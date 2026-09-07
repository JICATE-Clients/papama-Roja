-- =============================================================================
-- A-1 (B-02) — Location masters & structured addresses
-- =============================================================================
-- Work Order card A-1, CD §D-2. Establishes the location spine that A-2 (token
-- geographic scope), E-1 (emergency scoping) and P-1 (City+State in
-- notifications) all depend on. Schema-first: this must land BEFORE pilot data
-- accumulates, because backfilling a district onto free-text city strings gets
-- harder with every row.
--
-- RECONCILIATION with the live schema (the card's "Current" is slightly off):
--   - `vendors` ALREADY has address / city / pincode / geo_lat / geo_lng. What is
--     genuinely missing is state + district, and the registered-vs-operating
--     split. The existing single address is treated as the REGISTERED address
--     and the new operating_* columns are added alongside it — nothing is
--     renamed or dropped, so existing reads keep working.
--   - `volunteers` and `beneficiaries` have NO location columns at all.
--   - `token_redemptions` has geo_lat/geo_lng but no place-name snapshot.
--
-- DESIGN NOTES
--   - Masters are reference data, not user data: readable by any authenticated
--     user (a registration form must populate its dropdowns), writable by admin
--     only.
--   - Snapshot columns on token_redemptions are plain TEXT, not FKs. That is the
--     point: a snapshot must not change when the Food Partner later edits their
--     address, and an FK would follow the rename. Historical redemptions must
--     keep saying where the meal was actually served.
--   - Beneficiary location is LENIENT by design (CD §D-2): every column is
--     nullable with no constraint that can block a registration. A hungry person
--     is not turned away for want of a PIN code.
-- =============================================================================

begin;

-- --- helper: a 6-digit Indian PIN, or NULL ----------------------------------
-- Indian PINs are exactly six digits and never start with 0. Written as a
-- reusable domain-style CHECK expression rather than repeated inline so every
-- table validates identically.
create or replace function public.is_valid_pincode(p text)
returns boolean
language sql
immutable
as $$
    select p is null or p ~ '^[1-9][0-9]{5}$';
$$;

comment on function public.is_valid_pincode(text) is
    'True when p is NULL or a valid 6-digit Indian PIN (first digit 1-9). Used by every address CHECK so validation cannot drift between tables.';

-- --- states ------------------------------------------------------------------
create table public.states (
    id         uuid primary key default gen_random_uuid(),
    -- Census/ISO-style short code, e.g. 'TN', 'KL', 'MH'. Stable join key for
    -- seeds and imports; the UUID is for FKs.
    code       text not null unique check (code ~ '^[A-Z]{2,3}$'),
    name       text not null unique,
    -- States vs union territories differ in administration; several reports
    -- need the distinction and it cannot be derived from the name.
    is_union_territory boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.states is
    'Master list of Indian states and union territories (A-1/CD §D-2). Reference data: admin-writable, readable by any authenticated user so registration dropdowns can populate.';

-- --- districts ---------------------------------------------------------------
create table public.districts (
    id         uuid primary key default gen_random_uuid(),
    state_id   uuid not null references public.states (id) on delete restrict,
    name       text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- District names repeat across states (Aurangabad exists in more than one),
    -- so uniqueness is per-state, never global.
    unique (state_id, name)
);

comment on table public.districts is
    'Master list of districts, one state per row (A-1/CD §D-2). Unique per (state, name) — district names repeat across states.';

create index districts_state_idx on public.districts (state_id);

create trigger states_set_updated_at
    before update on public.states
    for each row execute function public.set_updated_at();

create trigger districts_set_updated_at
    before update on public.districts
    for each row execute function public.set_updated_at();

-- --- RLS on the masters ------------------------------------------------------
alter table public.states    enable row level security;
alter table public.districts enable row level security;

create policy states_select_authenticated on public.states
    for select to authenticated using (true);
create policy districts_select_authenticated on public.districts
    for select to authenticated using (true);

create policy states_write_admin on public.states
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');
create policy districts_write_admin on public.districts
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

-- =============================================================================
-- Food Partner (vendors) — full structured address, registered AND operating
-- =============================================================================
-- The existing address/city/pincode columns become the REGISTERED address; the
-- structured references and the separate operating address are added around
-- them. Mandatory-ness (district + PIN required) is enforced in the application
-- layer, NOT as a NOT NULL here: existing rows predate these columns and a NOT
-- NULL would make this migration unrunnable against live data. The acceptance
-- criterion "registration without district/PIN rejected" is a Zod/route rule.
alter table public.vendors
    add column registered_state_id    uuid references public.states    (id) on delete restrict,
    add column registered_district_id uuid references public.districts (id) on delete restrict,
    add column registered_locality    text,
    add column operating_address      text,
    add column operating_locality     text,
    add column operating_city         text,
    add column operating_pincode      text,
    add column operating_state_id     uuid references public.states    (id) on delete restrict,
    add column operating_district_id  uuid references public.districts (id) on delete restrict;

alter table public.vendors
    add constraint vendors_pincode_valid
        check (public.is_valid_pincode(pincode)) not valid,
    add constraint vendors_operating_pincode_valid
        check (public.is_valid_pincode(operating_pincode)) not valid;

-- NOT VALID: the constraint applies to every future insert/update but does not
-- reject rows already present with a malformed PIN. Those are surfaced by the
-- backfill script instead of blocking this migration. Validate explicitly once
-- the data is clean:
--     alter table public.vendors validate constraint vendors_pincode_valid;

comment on column public.vendors.operating_address is
    'Where meals are actually served, when it differs from the registered address (CD §D-2). NULL means operating = registered; resolve with coalesce(operating_*, registered).';
comment on column public.vendors.registered_district_id is
    'District of the registered address. Mandatory for Food Partners at registration — enforced in the API layer, not NOT NULL, because rows predating A-1 have no value.';

create index vendors_operating_district_idx on public.vendors (operating_district_id)
    where operating_district_id is not null;
create index vendors_registered_district_idx on public.vendors (registered_district_id)
    where registered_district_id is not null;

-- =============================================================================
-- Volunteers — structured location
-- =============================================================================
alter table public.volunteers
    add column address     text,
    add column locality    text,
    add column city        text,
    add column pincode     text,
    add column state_id    uuid references public.states    (id) on delete restrict,
    add column district_id uuid references public.districts (id) on delete restrict;

alter table public.volunteers
    add constraint volunteers_pincode_valid
        check (public.is_valid_pincode(pincode)) not valid;

create index volunteers_district_idx on public.volunteers (district_id)
    where district_id is not null;

comment on column public.volunteers.district_id is
    'Operating district — used by A-2 to skip pool tokens whose geographic scope excludes this volunteer''s zone.';

-- =============================================================================
-- Beneficiaries — LENIENT location (CD §D-2: optional fields never block)
-- =============================================================================
alter table public.beneficiaries
    add column address     text,
    add column locality    text,
    add column city        text,
    add column pincode     text,
    add column state_id    uuid references public.states    (id) on delete restrict,
    add column district_id uuid references public.districts (id) on delete restrict;

-- A malformed PIN on a beneficiary is still rejected, but ABSENCE never is:
-- is_valid_pincode() passes NULL. No column here is NOT NULL, and nothing in
-- this block can fail a registration that omits location entirely.
alter table public.beneficiaries
    add constraint beneficiaries_pincode_valid
        check (public.is_valid_pincode(pincode)) not valid;

create index beneficiaries_district_idx on public.beneficiaries (district_id)
    where district_id is not null;

comment on column public.beneficiaries.pincode is
    'Optional. CD §D-2 lenient rule: beneficiary location NEVER blocks registration. Nullable, and every consumer must treat NULL as normal.';

-- =============================================================================
-- token_redemptions — SERVICE-LOCATION SNAPSHOT
-- =============================================================================
-- Filled at redemption from the Food Partner's OPERATING address (falling back
-- to registered). Text, not FKs, and never updated afterwards: the acceptance
-- criterion is that changing a Food Partner's address later does not alter
-- historical snapshots. This is also the source for P-1's "City, State" in
-- notifications — the only location detail a notification may carry.
alter table public.token_redemptions
    add column service_city     text,
    add column service_district text,
    add column service_state    text,
    add column service_pincode  text;

comment on column public.token_redemptions.service_city is
    'Snapshot of where the meal was served, copied from the Food Partner at redemption time. Deliberately TEXT and not a FK: a later address change must not rewrite history.';

create index token_redemptions_service_district_idx
    on public.token_redemptions (service_district)
    where service_district is not null;

-- =============================================================================
-- SEED — all-India states/UTs + Tamil Nadu districts (card: "TN minimum")
-- =============================================================================
insert into public.states (code, name, is_union_territory) values
    ('AP',  'Andhra Pradesh',                            false),
    ('AR',  'Arunachal Pradesh',                         false),
    ('AS',  'Assam',                                     false),
    ('BR',  'Bihar',                                     false),
    ('CT',  'Chhattisgarh',                              false),
    ('GA',  'Goa',                                       false),
    ('GJ',  'Gujarat',                                   false),
    ('HR',  'Haryana',                                   false),
    ('HP',  'Himachal Pradesh',                          false),
    ('JH',  'Jharkhand',                                 false),
    ('KA',  'Karnataka',                                 false),
    ('KL',  'Kerala',                                    false),
    ('MP',  'Madhya Pradesh',                            false),
    ('MH',  'Maharashtra',                               false),
    ('MN',  'Manipur',                                   false),
    ('ML',  'Meghalaya',                                 false),
    ('MZ',  'Mizoram',                                   false),
    ('NL',  'Nagaland',                                  false),
    ('OR',  'Odisha',                                    false),
    ('PB',  'Punjab',                                    false),
    ('RJ',  'Rajasthan',                                 false),
    ('SK',  'Sikkim',                                    false),
    ('TN',  'Tamil Nadu',                                false),
    ('TG',  'Telangana',                                 false),
    ('TR',  'Tripura',                                   false),
    ('UP',  'Uttar Pradesh',                             false),
    ('UT',  'Uttarakhand',                               false),
    ('WB',  'West Bengal',                               false),
    ('AN',  'Andaman and Nicobar Islands',               true),
    ('CH',  'Chandigarh',                                true),
    ('DH',  'Dadra and Nagar Haveli and Daman and Diu',  true),
    ('DL',  'Delhi',                                     true),
    ('JK',  'Jammu and Kashmir',                         true),
    ('LA',  'Ladakh',                                    true),
    ('LD',  'Lakshadweep',                               true),
    ('PY',  'Puducherry',                                true)
on conflict (code) do nothing;

-- Tamil Nadu's 38 districts — the pilot state.
insert into public.districts (state_id, name)
select s.id, d.name
from public.states s
cross join (values
    ('Ariyalur'), ('Chengalpattu'), ('Chennai'), ('Coimbatore'), ('Cuddalore'),
    ('Dharmapuri'), ('Dindigul'), ('Erode'), ('Kallakurichi'), ('Kancheepuram'),
    ('Kanniyakumari'), ('Karur'), ('Krishnagiri'), ('Madurai'), ('Mayiladuthurai'),
    ('Nagapattinam'), ('Namakkal'), ('Nilgiris'), ('Perambalur'), ('Pudukkottai'),
    ('Ramanathapuram'), ('Ranipet'), ('Salem'), ('Sivagangai'), ('Tenkasi'),
    ('Thanjavur'), ('Theni'), ('Thoothukudi'), ('Tiruchirappalli'), ('Tirunelveli'),
    ('Tirupathur'), ('Tiruppur'), ('Tiruvallur'), ('Tiruvannamalai'), ('Tiruvarur'),
    ('Vellore'), ('Viluppuram'), ('Virudhunagar')
) as d(name)
where s.code = 'TN'
on conflict (state_id, name) do nothing;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- Drops in reverse dependency order. The added columns are dropped rather than
-- preserved: nothing outside A-1 writes them yet, so there is no data to lose on
-- an immediate rollback. Run only if no code depending on these has shipped.
--
-- begin;
--
-- drop index if exists public.token_redemptions_service_district_idx;
-- alter table public.token_redemptions
--     drop column if exists service_city,
--     drop column if exists service_district,
--     drop column if exists service_state,
--     drop column if exists service_pincode;
--
-- drop index if exists public.beneficiaries_district_idx;
-- alter table public.beneficiaries
--     drop constraint if exists beneficiaries_pincode_valid,
--     drop column if exists address,
--     drop column if exists locality,
--     drop column if exists city,
--     drop column if exists pincode,
--     drop column if exists state_id,
--     drop column if exists district_id;
--
-- drop index if exists public.volunteers_district_idx;
-- alter table public.volunteers
--     drop constraint if exists volunteers_pincode_valid,
--     drop column if exists address,
--     drop column if exists locality,
--     drop column if exists city,
--     drop column if exists pincode,
--     drop column if exists state_id,
--     drop column if exists district_id;
--
-- drop index if exists public.vendors_registered_district_idx;
-- drop index if exists public.vendors_operating_district_idx;
-- alter table public.vendors
--     drop constraint if exists vendors_pincode_valid,
--     drop constraint if exists vendors_operating_pincode_valid,
--     drop column if exists registered_state_id,
--     drop column if exists registered_district_id,
--     drop column if exists registered_locality,
--     drop column if exists operating_address,
--     drop column if exists operating_locality,
--     drop column if exists operating_city,
--     drop column if exists operating_pincode,
--     drop column if exists operating_state_id,
--     drop column if exists operating_district_id;
--
-- drop policy if exists districts_write_admin        on public.districts;
-- drop policy if exists districts_select_authenticated on public.districts;
-- drop policy if exists states_write_admin           on public.states;
-- drop policy if exists states_select_authenticated  on public.states;
-- drop trigger if exists districts_set_updated_at on public.districts;
-- drop trigger if exists states_set_updated_at    on public.states;
-- drop table if exists public.districts cascade;
-- drop table if exists public.states    cascade;
-- drop function if exists public.is_valid_pincode(text);
--
-- commit;
