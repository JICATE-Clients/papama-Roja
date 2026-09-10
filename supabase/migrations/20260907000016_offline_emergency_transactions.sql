-- =============================================================================
-- E-4 (B-30) — Controlled offline emergency transactions
-- =============================================================================
-- Work Order card E-4, CD §D-9. Apply after 20260907000015.
-- Design: docs/design-offline-emergency-transactions.md
--
-- EMERGENCY ONLY. CD §D-9: "Emergency Mode + No Connectivity = Controlled
-- Emergency Offline Procedure". Normal operations have NO offline path — during
-- normal periods volunteers "shall not improvise or create unverified
-- redemptions". Enforced at sync: a capture whose emergency was not genuinely
-- active at capture time is rejected, whatever the device claimed.
--
-- THE CENTRAL RULE, and the reason this table exists at all: an offline capture
-- does NOT redeem a token. It records that a meal was served. The token is
-- burned only at sync, after full normal validation. So this is a QUEUE of
-- claims awaiting validation, never a ledger of completed redemptions — which is
-- why it has its own table rather than writing straight into token_redemptions.
-- =============================================================================

begin;

create type public.offline_txn_status as enum (
    'pending_sync',                 -- on the device, not yet uploaded
    'pending_offline_validation',   -- received, awaiting validation
    'validated',                    -- passed; a real redemption now exists
    'rejected',                     -- failed validation; NO token burned
    'duplicate'                     -- conflicts with another capture; human decides
);

comment on type public.offline_txn_status is
    'CD §D-9 lifecycle. ''pending_offline_validation'' is the client''s stated wording. ''rejected'' means the meal was served but the token was NOT burned — see the settlement policy config below.';

create type public.offline_txn_source as enum ('food_partner', 'volunteer');

comment on type public.offline_txn_source is
    'MANDATORY per the 18 Aug confirmation. Post-emergency review runs SEPARATELY BY SOURCE: a Food Partner recording at their own till and a volunteer recording in a field are different risk profiles and must not be pooled.';

-- --- the offline transaction record (CD §D-9's 11 fields + source) ------------
create table public.offline_transactions (
    -- 1. Generated ON THE DEVICE — it cannot ask the server for an id. Primary
    --    key, so a re-uploaded batch is idempotent by construction.
    id                     uuid primary key,
    -- 2
    token_id               uuid references public.tokens (id) on delete set null,
    -- 3
    volunteer_id           uuid references public.volunteers (id) on delete set null,
    -- 4
    food_partner_id        uuid references public.vendors (id) on delete set null,
    -- 5. "Where available" (CD §D-9) — usually NULL in the field case.
    beneficiary_identifier text,
    -- 6
    emergency_id           uuid references public.emergencies (id) on delete set null,
    -- 7. The DEVICE clock. Claimed, not trusted — see received_at.
    captured_at            timestamptz not null,
    -- 8
    token_meal_type        text,
    -- 9
    waiver_status          boolean not null default false,
    -- 10
    status                 public.offline_txn_status not null default 'pending_offline_validation',
    -- 11
    device_reference       text not null,
    -- 12 (confirmed 18 Aug)
    source                 public.offline_txn_source not null,

    -- Server-side facts, never supplied by the device.
    received_at            timestamptz not null default now(),
    validated_at           timestamptz,
    rejection_reason       text,
    -- The redemption this became, once validated.
    redemption_id          uuid references public.token_redemptions (id) on delete set null,
    -- Set when this capture conflicts with another (§9 of the design).
    conflicts_with         uuid references public.offline_transactions (id) on delete set null,
    created_at             timestamptz not null default now()
);

comment on table public.offline_transactions is
    'Offline emergency capture queue (CD §D-9, E-4/B-30). A QUEUE OF CLAIMS awaiting validation, never a ledger of completed redemptions — an offline capture does not redeem a token; the token is burned at sync after full normal validation. The id is device-generated and is the primary key, so re-uploading a batch is idempotent.';

comment on column public.offline_transactions.captured_at is
    'The DEVICE clock at capture. Claimed, not trusted — a device clock is a value an attacker controls. Emergency-window validation uses the server''s knowledge of the emergency period, not this.';
comment on column public.offline_transactions.source is
    'food_partner (primary route, at premises) or volunteer (secondary, field). Mandatory: post-emergency review is run separately by source.';

create index offline_transactions_status_idx
    on public.offline_transactions (status, received_at desc)
    where status in ('pending_offline_validation', 'duplicate');
create index offline_transactions_token_idx on public.offline_transactions (token_id)
    where token_id is not null;
create index offline_transactions_device_idx on public.offline_transactions (device_reference);
create index offline_transactions_emergency_idx on public.offline_transactions (emergency_id)
    where emergency_id is not null;
create index offline_transactions_source_idx on public.offline_transactions (source, received_at desc);

-- --- device registry ---------------------------------------------------------
-- The admin "unsynced view" (CD §D-9) needs to know a device EXISTS and when it
-- last synced. Without this, a device that captures and never returns is
-- invisible: meals served with no record reaching the platform, and nobody aware.
create table public.offline_devices (
    device_reference text primary key,
    -- Who the device belongs to, as far as we know.
    volunteer_id     uuid references public.volunteers (id) on delete set null,
    vendor_id        uuid references public.vendors (id) on delete set null,
    label            text,
    last_seen_at     timestamptz,
    last_sync_at     timestamptz,
    pending_reported integer not null default 0 check (pending_reported >= 0),
    -- An admin can mark a device compromised (design §7). Anything later synced
    -- from it lands in the exception queue rather than validating.
    is_compromised   boolean not null default false,
    compromised_at   timestamptz,
    compromised_by   uuid references public.users (id) on delete set null,
    compromised_note text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

comment on table public.offline_devices is
    'Devices that have captured offline (CD §D-9 admin unsynced view). is_compromised is the response to a lost or stolen device: records later synced from it go to the exception queue instead of validating — the only server-side control available once a device is physically gone.';

create index offline_devices_stale_idx on public.offline_devices (last_sync_at)
    where pending_reported > 0;

create trigger offline_devices_set_updated_at
    before update on public.offline_devices
    for each row execute function public.set_updated_at();

-- --- config: the limits (CD §D-9 "limits configurable post-pilot") ------------
-- ALL SEEDED NULL, deliberately. These four numbers are the client's to set, and
-- the design document lists them as decisions JICATE has not yet made. The same
-- discipline as max_tokens_per_volunteer: a NULL is visibly incomplete and gets
-- fixed, whereas an invented default silently becomes policy nobody approved.
--
-- Every consumer treats NULL as "limit not enforced" and says so in the admin
-- UI, rather than guessing a value.
insert into public.system_config (key, value, value_type, description) values
    ('offline_max_pending_per_device', null, 'number',
     'Max unsynced offline captures one device may hold (CD §D-9). NULL = not enforced — awaiting a client value.'),
    ('offline_max_pending_per_volunteer', null, 'number',
     'Max unsynced offline captures one volunteer may hold across devices (CD §D-9). NULL = not enforced — awaiting a client value.'),
    ('offline_max_sync_window_hours', null, 'number',
     'Hours after capture beyond which a sync is rejected as too stale to validate (CD §D-9). NULL = not enforced — awaiting a client value.'),
    ('offline_unsynced_alert_hours', null, 'number',
     'Hours a device may hold unsynced captures before an admin alert (CD §D-9). NULL = no alert — awaiting a client value.'),
    ('offline_capture_enabled', 'false', 'boolean',
     'Master switch for offline emergency capture. Ships FALSE: the capability is built but must be deliberately turned on, per emergency, by an administrator.')
on conflict (key) do nothing;

-- --- settlement policy for rejected captures (design §9.1) -------------------
-- THE DECISION THE DESIGN FLAGS AS THE CLIENT'S. A meal served offline against a
-- token that later fails validation: the food is gone, the token is not burned,
-- and the Food Partner still expects payment.
--
-- Seeded 'review' — the option that decides nothing. It neither pays out nor
-- refuses; it routes the case to a human. Defaulting to 'absorb' would commit
-- pApAmA's money on a policy nobody approved, and 'refuse' would make a Food
-- Partner bear a loss for serving a meal in good faith during a disaster.
insert into public.system_config (key, value, value_type, description) values
    ('offline_rejected_settlement_policy', 'review', 'string',
     'What happens when an offline capture fails validation but the meal was served (E-4 design §9.1): absorb (pay the Food Partner from the Meal Pool) | refuse (no settlement) | review (route to a human). Seeded ''review'' because it decides nothing — the real choice is the client''s.')
on conflict (key) do nothing;

-- --- RLS ---------------------------------------------------------------------
alter table public.offline_transactions enable row level security;
alter table public.offline_devices      enable row level security;

create policy offline_transactions_select_staff on public.offline_transactions
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance', 'vendor_manager'));
create policy offline_transactions_write_admin on public.offline_transactions
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

create policy offline_devices_select_staff on public.offline_devices
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance', 'vendor_manager'));
create policy offline_devices_write_admin on public.offline_devices
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- offline_transactions holds claims that meals were served. Dropping it destroys
-- the only record of redemptions captured while the platform was unreachable.
-- Export before rolling back.
--
-- begin;
-- drop policy if exists offline_devices_write_admin       on public.offline_devices;
-- drop policy if exists offline_devices_select_staff      on public.offline_devices;
-- drop policy if exists offline_transactions_write_admin  on public.offline_transactions;
-- drop policy if exists offline_transactions_select_staff on public.offline_transactions;
-- drop trigger if exists offline_devices_set_updated_at   on public.offline_devices;
-- drop table if exists public.offline_transactions cascade;
-- drop table if exists public.offline_devices      cascade;
-- drop type  if exists public.offline_txn_source;
-- drop type  if exists public.offline_txn_status;
-- delete from public.system_config where key like 'offline_%';
-- commit;
