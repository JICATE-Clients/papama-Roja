-- =============================================================================
-- A-2 (B-23) — token geographic scope, per-mode activation/expiry, reissue link
-- =============================================================================
-- Work Order card A-2, CD §D-2A. Depends on A-1 (states/districts) and A-4
-- (distribution_mode). Apply after 20260907000001 and 20260907000003.
--
-- RECONCILIATION — `tokens.area_lock` already exists and OVERLAPS this card.
-- It was added by 20260625000012 as a free-text region (city / locality / PIN)
-- that is PRINTED on a physical token. Its own comment is explicit that it is a
-- DECLARATION, not enforcement: "The redemption city-lock
-- (system_config.city_lock_enabled) is the ENFORCEMENT side; this column is the
-- per-token DECLARATION printed on the physical token."
--
-- So today a token can *say* "Coimbatore only" and still redeem in Mumbai. This
-- card adds the STRUCTURED, ENFORCED scope the card actually asks for.
-- `area_lock` is left in place (the donor API and printed view read it) but is
-- now documented as display-only and superseded — the printed line should be
-- derived from the scope below once the print view is updated. Deleting it here
-- would break `/api/donor/tokens` for no gain in this card.
--
-- NOTE the existing city-lock code anticipated exactly this:
--   "(If a future migration adds a per-token/beneficiary city, swap
--    operating_city for that bound value here.)"  — lib/services/redemption.ts
-- =============================================================================

begin;

-- --- geographic scope --------------------------------------------------------
create type public.token_geographic_scope as enum (
    'PAN_INDIA',
    'STATE',
    'DISTRICT',
    'CITY',
    'PIN'
);

comment on type public.token_geographic_scope is
    'Where a token may be redeemed (CD §D-2A). Checked at redemption against the SERVICE location — the Food Partner''s operating address — never against the beneficiary''s location.';

alter table public.tokens
    add column geographic_scope public.token_geographic_scope not null default 'PAN_INDIA',
    add column scope_state_id    uuid references public.states    (id) on delete restrict,
    add column scope_district_id uuid references public.districts (id) on delete restrict,
    add column scope_city        text,
    add column scope_pincode     text;

comment on column public.tokens.geographic_scope is
    'PAN_INDIA (default) means redeemable anywhere. Narrower values require the matching scope_* reference — enforced by tokens_scope_reference_present.';

-- The scope column and its reference must agree, or the redemption check has
-- nothing to compare against and would fail open. A DISTRICT-scoped token with
-- no district is not a restriction, it is a bug that silently redeems anywhere.
alter table public.tokens
    add constraint tokens_scope_reference_present check (
        case geographic_scope
            when 'PAN_INDIA' then true
            when 'STATE'     then scope_state_id    is not null
            when 'DISTRICT'  then scope_district_id is not null
            when 'CITY'      then scope_city    is not null and btrim(scope_city) <> ''
            when 'PIN'       then public.is_valid_pincode(scope_pincode) and scope_pincode is not null
        end
    ) not valid;

-- NOT VALID: binds every future write; existing rows all default to PAN_INDIA
-- and therefore already satisfy it. Promote once verified:
--   alter table public.tokens validate constraint tokens_scope_reference_present;

create index tokens_scope_district_idx on public.tokens (scope_district_id)
    where scope_district_id is not null;
create index tokens_scope_state_idx on public.tokens (scope_state_id)
    where scope_state_id is not null;

-- --- activation (the per-mode expiry anchor) ---------------------------------
-- CD §D-2A, confirmed 18 Aug: 60-day validity for both modes, but counted from
-- DIFFERENT events.
--   DONOR_CONTROLLED   — from creation / issue to the donor.
--   PAPAMA_DISTRIBUTED — from DISTRIBUTION to the beneficiary, NOT creation.
--
-- The card's worked example: a pool token distributed on day 30 expires on day
-- 90 from creation, i.e. day 60 from distribution. Without a separate anchor
-- column that is impossible to express — `minted_at` cannot represent both.
alter table public.tokens
    add column activated_at timestamptz;

comment on column public.tokens.activated_at is
    'When the 60-day validity STARTS. DONOR_CONTROLLED: set at creation. PAPAMA_DISTRIBUTED: set at distribution, so a token sitting in the pool is not burning its own validity. NULL on an undistributed pool token is correct and means "not started".';

-- Backfill so existing rows carry a coherent anchor.
update public.tokens
set activated_at = case
    when distribution_mode = 'DONOR_CONTROLLED' then coalesce(minted_at, created_at)
    else distributed_at
end
where activated_at is null;

comment on column public.tokens.expires_at is
    'Derived from activated_at + token_expiry_days (60). NULL while an undistributed PAPAMA_DISTRIBUTED token has not been activated. Expiry is PERMANENT — revalidation was retired (CD confirmed 18 Aug); the only route back is a controlled reissue.';

-- --- reissue link ------------------------------------------------------------
-- `replacement_for_token_id` already exists (m16, added as the LOST-token seam)
-- and the card says to reuse it rather than add a parallel column. What it
-- lacked was a reason and an index.
alter table public.tokens
    add column reissue_reason text,
    add column reissued_at    timestamptz,
    add column reissued_by    uuid references public.users (id) on delete set null;

comment on column public.tokens.reissue_reason is
    'Why this token was issued to replace replacement_for_token_id. Mandatory at the API layer for an admin-approved reissue (CD §D-2A: "approve with reason").';

create index tokens_replacement_for_idx on public.tokens (replacement_for_token_id)
    where replacement_for_token_id is not null;

-- --- retire revalidation (CONFIRMED 18 Aug) ----------------------------------
-- Revalidation reactivated the SAME token, which contradicts "expired =
-- permanently non-redeemable". The config key is forced to false and its
-- description records that the feature is retired, so an admin cannot switch it
-- back on from the console. The routes/UI are removed in the application layer.
update public.system_config
set value = 'false',
    description = 'RETIRED (CD confirmed 18 Aug, A-2/B-23). Expired tokens are permanently non-redeemable; the only route back is a controlled reissue. Kept false — do not re-enable.'
where key = 'token_revalidation_allowed';

-- --- the approved 60-day validity (CD §D-2A) ---------------------------------
-- A real client-approved value, so it is set rather than left NULL. This is the
-- one number in this migration that is NOT invented.
update public.system_config
set value = '60'
where key = 'token_expiry_days'
  and (value is null or btrim(value) = '');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- Does not restore token_revalidation_allowed — the feature is retired by
-- client decision, not by this migration, and re-enabling it on rollback would
-- resurrect a contradiction. Set it back by hand only if that decision reverses.
--
-- begin;
-- drop index if exists public.tokens_replacement_for_idx;
-- drop index if exists public.tokens_scope_state_idx;
-- drop index if exists public.tokens_scope_district_idx;
-- alter table public.tokens
--     drop constraint if exists tokens_scope_reference_present,
--     drop column if exists geographic_scope,
--     drop column if exists scope_state_id,
--     drop column if exists scope_district_id,
--     drop column if exists scope_city,
--     drop column if exists scope_pincode,
--     drop column if exists activated_at,
--     drop column if exists reissue_reason,
--     drop column if exists reissued_at,
--     drop column if exists reissued_by;
-- drop type if exists public.token_geographic_scope;
-- commit;
