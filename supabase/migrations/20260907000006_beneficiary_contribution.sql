-- =============================================================================
-- F-1 (B-01) — ₹10 beneficiary contribution: status, waivers, remittance
-- =============================================================================
-- Work Order card F-1, CD §D-1. Lane 2 — the most sensitive surface. Apply after
-- 20260907000005.
--
-- THE CLIENT'S FOUR PRINCIPLES (verbatim, 14 Aug), which drive every choice here:
--   1. ₹10 is a beneficiary contribution to pApAmA and is NOT Food Partner
--      revenue.
--   2. The Food Partner may collect it only as an AUTHORISED COLLECTION AGENT of
--      pApAmA.
--   3. The Food Partner's meal settlement is released only AFTER the ₹10 has
--      been received/reconciled, except where an authorised humanitarian waiver
--      has been recorded.
--   4. Basic waiver recording and reconciliation must exist in Phase 1.
--
-- THE WORKED EXAMPLE MATTERS MORE THAN IT LOOKS. Client's §8: a ₹50 meal means
-- ₹50 payable to the Food Partner AND ₹10 payable to pApAmA — "the two remain
-- completely separate". So the contribution is NEVER netted off the settlement.
-- The partner is paid the full meal value; the ₹10 is a separate obligation they
-- owe pApAmA as collection agent. Deducting it would be simpler to build and
-- would silently make the partner fund the contribution, which is exactly what
-- principle 1 forbids.
--
-- RECONCILED with what exists: `token_redemptions.co_pay_inr` already records an
-- amount, but as an OPTIONAL voluntary co-pay with no status, no waiver concept
-- and no bearing on settlement. It is kept as "the amount actually collected"
-- and the policy layer is built around it, rather than adding a second money
-- column that could disagree with it.
-- =============================================================================

begin;

create type public.contribution_status as enum ('collected', 'waived', 'outstanding');

comment on type public.contribution_status is
    'Per-redemption ₹10 contribution state (CD §D-1). outstanding = due but not yet remitted/reconciled — this is what gates settlement release. collected = received and reconciled. waived = an authorised humanitarian waiver was recorded.';

-- --- per-redemption contribution state ---------------------------------------
alter table public.token_redemptions
    -- What was DUE under policy at redemption time. Frozen per row: the policy
    -- value can change later and historical rows must not silently re-price.
    add column contribution_expected_inr integer not null default 0
        check (contribution_expected_inr >= 0),
    add column contribution_status public.contribution_status not null default 'outstanding',
    add column contribution_reconciled_at timestamptz;

comment on column public.token_redemptions.contribution_expected_inr is
    'What the beneficiary contribution was under policy AT REDEMPTION TIME (CD §D-1). Frozen per row — changing the config must never re-price historical redemptions. 0 means no contribution applied.';
comment on column public.token_redemptions.contribution_status is
    'collected | waived | outstanding. A settlement cannot be paid while any line is outstanding (enforced in the settlement service).';

-- A redemption with nothing expected is settled by definition — it must not sit
-- 'outstanding' and block a settlement forever.
update public.token_redemptions
set contribution_status = 'collected'
where contribution_expected_inr = 0;

create index token_redemptions_contribution_status_idx
    on public.token_redemptions (contribution_status)
    where contribution_status = 'outstanding';

-- --- waiver records (CD §D-1 minimum fields) ---------------------------------
-- The client listed the minimum fields explicitly. Several duplicate data on the
-- redemption (Food Partner, date/time, meal value); they are DENORMALISED here
-- on purpose. A waiver is an authorisation record that must remain readable and
-- auditable exactly as it was authorised, even if the redemption is later
-- adjusted. This is a governance record, not a view.
create table public.contribution_waivers (
    id                    uuid primary key default gen_random_uuid(),
    redemption_id         uuid not null unique
        references public.token_redemptions (id) on delete restrict,
    vendor_id             uuid references public.vendors (id) on delete set null,
    meal_value_inr        numeric(12, 2),
    contribution_applicable_inr integer not null default 0,
    collected             boolean not null default false,
    waived                boolean not null default true,
    -- WHO authorised it. Nullable only because a user row may later be removed;
    -- the application layer requires it at write time.
    authorised_by         uuid references public.users (id) on delete set null,
    reason                text not null,
    reason_category       text,
    -- Set when the waiver was applied automatically under an active emergency
    -- (E-2). CD §D-7 is explicit that an emergency waiver is system-indicated and
    -- NEVER Food-Partner or volunteer discretion, so the two must be
    -- distinguishable in the audit.
    emergency_id          uuid,
    settlement_status_at_waiver public.settlement_status,
    created_at            timestamptz not null default now()
);

comment on table public.contribution_waivers is
    'Authorised humanitarian waivers of the ₹10 contribution (CD §D-1). Fields are the client''s stated minimum set. Denormalised by design: a waiver must stay readable exactly as authorised even if the redemption changes. UNIQUE on redemption_id — one waiver per redemption, so a waiver cannot be silently stacked or replaced.';

create index contribution_waivers_vendor_idx on public.contribution_waivers (vendor_id);
create index contribution_waivers_created_idx on public.contribution_waivers (created_at desc);
create index contribution_waivers_emergency_idx on public.contribution_waivers (emergency_id)
    where emergency_id is not null;

alter table public.contribution_waivers enable row level security;

create policy contribution_waivers_select_staff on public.contribution_waivers
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

create policy contribution_waivers_write_admin on public.contribution_waivers
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

-- --- remittance & reconciliation ---------------------------------------------
-- The Food Partner collects ₹10 as pApAmA's agent, then remits it. A remittance
-- is the partner's declaration; reconciliation is pApAmA confirming receipt.
-- These are separate events and only the SECOND one releases a settlement —
-- principle 3 says "received/reconciled", not "declared".
create table public.contribution_remittances (
    id              uuid primary key default gen_random_uuid(),
    vendor_id       uuid not null references public.vendors (id) on delete restrict,
    -- The daily cycle (configurable later per CD §D-1) this batch covers.
    period_start    date not null,
    period_end      date not null,
    declared_amount_inr numeric(12, 2) not null check (declared_amount_inr >= 0),
    received_amount_inr numeric(12, 2) check (received_amount_inr >= 0),
    reference        text,
    status          text not null default 'declared'
        check (status in ('declared', 'reconciled', 'disputed')),
    declared_at     timestamptz not null default now(),
    reconciled_at   timestamptz,
    reconciled_by   uuid references public.users (id) on delete set null,
    notes           text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint contribution_remittances_period_order check (period_start <= period_end)
);

comment on table public.contribution_remittances is
    'Food Partner remittance of collected ₹10 contributions to the pApAmA Administration Account (CD §D-1, daily cycle initially). ''declared'' is the partner''s claim; ''reconciled'' is pApAmA confirming receipt. Only reconciliation releases settlement — principle 3 says received/reconciled, not declared.';

create index contribution_remittances_vendor_idx on public.contribution_remittances (vendor_id);
create index contribution_remittances_status_idx on public.contribution_remittances (status);
create index contribution_remittances_period_idx
    on public.contribution_remittances (period_start, period_end);

create trigger contribution_remittances_set_updated_at
    before update on public.contribution_remittances
    for each row execute function public.set_updated_at();

-- Which redemptions a remittance covers. Separate table so one remittance can
-- cover many redemptions and each redemption is provably in exactly one.
create table public.contribution_remittance_lines (
    id             uuid primary key default gen_random_uuid(),
    remittance_id  uuid not null references public.contribution_remittances (id) on delete cascade,
    redemption_id  uuid not null unique references public.token_redemptions (id) on delete restrict,
    amount_inr     integer not null check (amount_inr >= 0),
    created_at     timestamptz not null default now()
);

comment on table public.contribution_remittance_lines is
    'Which redemptions a remittance covers. UNIQUE on redemption_id: the same ₹10 can never be remitted twice, which would let a partner reconcile one payment against two obligations.';

create index contribution_remittance_lines_remittance_idx
    on public.contribution_remittance_lines (remittance_id);

alter table public.contribution_remittances      enable row level security;
alter table public.contribution_remittance_lines enable row level security;

create policy contribution_remittances_select_staff on public.contribution_remittances
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance', 'vendor_manager'));
create policy contribution_remittances_write_admin on public.contribution_remittances
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

-- A Food Partner may see their OWN remittances — they need to know what pApAmA
-- believes they owe and have received.
create policy contribution_remittances_select_vendor_own on public.contribution_remittances
    for select to authenticated
    using (
        private.current_app_role() = 'vendor'
        and vendor_id in (select v.id from public.vendors v where v.owner_id = auth.uid())
    );

create policy contribution_remittance_lines_select_staff on public.contribution_remittance_lines
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance', 'vendor_manager'));
create policy contribution_remittance_lines_write_admin on public.contribution_remittance_lines
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

-- --- config: the remittance cycle --------------------------------------------
insert into public.system_config (key, value, value_type, description) values
    ('contribution_remittance_cycle_days', '1', 'number',
     'How many days one contribution remittance batch covers (CD §D-1: daily initially, configurable later).')
on conflict (key) do nothing;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- Dropping contribution_waivers destroys authorisation records. Export them
-- first — a waiver is the evidence that a beneficiary was excused a payment on
-- someone's authority, and it is not reconstructible from anything else.
--
-- begin;
-- drop policy if exists contribution_remittance_lines_write_admin  on public.contribution_remittance_lines;
-- drop policy if exists contribution_remittance_lines_select_staff on public.contribution_remittance_lines;
-- drop policy if exists contribution_remittances_select_vendor_own on public.contribution_remittances;
-- drop policy if exists contribution_remittances_write_admin       on public.contribution_remittances;
-- drop policy if exists contribution_remittances_select_staff      on public.contribution_remittances;
-- drop trigger if exists contribution_remittances_set_updated_at   on public.contribution_remittances;
-- drop table if exists public.contribution_remittance_lines cascade;
-- drop table if exists public.contribution_remittances      cascade;
-- drop policy if exists contribution_waivers_write_admin  on public.contribution_waivers;
-- drop policy if exists contribution_waivers_select_staff on public.contribution_waivers;
-- drop table if exists public.contribution_waivers cascade;
-- drop index if exists public.token_redemptions_contribution_status_idx;
-- alter table public.token_redemptions
--     drop column if exists contribution_expected_inr,
--     drop column if exists contribution_status,
--     drop column if exists contribution_reconciled_at;
-- drop type if exists public.contribution_status;
-- delete from public.system_config where key = 'contribution_remittance_cycle_days';
-- commit;
