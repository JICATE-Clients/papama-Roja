-- =============================================================================
-- A-4 (B-32a) — explicit token distribution mode
-- =============================================================================
-- Work Order card A-4, CD §D-10A. Small card, but a prerequisite for two others:
-- A-2 needs it to decide WHICH date a token's 60-day validity counts from, and
-- F-5 (FIFO) needs it to keep donor-controlled tokens out of the pool queue.
--
-- CURRENT: the mode is implicit in `status` — 'in_admin_pool' implies pApAmA
-- distributes it, 'live' with a donor implies the donor controls it. Inferring a
-- permanent property from a mutable lifecycle column is fragile: status moves
-- (pool → assigned_to_volunteer → distributed) while the mode must not. A token
-- created for a donor is donor-controlled for its whole life.
--
-- IMMUTABILITY is enforced by trigger, not convention. The mode changes which
-- expiry rule applies, so flipping it after creation would retroactively move a
-- token's expiry date — silently extending or killing a live token. CD §D-10A
-- says "fixed at creation"; this makes that true rather than documented.
-- =============================================================================

begin;

create type public.token_distribution_mode as enum (
    'PAPAMA_DISTRIBUTED',
    'DONOR_CONTROLLED'
);

comment on type public.token_distribution_mode is
    'How a token reaches a beneficiary (CD §D-10A). PAPAMA_DISTRIBUTED: enters the admin pool, allocated FIFO via a volunteer. DONOR_CONTROLLED: the donor holds and gives it directly. Fixed at creation — see the immutability trigger.';

-- Backfill from the existing implicit signal BEFORE adding NOT NULL, so no row
-- is left guessing. A token that ever sat in the admin pool, or is held by a
-- volunteer, is pApAmA-distributed; anything with a donor and no pool history is
-- donor-controlled. Tokens matching neither default to PAPAMA_DISTRIBUTED, which
-- is the conservative choice: it keeps them in the pool workflow where an admin
-- can see them, rather than silently handing control to a donor.
alter table public.tokens
    add column distribution_mode public.token_distribution_mode;

update public.tokens
set distribution_mode = case
    when status in ('in_admin_pool', 'assigned_to_volunteer') then 'PAPAMA_DISTRIBUTED'::public.token_distribution_mode
    when donor_id is not null and batch_id is null           then 'DONOR_CONTROLLED'::public.token_distribution_mode
    else 'PAPAMA_DISTRIBUTED'::public.token_distribution_mode
end
where distribution_mode is null;

alter table public.tokens
    alter column distribution_mode set not null,
    alter column distribution_mode set default 'PAPAMA_DISTRIBUTED';

comment on column public.tokens.distribution_mode is
    'Fixed at creation, never updated (enforced by tokens_distribution_mode_immutable). Decides the expiry anchor: DONOR_CONTROLLED counts 60 days from creation, PAPAMA_DISTRIBUTED from distribution (A-2/CD §D-2A).';

create index tokens_distribution_mode_idx on public.tokens (distribution_mode);

-- --- donor notification preference (CD §D-10A) -------------------------------
-- Whether the donor wants to be told about their token's lifecycle. Nullable
-- rather than defaulted: an unset preference is "never asked", which is not the
-- same as "opted out", and the dispatch layer must be able to tell them apart.
alter table public.tokens
    add column donor_notification_opt_in boolean;

comment on column public.tokens.donor_notification_opt_in is
    'Donor lifecycle-notification preference (CD §D-10A). NULL = never asked, which is deliberately distinct from false = declined.';

-- --- immutability trigger ----------------------------------------------------
create or replace function public.guard_token_distribution_mode()
returns trigger
language plpgsql
as $$
begin
    if new.distribution_mode is distinct from old.distribution_mode then
        raise exception
            'tokens.distribution_mode is fixed at creation and cannot be changed (token %, % -> %)',
            old.id, old.distribution_mode, new.distribution_mode
            using errcode = 'check_violation';
    end if;
    return new;
end;
$$;

comment on function public.guard_token_distribution_mode() is
    'Blocks any UPDATE that changes tokens.distribution_mode (CD §D-10A "fixed at creation"). Applies to service_role too — the expiry anchor depends on this value, so a change would retroactively move a live token''s expiry date.';

create trigger tokens_distribution_mode_immutable
    before update on public.tokens
    for each row execute function public.guard_token_distribution_mode();

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop trigger if exists tokens_distribution_mode_immutable on public.tokens;
-- drop function if exists public.guard_token_distribution_mode();
-- drop index if exists public.tokens_distribution_mode_idx;
-- alter table public.tokens
--     drop column if exists distribution_mode,
--     drop column if exists donor_notification_opt_in;
-- drop type if exists public.token_distribution_mode;
-- commit;
