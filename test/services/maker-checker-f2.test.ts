import { describe, expect, it, vi } from "vitest";

import {
    canApprove,
    canPay,
    canPayToVendorAccount,
    canReject,
    canReleaseHold,
    isMaterialChange,
    reopenForAmendment,
    type SettlementSnapshot,
} from "@/lib/services/makerChecker";

/**
 * Acceptance tests for Work Order F-2 (B-24) — settlement maker-checker.
 *
 * The card requires "each lettered control has a FAILING-PATH test", so every
 * block below asserts the denial first. The client's principle:
 *
 *   "No individual user shall have the ability to prepare, independently verify,
 *    approve and release the same Food Partner settlement. Any material change to
 *    a settlement after approval shall automatically invalidate the approval and
 *    require fresh maker-checker authorisation."
 */

const ALICE = "user-alice";
const BOB = "user-bob";
const CAROL = "user-carol";

function settlement(over: Partial<SettlementSnapshot> = {}): SettlementSnapshot {
    return {
        id: "settle-1",
        status: "locked",
        version: 1,
        approved_version: null,
        prepared_by: ALICE,
        locked_by: ALICE,
        approved_by: null,
        hold_placed_by: null,
        hold_is_material: false,
        on_hold: false,
        ...over,
    };
}

describe("F-2 (a) — maker cannot be checker", () => {
    it("FAILS: the locker cannot approve their own settlement", () => {
        const r = canApprove(settlement({ locked_by: ALICE }), ALICE);
        expect(r.allowed).toBe(false);
        expect(r.control).toBe("D-4(a)");
        expect(r.reason).toMatch(/different user must approve/i);
    });

    it("FAILS: the preparer cannot approve, even if someone else locked it", () => {
        // Otherwise segregation is defeated by preparing, handing the lock to a
        // colleague, then approving your own work.
        const r = canApprove(settlement({ prepared_by: ALICE, locked_by: BOB }), ALICE);
        expect(r.allowed).toBe(false);
    });

    it("ALLOWS a genuinely independent approver", () => {
        expect(canApprove(settlement({ prepared_by: ALICE, locked_by: ALICE }), BOB).allowed).toBe(
            true
        );
    });

    it("FAILS: the approver cannot also release the payment", () => {
        // Approval and payment release are separate events per CD §D-4; one
        // person doing both collapses two controls into one.
        const r = canPay(
            settlement({ status: "approved", approved_by: BOB, approved_version: 1 }),
            BOB
        );
        expect(r.allowed).toBe(false);
        expect(r.reason).toMatch(/different user must release/i);
    });

    it("ALLOWS a third user to release payment", () => {
        const r = canPay(
            settlement({ status: "approved", approved_by: BOB, approved_version: 1 }),
            CAROL
        );
        expect(r.allowed).toBe(true);
    });
});

describe("F-2 (b) — versioning: reopen → amend → new version → fresh approval", () => {
    it("bumps the version and clears the approval in one step", () => {
        const next = reopenForAmendment(
            settlement({ status: "approved", version: 1, approved_version: 1, approved_by: BOB }),
            "line item disputed"
        );
        expect(next.version).toBe(2);
        expect(next.approved_by).toBeNull();
        expect(next.approved_version).toBeNull();
        expect(next.status).toBe("pending");
        expect(next.approval_invalidated_reason).toBe("line item disputed");
    });
});

describe("F-2 (c) — material change auto-invalidates the approval", () => {
    it("FAILS: a settlement amended after approval cannot be paid", () => {
        // Approved at v1, now at v2 — the approval is for a settlement that no
        // longer exists.
        const r = canPay(
            settlement({ status: "approved", approved_by: BOB, approved_version: 1, version: 2 }),
            CAROL
        );
        expect(r.allowed).toBe(false);
        expect(r.control).toBe("D-4(c)");
        expect(r.reason).toMatch(/amended after approval/i);
        expect(r.reason).toMatch(/fresh approval/i);
    });

    it("FAILS: a settlement with no recorded approval cannot be paid", () => {
        const r = canPay(settlement({ approved_version: null }), CAROL);
        expect(r.allowed).toBe(false);
        expect(r.control).toBe("D-4(c)");
    });

    it("treats an amount change as material", () => {
        expect(isMaterialChange(["amount"])).toBe(true);
    });

    it("treats a line-item change as material", () => {
        expect(isMaterialChange(["line_item_count"])).toBe(true);
    });

    it("treats a note-only change as immaterial", () => {
        expect(isMaterialChange(["notes"])).toBe(false);
    });

    it("errs toward material when a change is mixed", () => {
        // Over-invalidating costs one re-approval; under-invalidating pays out an
        // amount nobody checked.
        expect(isMaterialChange(["notes", "amount"])).toBe(true);
    });
});

describe("F-2 (d) — reject requires a reason", () => {
    it.each([null, undefined, "", "   "])("FAILS with reason %j", (reason) => {
        const r = canReject(reason as string | null | undefined);
        expect(r.allowed).toBe(false);
        expect(r.control).toBe("D-4(d)");
    });

    it("ALLOWS a real reason", () => {
        expect(canReject("meal counts do not match the proofs").allowed).toBe(true);
    });
});

describe("F-2 (e) — maker cannot release own material hold", () => {
    it("FAILS: the placer cannot release their own material hold", () => {
        const r = canReleaseHold(
            settlement({ on_hold: true, hold_is_material: true, hold_placed_by: ALICE }),
            ALICE
        );
        expect(r.allowed).toBe(false);
        expect(r.control).toBe("D-4(e)");
    });

    it("ALLOWS a different user to release a material hold", () => {
        const r = canReleaseHold(
            settlement({ on_hold: true, hold_is_material: true, hold_placed_by: ALICE }),
            BOB
        );
        expect(r.allowed).toBe(true);
    });

    it("ALLOWS the placer to release a NON-material hold", () => {
        const r = canReleaseHold(
            settlement({ on_hold: true, hold_is_material: false, hold_placed_by: ALICE }),
            ALICE
        );
        expect(r.allowed).toBe(true);
    });

    it("FAILS when the settlement is not on hold at all", () => {
        expect(canReleaseHold(settlement({ on_hold: false }), ALICE).allowed).toBe(false);
    });
});

/** `.from().select().eq().eq()` resolving to approved bank-change rows. */
function fakeBankClient(rows: unknown[] | null, error?: string) {
    return {
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue(
                        error ? { data: null, error: { message: error } } : { data: rows, error: null }
                    ),
                }),
            }),
        }),
    };
}

describe("F-2 (f) — bank-account changer cannot approve payment to it", () => {
    it("FAILS: the requester of an approved bank change cannot release payment", async () => {
        const r = await canPayToVendorAccount(
            fakeBankClient([{ requested_by: ALICE }]) as never,
            "vendor-1",
            ALICE
        );
        expect(r.allowed).toBe(false);
        expect(r.control).toBe("D-4(f)");
        expect(r.reason).toMatch(/bank account/i);
    });

    it("FAILS even when the requester chained a LATER change", async () => {
        // Chaining changes to launder yourself out of the picture is exactly
        // what this prevents, so every approved change is checked, not just the
        // most recent one.
        const r = await canPayToVendorAccount(
            fakeBankClient([{ requested_by: ALICE }, { requested_by: BOB }]) as never,
            "vendor-1",
            ALICE
        );
        expect(r.allowed).toBe(false);
    });

    it("ALLOWS someone who never touched the bank details", async () => {
        const r = await canPayToVendorAccount(
            fakeBankClient([{ requested_by: ALICE }]) as never,
            "vendor-1",
            CAROL
        );
        expect(r.allowed).toBe(true);
    });

    it("ALLOWS when the vendor has no bank-change history", async () => {
        expect(
            (await canPayToVendorAccount(fakeBankClient([]) as never, "vendor-1", ALICE)).allowed
        ).toBe(true);
    });

    it("FAILS CLOSED when the change history cannot be read", async () => {
        // Money to the wrong account is not recoverable.
        const r = await canPayToVendorAccount(
            fakeBankClient(null, "boom") as never,
            "vendor-1",
            ALICE
        );
        expect(r.allowed).toBe(false);
        expect(r.reason).toMatch(/blocked/i);
    });
});

describe("F-2 — the full segregation the client asked for", () => {
    it("one person cannot prepare, approve AND pay the same settlement", () => {
        // The client's principle, end to end.
        const prepared = settlement({ prepared_by: ALICE, locked_by: ALICE });
        expect(canApprove(prepared, ALICE).allowed).toBe(false);

        // Alice gets a colleague to approve…
        const approved = settlement({
            ...prepared,
            status: "approved",
            approved_by: BOB,
            approved_version: 1,
        });
        // …but Bob then cannot also release it.
        expect(canPay(approved, BOB).allowed).toBe(false);
        // It takes a genuine third party.
        expect(canPay(approved, CAROL).allowed).toBe(true);
    });
});
