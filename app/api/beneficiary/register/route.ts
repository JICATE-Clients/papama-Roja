import { z } from "zod";

import { parseBody, toErrorResponse } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { embeddingFingerprint, toVectorLiteral } from "@/lib/face/embedding";
import { assertLiveness } from "@/lib/face/liveness";
import { writeAuditLog } from "@/lib/services/audit";
import { assertWithinOperatingCity } from "@/lib/services/operatingCity";
import { faceCaptureSchema } from "@/lib/validation/schemas";

/**
 * POST /api/beneficiary/register — PUBLIC beneficiary self-registration (no session).
 *
 * The permission matrix grants `guest → beneficiary_registration/create (self_register)`
 * (lib/permissions/matrix.ts) and the m05 RLS explicitly anticipates this going through
 * a server route on the service-role client rather than an anon RLS policy
 * (m05_beneficiaries.sql:115-119) — matching the "no direct client DB writes" rule and
 * avoiding a public write surface. This is the same shape as /api/vendor/register: a
 * hand-written public POST (not defineRoute, which would 401 a guest), service-role
 * insert, and an audit row with no staff actor.
 *
 * It only ever creates a clean PENDING registration that an admin must approve before
 * the eligible `beneficiaries` row exists — exactly the RLS insert check (pending,
 * reviewed_by null, beneficiary_id null). Face handling is at PARITY with the admin
 * route: on-device capture → liveness gate → embedding stored; the raw image never
 * leaves the device, only the non-reversible vector is sent.
 */
const schema = z.object({
    full_name: z.string().trim().max(120).optional(),
    category: z.enum(["pregnant_women", "patient", "disability", "disaster_affected"]),
    /** On-device face capture (preferred): embedding + liveness. */
    face_capture: faceCaptureSchema.optional(),
    /** Legacy manual face_hash, kept for back-compat / fallback. */
    face_hash: z.string().trim().min(1).optional(),
    aadhaar_hash: z.string().trim().min(1).optional(),
    contact: z.string().trim().max(120).optional(),
    /**
     * Q-5 (B-15): checked against the operating city while the city lock is
     * on. Optional in the schema because the lock may be off; the rule below
     * requires it when the lock is on, which is where "required" belongs —
     * a schema cannot read configuration.
     */
    city: z.string().trim().max(120).optional(),
    location_hint: z.string().trim().max(200).optional(),
    document_refs: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
    try {
        const body = await parseBody(req as never, schema);
        const admin = createAdminClient();

        // Q-5 (B-15): refuse a sign-up from outside the operating city before
        // any account or face record is created.
        await assertWithinOperatingCity(body.city, admin as never);

        // On-device face capture (preferred): gate liveness (fail-safe — see
        // lib/face/liveness.ts), then store the embedding. Identical handling to
        // app/api/admin/beneficiary-registrations/route.ts.
        let faceEmbedding: string | null = null;
        let faceHash: string | null = body.face_hash ?? null;
        if (body.face_capture) {
            await assertLiveness(body.face_capture, admin as never);
            faceEmbedding = toVectorLiteral(body.face_capture.embedding);
            faceHash = body.face_hash ?? embeddingFingerprint(body.face_capture.embedding);
        }

        // Self-registration has no staff/volunteer actor; submitted_by stays null
        // (the RLS pending-row insert check governs this on the service-role client).
        const { data, error } = await admin
            .from("beneficiary_registrations")
            .insert({
                full_name: body.full_name ?? null,
                category: body.category,
                face_hash: faceHash,
                face_embedding: faceEmbedding,
                aadhaar_hash: body.aadhaar_hash ?? null,
                contact: body.contact ?? null,
                city: body.city ?? null,
                location_hint: body.location_hint ?? null,
                document_refs: body.document_refs ?? [],
                submitted_by: null,
            })
            .select("id")
            .single();
        if (error || !data) throw new Error(error?.message ?? "failed to submit registration");
        const id = (data as { id: string }).id;

        await writeAuditLog({
            actor: null,
            action: "beneficiary.register",
            entity_table: "beneficiary_registrations",
            entity_id: id,
            summary: `self-registered a ${body.category} beneficiary`,
            metadata: { category: body.category, self_registered: true },
        });

        return new Response(JSON.stringify({ id, status: "pending" }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    } catch (err) {
        return toErrorResponse(err);
    }
}
