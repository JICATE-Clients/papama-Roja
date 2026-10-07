import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/system-config", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/system-config")>();
    return { ...actual, getBoolean: vi.fn(), getString: vi.fn() };
});

import { assertWithinOperatingCity, readOperatingCityRule } from "@/lib/services/operatingCity";
import { getBoolean, getString } from "@/lib/system-config";
import type { SupabaseClient } from "@supabase/supabase-js";

const client = {} as SupabaseClient;

/** Lock on, operating city set — the configuration the pilot actually runs. */
function lockOn(city = "Coimbatore") {
    vi.mocked(getBoolean).mockResolvedValue(true);
    vi.mocked(getString).mockResolvedValue(city);
}

beforeEach(() => {
    vi.mocked(getBoolean).mockReset();
    vi.mocked(getString).mockReset();
});

describe("Q-5 — city lock at registration", () => {
    it("accepts a registration from the operating city", async () => {
        lockOn();
        await expect(assertWithinOperatingCity("Coimbatore", client)).resolves.toBeUndefined();
    });

    it("refuses a registration from anywhere else", async () => {
        lockOn();
        // THE card's criterion: the client chose a hard block over a warning, so
        // this must throw rather than annotate and continue.
        await expect(assertWithinOperatingCity("Chennai", client)).rejects.toThrow(
            /serves Coimbatore only/i
        );
    });

    it("refuses a blank city while the lock is on", async () => {
        lockOn();
        // Without this, the block is no block: leaving the field empty would walk
        // straight past it, which is the hole the Food Partner 'Dhruv' has at the
        // counter today.
        await expect(assertWithinOperatingCity("", client)).rejects.toThrow(/city is required/i);
        await expect(assertWithinOperatingCity(undefined, client)).rejects.toThrow(
            /city is required/i
        );
    });

    it("ignores case and surrounding space", async () => {
        lockOn();
        // A person typing their own city should not be refused over a capital.
        await expect(assertWithinOperatingCity("  coimbatore ", client)).resolves.toBeUndefined();
    });

    it("lets everyone through when the lock is off", async () => {
        vi.mocked(getBoolean).mockResolvedValue(false);
        await expect(assertWithinOperatingCity("Chennai", client)).resolves.toBeUndefined();
        await expect(assertWithinOperatingCity(undefined, client)).resolves.toBeUndefined();
    });

    it("lets everyone through when the lock is on but no city is configured", async () => {
        // Deliberately NOT fail-closed. An unset operating_city means nobody has
        // decided which city pApAmA serves; refusing every registration in the
        // country is a worse answer to that than letting sign-ups through. This
        // is exactly the state the platform was in until 7 Oct 2026.
        vi.mocked(getBoolean).mockResolvedValue(true);
        vi.mocked(getString).mockResolvedValue("   ");
        await expect(assertWithinOperatingCity("Chennai", client)).resolves.toBeUndefined();
    });

    it("treats an unreadable lock setting as off rather than guessing", async () => {
        vi.mocked(getBoolean).mockRejectedValue(new Error("unset"));
        const rule = await readOperatingCityRule(client);
        expect(rule).toEqual({ enforced: false, operatingCity: null });
    });

    it("reports what it will enforce, so a route can require the field first", async () => {
        lockOn("Madurai");
        await expect(readOperatingCityRule(client)).resolves.toEqual({
            enforced: true,
            operatingCity: "Madurai",
        });
    });

    it("names the city it does serve, so the applicant learns something useful", async () => {
        lockOn();
        await expect(assertWithinOperatingCity("Erode", client)).rejects.toThrow(/Erode/);
    });
});
