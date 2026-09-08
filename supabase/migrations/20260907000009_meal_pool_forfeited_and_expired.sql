-- =============================================================================
-- F-4 (B-03) — Forfeited & expired value return to the Meal Pool
-- =============================================================================
-- Work Order card F-4, decision of 4 Aug §2 (+ CD §D-8 for the Special-Care
-- variant, already delivered in A-3). Apply after 20260907000008.
--
-- WHAT IS WRONG TODAY, and it is a real accounting error rather than a gap:
--
--   Forfeited value — a ₹60 token spent on a ₹50 meal leaves ₹10 — is currently
--   posted to the REVENUE ledger and shown as a revenue line in analytics. That
--   money is a donation that has not yet bought a meal. Booking it as revenue
--   records donated money as income to pApAmA, and every downstream report,
--   transparency figure and CSR statement inherits the error.
--
--   Expired value is worse: nothing is written at all. A token expires, its
--   status flips, and the money silently ceases to be accounted for anywhere.
--
-- WHERE IT GOES INSTEAD. Both return to the MEAL POOL: donated value waiting to
-- fund another meal. Implemented as a fifth `ledger_entries.ledger` value
-- alongside special_care_pool (A-3), so it inherits the same append-only trail,
-- RLS and reconciliation rather than growing a parallel money system.
--
-- ORDERING: this card is deliberately sequenced after A-2 and A-3 so the two
-- pool streams land one at a time and each can be reconciled on its own.
-- =============================================================================

begin;

-- --- the Meal Pool ledger stream ---------------------------------------------
alter table public.ledger_entries
    drop constraint if exists ledger_entries_ledger_check;

alter table public.ledger_entries
    add constraint ledger_entries_ledger_check
        check (ledger in (
            'donation', 'vendor_payable', 'revenue',
            'special_care_pool', 'meal_pool'
        ));

comment on table public.ledger_entries is
    'Financial trail (spec §3.1 F-10, addon #18, A-3, F-4) — donation / vendor_payable / revenue / special_care_pool / meal_pool. Append-only. amount sign: credit=+, debit=-. '
    'meal_pool holds standard-token forfeited difference and expired token value (F-4/B-03); special_care_pool holds the ₹100-minus-meal surplus (A-3/CD §D-8). NEITHER is revenue — both are donated value awaiting a meal.';

-- --- expired value awaiting reissue ------------------------------------------
-- CD/A-2: an expired token is permanently non-redeemable and the only route back
-- is a controlled reissue. Its VALUE, however, is still donated money. It is
-- parked as "pool pending" until a reissue either reclaims it or it is written
-- into the pool for general use.
alter table public.tokens
    add column value_returned_to_pool_at timestamptz,
    add column value_returned_ledger_id  uuid references public.ledger_entries (id) on delete set null;

comment on column public.tokens.value_returned_to_pool_at is
    'When this token''s value was returned to the Meal Pool (F-4/B-03) — on expiry, or on forfeit at redemption. NULL means not yet returned. Prevents double-crediting: the expiry sweep skips any token that already has this set.';

create index tokens_pending_pool_return_idx
    on public.tokens (status, value_returned_to_pool_at)
    where status = 'expired' and value_returned_to_pool_at is null;

-- --- backfill: existing forfeited balances were posted to REVENUE -------------
-- Those entries are wrong under the 4-Aug decision, but they are also posted
-- financial history. They are NOT deleted or edited — the ledger is append-only
-- and rewriting posted entries destroys the trail. Instead a reversing pair is
-- posted: a debit out of revenue and a matching credit into the meal pool, both
-- describing themselves as the F-4 correction so the movement is explicable to
-- an auditor years later.
--
-- Restricted to forfeit entries specifically (reference_type = 'redemption' with
-- a positive amount), so genuine revenue is untouched.
insert into public.ledger_entries (ledger, amount, reference_type, reference_id, description)
select 'revenue', -le.amount, le.reference_type, le.reference_id,
       'F-4 correction: forfeited value reclassified out of revenue (was ' || le.id || ')'
from public.ledger_entries le
where le.ledger = 'revenue'
  and le.reference_type = 'redemption'
  and le.amount > 0
  and le.description like 'forfeited balance%';

insert into public.ledger_entries (ledger, amount, reference_type, reference_id, description)
select 'meal_pool', le.amount, le.reference_type, le.reference_id,
       'F-4 correction: forfeited value returned to Meal Pool (was ' || le.id || ')'
from public.ledger_entries le
where le.ledger = 'revenue'
  and le.reference_type = 'redemption'
  and le.amount > 0
  and le.description like 'forfeited balance%';

commit;

-- =============================================================================
-- VERIFY after applying
-- =============================================================================
-- Revenue should no longer carry forfeited value; the meal pool should hold it.
--
--   select ledger, sum(amount) from public.ledger_entries group by ledger order by ledger;
--
-- Every historical forfeit should now net to zero in revenue:
--
--   select coalesce(sum(amount), 0) as should_be_zero
--   from public.ledger_entries
--   where ledger = 'revenue' and reference_type = 'redemption';

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- The correcting entries are NOT removed: they are posted ledger history, and
-- deleting them would be the same mistake this migration exists to avoid. To
-- reverse the reclassification, post a further correcting pair with a recorded
-- decision. Only the schema changes are undone here.
--
-- begin;
-- drop index if exists public.tokens_pending_pool_return_idx;
-- alter table public.tokens
--     drop column if exists value_returned_to_pool_at,
--     drop column if exists value_returned_ledger_id;
-- alter table public.ledger_entries drop constraint if exists ledger_entries_ledger_check;
-- alter table public.ledger_entries
--     add constraint ledger_entries_ledger_check
--         check (ledger in ('donation', 'vendor_payable', 'revenue', 'special_care_pool'));
-- commit;
