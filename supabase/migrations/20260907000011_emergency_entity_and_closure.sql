-- =============================================================================
-- E-1 (B-26 a,d,e) — Emergency event entity, tagging and closure reconciliation
-- =============================================================================
-- Work Order card E-1, CD §D-6. Lane 3's foundation: E-2, E-3, E-6 and the
-- closure reconciliation all hang off this entity. Apply after 20260907000010.
--
-- WHAT EXISTS: a global `emergency_mode_enabled` boolean plus time-boxed
-- `emergency_overrides` with auto-revert, and `tokens.is_emergency` as a
-- provenance flag. What is missing is the EVENT itself. Today "emergency mode"
-- is a switch with no subject — you can tell that relaxed limits were in force,
-- but not WHICH emergency, where, on whose authority, or what was spent on it.
--
-- CD §D-6 requires a unique Emergency ID (e.g. TN-FLOOD-2026-001) carrying the
-- reason, geographic scope, period, activator and audit trail, with every
-- emergency donation and token linked to it "for accounting, monitoring and
-- reporting". That is not reporting garnish: the surplus rules below only work
-- if you can say exactly what came in and what went out for one emergency.
--
-- THE SURPLUS RULE, which drives the closure record's shape (client verbatim):
-- surplus is NOT refunded to donors. It goes (1) to the specific emergency,
-- then (2) to continuing humanitarian needs in the same affected area, then
-- (3) to the Emergency Response Fund. "All such utilisation shall be
-- documented, accounted for and appropriately reported" — so the closure record
-- stores the DECISION and its APPROVER, not just the numbers.
-- =============================================================================

begin;

create type public.emergency_status as enum ('active', 'closed', 'cancelled');

comment on type public.emergency_status is
    'Lifecycle of an emergency event (CD §D-6). No indefinite emergency: an active one always carries an end date, extended only by explicit authorised action with a reason.';

-- --- the emergency event ------------------------------------------------------
create table public.emergencies (
    id            uuid primary key default gen_random_uuid(),
    -- The human Emergency ID, e.g. 'TN-FLOOD-2026-001'. Unique and stable: it
    -- appears in reports, donor communications and CSR statements, so it is the
    -- identifier people quote, not the UUID.
    emergency_ref text not null unique check (emergency_ref ~ '^[A-Z0-9][A-Z0-9-]{4,49}$'),
    title         text not null,
    reason        text not null,

    -- Geographic scope, referencing the A-1 masters rather than free text so an
    -- emergency can be queried and reported against the same location spine the
    -- tokens and redemptions use.
    scope_state_id    uuid references public.states    (id) on delete restrict,
    scope_district_id uuid references public.districts (id) on delete restrict,
    scope_city        text,
    -- Beneficiary scope "where applicable" (CD §D-6) — e.g. limited to a
    -- category. NULL means the whole affected area.
    beneficiary_scope text,

    status        public.emergency_status not null default 'active',
    activated_by  uuid references public.users (id) on delete set null,
    activated_at  timestamptz not null default now(),
    -- No indefinite emergency mode (CD §D-6). NOT NULL enforces that at the
    -- schema level rather than trusting the activation flow to remember.
    ends_at       timestamptz not null,
    extended_count integer not null default 0 check (extended_count >= 0),

    -- Planning estimates recorded at activation, so the closure report can show
    -- expectation against outturn.
    estimated_beneficiaries integer check (estimated_beneficiaries >= 0),
    estimated_meals         integer check (estimated_meals >= 0),
    estimated_funds_inr     numeric(14, 2) check (estimated_funds_inr >= 0),

    closed_at     timestamptz,
    closed_by     uuid references public.users (id) on delete set null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    constraint emergencies_period_order check (ends_at > activated_at)
);

comment on table public.emergencies is
    'Authorised humanitarian emergency events (CD §D-6). emergency_ref (e.g. TN-FLOOD-2026-001) is the identifier quoted in reports, donor communications and CSR statements. Every emergency donation, token and redemption links here so one emergency''s accounts can be closed and reconciled.';

comment on column public.emergencies.ends_at is
    'NOT NULL by design: CD §D-6 forbids indefinite emergency mode. Extension is an explicit authorised action that moves this date and increments extended_count, never an open-ended state.';

create unique index emergencies_ref_key on public.emergencies (emergency_ref);
create index emergencies_active_idx on public.emergencies (status, ends_at)
    where status = 'active';
create index emergencies_district_idx on public.emergencies (scope_district_id)
    where scope_district_id is not null;

create trigger emergencies_set_updated_at
    before update on public.emergencies
    for each row execute function public.set_updated_at();

-- --- extension trail ----------------------------------------------------------
-- CD §D-6: "extension only by explicit authorised action + reason + revised end
-- date". A separate table rather than overwriting ends_at, because how long an
-- emergency ran and who kept extending it is exactly what a reviewer asks.
create table public.emergency_extensions (
    id            uuid primary key default gen_random_uuid(),
    emergency_id  uuid not null references public.emergencies (id) on delete restrict,
    previous_ends_at timestamptz not null,
    new_ends_at      timestamptz not null,
    reason        text not null,
    extended_by   uuid references public.users (id) on delete set null,
    created_at    timestamptz not null default now(),
    constraint emergency_extensions_forward check (new_ends_at > previous_ends_at)
);

comment on table public.emergency_extensions is
    'Every extension of an emergency, with a MANDATORY reason (CD §D-6). Append-only history: how long an emergency ran and on whose repeated authority is precisely what a reviewer asks about.';

create index emergency_extensions_emergency_idx
    on public.emergency_extensions (emergency_id, created_at desc);

-- --- tagging: link donations, tokens and redemptions to the emergency --------
-- Rides the existing campaign_id pattern (the Work Order allows either); a
-- dedicated FK is used because an emergency is not a campaign and conflating
-- them would make campaign reporting wrong.
alter table public.donations
    add column emergency_id uuid references public.emergencies (id) on delete set null;
alter table public.tokens
    add column emergency_id uuid references public.emergencies (id) on delete set null;
alter table public.token_redemptions
    add column emergency_id uuid references public.emergencies (id) on delete set null;

comment on column public.donations.emergency_id is
    'Links a donation to its Emergency ID (CD §D-6). ON DELETE SET NULL, never CASCADE: deleting an emergency must never delete donations.';

create index donations_emergency_idx        on public.donations        (emergency_id) where emergency_id is not null;
create index tokens_emergency_id_idx        on public.tokens           (emergency_id) where emergency_id is not null;
create index token_redemptions_emergency_idx on public.token_redemptions (emergency_id) where emergency_id is not null;

-- --- closure reconciliation ---------------------------------------------------
-- CD §D-6's permanent record: funds received/utilised/committed; tokens
-- issued/redeemed/unused; surplus; utilisation decision; approver; closure date.
create table public.emergency_closures (
    id            uuid primary key default gen_random_uuid(),
    emergency_id  uuid not null unique references public.emergencies (id) on delete restrict,

    funds_received_inr  numeric(14, 2) not null default 0,
    funds_utilised_inr  numeric(14, 2) not null default 0,
    funds_committed_inr numeric(14, 2) not null default 0,

    tokens_issued   integer not null default 0 check (tokens_issued   >= 0),
    tokens_redeemed integer not null default 0 check (tokens_redeemed >= 0),
    tokens_unused   integer not null default 0 check (tokens_unused   >= 0),

    surplus_inr numeric(14, 2) not null default 0,
    -- The surplus hierarchy, in the client's order. There is deliberately NO
    -- 'donor_refund' option: CD §D-6 states surplus "shall not be subject to a
    -- normal donor refund or return process", and offering the choice in the
    -- schema would invite someone to make it.
    surplus_utilisation text
        check (surplus_utilisation in (
            'same_emergency', 'continuing_need_same_area', 'emergency_response_fund'
        )),
    surplus_utilisation_note text,

    approved_by uuid references public.users (id) on delete set null,
    closed_at   timestamptz not null default now(),
    created_at  timestamptz not null default now()
);

comment on table public.emergency_closures is
    'Permanent closure reconciliation for one emergency (CD §D-6). One row per emergency (UNIQUE). Stores the surplus UTILISATION DECISION and its APPROVER, not just the figures — "all such utilisation shall be documented, accounted for and appropriately reported". No donor-refund option exists in surplus_utilisation, because the client''s policy excludes it.';

-- A closure is evidence. Deleting it would erase the record of where surplus
-- donated money went.
create trigger emergency_closures_no_delete
    before delete on public.emergency_closures
    for each row execute function public.forbid_delete();

create trigger emergency_extensions_no_delete
    before delete on public.emergency_extensions
    for each row execute function public.forbid_delete();

-- --- RLS ----------------------------------------------------------------------
alter table public.emergencies          enable row level security;
alter table public.emergency_extensions enable row level security;
alter table public.emergency_closures   enable row level security;

-- Readable by staff generally: a volunteer or Food Partner needs to know an
-- emergency is running to understand why limits changed. Activation is
-- admin-only (CD §D-6: "activation restricted to authorised administrators").
create policy emergencies_select_authenticated on public.emergencies
    for select to authenticated using (true);
create policy emergencies_write_admin on public.emergencies
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

create policy emergency_extensions_select_staff on public.emergency_extensions
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));
create policy emergency_extensions_write_admin on public.emergency_extensions
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

create policy emergency_closures_select_staff on public.emergency_closures
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));
create policy emergency_closures_write_admin on public.emergency_closures
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

-- --- the client-confirmed Phase 1 parameters (CD §D-6) ------------------------
-- 4 meals / 3-hour cooldown / 7-day maximum. Real approved values, so they are
-- set rather than left NULL.
update public.system_config set value = '4'
    where key = 'emergency_max_meals_per_day'   and (value is null or btrim(value) = '');
update public.system_config set value = '3'
    where key = 'emergency_meal_cooldown_hours' and (value is null or btrim(value) = '');
update public.system_config set value = '7'
    where key = 'emergency_mode_max_duration_days' and (value is null or btrim(value) = '');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- Closure records document where surplus donated money went. The no-delete
-- triggers must be dropped first, which is a deliberate speed bump. Export
-- before rolling back.
--
-- begin;
-- drop trigger if exists emergency_extensions_no_delete on public.emergency_extensions;
-- drop trigger if exists emergency_closures_no_delete   on public.emergency_closures;
-- alter table public.token_redemptions drop column if exists emergency_id;
-- alter table public.tokens            drop column if exists emergency_id;
-- alter table public.donations         drop column if exists emergency_id;
-- drop table if exists public.emergency_closures   cascade;
-- drop table if exists public.emergency_extensions cascade;
-- drop table if exists public.emergencies          cascade;
-- drop type  if exists public.emergency_status;
-- commit;
