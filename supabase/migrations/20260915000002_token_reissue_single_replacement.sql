-- =============================================================================
-- A-2 (B-23) — a token can be replaced AT MOST ONCE
-- =============================================================================
-- The controlled reissue (lib/services/tokenReissue.ts) and the lost-token
-- replacement both link the new token via `replacement_for_token_id`. Two
-- admins approving the same reissue at the same moment would otherwise mint two
-- new tokens carrying one token's value — donated money counted twice.
--
-- The application checks for an existing replacement first; this index is the
-- guard that holds when two requests pass that check together.
--
-- Verified before applying (15 Sept): no token has more than one replacement.
-- =============================================================================

begin;

drop index if exists public.tokens_replacement_for_idx;

create unique index tokens_replacement_for_uniq
    on public.tokens (replacement_for_token_id)
    where replacement_for_token_id is not null;

comment on index public.tokens_replacement_for_uniq is
    'A-2: one replacement per token (reissue or lost-token). Prevents a double-approved reissue from minting the same value twice.';

commit;

-- DOWN
-- begin;
-- drop index if exists public.tokens_replacement_for_uniq;
-- create index tokens_replacement_for_idx on public.tokens (replacement_for_token_id)
--     where replacement_for_token_id is not null;
-- commit;
