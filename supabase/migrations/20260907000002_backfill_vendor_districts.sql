-- =============================================================================
-- A-1 (B-02) — backfill: map existing free-text vendor cities to districts
-- =============================================================================
-- The card's migration note: "backfill existing Coimbatore records via one
-- mapped script; write it alongside the migration."
--
-- Runs AFTER 20260907000001. Separate file on purpose: the schema change must be
-- reviewable and revertible on its own, and this one touches live rows.
--
-- WHAT IT DOES
--   Matches `vendors.city` (free text, entered by hand, inconsistently cased and
--   spelled) against Tamil Nadu district names, and fills registered_state_id /
--   registered_district_id where they are still NULL. It NEVER overwrites a row
--   that already has a district — a human-entered value outranks a guess.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   No fuzzy matching. A wrong district is worse than a NULL one: NULL is
--   visibly incomplete and gets fixed, whereas a confidently wrong district
--   silently mis-scopes tokens (A-2) and mis-files emergency reports (E-1).
--   Anything this script cannot match with certainty is left NULL and listed by
--   the audit query at the bottom for a human to resolve.
--
--   A city is not a district. "Coimbatore" the city sits in Coimbatore district,
--   which is why the pilot data maps cleanly — but e.g. "Gandhipuram" is a
--   locality of Coimbatore and is intentionally NOT guessed at here.
-- =============================================================================

begin;

-- --- exact and near-exact city → district matches ----------------------------
-- `alias` covers the spellings actually seen in Indian address data: the
-- pre-2018 anglicisations most people still type, and common contractions.
with alias(raw, district_name) as (
    values
        ('coimbatore',      'Coimbatore'),
        ('kovai',           'Coimbatore'),
        ('chennai',         'Chennai'),
        ('madras',          'Chennai'),
        ('madurai',         'Madurai'),
        ('trichy',          'Tiruchirappalli'),
        ('tiruchirapalli',  'Tiruchirappalli'),
        ('tiruchirappalli', 'Tiruchirappalli'),
        ('trichinopoly',    'Tiruchirappalli'),
        ('salem',           'Salem'),
        ('erode',           'Erode'),
        ('tirupur',         'Tiruppur'),
        ('tiruppur',        'Tiruppur'),
        ('vellore',         'Vellore'),
        ('thanjavur',       'Thanjavur'),
        ('tanjore',         'Thanjavur'),
        ('tirunelveli',     'Tirunelveli'),
        ('nellai',          'Tirunelveli'),
        ('thoothukudi',     'Thoothukudi'),
        ('tuticorin',       'Thoothukudi'),
        ('dindigul',        'Dindigul'),
        ('namakkal',        'Namakkal'),
        ('karur',           'Karur'),
        ('ooty',            'Nilgiris'),
        ('udhagamandalam',  'Nilgiris'),
        ('nilgiris',        'Nilgiris'),
        ('kanyakumari',     'Kanniyakumari'),
        ('kanniyakumari',   'Kanniyakumari'),
        ('nagercoil',       'Kanniyakumari')
)
update public.vendors v
set registered_state_id    = s.id,
    registered_district_id = d.id
from public.states s
join public.districts d on d.state_id = s.id
join alias a on a.district_name = d.name
where s.code = 'TN'
  and v.registered_district_id is null
  -- Normalise the free text the same way on both sides: trim, lowercase, and
  -- collapse internal runs of whitespace ("  new   delhi " → "new delhi").
  and regexp_replace(btrim(lower(coalesce(v.city, ''))), '\s+', ' ', 'g') = a.raw;

-- --- direct name matches for any district not covered by an alias ------------
-- Catches the remaining TN districts where the typed city IS the district name.
update public.vendors v
set registered_state_id    = s.id,
    registered_district_id = d.id
from public.states s
join public.districts d on d.state_id = s.id
where s.code = 'TN'
  and v.registered_district_id is null
  and regexp_replace(btrim(lower(coalesce(v.city, ''))), '\s+', ' ', 'g') = lower(d.name);

commit;

-- =============================================================================
-- AUDIT — run this after applying and resolve every row it returns by hand.
-- =============================================================================
-- These are Food Partners whose city could not be mapped with certainty. Until
-- they have a district they cannot be geographic-scope checked by A-2, so they
-- should be resolved before A-2 ships.
--
--   select id, name, city, pincode
--   from public.vendors
--   where registered_district_id is null
--   order by city nulls first, name;
--
-- Rows with a malformed PIN, which the NOT VALID constraint let through:
--
--   select id, name, pincode
--   from public.vendors
--   where not public.is_valid_pincode(pincode);
--
-- Once both queries return nothing, promote the constraints from NOT VALID:
--
--   alter table public.vendors validate constraint vendors_pincode_valid;
--   alter table public.vendors validate constraint vendors_operating_pincode_valid;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- Clears ONLY what this script could have set: TN districts on rows that have no
-- operating address and were never edited since. There is no perfect inverse —
-- the columns were NULL before, and a human may have corrected a row in the
-- meantime. Prefer fixing forward.
--
-- begin;
-- update public.vendors v
-- set registered_state_id = null, registered_district_id = null
-- from public.states s
-- where v.registered_state_id = s.id and s.code = 'TN';
-- commit;
