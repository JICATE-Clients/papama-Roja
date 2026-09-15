-- =============================================================================
-- E-4 (B-30) — offline captures carry the QR HASH, not a token id
-- =============================================================================
-- Apply after 20260907000016.
--
-- CORRECTS THE E-4 DESIGN DOCUMENT. It said the offline record's token id comes
-- "from the scanned QR". It cannot: the QR payload is `PAPAMA:<hmac>`, derived
-- from the token id with a SERVER secret (app/api/_lib/tokenQr.ts). A device
-- offline holds the payload and has no way to turn it back into a token id.
--
-- So the device stores sha256(payload) and the server resolves the token at
-- sync by matching tokens.qr_hash — exactly the lookup online redemption uses.
--
-- WHY THE HASH AND NOT THE RAW PAYLOAD. The raw payload is a bearer credential:
-- anyone holding it can present it at a till. Storing it on a field device that
-- may be lost during a disaster would turn a stolen phone into a bag of
-- redeemable meals. The hash cannot be presented as a QR — redemption hashes
-- what is SCANNED — so a stolen device yields nothing redeemable. This is the
-- design's "store almost nothing" principle applied to the one field that
-- mattered most.
-- =============================================================================

begin;

alter table public.offline_transactions
    add column qr_hash text;

comment on column public.offline_transactions.qr_hash is
    'sha256 of the scanned QR payload, computed ON THE DEVICE. The device cannot derive a token id (the payload is an HMAC with a server secret), so the server resolves token_id from this at sync. The raw payload is never stored offline: it is a bearer credential, and a lost device must not carry redeemable meals.';

create index offline_transactions_qr_hash_idx
    on public.offline_transactions (qr_hash)
    where qr_hash is not null;

commit;

-- DOWN
-- begin;
-- drop index if exists public.offline_transactions_qr_hash_idx;
-- alter table public.offline_transactions drop column if exists qr_hash;
-- commit;
