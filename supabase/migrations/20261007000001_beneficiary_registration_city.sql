-- Work Order Q-5 (B-15) — city lock at registration.
--
-- The redemption engine already refuses a meal outside the operating city, but
-- that is too late to be kind: someone registers, waits, travels to a counter,
-- and only there learns pApAmA does not serve their city. The client chose a
-- hard block at sign-up (7 Oct 2026), which needs a city on the registration to
-- check against.
--
-- `location_hint` already exists but is a free-text aid for finding someone
-- ("near the bus stand"), not a place the rule can be evaluated against. The
-- two are kept separate so neither has to carry the other's meaning.
--
-- Vendors and volunteers already have a `city` column; only this table lacked one.

alter table public.beneficiary_registrations
    add column if not exists city text;

comment on column public.beneficiary_registrations.city is
    'Applicant''s city, captured at registration. Checked against system_config.operating_city while city_lock_enabled is on (Q-5 / B-15). Distinct from location_hint, which is a free-text aid for finding the person.';

-- DOWN (reversible):
--   alter table public.beneficiary_registrations drop column if exists city;
