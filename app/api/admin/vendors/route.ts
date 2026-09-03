import { BadRequestError, NotFoundError, defineRoute, parseBody, parseQuery } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { KycStatus, VendorStatus } from "@/lib/types/enums";
import {
    vendorActionRequestSchema,
    vendorCreateRequestSchema,
    type VendorResponse,
} from "@/lib/validation/schemas";
import { z } from "zod";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

const vendorListQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
    offset: z.coerce.number().int().min(0).optional(),
});

/**
 * GET /api/admin/vendors — list vendors for the admin console (contract §4).
 *
 * Thin read: the guard authenticates + checks `vendor_management/read` (admin,
 * compliance, vendor_manager, volunteer per the matrix); RLS applies again on
 * the session client as defense-in-depth. Maps the live `vendors` columns to the
 * VendorResponse contract shape (geo composed from geo_lat/geo_lng). Never null
 * body — returns an empty list on no rows.
 */
export const GET = defineRoute({ feature: "vendor_management", action: "read" }, async ({ req }) => {
    const { limit = DEFAULT_LIMIT, offset = 0 } = parseQuery(
        req.nextUrl.searchParams,
        vendorListQuerySchema
    );
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("vendors")
        .select(
            "id, name, status, kyc_status, fssai_license, gst_number, geo_lat, geo_lng, hygiene_rating, created_at, owner_id"
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    const vendors: VendorResponse[] = (data ?? []).map((v) => ({
        vendor_id: v.id,
        name: v.name,
        status: v.status,
        kyc_status: v.kyc_status,
        fssai_license: v.fssai_license,
        gst_number: v.gst_number,
        geo:
            v.geo_lat != null && v.geo_lng != null
                ? { lat: Number(v.geo_lat), lng: Number(v.geo_lng) }
                : null,
        hygiene_rating: v.hygiene_rating,
        created_at: v.created_at,
        has_login: v.owner_id != null,
    }));

    return { vendors, total: vendors.length, limit, offset };
});

/**
 * PATCH /api/admin/vendors — staff lifecycle action on one vendor (contract §4).
 *
 * Gated by `vendor_management/update` (admin + vendor_manager). The action drives
 * an explicit state machine; an illegal transition (e.g. suspend a pending
 * vendor) is a 400, a missing vendor a 404. The mutation runs on the service-role
 * client AFTER the matrix check, and every change writes one audit row (the
 * vendors table has no reason column, so the reason lives in the trail).
 */
type VendorActionRule = {
    column: "status" | "kyc_status";
    to: VendorStatus | KycStatus;
    from: ReadonlyArray<VendorStatus | KycStatus>;
    verb: string;
};

const VENDOR_ACTION_RULES: Record<string, VendorActionRule> = {
    approve: { column: "status", to: "approved", from: ["pending"], verb: "vendor.approve" },
    reject: { column: "status", to: "rejected", from: ["pending"], verb: "vendor.reject" },
    suspend: { column: "status", to: "suspended", from: ["approved"], verb: "vendor.suspend" },
    reinstate: { column: "status", to: "approved", from: ["suspended"], verb: "vendor.reinstate" },
    verify_kyc: { column: "kyc_status", to: "verified", from: ["pending", "failed"], verb: "vendor.kyc.verify" },
    fail_kyc: { column: "kyc_status", to: "failed", from: ["pending", "verified"], verb: "vendor.kyc.fail" },
};

export const PATCH = defineRoute(
    { feature: "vendor_management", action: "update" },
    async ({ req, audit }) => {
        const body = await parseBody(req, vendorActionRequestSchema);
        const rule = VENDOR_ACTION_RULES[body.action];

        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("vendors")
            .select("id, name, status, kyc_status")
            .eq("id", body.vendor_id)
            .single();

        if (fetchError || !data) throw new NotFoundError("vendor not found");
        const vendor = data as {
            id: string;
            name: string;
            status: VendorStatus;
            kyc_status: KycStatus;
        };

        const current = vendor[rule.column];
        if (!rule.from.includes(current)) {
            throw new BadRequestError(
                `cannot '${body.action}' a vendor whose ${rule.column} is '${current}'`
            );
        }

        // A vendor must not be brought online before KYC is verified — approving a
        // pending/failed-KYC outlet would let it scan tokens and lock payments
        // without verification (status and kyc_status were independent before).
        if (body.action === "approve" && vendor.kyc_status !== "verified") {
            throw new BadRequestError("verify KYC before approving this vendor");
        }

        const { error: updateError } = await admin
            .from("vendors")
            .update({ [rule.column]: rule.to, updated_at: new Date().toISOString() })
            .eq("id", body.vendor_id);

        if (updateError) throw new Error(updateError.message);

        await audit({
            action: rule.verb,
            entity_table: "vendors",
            entity_id: body.vendor_id,
            summary: `${vendor.name}: ${rule.column} ${current} → ${rule.to}${
                body.reason ? ` (${body.reason})` : ""
            }`,
            metadata: {
                column: rule.column,
                from: current,
                to: rule.to,
                reason: body.reason ?? null,
            },
        });

        return { ok: true, id: body.vendor_id, [rule.column]: rule.to };
    }
);

/**
 * POST /api/admin/vendors — staff pre-registration of an outlet (contract §4).
 *
 * Gated by `vendor_management/create` (admin + vendor_manager). This is the
 * counterpart to public self-registration (`POST /api/vendor/register`) for the
 * common field case: an admin has visited an outlet, has its papers in hand, and
 * wants it in the registry before the owner ever touches a phone.
 *
 * Two deliberate differences from self-registration:
 *   - **No auth account.** The row is created UNCLAIMED (`owner_id` null). Making
 *     a login for someone means choosing or transmitting a credential, and the
 *     email provider is still an open item — so there is nothing to send. The
 *     vendor claims the outlet by self-registering later.
 *   - **No bank details.** Settlement destinations are collected from the vendor,
 *     never typed in on their behalf.
 *
 * The outlet starts `pending`/`pending` exactly like a self-registration: being
 * admin-entered is not evidence of KYC, and PATCH already refuses to approve a
 * vendor whose KYC is unverified.
 */
export const POST = defineRoute(
    { feature: "vendor_management", action: "create" },
    async ({ req, audit }) => {
        const body = await parseBody(req, vendorCreateRequestSchema);
        const admin = createAdminClient();

        // An FSSAI licence identifies one outlet, so a repeat is a re-entry of a
        // vendor already in the registry, not a second business. There is no DB
        // unique constraint on the column (self-registration leaves it optional),
        // so the check lives here — advisory, but it catches the real mistake.
        if (body.fssai_license) {
            const { data: clash } = await admin
                .from("vendors")
                .select("id, name")
                .eq("fssai_license", body.fssai_license)
                .maybeSingle();
            if (clash) {
                throw new BadRequestError(
                    `FSSAI licence ${body.fssai_license} is already registered to '${
                        (clash as { name: string }).name
                    }'`
                );
            }
        }

        const { data, error } = await admin
            .from("vendors")
            .insert({
                owner_id: null, // unclaimed until the vendor self-registers
                name: body.name,
                legal_name: body.legal_name ?? null,
                address: body.address ?? null,
                city: body.city ?? null,
                pincode: body.pincode ?? null,
                phone: body.phone ?? null,
                email: body.email ?? null,
                emergency_contact: body.emergency_contact ?? null,
                fssai_license: body.fssai_license ?? null,
                gst_number: body.gst_number ?? null,
                geo_lat: body.geo_lat ?? null,
                geo_lng: body.geo_lng ?? null,
                status: "pending",
                kyc_status: "pending",
            })
            .select("id, name, status, kyc_status")
            .single();

        if (error || !data) throw new Error(error?.message ?? "failed to create vendor");
        const vendor = data as { id: string; name: string; status: string; kyc_status: string };

        await audit({
            action: "vendor.create",
            entity_table: "vendors",
            entity_id: vendor.id,
            summary: `pre-registered vendor '${vendor.name}'${body.city ? ` (${body.city})` : ""} — unclaimed, pending review`,
            metadata: {
                vendor_id: vendor.id,
                city: body.city ?? null,
                fssai_license: body.fssai_license ?? null,
                gst_number: body.gst_number ?? null,
                self_registered: false,
            },
        });

        return {
            vendor_id: vendor.id,
            name: vendor.name,
            status: vendor.status,
            kyc_status: vendor.kyc_status,
        };
    }
);
