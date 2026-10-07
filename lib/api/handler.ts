import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

import { requireAppUser, UnauthorizedError, type AppUser } from "@/lib/auth";
import {
    assertCan,
    assertCapability,
    ForbiddenError,
    type Action,
    type Capability,
    type Feature,
    type Scope,
} from "@/lib/permissions";
import { writeAuditLog, AuditError, type AuditInput } from "@/lib/services/audit";
import { MissingConfigError } from "@/lib/system-config";
import type { ErrorResponse } from "@/lib/validation/schemas";

/**
 * Route handler foundation — the single auth + authz + audit + error shape every
 * `app/api/**` route reuses (contract "Route Handler Pattern" + "Never Return a
 * Null Body"). A route declares the matrix cell it needs; `defineRoute` then:
 *   1. authenticates server-side via requireAppUser (401 if not signed in),
 *   2. resolves the caller's role and checks the permission matrix via assertCan
 *      (403 if the cell denies the action),
 *   3. hands the handler a context with the AppUser and an actor-bound `audit()`,
 *   4. serialises the return value to JSON, and
 *   5. maps every known error to the contract's `{ error: string }` body with
 *      the right HTTP status — never a bare null.
 *
 * Net-new application code: no DB schema changes, touches no Dev-1 tables.
 */

/** Thrown by handlers/parsers for a malformed request. Map to HTTP 400. */
export class BadRequestError extends Error {
    constructor(message = "bad request") {
        super(message);
        this.name = "BadRequestError";
    }
}

/** Thrown when a referenced entity does not exist. Map to HTTP 404. */
export class NotFoundError extends Error {
    constructor(message = "not found") {
        super(message);
        this.name = "NotFoundError";
    }
}

/** The matrix cell a route requires before its handler runs. */
export interface RouteGuard {
    feature: Feature;
    action: Action;
    /** "all" (default) or "own"; never "none". */
    scope?: Exclude<Scope, "none">;
    /**
     * A capability the role must also hold. Use it when the thing being guarded
     * is narrower than the CRUD verb — offline capture, for instance, is not
     * "create a redemption" and must not require that permission.
     */
    cap?: Capability;
}

/** What a handler receives once auth + authz have passed. */
export interface RouteContext<P = Record<string, string>> {
    req: NextRequest;
    /** The authenticated app user (id + role + donor_id). */
    user: AppUser;
    /** Resolved dynamic route params (already awaited). */
    params: P;
    /** Write an audit row for this action; actor is pre-bound to `user`. */
    audit: (entry: Omit<AuditInput, "actor">) => Promise<void>;
}

/** A JSON-serialisable success body. Routes must never resolve to null/undefined. */
type JsonBody = Record<string, unknown> | unknown[];

/** Next.js App Router passes dynamic params as the second arg (a Promise in v15+). */
type SegmentData<P> = { params?: Promise<P> | P };

/**
 * Wrap a route handler with auth, the permission-matrix check, audit binding,
 * JSON serialisation, and contract error mapping.
 *
 * @example
 *   export const POST = defineRoute(
 *     { feature: "vendor_management", action: "update" },
 *     async ({ user, req, audit }) => {
 *       const body = await parseBody(req, vendorApproveRequestSchema);
 *       // ...perform the mutation via the service-role client...
 *       await audit({ action: "vendor.approve", entity_table: "vendors", entity_id: body.vendor_id });
 *       return { ok: true, vendor_id: body.vendor_id };
 *     }
 *   );
 */
export function defineRoute<P = Record<string, string>>(
    guard: RouteGuard,
    handler: (ctx: RouteContext<P>) => Promise<NextResponse | JsonBody>
): (req: NextRequest, segment?: SegmentData<P>) => Promise<NextResponse> {
    return async (req, segment) => {
        try {
            const user = await requireAppUser();
            assertCan(user, guard.feature, guard.action, guard.scope ?? "all");
            if (guard.cap) assertCapability(user, guard.feature, guard.cap);

            const params = ((segment?.params
                ? await segment.params
                : {}) as P);

            const audit: RouteContext<P>["audit"] = (entry) =>
                writeAuditLog({ actor: user, ...entry });

            const result = await handler({ req, user, params, audit });

            if (result instanceof NextResponse) return result;
            return NextResponse.json(result);
        } catch (err) {
            return toErrorResponse(err);
        }
    };
}

/**
 * Parse + validate a JSON request body with a Zod schema. Throws BadRequestError
 * for unparseable JSON and ZodError for schema violations — both mapped to 400
 * by `toErrorResponse`.
 */
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        throw new BadRequestError("request body is not valid JSON");
    }
    return schema.parse(raw);
}

/**
 * Validate URL search params (already extracted to an object) with a Zod schema.
 * Same error mapping as parseBody.
 */
export function parseQuery<T>(searchParams: URLSearchParams, schema: ZodType<T>): T {
    return schema.parse(Object.fromEntries(searchParams.entries()));
}

/** Build the contract's `{ error: string }` body at a given status. */
function errorJson(status: number, message: string): NextResponse<ErrorResponse> {
    return NextResponse.json({ error: message }, { status });
}

/** Flatten a ZodError into a single readable string for the `error` field. */
function formatZodError(err: ZodError): string {
    const first = err.issues
        .map((i) => {
            const path = i.path.join(".");
            return path ? `${path}: ${i.message}` : i.message;
        })
        .join("; ");
    return first || "invalid request";
}

/**
 * Map any thrown value to a contract error response. Centralised so every route
 * (guarded or hand-written) returns consistent `{ error }` bodies and statuses.
 * Detailed/internal messages are logged server-side, never leaked to the client.
 */
export function toErrorResponse(err: unknown): NextResponse<ErrorResponse> {
    if (err instanceof UnauthorizedError) return errorJson(401, "unauthorized");

    if (err instanceof ForbiddenError) {
        // Log the matrix-detail message; return a generic body (no matrix leak).
        console.warn("[route] forbidden:", err.message);
        return errorJson(403, "forbidden");
    }

    if (err instanceof BadRequestError) return errorJson(400, err.message);
    if (err instanceof ZodError) return errorJson(400, formatZodError(err));
    if (err instanceof NotFoundError) return errorJson(404, err.message);

    if (err instanceof AuditError) {
        console.error("[route] audit failure:", err.message);
        return errorJson(500, "internal error");
    }

    if (err instanceof MissingConfigError) {
        console.error("[route] config error:", err.message);
        return errorJson(500, "server configuration error");
    }

    console.error("[route] unhandled error:", err);
    return errorJson(500, "internal error");
}
