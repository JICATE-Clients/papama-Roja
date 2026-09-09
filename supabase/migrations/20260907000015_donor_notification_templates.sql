-- =============================================================================
-- P-1 (B-29a) — the three donor redemption templates, verbatim from CD §D-10
-- =============================================================================
-- Work Order card P-1, second half. Apply after 20260907000014.
--
-- CD §D-10 supplies three templates and calls them "the ONLY donor-visible
-- redemption content". They are reproduced here word for word. They are not a
-- draft to improve on: the client wrote them to say exactly enough and no more,
-- and every word not present is a deliberate omission. In particular none of
-- them names the beneficiary, their category, their condition or their address.
--
-- {{location}} renders "City, State" from the whitelist payload builder
-- (lib/notifications/donorWhitelist.ts), which fills it from the A-1 service
-- snapshot — where the MEAL WAS SERVED, never where the beneficiary lives. CD's
-- worked example: a Coimbatore-sponsored unrestricted token redeemed in Mumbai
-- reads "Mumbai, Maharashtra".
--
-- WHY THREE KINDS AND NOT ONE WITH A CONDITIONAL: the dispatcher resolves a
-- template by `kind`, and an admin editing the Special Care wording must not be
-- able to change the standard one by accident. Separate rows keep the blast
-- radius of an edit to the programme it belongs to.
--
-- `on conflict do nothing`: these are DEFAULTS. If an administrator has already
-- customised a row, this migration must not overwrite their words.
-- =============================================================================

begin;

insert into public.notification_templates (kind, channel, subject, body_template, is_active)
values
    (
        'redemption',
        'in_app',
        'PAPAMA Redemption Update',
        'Your sponsored meal token has been successfully redeemed in {{location}}. Thank you for helping PAPAMA provide food with dignity.',
        true
    ),
    (
        'redemption_special_care',
        'in_app',
        'PAPAMA Special Care Update',
        'Your ₹100 Special Care Token has been successfully redeemed in {{location}}. Thank you for supporting PAPAMA''s Special Care programme.',
        true
    ),
    (
        'redemption_emergency',
        'in_app',
        'PAPAMA Emergency Response Update',
        'Your sponsored emergency meal token has been successfully redeemed in {{location}}. Thank you for supporting PAPAMA''s emergency food response.',
        true
    )
on conflict (kind, channel) do nothing;

commit;

-- =============================================================================
-- VERIFY after applying
-- =============================================================================
-- No donor-facing template should mention a beneficiary attribute. This should
-- return zero rows:
--
--   select kind, subject
--   from public.notification_templates
--   where body_template ~* 'categor|patient|pregnan|disabilit|medical|aadhaar|address';

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- Removes ONLY rows still carrying the exact CD wording, so an administrator's
-- later edits are never silently deleted by a rollback.
--
-- begin;
-- delete from public.notification_templates
-- where kind in ('redemption', 'redemption_special_care', 'redemption_emergency')
--   and body_template like '%Thank you for %PAPAMA%';
-- commit;
