import type { AppUser } from "@/lib/auth";
import type { UserRole } from "@/lib/types/enums";

import {
    PERMISSION_MATRIX,
    type Action,
    type Capability,
    type Feature,
    type Permission,
    type Scope,
} from "@/lib/permissions/matrix";

export {
    FEATURES,
    PERMISSION_MATRIX,
    type Action,
    type Capability,
    type Feature,
    type Permission,
    type Scope,
} from "@/lib/permissions/matrix";

const NO_PERMISSION: Permission = {
    create: "none",
    read: "none",
    update: "none",
    delete: "none",
    caps: [],
};

/** The effective permission cell for a (role, feature) pair. Defaults to none. */
export function getPermission(role: UserRole, feature: Feature): Permission {
    return PERMISSION_MATRIX[feature][role] ?? NO_PERMISSION;
}

/**
 * Can `role` perform `action` on `feature`? Returns the granted scope check.
 * - Pass `scope: "own"` to ask "may they act on their own rows?" (true if the
 *   cell grants "own" or "all").
 * - Pass `scope: "all"` (default) to ask "may they act across all rows?"
 *   (true only if the cell grants "all").
 */
export function can(
    role: UserRole,
    feature: Feature,
    action: Action,
    scope: Exclude<Scope, "none"> = "all"
): boolean {
    const granted = getPermission(role, feature)[action];
    if (granted === "none") return false;
    if (granted === "all") return true;
    // granted === "own"
    return scope === "own";
}

/** Does `role` hold a special capability on `feature` (approve/override/…)? */
export function hasCapability(role: UserRole, feature: Feature, cap: Capability): boolean {
    return getPermission(role, feature).caps.includes(cap);
}

/** Throw unless `user` holds `cap` on `feature`. The capability twin of assertCan. */
export function assertCapability(user: AppUser, feature: Feature, cap: Capability): void {
    if (!hasCapability(user.role, feature, cap)) {
        throw new ForbiddenError(`role '${user.role}' does not hold '${cap}' on '${feature}'`);
    }
}

/**
 * Roles the /admin console is for. Used by the admin layout to gate the whole
 * area server-side (coarse "may you enter at all"); per-feature access is still
 * enforced by each route's matrix cell and by RLS. Other authenticated roles
 * (donor, beneficiary, vendor, volunteer, guest) are bounced with Access Denied.
 */
export const ADMIN_CONSOLE_ROLES: readonly UserRole[] = [
    "admin",
    "compliance",
    "vendor_manager",
] as const;

/** True when `role` may enter the /admin console at all. */
export function isAdminConsoleRole(role: UserRole): boolean {
    return ADMIN_CONSOLE_ROLES.includes(role);
}

/** Convenience wrappers operating on an AppUser. */
export function userCan(
    user: AppUser,
    feature: Feature,
    action: Action,
    scope: Exclude<Scope, "none"> = "all"
): boolean {
    return can(user.role, feature, action, scope);
}

export function userHasCapability(user: AppUser, feature: Feature, cap: Capability): boolean {
    return hasCapability(user.role, feature, cap);
}

/**
 * Guard for route handlers: throws ForbiddenError when the user lacks the
 * permission. Catch and map to HTTP 403.
 */
export function assertCan(
    user: AppUser,
    feature: Feature,
    action: Action,
    scope: Exclude<Scope, "none"> = "all"
): void {
    if (!can(user.role, feature, action, scope)) {
        throw new ForbiddenError(
            `role '${user.role}' cannot ${action} (${scope}) '${feature}'`
        );
    }
}

/** Thrown when an authenticated user lacks permission. Map to HTTP 403. */
export class ForbiddenError extends Error {
    constructor(message = "forbidden") {
        super(message);
        this.name = "ForbiddenError";
    }
}
