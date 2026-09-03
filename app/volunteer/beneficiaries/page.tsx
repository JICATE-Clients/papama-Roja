"use client";

import BeneficiaryRegisterForm from "@/components/beneficiary/BeneficiaryRegisterForm";
import { shortDate } from "@/lib/format";

import {
    Dash,
    ListStates,
    PageHeader,
    StatusBadge,
    TableHead,
    TableShell,
    useVolunteerFetch,
} from "../_ui";

/**
 * Volunteer beneficiary-registration assist (owner §2.2.1, BEN-1, matrix volunteer
 * `create`/`assist`). A volunteer submits registrations (with on-device face
 * enrolment) through the dedicated volunteer route — NOT the admin path — so the
 * GET is RLS-scoped to this volunteer's own submissions and the POST handles the
 * face embedding at parity with admin. They CANNOT approve — eligibility approval
 * is admin-only.
 */

type RegistrationRow = {
    id: string;
    full_name: string | null;
    category: string;
    status: string;
    face_hash_present: boolean;
    aadhaar_present: boolean;
    created_at: string;
};

export default function VolunteerBeneficiariesPage() {
    const { data, state, errorMsg, reload } = useVolunteerFetch<RegistrationRow[]>(
        "/api/volunteer/beneficiary-registrations",
        "registrations",
        "/volunteer/beneficiaries"
    );
    const items = data ?? [];

    return (
        <div>
            <PageHeader
                title="Register a beneficiary"
                subtitle="Assist a beneficiary's registration. An admin reviews and approves eligibility — you cannot approve."
                count={state === "ready" ? items.length : undefined}
            />

            <BeneficiaryRegisterForm
                onDone={reload}
                heading="Register a beneficiary (volunteer assist)"
                endpoint="/api/volunteer/beneficiary-registrations"
            />

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="registrations"
                emptyHint="Submit a registration above — it will appear here pending admin review."
            >
                <TableShell hideCols={[5]}>
                    <TableHead columns={["Name", "Category", "Identity", "Status", "Submitted"]} />
                    <tbody className="divide-y divide-slate-100">
                        {items.map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 text-slate-800">
                                    <Dash>{r.full_name}</Dash>
                                </td>
                                <td className="px-4 py-3 capitalize text-slate-700">
                                    {r.category.replace(/_/g, " ")}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-500">
                                    {r.face_hash_present ? "face ✓" : "no face"}
                                    {r.aadhaar_present ? " · aadhaar ✓" : ""}
                                </td>
                                <td className="px-4 py-3">
                                    <StatusBadge value={r.status} />
                                </td>
                                <td className="px-4 py-3 text-slate-500">
                                    {shortDate(r.created_at)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </TableShell>
            </ListStates>
        </div>
    );
}
