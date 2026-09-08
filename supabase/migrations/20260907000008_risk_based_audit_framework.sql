-- =============================================================================
-- F-3 (B-25) — Risk-based audit framework
-- =============================================================================
-- Work Order card F-3, CD §D-5. Apply after 20260907000007.
--
-- CLIENT'S KEY PRINCIPLE: "10% random audit is the baseline, not the ceiling."
-- Random sampling is supplemented by risk-based and exception-based audits, and
-- the audit rate itself may only change with authorised approval.
--
-- WHAT EXISTS: `settlement_audit_queue` (addon #10) — a flat list of settlements
-- pulled for review, randomly sampled or flagged. It is kept and still used as
-- the reviewer's work queue. What it cannot do is prove HOW a sample was drawn:
-- there is no record of the cycle, the population it was drawn from, or the rate
-- in force at the time, and rows are deletable. An audit sample that cannot be
-- shown to have been drawn honestly is not an audit sample. This migration adds
-- the evidence layer around the queue rather than replacing it.
--
-- THREE NEW TABLES, all APPEND-ONLY by trigger:
--   settlement_audit_selections — proof of how each cycle's sample was drawn
--   settlement_audit_records    — CD's 14-field findings, never deleted
--   exception_queue             — inherently risky transactions, auto-flagged.
--                                 Built ONCE here and shared with E-3 and F-2(i)
--                                 per the Work Order's cross-cutting note.
-- =============================================================================

begin;

create type public.audit_severity as enum ('critical', 'major', 'minor');

comment on type public.audit_severity is
    'Finding grade (CD §D-5), linked to the D-3 graduated corrective-action framework.';

create type public.vendor_risk_status as enum ('low', 'normal', 'medium', 'high');

comment on type public.vendor_risk_status is
    'Basic Food Partner risk status (CD §D-5). A COMPOSITE rating is explicitly Phase 2 (B-25e) — this is the manually-set basic field only, and nothing here computes it.';

-- --- selection record: proof of how the sample was drawn ---------------------
create table public.settlement_audit_selections (
    id              uuid primary key default gen_random_uuid(),
    -- The cycle this selection covers. Text rather than a date range so a cycle
    -- keeps its identity even if its window is later described differently.
    cycle_ref       text not null,
    cycle_start     date,
    cycle_end       date,
    -- The evidence: what was eligible, how many were drawn, and at what rate.
    -- Without the population and the rate, a sample of 3 proves nothing.
    population_count integer not null check (population_count >= 0),
    sample_count     integer not null check (sample_count >= 0),
    rate_applied     numeric(5, 4),
    selection_method text not null default 'random'
        check (selection_method in ('random', 'targeted', 'exception', 'enhanced')),
    -- Why, when the selection is targeted rather than random.
    targeted_reason  text,
    selected_at      timestamptz not null default now(),
    assigned_to      uuid references public.users (id) on delete set null,
    result           text,
    completed_at     timestamptz,
    created_at       timestamptz not null default now(),
    constraint settlement_audit_selections_sample_le_population
        check (sample_count <= population_count)
);

comment on table public.settlement_audit_selections is
    'Permanent, tamper-proof record of how each audit cycle''s sample was drawn (CD §D-5): cycle, population, sample size, rate, timestamp, assignment, result. Append-only — a selection cannot be edited or deleted, because a sample you can quietly re-draw after seeing the results is not a sample.';

-- Which settlements a selection drew. Separate table so the selection header
-- stays immutable while remaining provably linked to its members.
create table public.settlement_audit_selection_items (
    id            uuid primary key default gen_random_uuid(),
    selection_id  uuid not null references public.settlement_audit_selections (id) on delete restrict,
    settlement_id uuid not null references public.vendor_settlements (id) on delete restrict,
    created_at    timestamptz not null default now(),
    unique (selection_id, settlement_id)
);

comment on table public.settlement_audit_selection_items is
    'The settlements a selection drew. ON DELETE RESTRICT both ways and no delete policy: CD §D-5 says selected settlements cannot be removed once selected.';

create index settlement_audit_selection_items_settlement_idx
    on public.settlement_audit_selection_items (settlement_id);

-- --- audit records: CD's 14 fields, never deleted ----------------------------
create table public.settlement_audit_records (
    id                  uuid primary key default gen_random_uuid(),          -- 1
    selection_id        uuid references public.settlement_audit_selections (id) on delete restrict, -- 2
    settlement_id       uuid not null references public.vendor_settlements (id) on delete restrict, -- 3
    vendor_id           uuid references public.vendors (id) on delete set null,                      -- 4
    auditor_id          uuid references public.users (id) on delete set null,                        -- 5
    audit_started_at    timestamptz,                                          -- 6
    audit_completed_at  timestamptz,                                          -- 7
    severity            public.audit_severity,                                -- 8
    finding_category    text,                                                 -- 9
    finding_summary     text,                                                 -- 10
    evidence_refs       jsonb not null default '[]'::jsonb,                   -- 11
    -- CD §D-5: the audit verifies the full chain token → Food Partner →
    -- contribution/waiver → settlement → payment, and the ₹10 contribution
    -- reconciliation "receives special attention". Recorded explicitly so a
    -- completed audit that skipped it is visible rather than assumed.
    contribution_verified boolean not null default false,                     -- 12
    corrective_action   text,                                                 -- 13
    status              text not null default 'open'
        check (status in ('open', 'in_review', 'closed')),                    -- 14
    created_at          timestamptz not null default now()
);

comment on table public.settlement_audit_records is
    'Permanent audit findings (CD §D-5, 14 fields). Severity grades link to the D-3 corrective-action ladder. APPEND-ONLY: findings are never deleted, and a closed finding is superseded by a new record rather than edited away.';

create index settlement_audit_records_settlement_idx on public.settlement_audit_records (settlement_id);
create index settlement_audit_records_vendor_idx     on public.settlement_audit_records (vendor_id);
create index settlement_audit_records_severity_idx   on public.settlement_audit_records (severity)
    where severity is not null;
create index settlement_audit_records_open_idx       on public.settlement_audit_records (status)
    where status <> 'closed';

-- --- exception queue: built ONCE, shared (Work Order cross-cutting note) ------
create table public.exception_queue (
    id              uuid primary key default gen_random_uuid(),
    -- CD §D-5's list of inherently risky transaction kinds.
    exception_type  text not null check (exception_type in (
        'manual_adjustment', 'token_reissue', 'reversal', 'refund',
        'manual_entry', 'bank_account_change', 'unusual_waiver', 'fraud_linked',
        'emergency_pattern', 'offline_duplicate'
    )),
    entity_table    text not null,
    entity_id       text not null,
    vendor_id       uuid references public.vendors (id) on delete set null,
    severity        public.audit_severity,
    detail          text,
    -- E-3 filters this queue by Emergency ID for the post-emergency review.
    emergency_id    uuid,
    status          text not null default 'open'
        check (status in ('open', 'in_review', 'cleared', 'escalated')),
    reviewed_by     uuid references public.users (id) on delete set null,
    reviewed_at     timestamptz,
    resolution      text,
    created_at      timestamptz not null default now(),
    -- The same event must not queue twice — a retried write would otherwise
    -- inflate the queue and the exception statistics with it.
    unique (entity_table, entity_id, exception_type)
);

comment on table public.exception_queue is
    'Auto-flagged inherently risky transactions (CD §D-5). Built ONCE here and shared: E-3 filters it by emergency_id for post-emergency review, F-2(i) feeds adjustments and reversals into it, and E-4 feeds cross-batch offline duplicates. UNIQUE on (entity, type) so a retried write cannot double-queue.';

create index exception_queue_open_idx on public.exception_queue (status, created_at desc)
    where status = 'open';
create index exception_queue_type_idx on public.exception_queue (exception_type);
create index exception_queue_emergency_idx on public.exception_queue (emergency_id)
    where emergency_id is not null;

-- --- Food Partner basic risk status ------------------------------------------
alter table public.vendors
    add column risk_status public.vendor_risk_status not null default 'normal',
    add column risk_status_note text,
    add column risk_status_updated_at timestamptz,
    add column risk_status_updated_by uuid references public.users (id) on delete set null;

comment on column public.vendors.risk_status is
    'Basic risk tier (CD §D-5) driving the three audit tiers: normal 10% / medium-high enhanced / high 100%. Set by a human — the COMPOSITE computed rating is explicitly Phase 2 (B-25e), and nothing here computes it.';

-- --- append-only enforcement -------------------------------------------------
-- CD §D-5: selections cannot be removed once selected; audit records are never
-- deleted. Enforced by trigger so it holds for service_role too — the whole
-- point is that nobody, including the application, can quietly erase evidence.
create or replace function public.forbid_delete()
returns trigger
language plpgsql
as $$
begin
    raise exception 'rows in % are permanent and cannot be deleted', tg_table_name
        using errcode = 'restrict_violation';
end;
$$;

comment on function public.forbid_delete() is
    'Blocks DELETE outright. Used by the audit-evidence tables (CD §D-5): a sample or a finding that can be deleted is not evidence.';

create trigger settlement_audit_selections_no_delete
    before delete on public.settlement_audit_selections
    for each row execute function public.forbid_delete();

create trigger settlement_audit_selection_items_no_delete
    before delete on public.settlement_audit_selection_items
    for each row execute function public.forbid_delete();

create trigger settlement_audit_records_no_delete
    before delete on public.settlement_audit_records
    for each row execute function public.forbid_delete();

-- --- RLS ---------------------------------------------------------------------
alter table public.settlement_audit_selections      enable row level security;
alter table public.settlement_audit_selection_items enable row level security;
alter table public.settlement_audit_records         enable row level security;
alter table public.exception_queue                  enable row level security;

-- Compliance reads everything (audit independence, CD §D-5) but is not given a
-- blanket write: findings are written by the auditing flow, not edited ad hoc.
create policy settlement_audit_selections_select_staff on public.settlement_audit_selections
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));
create policy settlement_audit_selections_insert_staff on public.settlement_audit_selections
    for insert to authenticated
    with check (private.current_app_role() in ('admin', 'compliance'));
create policy settlement_audit_selections_update_staff on public.settlement_audit_selections
    for update to authenticated
    using (private.current_app_role() in ('admin', 'compliance'))
    with check (private.current_app_role() in ('admin', 'compliance'));

create policy settlement_audit_selection_items_select_staff on public.settlement_audit_selection_items
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));
create policy settlement_audit_selection_items_insert_staff on public.settlement_audit_selection_items
    for insert to authenticated
    with check (private.current_app_role() in ('admin', 'compliance'));

create policy settlement_audit_records_select_staff on public.settlement_audit_records
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));
create policy settlement_audit_records_insert_staff on public.settlement_audit_records
    for insert to authenticated
    with check (private.current_app_role() in ('admin', 'compliance'));
create policy settlement_audit_records_update_staff on public.settlement_audit_records
    for update to authenticated
    using (private.current_app_role() in ('admin', 'compliance'))
    with check (private.current_app_role() in ('admin', 'compliance'));

create policy exception_queue_select_staff on public.exception_queue
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance', 'vendor_manager'));
create policy exception_queue_write_staff on public.exception_queue
    for all to authenticated
    using (private.current_app_role() in ('admin', 'compliance'))
    with check (private.current_app_role() in ('admin', 'compliance'));

-- --- the client-confirmed 10% baseline ---------------------------------------
-- CD §D-5 confirms 10%. A real approved number, so it is set rather than left
-- NULL. The description records that it is a floor, not a target.
update public.system_config
set value = '0.10',
    description = 'Baseline fraction (0..1) of eligible Food Partner settlement batches pulled for RANDOM audit (CD §D-5). 10% is the BASELINE, NOT THE CEILING — risk-based and exception-based audits run on top, and a minimum of one settlement per cycle applies regardless of this rate. Changing it requires authorised approval.'
where key = 'settlement_random_audit_rate';

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- Dropping these destroys audit evidence, which is the one thing CD §D-5 says
-- must be permanent. The no-delete triggers must be dropped first, which is
-- itself a deliberate speed bump. Export everything before rolling back.
--
-- begin;
-- drop trigger if exists settlement_audit_records_no_delete         on public.settlement_audit_records;
-- drop trigger if exists settlement_audit_selection_items_no_delete on public.settlement_audit_selection_items;
-- drop trigger if exists settlement_audit_selections_no_delete      on public.settlement_audit_selections;
-- drop table if exists public.exception_queue                  cascade;
-- drop table if exists public.settlement_audit_records         cascade;
-- drop table if exists public.settlement_audit_selection_items cascade;
-- drop table if exists public.settlement_audit_selections      cascade;
-- alter table public.vendors
--     drop column if exists risk_status,
--     drop column if exists risk_status_note,
--     drop column if exists risk_status_updated_at,
--     drop column if exists risk_status_updated_by;
-- drop function if exists public.forbid_delete();
-- drop type if exists public.vendor_risk_status;
-- drop type if exists public.audit_severity;
-- commit;
