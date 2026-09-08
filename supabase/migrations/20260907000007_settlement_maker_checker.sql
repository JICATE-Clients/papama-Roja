-- =============================================================================
-- F-2 (B-24) — Settlement maker-checker enforcement
-- =============================================================================
-- Work Order card F-2, CD §D-4. Lane 2, most sensitive surface. Apply after
-- 20260907000006.
--
-- CLIENT'S CORE PRINCIPLE (verbatim, 14 Aug):
--   "No individual user shall have the ability to prepare, independently verify,
--    approve and release the same Food Partner settlement. Any material change to
--    a settlement after approval shall automatically invalidate the approval and
--    require fresh maker-checker authorisation."
--
-- WHAT EXISTS: the pending → locked → approved → reconciled → paid lifecycle with
-- an orthogonal on_hold flag, fully audited. What is missing is WHO did each
-- step. Today the audit log records it, but the settlement row itself does not —
-- so segregation cannot be ENFORCED, only reconstructed afterwards by reading
-- the audit trail. An audit trail tells you who broke the rule; a constraint
-- stops them. CD §D-4 asks for system-blocked, so the actor moves onto the row.
--
-- BANK DETAILS ALREADY EXIST. The card says "first confirm where/if bank details
-- are stored; if absent, add the fields under this card". They are present:
-- vendors.bank_account_name / bank_account_number / bank_ifsc (m04). So (f) is a
-- CHANGE-CONTROL problem, not a schema-gap problem, and no bank columns are added.
--
-- STATUS NAMES are retained per CD §D-4 Question 4 (client permits expressly).
-- The documented mapping to the client's logical stages is recorded as a table
-- comment so it lives with the data, not only in a doc that can drift.
-- =============================================================================

begin;

-- --- who did each step (controls a, e) ---------------------------------------
alter table public.vendor_settlements
    add column prepared_by   uuid references public.users (id) on delete set null,
    add column locked_by     uuid references public.users (id) on delete set null,
    add column approved_by   uuid references public.users (id) on delete set null,
    add column paid_by       uuid references public.users (id) on delete set null,
    add column hold_placed_by uuid references public.users (id) on delete set null,
    -- Whether the current hold is MATERIAL. CD §D-4: a maker cannot release their
    -- own material hold. A routine administrative hold is not subject to that.
    add column hold_is_material boolean not null default false;

comment on column public.vendor_settlements.locked_by is
    'Who locked (prepared) this settlement. The MAKER. Enforced distinct from approved_by and paid_by — CD §D-4 requires segregation be system-blocked, not merely auditable.';
comment on column public.vendor_settlements.approved_by is
    'Who approved. The CHECKER. Cleared whenever the approval is invalidated by a material change.';
comment on column public.vendor_settlements.hold_placed_by is
    'Who placed the current hold. A MATERIAL hold cannot be released by the person who placed it (CD §D-4).';

-- --- versioning (control b) --------------------------------------------------
-- CD §D-4: reopen → amend → new version → re-lock → fresh approval. A version
-- number on the row is what makes "fresh approval" checkable: an approval
-- recorded against v1 is not an approval of v2.
alter table public.vendor_settlements
    add column version integer not null default 1 check (version >= 1),
    add column approved_version integer,
    add column approval_invalidated_at timestamptz,
    add column approval_invalidated_reason text,
    add column rejected_by uuid references public.users (id) on delete set null,
    add column rejected_at timestamptz,
    add column rejected_reason text;

comment on column public.vendor_settlements.version is
    'Incremented on every reopen-and-amend cycle (CD §D-4 control b). An approval is only valid for the version it was granted against.';
comment on column public.vendor_settlements.approved_version is
    'The version that was approved. When version <> approved_version the approval is STALE and payment must be refused — this is control (c), auto-invalidation on material change, expressed as data rather than as a hope that someone re-checks.';
comment on column public.vendor_settlements.rejected_reason is
    'Mandatory when rejecting back to the maker (CD §D-4 control d). Enforced at the API layer; NULL here only because rejection is not the normal path.';

comment on table public.vendor_settlements is
    'Settlement records (contract §8) with maker-checker controls (F-2/CD §D-4). '
    'STATUS MAPPING to the client''s logical stages, retained per CD §D-4 Question 4: '
    'pending = PENDING/PREPARED; locked = LOCKED (maker done, awaiting checker); '
    'approved = VERIFIED/APPROVED; reconciled = pre-payment settlement reconciliation '
    '(NOT post-payment bank reconciliation); paid = PAYMENT INITIATED/PAID. '
    'on_hold is orthogonal to all of them.';

-- --- bank-account change control (control f) ---------------------------------
-- Bank columns already exist on vendors. What was missing is that anyone with
-- vendor-edit rights could change where the money goes, silently. This makes a
-- change a REQUEST that a second person must approve, and bars the requester
-- from approving payment to the account they introduced.
create table public.vendor_bank_change_requests (
    id                 uuid primary key default gen_random_uuid(),
    vendor_id          uuid not null references public.vendors (id) on delete cascade,
    -- Snapshot of the values being replaced, so the change is reviewable without
    -- reconstructing history.
    old_account_name   text,
    old_account_number text,
    old_ifsc           text,
    new_account_name   text not null,
    new_account_number text not null,
    new_ifsc           text not null,
    reason             text,
    -- Four eyes: requester and approver must differ, enforced by CHECK.
    requested_by       uuid references public.users (id) on delete set null,
    requested_at       timestamptz not null default now(),
    approved_by        uuid references public.users (id) on delete set null,
    approved_at        timestamptz,
    rejected_by        uuid references public.users (id) on delete set null,
    rejected_at        timestamptz,
    rejection_reason   text,
    -- When the new account becomes payable-to (CD §D-4 requires an effective date).
    effective_from     date,
    status             text not null default 'pending'
        check (status in ('pending', 'approved', 'rejected')),
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    constraint vendor_bank_change_four_eyes
        check (approved_by is null or requested_by is null or approved_by <> requested_by)
);

comment on table public.vendor_bank_change_requests is
    'Four-eyes control over Food Partner bank-account changes (CD §D-4 control f). The requester can never be the approver (vendor_bank_change_four_eyes), and the requester is additionally barred from approving PAYMENT to the account they introduced — that second rule is enforced in the settlement service, because it spans two tables.';

create index vendor_bank_change_requests_vendor_idx
    on public.vendor_bank_change_requests (vendor_id);
create index vendor_bank_change_requests_status_idx
    on public.vendor_bank_change_requests (status)
    where status = 'pending';

create trigger vendor_bank_change_requests_set_updated_at
    before update on public.vendor_bank_change_requests
    for each row execute function public.set_updated_at();

alter table public.vendor_bank_change_requests enable row level security;

create policy vendor_bank_change_requests_select_staff
    on public.vendor_bank_change_requests
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

create policy vendor_bank_change_requests_write_admin
    on public.vendor_bank_change_requests
    for all to authenticated
    using (private.current_app_role() in ('admin', 'vendor_manager'))
    with check (private.current_app_role() in ('admin', 'vendor_manager'));

-- --- backfill ----------------------------------------------------------------
-- Existing approved/paid settlements have no recorded approver. They are left
-- NULL rather than guessed at: inventing an approver would fabricate the exact
-- accountability record this card exists to create. Approved rows are marked as
-- approved at their current version so the staleness check does not retroactively
-- invalidate settlements that were approved legitimately under the old rules.
update public.vendor_settlements
set approved_version = version
where status in ('approved', 'reconciled', 'paid')
  and approved_version is null;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- Dropping vendor_bank_change_requests destroys the audit of who redirected a
-- Food Partner's money and who approved it. Export before rolling back.
--
-- begin;
-- drop policy if exists vendor_bank_change_requests_write_admin  on public.vendor_bank_change_requests;
-- drop policy if exists vendor_bank_change_requests_select_staff on public.vendor_bank_change_requests;
-- drop trigger if exists vendor_bank_change_requests_set_updated_at on public.vendor_bank_change_requests;
-- drop table if exists public.vendor_bank_change_requests cascade;
-- alter table public.vendor_settlements
--     drop column if exists prepared_by,
--     drop column if exists locked_by,
--     drop column if exists approved_by,
--     drop column if exists paid_by,
--     drop column if exists hold_placed_by,
--     drop column if exists hold_is_material,
--     drop column if exists version,
--     drop column if exists approved_version,
--     drop column if exists approval_invalidated_at,
--     drop column if exists approval_invalidated_reason,
--     drop column if exists rejected_by,
--     drop column if exists rejected_at,
--     drop column if exists rejected_reason;
-- commit;
