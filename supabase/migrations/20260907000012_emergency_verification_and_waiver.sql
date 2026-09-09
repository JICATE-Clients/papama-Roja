-- =============================================================================
-- E-2 (B-27 a–c) — Emergency verification relaxation + automatic ₹10 waiver
-- =============================================================================
-- Work Order card E-2, CD §D-7. Depends on E-1 (the emergency entity) and F-1
-- (contribution_waivers). Apply after 20260907000011.
--
-- THE CLIENT'S POLICY, in one line: genuine beneficiaries must not be denied
-- emergency food because they lack documentation. So during an authorised
-- emergency the verification step may be relaxed — but the CORE controls never
-- relax. CD §D-7 lists what always runs: valid token, not already redeemed,
-- within validity, authorised active Food Partner, geographic restriction,
-- emergency meal limit, cooldown, date/time recorded.
--
-- WHAT "RELAXED" MEANS PRECISELY. Face verification becomes SKIPPABLE, not
-- absent, and the level actually achieved is recorded per transaction:
--   Level 1 Standard  — valid token + the basic controls
--   Level 2 Enhanced  — plus face / mobile / volunteer confirmation where feasible
--   Level 3 Referred  — exception, flagged for investigation
-- Recording the level is what makes post-emergency review possible: without it
-- every emergency transaction looks identical afterwards and there is nothing to
-- risk-rank.
--
-- THE WAIVER IS SYSTEM-INDICATED. CD §D-7 is explicit that it is "never
-- Food-Partner or volunteer discretion". A vendor cannot ask for it; the server
-- grants it because an active emergency covers this service location. That
-- distinction is the whole control — a discretionary waiver at the till is a
-- ₹10 leak with a humanitarian label on it.
--
-- ON PHOTOGRAPHS (CD §D-7's documentation correction, VERIFIED against the code
-- before writing this): the platform stores no photograph of any person in any
-- mode. `faceCaptureSchema` accepts only an on-device-computed embedding and a
-- liveness score — there is no image field, and none is transmitted or retained.
-- Nothing here changes that.
-- =============================================================================

begin;

create type public.verification_level as enum ('standard', 'enhanced', 'referred');

comment on type public.verification_level is
    'Verification actually achieved for a redemption (CD §D-7). standard = valid token + basic controls; enhanced = plus face/mobile/volunteer confirmation; referred = exception, flagged for investigation. Recorded per transaction so post-emergency review can risk-rank rather than face an undifferentiated mass.';

alter table public.token_redemptions
    -- Defaults to 'enhanced': the NORMAL path requires face verification, so a
    -- row written outside an emergency has met the higher bar. Defaulting to
    -- 'standard' would silently downgrade the entire existing history.
    add column verification_level public.verification_level not null default 'enhanced',
    add column face_verification_skipped boolean not null default false,
    -- Denormalised YES/NO flags matching CD §D-7's stated tagging fields. The
    -- emergency_id FK (E-1) is the join; these make the client's required
    -- "Emergency Mode = YES / Emergency ₹10 Waiver = YES" reporting a plain
    -- column read rather than a three-table inference.
    add column emergency_mode boolean not null default false,
    add column contribution_waived boolean not null default false;

comment on column public.token_redemptions.verification_level is
    'CD §D-7 Level 1/2/3. Defaults to enhanced because the normal path requires face verification — defaulting to standard would silently downgrade all existing history.';
comment on column public.token_redemptions.face_verification_skipped is
    'True when the face step was skipped under an authorised emergency. Distinct from verification_level: a skipped face is WHY the level dropped, and post-emergency review needs both.';
comment on column public.token_redemptions.contribution_waived is
    'True when the ₹10 was auto-waived under an emergency (CD §D-7). SYSTEM-INDICATED — never Food-Partner or volunteer discretion. The Food Partner still receives the FULL meal value through normal settlement.';

create index token_redemptions_emergency_mode_idx
    on public.token_redemptions (emergency_mode, redeemed_at desc)
    where emergency_mode;

create index token_redemptions_verification_level_idx
    on public.token_redemptions (verification_level)
    where verification_level <> 'enhanced';

-- --- emergency waiver policy on the emergency itself --------------------------
-- CD §D-7: the waiver applies "either generally within the defined emergency
-- scope or for specified emergency circumstances". Defaulting to TRUE would
-- decide policy on the client's behalf, so an emergency starts with the waiver
-- OFF and an administrator turns it on deliberately.
alter table public.emergencies
    add column contribution_waiver_enabled boolean not null default false,
    add column verification_relaxation_enabled boolean not null default false;

comment on column public.emergencies.contribution_waiver_enabled is
    'Whether the ₹10 auto-waiver applies within this emergency''s scope (CD §D-7). Defaults FALSE: an emergency does not automatically waive contributions, an administrator decides. Ends with the emergency — there is no separate expiry to forget.';
comment on column public.emergencies.verification_relaxation_enabled is
    'Whether the face-verification step may be skipped within this emergency''s scope (CD §D-7). Defaults FALSE for the same reason.';

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop index if exists public.token_redemptions_verification_level_idx;
-- drop index if exists public.token_redemptions_emergency_mode_idx;
-- alter table public.emergencies
--     drop column if exists contribution_waiver_enabled,
--     drop column if exists verification_relaxation_enabled;
-- alter table public.token_redemptions
--     drop column if exists verification_level,
--     drop column if exists face_verification_skipped,
--     drop column if exists emergency_mode,
--     drop column if exists contribution_waived;
-- drop type if exists public.verification_level;
-- commit;
