-- =============================================================================
-- E-5 (B-31) — Volunteer incident reporting
-- =============================================================================
-- Work Order card E-5, CD §D-9. Apply after 20260907000012.
--
-- CD §D-9's governing principle for the whole volunteer role: "The volunteer's
-- role is to facilitate access to PAPAMA assistance, not to create or alter
-- entitlement." An incident report is the SAFE outlet that principle needs. A
-- volunteer standing in front of someone hungry, with a closed Food Partner or a
-- token that will not scan, must have something to do other than improvise —
-- and CD §D-9 explicitly forbids improvising ("volunteers shall not improvise or
-- create unverified redemptions").
--
-- THE ELEVEN CATEGORIES ARE THE CLIENT'S OWN LIST, verbatim from CD §D-9, in
-- their order. They are not a taxonomy I designed and must not be "tidied":
--   no phone / no token / partner closed / partner refusing valid token /
--   no food / connectivity failure / token problem / urgent need /
--   food-safety concern / safety concern / other
--
-- WHY ONE-TAP MATTERS AT THE SCHEMA LEVEL. The acceptance criterion is a report
-- filed in TWO TAPS. That is only possible if `category` is the sole required
-- field — every other column is nullable or defaulted. A schema that demanded a
-- note, or a beneficiary reference, would push the volunteer into typing while
-- standing in a queue, and the report would not get filed at all. The reports
-- that never get written are the ones that matter most.
--
-- ASSISTANCE REQUESTS ARE FOLDED IN, per the card. 'urgent_need' and
-- 'safety_concern' are assistance requests wearing the same form — a separate
-- mechanism would mean a volunteer choosing which system to use under pressure.
-- =============================================================================

begin;

create type public.volunteer_incident_category as enum (
    'no_phone',
    'no_token',
    'partner_closed',
    'partner_refusing_valid_token',
    'no_food',
    'connectivity_failure',
    'token_problem',
    'urgent_need',
    'food_safety_concern',
    'safety_concern',
    'other'
);

comment on type public.volunteer_incident_category is
    'CD §D-9''s eleven one-tap categories, verbatim and in the client''s order. Not a designed taxonomy — do not merge, rename or "tidy" these without a client decision.';

create type public.volunteer_incident_status as enum (
    'open',
    'acknowledged',
    'in_progress',
    'resolved',
    'closed'
);

create table public.volunteer_incidents (
    id            uuid primary key default gen_random_uuid(),
    -- The ONLY required field. Everything else is optional so a report can be
    -- filed in two taps.
    category      public.volunteer_incident_category not null,

    volunteer_id  uuid references public.volunteers (id) on delete set null,
    reported_by   uuid references public.users (id) on delete set null,
    vendor_id     uuid references public.vendors (id) on delete set null,
    -- Free-text detail. Optional by design (see header).
    note          text,

    -- Location context: coordinates where available, plus the volunteer's
    -- recorded zone as a fallback. An incident with neither is still worth
    -- having — a partial report beats none.
    geo_lat       numeric,
    geo_lng       numeric,
    district_id   uuid references public.districts (id) on delete set null,
    city          text,

    -- Emergency context when one is running (E-1), so post-emergency review can
    -- see what volunteers were hitting in the field.
    emergency_id  uuid references public.emergencies (id) on delete set null,

    status        public.volunteer_incident_status not null default 'open',
    -- Two of the eleven categories are safety matters and are surfaced first in
    -- the admin queue. Stored rather than derived so the priority survives any
    -- later change to the category list.
    is_safety     boolean not null default false,

    acknowledged_by uuid references public.users (id) on delete set null,
    acknowledged_at timestamptz,
    resolution      text,
    resolved_by     uuid references public.users (id) on delete set null,
    resolved_at     timestamptz,

    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.volunteer_incidents is
    'Volunteer field incident reports (CD §D-9, E-5/B-31). `category` is the only required field so a report can be filed in two taps — a schema that demanded a note would push a volunteer into typing while standing in a queue, and the report would not get filed. Assistance requests are folded in: urgent_need and safety_concern are assistance requests on the same form.';

comment on column public.volunteer_incidents.is_safety is
    'True for food_safety_concern and safety_concern. Stored rather than derived so queue priority survives a later change to the category list. CD §D-9: volunteer safety provisions — never required to enter unsafe locations.';

create index volunteer_incidents_open_idx
    on public.volunteer_incidents (status, created_at desc)
    where status in ('open', 'acknowledged', 'in_progress');
-- Safety incidents lead the queue regardless of age.
create index volunteer_incidents_safety_idx
    on public.volunteer_incidents (is_safety, created_at desc)
    where is_safety and status <> 'closed';
create index volunteer_incidents_volunteer_idx on public.volunteer_incidents (volunteer_id);
create index volunteer_incidents_emergency_idx on public.volunteer_incidents (emergency_id)
    where emergency_id is not null;

create trigger volunteer_incidents_set_updated_at
    before update on public.volunteer_incidents
    for each row execute function public.set_updated_at();

-- --- safety flag maintained by trigger ---------------------------------------
-- Derived on write rather than trusted to every caller. A volunteer app that
-- forgot to set it would silently drop a safety report to the bottom of the
-- queue, which is the one failure mode this column exists to prevent.
create or replace function public.set_volunteer_incident_safety()
returns trigger
language plpgsql
as $$
begin
    new.is_safety := new.category in ('food_safety_concern', 'safety_concern');
    return new;
end;
$$;

create trigger volunteer_incidents_safety_flag
    before insert or update of category on public.volunteer_incidents
    for each row execute function public.set_volunteer_incident_safety();

-- --- RLS ----------------------------------------------------------------------
alter table public.volunteer_incidents enable row level security;

-- A volunteer files their own and sees their own. They deliberately CANNOT read
-- other volunteers' reports: an incident may name a Food Partner or describe a
-- safety situation, and that is staff information.
create policy volunteer_incidents_insert_own on public.volunteer_incidents
    for insert to authenticated
    with check (
        private.current_app_role() = 'volunteer'
        and reported_by = auth.uid()
    );

create policy volunteer_incidents_select_own on public.volunteer_incidents
    for select to authenticated
    using (private.current_app_role() = 'volunteer' and reported_by = auth.uid());

create policy volunteer_incidents_select_staff on public.volunteer_incidents
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

create policy volunteer_incidents_write_staff on public.volunteer_incidents
    for update to authenticated
    using (private.current_app_role() in ('admin', 'vendor_manager'))
    with check (private.current_app_role() in ('admin', 'vendor_manager'));

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop trigger if exists volunteer_incidents_safety_flag    on public.volunteer_incidents;
-- drop trigger if exists volunteer_incidents_set_updated_at on public.volunteer_incidents;
-- drop function if exists public.set_volunteer_incident_safety();
-- drop table if exists public.volunteer_incidents cascade;
-- drop type if exists public.volunteer_incident_status;
-- drop type if exists public.volunteer_incident_category;
-- commit;
