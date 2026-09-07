-- =============================================================================
-- A-3 (B-28 c+d) — Special Care category master + Common Special Care Pool
-- =============================================================================
-- Work Order card A-3, CD §D-8. Apply after 20260907000004.
--
-- TWO DISTINCT CONCEPTS, easily conflated:
--
--   beneficiary_category (existing enum: pregnant_women, patient, disability,
--       disaster_affected) — WHO a person is. Drives eligibility and review.
--
--   special_care_categories (this migration) — WHAT KIND of special-care need a
--       ₹100 token was issued against. Configurable by admins, because the
--       client expects to add categories without a code release; an enum cannot
--       do that. CD §D-8 seeds three, and they deliberately do NOT map 1:1 onto
--       the beneficiary enum: "Postpartum/Lactating Mothers" has no enum member
--       at all, which is precisely why a master table is needed.
--
-- THE POOL. A Special Care token has a FIXED ₹100 face value. When the meal
-- costs less, the surplus is NOT revenue and is NOT the Food Partner's — it
-- belongs to a Common Special Care Pool that funds future special-care meals.
-- CD §D-8's eight-line statement (opening / receipts / issued / utilised /
-- surplus / contributions / utilisation / closing) is reported off this stream.
--
-- Implemented as a fourth `ledger_entries.ledger` value rather than a new table,
-- so it inherits the existing append-only trail, RLS and reconciliation instead
-- of growing a parallel money system nobody reconciles.
-- =============================================================================

begin;

-- --- special_care_categories master ------------------------------------------
create table public.special_care_categories (
    id          uuid primary key default gen_random_uuid(),
    -- Stable machine key. The display name may be reworded by an admin; code and
    -- reports must not break when it is.
    code        text not null unique check (code ~ '^[a-z][a-z0-9_]{2,49}$'),
    name        text not null,
    description text,
    -- Deactivate rather than delete: a category referenced by historical tokens
    -- must remain resolvable, so removal is never the right operation.
    is_active   boolean not null default true,
    sort_order  integer not null default 100,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

comment on table public.special_care_categories is
    'Configurable Special Care categories (CD §D-8, A-3). Admin-editable — the client adds categories without a release. DISTINCT from the beneficiary_category enum: that is who a person is, this is what a ₹100 special-care token was issued against. Deactivate, never delete: historical tokens must stay resolvable.';

create index special_care_categories_active_idx
    on public.special_care_categories (is_active, sort_order)
    where is_active;

create trigger special_care_categories_set_updated_at
    before update on public.special_care_categories
    for each row execute function public.set_updated_at();

alter table public.special_care_categories enable row level security;

-- Readable by any signed-in user: the volunteer and admin issue screens need to
-- list them. Writable by admin only — "configurable" means by an administrator,
-- not by anyone with a session.
create policy special_care_categories_select_authenticated
    on public.special_care_categories
    for select to authenticated using (true);

create policy special_care_categories_write_admin
    on public.special_care_categories
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

-- CD §D-8 seeds exactly these three.
insert into public.special_care_categories (code, name, description, sort_order) values
    ('pregnant_women', 'Pregnant Women',
     'Expectant mothers requiring enhanced nutrition during pregnancy.', 10),
    ('postpartum_lactating', 'Postpartum / Lactating Mothers',
     'Mothers within the post-delivery window requiring nutritional support while breastfeeding.', 20),
    ('medically_vulnerable', 'Medically Vulnerable / Patients',
     'Individuals under treatment or with a condition requiring specific nutritional support.', 30)
on conflict (code) do nothing;

-- --- link a Special Care token to its category -------------------------------
alter table public.tokens
    add column special_care_category_id uuid
        references public.special_care_categories (id) on delete restrict;

comment on column public.tokens.special_care_category_id is
    'Which Special Care category this token was issued against (CD §D-8). NULL for standard tokens. ON DELETE RESTRICT with deactivation-not-deletion on the master, so a historical token can always be explained.';

create index tokens_special_care_category_idx
    on public.tokens (special_care_category_id)
    where special_care_category_id is not null;

-- --- the Common Special Care Pool ledger stream ------------------------------
-- Widen the existing CHECK rather than add a table: the pool then inherits the
-- append-only guarantees, RLS and reconciliation that already exist.
alter table public.ledger_entries
    drop constraint if exists ledger_entries_ledger_check;

alter table public.ledger_entries
    add constraint ledger_entries_ledger_check
        check (ledger in ('donation', 'vendor_payable', 'revenue', 'special_care_pool'));

comment on table public.ledger_entries is
    'Financial trail (spec §3.1 F-10, addon #18, A-3) — donation / vendor_payable / revenue / special_care_pool. Append-only. amount sign: credit=+, debit=-. special_care_pool holds the ₹100-minus-meal surplus from Special Care redemptions (CD §D-8) — that surplus is NEVER revenue.';

-- --- the fixed ₹100 face value (CD §D-8) -------------------------------------
-- A client-approved number, so it is seeded rather than left NULL.
insert into public.system_config (key, value, value_type, description) values
    ('special_care_token_value', '100', 'number',
     'Fixed face value in INR of a Special Care token (CD §D-8). Unlike standard_token_value this is FIXED by client decision, not tuned.')
on conflict (key) do nothing;

-- --- special_care_multiplier: confirmed dead ---------------------------------
-- The card requires the multiplier stay config-present but "provably unread by
-- value logic". Special Care value is the flat ₹100 above, NOT a multiple of the
-- standard token. The row is kept so existing reads do not 404, and its
-- description now says plainly that nothing consumes it. A test asserts the
-- value logic never reads this key.
update public.system_config
set description = 'INERT (A-3/CD §D-8). Special Care tokens use the FIXED special_care_token_value (₹100), not a multiple of the standard token. Retained for backwards compatibility and internal analysis only — no value logic reads this key. Changing it changes nothing.'
where key = 'special_care_multiplier';

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- The ledger CHECK is restored to its three original values. That FAILS if any
-- special_care_pool rows exist — deliberately: silently deleting posted ledger
-- entries to make a rollback succeed would destroy financial history. Move or
-- reverse those entries first, by hand, with a decision recorded.
--
-- begin;
-- drop index if exists public.tokens_special_care_category_idx;
-- alter table public.tokens drop column if exists special_care_category_id;
-- alter table public.ledger_entries drop constraint if exists ledger_entries_ledger_check;
-- alter table public.ledger_entries
--     add constraint ledger_entries_ledger_check
--         check (ledger in ('donation', 'vendor_payable', 'revenue'));
-- drop policy if exists special_care_categories_write_admin        on public.special_care_categories;
-- drop policy if exists special_care_categories_select_authenticated on public.special_care_categories;
-- drop trigger if exists special_care_categories_set_updated_at on public.special_care_categories;
-- drop table if exists public.special_care_categories cascade;
-- delete from public.system_config where key = 'special_care_token_value';
-- commit;
