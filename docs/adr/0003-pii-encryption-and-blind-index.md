# ADR 0003: PII encryption with blind-index search

- Status: Accepted
- Date: 2026-06-22

## Context

We store PII (email, phone, address, names, LINE user id) and must keep it
protected, while still supporting equality lookups (e.g. find a customer by
phone) and Japanese privacy expectations.

## Decision

Encrypt PII at the application layer with AES-256-GCM and store the ciphertext in
`bytea` columns suffixed `_encrypted`. For searchable PII, also store a
deterministic blind index `*_hash = HMAC-SHA256(normalized_value, pepper)`.

Keys (`PII_ENCRYPTION_KEY`) and pepper (`PII_HASH_PEPPER`) live in the
environment, never in the database or browser bundle. Implemented in
`@line-os/db/crypto`.

## Consequences

- The database never holds plaintext PII or the keys; a DB compromise alone does
  not reveal PII.
- Only equality search is possible on hashed columns (no range/prefix). Acceptable
  for lookups by exact phone/email.
- Key/pepper rotation requires a re-encryption / re-hash migration (see security
  doc). Plan key versioning before production.
