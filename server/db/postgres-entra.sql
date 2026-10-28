-- Entra External ID link: oid of the external identity, set only after JWKS-verified
-- ID-token exchange. Password column stays for legacy accounts until cutover.
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_oid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_entra_oid_unique ON users (entra_oid) WHERE entra_oid IS NOT NULL;
CREATE TABLE IF NOT EXISTS entra_replay (token_hash TEXT PRIMARY KEY, expires_at BIGINT NOT NULL);
