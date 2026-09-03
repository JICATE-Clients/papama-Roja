-- =============================================================================
-- donors.email — unique index (stops the duplicate-donor race recurring)
-- =============================================================================
-- WHY
-- `lib/donations/guest-pool.ts::ensureGuestPoolDonor` is find-or-create on
-- `donors.email`. With no unique constraint, two concurrent guest donations both
-- lost the find and both inserted — which is exactly what happened on
-- 2026-06-25, producing two `guest-pool@papama.internal` rows 3ms apart.
--
-- The consequence was not cosmetic. The lookup used `.maybeSingle()`, which
-- fails PGRST116 on more than one row, so `getGuestPoolBalance()` threw and
-- `GET /api/admin/donations` returned 500 — the admin donations page was dead
-- until 2026-08-24. The route code is now duplicate-tolerant
-- (order by created_at, limit 1), but tolerating a duplicate is not the same as
-- preventing one: while two rows exist, guest credit can still accumulate on the
-- row nobody reads.
--
-- PREREQUISITE — SATISFIED as of 2026-08-24. All duplicate-email rows have been
-- removed, so this index now applies cleanly:
--     guest-pool@papama.internal → duplicate deleted (orphaned; older row kept,
--                                  matching the row the fixed code selects)
--     admin@test.com             → `user_id`-null stub deleted
--     sri2410089@ssn.edu.in      → `user_id`-null stub deleted
-- Each deletion was re-verified immediately beforehand against ALL NINE tables
-- with a FK to donors (donations, tokens and payment_failures are ON DELETE SET
-- NULL — a donor with donations would have been silently reattributed as a guest
-- gift rather than refused, so "zero references" had to mean zero, not "no
-- cascade"). Only a zero-balance donor_credits row cascaded with each.
--
-- Re-run the audit below before applying anyway: this file may sit unapplied for
-- a while, and a new duplicate can appear at any time until the index exists.
--
-- NULL emails are unaffected: Postgres unique indexes permit many NULLs.
-- =============================================================================

begin;

create unique index if not exists donors_email_unique_idx
    on public.donors (email)
    where email is not null;

comment on index public.donors_email_unique_idx is
    'Find-or-create on donors.email (guest pool) requires this to be race-safe. Without it, two concurrent guest donations each insert a pool donor — see the 2026-06-25 incident that 500ed GET /api/admin/donations.';

commit;

-- =============================================================================
-- PRE-FLIGHT AUDIT — run this BEFORE applying; it must return zero rows.
-- =============================================================================
-- select d.email, count(*) as rows
-- from public.donors d
-- where d.email is not null
-- group by d.email
-- having count(*) > 1;
--
-- And for each duplicate, confirm the row you intend to drop is unreferenced:
-- select d.id, d.email, d.user_id,
--        (select count(*) from public.donor_credits       x where x.donor_id = d.id) as credits,
--        (select count(*) from public.donations           x where x.donor_id = d.id) as donations,
--        (select count(*) from public.tokens              x where x.donor_id = d.id) as tokens,
--        (select count(*) from public.credit_transactions x where x.donor_id = d.id) as txns,
--        (select count(*) from public.refunds             x where x.donor_id = d.id) as refunds
-- from public.donors d
-- where d.email in (select email from public.donors
--                   where email is not null group by email having count(*) > 1)
-- order by d.email, d.created_at;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop index if exists public.donors_email_unique_idx;
-- commit;
