import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
    checkDispatchGate,
    dispatchAppeal,
    renderAppeal,
    selectAudience,
    type AppealTemplate,
    type ChannelAdapter,
} from "@/lib/services/emergencyAppeal";

/**
 * Acceptance tests for Work Order E-6 (B-26 b,c) — Emergency Appeal.
 *
 * The card's criteria:
 *   - an unapproved template cannot dispatch
 *   - an instant-template dispatch creates a post-send review task
 *   - appeal-attributed donations carry the Emergency ID
 *   - the dispatch interface is CHANNEL-ABSTRACT: adding a channel is a new
 *     adapter, with no core rework
 */

const ROOT = join(__dirname, "..", "..");

function template(over: Partial<AppealTemplate> = {}): AppealTemplate {
    return {
        id: "tpl-1",
        name: "Flood appeal",
        subject: "Urgent: {{emergency_ref}}",
        body: "Please help families affected by {{emergency_ref}}.",
        status: "approved",
        is_instant: false,
        audience: "all",
        ...over,
    };
}

describe("E-6 — an unapproved template cannot dispatch", () => {
    it("REFUSES a draft", () => {
        const gate = checkDispatchGate(template({ status: "draft" }));
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toMatch(/must be approved/i);
    });

    it("REFUSES a retired template", () => {
        // Retirement exists because someone decided the wording should stop
        // being used. "Still dispatchable" would make it meaningless.
        const gate = checkDispatchGate(template({ status: "retired" }));
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toMatch(/retired/i);
    });

    it("ALLOWS an approved template", () => {
        expect(checkDispatchGate(template()).allowed).toBe(true);
    });

    it("a draft dispatch writes NOTHING", async () => {
        const client = { from: vi.fn() };
        const result = await dispatchAppeal(client as never, {
            template: template({ status: "draft" }),
            emergencyId: "em-1",
            emergencyRef: "TN-FLOOD-2026-001",
            recipients: [{ donorId: "d-1", isCsr: false }],
            adapter: inAppAdapter(),
        });

        expect(result.dispatched).toBe(false);
        expect(client.from).not.toHaveBeenCalled();
    });
});

describe("E-6 — the instant path always leaves a review task", () => {
    it("an instant template requires post-send review", () => {
        const gate = checkDispatchGate(template({ is_instant: true }));
        expect(gate.allowed).toBe(true);
        // A flood does not wait for an approval queue — but speed must not
        // silently become an absence of oversight.
        expect(gate.reviewRequired).toBe(true);
    });

    it("a normal approved template does NOT require review", () => {
        // It already went through approval; a second review would be noise.
        expect(checkDispatchGate(template()).reviewRequired).toBe(false);
    });

    it("records review_required on the dispatch row", async () => {
        const { client, insert } = fakeDispatchClient();
        await dispatchAppeal(client as never, {
            template: template({ is_instant: true }),
            emergencyId: "em-1",
            emergencyRef: "TN-FLOOD-2026-001",
            recipients: [{ donorId: "d-1", isCsr: false }],
            adapter: inAppAdapter(),
        });

        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({ was_instant: true, review_required: true })
        );
    });

    it("the caller cannot dispatch instantly and skip the review flag", async () => {
        // The two halves of the instant path are produced together by the gate,
        // so a caller that forgets the second one cannot exist.
        const gate = checkDispatchGate(template({ is_instant: true }));
        expect(gate.allowed && gate.reviewRequired).toBe(true);
    });
});

describe("E-6 — channel abstraction (adding a channel = one adapter)", () => {
    it("dispatch takes an adapter and never names a channel itself", () => {
        const src = readFileSync(join(ROOT, "lib/services/emergencyAppeal.ts"), "utf-8");
        const dispatchFn = src.slice(src.indexOf("export async function dispatchAppeal"));
        // The core must not branch on channel — that is what "without
        // fundamental redesign" means in practice.
        expect(dispatchFn).not.toMatch(/=== "email"|=== "sms"|=== "whatsapp"/);
        expect(dispatchFn).toContain("input.adapter.send");
    });

    it("works with an arbitrary new channel with no core change", async () => {
        // Standing in for a Phase 2 WhatsApp adapter.
        const whatsapp: ChannelAdapter = {
            channel: "whatsapp",
            send: vi.fn().mockResolvedValue({ delivered: 3, failed: 0 }),
        };
        const { client } = fakeDispatchClient();

        const result = await dispatchAppeal(client as never, {
            template: template(),
            emergencyId: "em-1",
            emergencyRef: "TN-FLOOD-2026-001",
            recipients: [
                { donorId: "d-1", isCsr: false },
                { donorId: "d-2", isCsr: true },
                { donorId: "d-3", isCsr: false },
            ],
            adapter: whatsapp,
        });

        expect(result.dispatched).toBe(true);
        expect(result.delivered).toBe(3);
        expect(whatsapp.send).toHaveBeenCalled();
    });

    it("the schema stores channel as TEXT+CHECK, not an enum", () => {
        // Adding a Phase 2 channel must be a one-line constraint change, not an
        // enum migration that locks the table.
        const sql = readFileSync(
            join(ROOT, "supabase/migrations/20260907000014_emergency_appeals.sql"),
            "utf-8"
        );
        expect(sql).toMatch(/channel\s+text not null default 'in_app'/);
        expect(sql).toMatch(/check \(channel in \('in_app', 'email', 'sms', 'whatsapp'\)\)/);
    });
});

describe("E-6 — audience segmentation", () => {
    const recipients = [
        { donorId: "d-1", isCsr: false },
        { donorId: "d-2", isCsr: true },
        { donorId: "d-3", isCsr: false },
    ];

    it("'all' takes everyone", () => {
        expect(selectAudience(recipients, "all")).toHaveLength(3);
    });

    it("'csr' takes only CSR donors", () => {
        expect(selectAudience(recipients, "csr").map((r) => r.donorId)).toEqual(["d-2"]);
    });

    it("'individual' excludes CSR donors", () => {
        expect(selectAudience(recipients, "individual").map((r) => r.donorId)).toEqual([
            "d-1",
            "d-3",
        ]);
    });

    it("does not mutate the list it was given", () => {
        selectAudience(recipients, "csr");
        expect(recipients).toHaveLength(3);
    });
});

describe("E-6 — template rendering", () => {
    it("substitutes the Emergency ID", () => {
        expect(renderAppeal("Help with {{emergency_ref}}", { emergency_ref: "TN-FLOOD-2026-001" })).toBe(
            "Help with TN-FLOOD-2026-001"
        );
    });

    it("leaves an unknown placeholder VISIBLE rather than blanking it", () => {
        // A donor seeing "{{name}}" is a bug someone fixes. "Dear ," reads as
        // merely clumsy and gets ignored.
        expect(renderAppeal("Dear {{name}},", {})).toBe("Dear {{name}},");
    });

    it("tolerates whitespace inside the braces", () => {
        expect(renderAppeal("{{ emergency_ref }}", { emergency_ref: "X" })).toBe("X");
    });
});

describe("E-6 — the dispatch record", () => {
    it("is written BEFORE delivery is attempted", async () => {
        // A record with delivered=0 is recoverable; a delivery with no record is
        // not investigable at all.
        const order: string[] = [];
        const insert = vi.fn().mockImplementation(() => {
            order.push("record");
            return {
                select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { id: "dsp-1" }, error: null }),
                }),
            };
        });
        const client = {
            from: vi.fn().mockReturnValue({
                insert,
                update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            }),
        };
        const adapter: ChannelAdapter = {
            channel: "in_app",
            send: vi.fn().mockImplementation(async () => {
                order.push("send");
                return { delivered: 1, failed: 0 };
            }),
        };

        await dispatchAppeal(client as never, {
            template: template(),
            emergencyId: "em-1",
            emergencyRef: "TN-FLOOD-2026-001",
            recipients: [{ donorId: "d-1", isCsr: false }],
            adapter,
        });

        expect(order).toEqual(["record", "send"]);
    });

    it("reports a partial failure rather than claiming success", async () => {
        const { client } = fakeDispatchClient();
        const flaky: ChannelAdapter = {
            channel: "email",
            send: vi.fn().mockResolvedValue({ delivered: 1, failed: 2 }),
        };

        const result = await dispatchAppeal(client as never, {
            template: template(),
            emergencyId: "em-1",
            emergencyRef: "TN-FLOOD-2026-001",
            recipients: [
                { donorId: "d-1", isCsr: false },
                { donorId: "d-2", isCsr: false },
                { donorId: "d-3", isCsr: false },
            ],
            adapter: flaky,
        });

        expect(result.delivered).toBe(1);
        expect(result.failed).toBe(2);
    });
});

describe("E-6 — appeal attribution reaches donations", () => {
    it("donations carry both the Emergency ID and the appeal dispatch", () => {
        const sql = readFileSync(
            join(ROOT, "supabase/migrations/20260907000014_emergency_appeals.sql"),
            "utf-8"
        );
        expect(sql).toMatch(/alter table public\.donations\s+add column appeal_dispatch_id/);
        // The Emergency ID itself was added by E-1; this is the finer
        // attribution on top of it.
        expect(sql).toContain("donations.emergency_id");
    });
});

/** An in-app adapter standing in for the real one. */
function inAppAdapter(): ChannelAdapter {
    return { channel: "in_app", send: vi.fn().mockResolvedValue({ delivered: 1, failed: 0 }) };
}

/** insert().select().single() then update().eq(). */
function fakeDispatchClient() {
    const insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "dsp-1" }, error: null }),
        }),
    });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    return { client: { from: vi.fn().mockReturnValue({ insert, update }) }, insert, update };
}
