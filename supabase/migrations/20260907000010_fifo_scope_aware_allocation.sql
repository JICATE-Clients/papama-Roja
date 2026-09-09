-- =============================================================================
-- F-5 (B-32b) — FIFO allocation honouring geographic scope and token type
-- =============================================================================
-- Work Order card F-5, CD §D-10A. Depends on A-1 (volunteer district/state),
-- A-2 (token geographic scope) and A-4 (distribution_mode). Apply after
-- 20260907000009.
--
-- WHAT ALREADY WORKED: `allocate_pooled_tokens` (20260625000004) is already
-- atomic and already FIFO — `order by t.minted_at asc` with FOR UPDATE SKIP
-- LOCKED. That part is untouched; this replaces the function only to add the
-- filters that A-1/A-2/A-4 made possible.
--
-- WHAT THIS ADDS:
--   1. GEOGRAPHIC SCOPE. A Coimbatore-district token must not be handed to a
--      volunteer working in Madurai — they could never get it redeemed, and it
--      would sit in their holding limit blocking tokens they CAN distribute.
--      Skipped tokens stay in the pool for a volunteer who can use them.
--   2. TOKEN TYPE. A Special Care token is issued against a specific need
--      (CD §D-8) and should not be handed out in a general allocation.
--   3. DONOR-CONTROLLED EXCLUSION, made explicit. The card notes this is
--      "already structural" because such tokens never reach `in_admin_pool` —
--      but structural-by-accident is one refactor away from broken, so the
--      predicate now states it. Belt and braces on real money.
--
-- FAIL-CLOSED ON UNKNOWN VOLUNTEER LOCATION. If a token is district-scoped and
-- the volunteer has no district recorded, the token is SKIPPED. Handing over a
-- token that demonstrably cannot be redeemed in the volunteer's zone is worse
-- than leaving it in the pool: it consumes their holding cap and fails at the
-- till, in front of a beneficiary.
-- =============================================================================

begin;

-- --- the scope predicate -----------------------------------------------------
-- Separate function so the rule has ONE definition, testable on its own and
-- shared by both the eligibility count and the claim.
create or replace function public.token_scope_allows_volunteer(
    p_token_id    uuid,
    p_state_id    uuid,
    p_district_id uuid,
    p_city        text,
    p_pincode     text
)
returns boolean
language sql
stable
set search_path = public
as $$
    select case t.geographic_scope
        when 'PAN_INDIA' then true
        -- A restricted token needs a MATCHING volunteer location. A NULL
        -- location is not a wildcard: handing over a token that cannot be
        -- redeemed in the volunteer's zone consumes their holding cap and then
        -- fails at the till, in front of a beneficiary.
        when 'STATE'    then p_state_id    is not null and p_state_id    = t.scope_state_id
        when 'DISTRICT' then p_district_id is not null and p_district_id = t.scope_district_id
        when 'CITY'     then p_city is not null and t.scope_city is not null
                             and lower(btrim(p_city)) = lower(btrim(t.scope_city))
        when 'PIN'      then p_pincode is not null and btrim(p_pincode) = btrim(t.scope_pincode)
        else false
    end
    from public.tokens t
    where t.id = p_token_id;
$$;

comment on function public.token_scope_allows_volunteer(uuid, uuid, uuid, text, text) is
    'Whether a token''s geographic scope permits allocation to a volunteer in the given zone (F-5). A NULL volunteer location is NOT a wildcard — a restricted token is skipped rather than handed to someone who cannot redeem it. Distinct from the REDEMPTION check, which tests the Food Partner''s service location (A-2), never the volunteer''s.';

-- Return type gains a `skipped_count` so the caller can log what FIFO passed
-- over — CD's acceptance criterion is that the skip is LOGGED, not silent.
drop function if exists public.allocate_pooled_tokens(uuid, integer, text);

create or replace function public.allocate_pooled_tokens(
    p_volunteer_id uuid,
    p_count        integer,
    p_channel      text,
    p_token_type   text default 'standard'
)
returns table (token_id uuid, skipped_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id      uuid;
    v_status       text;
    v_limit        numeric;
    v_held         integer;
    v_moved_ids    uuid[];
    v_now          timestamptz := now();
    v_state_id     uuid;
    v_district_id  uuid;
    v_city         text;
    v_pincode      text;
    v_eligible     integer;
    v_in_pool      integer;
begin
    if p_count is null or p_count <= 0 then
        raise exception 'allocation count must be positive';
    end if;

    -- 1. Volunteer gate + location, under a row lock.
    select v.user_id, v.status, v.state_id, v.district_id, v.city, v.pincode
        into v_user_id, v_status, v_state_id, v_district_id, v_city, v_pincode
        from public.volunteers v
        where v.id = p_volunteer_id
        for update;

    if not found then
        raise exception 'volunteer not found';
    end if;
    if v_user_id is null then
        raise exception 'volunteer has no linked user account';
    end if;
    if v_status <> 'active' then
        raise exception 'cannot allocate to a % volunteer', v_status;
    end if;

    -- 2. Lock currently-held rows so a concurrent allocation for the SAME
    --    volunteer blocks and re-counts. Semantics mirror lib/volunteer/holdings.
    perform 1
        from public.tokens t
        cross join lateral (
            select r.distributed_by, r.channel
            from public.token_distribution_records r
            where r.token_id = t.id
            order by r.distributed_at desc
            limit 1
        ) latest
        where t.status = 'assigned_to_volunteer'
          and latest.distributed_by = v_user_id
          and latest.channel in ('admin_to_volunteer', 'volunteer_request_grant')
        for update of t;

    -- 3. Concurrent-limit check. NULL/unset => no limit (never invent one).
    select case
               when value is null or btrim(value) = '' then null
               else value::numeric
           end
        into v_limit
        from public.system_config
        where key = 'max_tokens_per_volunteer';

    if v_limit is not null then
        select count(*)
            into v_held
            from public.tokens t
            cross join lateral (
                select r.distributed_by, r.channel
                from public.token_distribution_records r
                where r.token_id = t.id
                order by r.distributed_at desc
                limit 1
            ) latest
            where t.status = 'assigned_to_volunteer'
              and latest.distributed_by = v_user_id
              and latest.channel in ('admin_to_volunteer', 'volunteer_request_grant');

        if v_held + p_count > v_limit then
            raise exception
                'allocation of % would exceed max_tokens_per_volunteer (%); volunteer already holds %',
                p_count, v_limit, v_held;
        end if;
    end if;

    -- 4. Count what FIFO can and cannot serve, so the caller can log the skip.
    select count(*) into v_in_pool
        from public.tokens t
        where t.status = 'in_admin_pool'
          and t.token_type = p_token_type::public.token_type
          and t.distribution_mode = 'PAPAMA_DISTRIBUTED';

    select count(*) into v_eligible
        from public.tokens t
        where t.status = 'in_admin_pool'
          and t.token_type = p_token_type::public.token_type
          and t.distribution_mode = 'PAPAMA_DISTRIBUTED'
          and public.token_scope_allows_volunteer(t.id, v_state_id, v_district_id, v_city, v_pincode);

    -- 5 + 6. Claim the N OLDEST ELIGIBLE tokens and flip them. FIFO ordering is
    --        unchanged (minted_at asc); the scope predicate simply removes rows
    --        this volunteer could never use, so FIFO skips over them rather than
    --        stalling on them.
    with claimed as (
        select t.id
        from public.tokens t
        where t.status = 'in_admin_pool'
          and t.token_type = p_token_type::public.token_type
          -- Explicit, though such tokens never reach the pool: the donor holds
          -- and gives these directly (CD §D-10A), so they must never be
          -- allocated to a volunteer.
          and t.distribution_mode = 'PAPAMA_DISTRIBUTED'
          and public.token_scope_allows_volunteer(t.id, v_state_id, v_district_id, v_city, v_pincode)
        order by t.minted_at asc
        limit p_count
        for update skip locked
    ),
    moved as (
        update public.tokens t
            set status = 'assigned_to_volunteer'
            from claimed c
            where t.id = c.id
              and t.status = 'in_admin_pool'
            returning t.id
    )
    select array_agg(id) into v_moved_ids from moved;

    if v_moved_ids is null or array_length(v_moved_ids, 1) < p_count then
        -- Abort so the partial flips roll back — nothing is left half-allocated.
        -- The message distinguishes "pool is empty" from "pool has tokens this
        -- volunteer's zone cannot use", because those need different fixes.
        if v_in_pool > v_eligible then
            raise exception
                'admin pool has fewer than % allocatable token(s) for this volunteer: % in pool, % eligible after geographic scope',
                p_count, v_in_pool, v_eligible;
        else
            raise exception
                'admin pool has fewer than % allocatable token(s)', p_count;
        end if;
    end if;

    -- 7. One grant record per moved token.
    insert into public.token_distribution_records (token_id, distributed_by, channel, distributed_at)
    select u.id, v_user_id, p_channel::public.distribution_channel, v_now
    from unnest(v_moved_ids) as u(id);

    return query
        select u.id as token_id, (v_in_pool - v_eligible) as skipped_count
        from unnest(v_moved_ids) as u(id);
end;
$$;

comment on function public.allocate_pooled_tokens(uuid, integer, text, text) is
    'FIFO pool allocation honouring geographic scope and token type (F-5/B-32b, CD §D-10A). Ordering is unchanged (minted_at asc); the scope predicate removes tokens the volunteer could never redeem, so FIFO skips over them rather than stalling. Donor-controlled tokens are excluded explicitly. Returns skipped_count so the caller can log what was passed over.';

revoke all on function public.allocate_pooled_tokens(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.allocate_pooled_tokens(uuid, integer, text, text) to service_role;

-- --- the §3b request-grant channel also reports the skip ---------------------
-- CD §D-10A covers BOTH allocation channels: admin assignment (§3a) and the
-- volunteer-request grant (§3b). decide_volunteer_request calls
-- allocate_pooled_tokens internally and selects `a.token_id` by name, so the new
-- second column does not break it — but without this change the §3b path would
-- silently discard the skip count, and only half the card's criterion would hold.
--
-- The 3-argument call inside it still resolves, via p_token_type's default.
drop function if exists public.decide_volunteer_request(uuid, text, integer, uuid);

create or replace function public.decide_volunteer_request(
    p_request_id    uuid,
    p_decision      text,
    p_decided_count integer,
    p_admin_id      uuid
)
returns table (token_ids uuid[], volunteer_user_id uuid, granted_count integer, skipped_for_scope integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_volunteer_id uuid;
    v_status       text;
    v_requested    integer;
    v_count        integer;
    v_moved        uuid[];
    v_user_id      uuid;
    v_skipped      integer := 0;
begin
    -- 1. Row-lock the request so a concurrent decide blocks and then sees a
    --    non-pending status.
    select r.volunteer_id, r.status, r.requested_count
        into v_volunteer_id, v_status, v_requested
        from public.volunteer_token_requests r
        where r.id = p_request_id
        for update;

    if not found then
        raise exception 'request not found';
    end if;
    if v_status <> 'pending' then
        raise exception 'request already decided (status is %)', v_status;
    end if;

    -- 2. Denial finalises without allocating anything.
    if p_decision = 'denied' then
        update public.volunteer_token_requests
            set status = 'denied'::public.volunteer_request_status,
                decided_by = p_admin_id, decided_count = 0, updated_at = now()
            where id = p_request_id;
        select user_id into v_user_id from public.volunteers where id = v_volunteer_id;
        return query select null::uuid[], v_user_id, 0, 0;
        return;
    end if;

    -- 3. Resolve the count to grant.
    if p_decision = 'granted' then
        v_count := v_requested;
    else
        if p_decided_count is null or p_decided_count <= 0 then
            raise exception 'a partial grant needs a positive count';
        end if;
        if p_decided_count > v_requested then
            raise exception 'cannot grant % when only % were requested', p_decided_count, v_requested;
        end if;
        v_count := p_decided_count;
    end if;

    -- 4. Allocate in the SAME transaction; a raise aborts the whole decision.
    select array_agg(a.token_id), coalesce(max(a.skipped_count), 0)
        into v_moved, v_skipped
        from public.allocate_pooled_tokens(v_volunteer_id, v_count, 'volunteer_request_grant') a;

    -- 5. Finalise.
    update public.volunteer_token_requests
        set status = p_decision::public.volunteer_request_status,
            decided_by = p_admin_id, decided_count = v_count, updated_at = now()
        where id = p_request_id;

    select user_id into v_user_id from public.volunteers where id = v_volunteer_id;

    return query select v_moved, v_user_id, v_count, v_skipped;
end;
$$;

comment on function public.decide_volunteer_request(uuid, text, integer, uuid) is
    'Atomic volunteer-request decision (token-flow §3b). Unchanged except that it now also returns skipped_for_scope (F-5/B-32b) — CD §D-10A''s logged-skip requirement covers BOTH allocation channels, not only admin assignment.';

revoke all on function public.decide_volunteer_request(uuid, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.decide_volunteer_request(uuid, text, integer, uuid) to service_role;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- Restores BOTH original signatures. The original bodies are in
-- 20260625000004_allocate_pooled_tokens_rpc.sql and
-- 20260625000017_decide_volunteer_request_atomic.sql — re-run both files after
-- dropping these, or allocation stops working entirely.
--
-- begin;
-- drop function if exists public.allocate_pooled_tokens(uuid, integer, text, text);
-- drop function if exists public.token_scope_allows_volunteer(uuid, uuid, uuid, text, text);
-- -- then re-apply 20260625000004_allocate_pooled_tokens_rpc.sql
-- commit;
