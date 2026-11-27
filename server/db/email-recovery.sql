CREATE TABLE IF NOT EXISTS recovery_email_proofs (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  verified_at BIGINT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cloudflare-code', 'firebase-link', 'entra'))
);
CREATE TABLE IF NOT EXISTS firebase_email_attempts (
  uid TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  owner_marker TEXT NOT NULL,
  user_id BIGINT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  recipient_key TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  nonce_hash TEXT NOT NULL UNIQUE,
  session_hash TEXT,
  state TEXT NOT NULL CHECK (state IN ('queued', 'sending', 'ready', 'retired', 'reconcile')),
  expires_at BIGINT NOT NULL,
  cleanup_at BIGINT NOT NULL,
  retry_until BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS firebase_email_account ON firebase_email_attempts(user_id, purpose, state);
CREATE INDEX IF NOT EXISTS firebase_email_cleanup ON firebase_email_attempts(project_id, cleanup_at);
CREATE INDEX IF NOT EXISTS firebase_email_recipient ON firebase_email_attempts(project_id, recipient_key, state);
CREATE UNIQUE INDEX IF NOT EXISTS firebase_email_one_live_recipient ON firebase_email_attempts(project_id, recipient_key)
  WHERE state IN ('sending', 'ready');
