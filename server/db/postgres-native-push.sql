-- WP09: native Expo device tokens bound to the authentication session that registered them.
-- Deleting a session (logout, password reset/change, account deletion, admin
-- revocation, phone change/recovery) cascades to its tokens, mirroring presence.
CREATE TABLE native_push_tokens (
  token_hash TEXT PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  user_id BIGINT NOT NULL REFERENCES users(id),
  auth_session_hash TEXT NOT NULL,
  device_hash TEXT NOT NULL CHECK(device_hash ~ '^[a-f0-9]{64}$'),
  platform TEXT NOT NULL CHECK(platform IN ('ios','android')),
  expo_push_token TEXT NOT NULL CHECK(char_length(expo_push_token) BETWEEN 10 AND 300),
  lang TEXT NOT NULL DEFAULT 'ar' CHECK(lang IN ('ar','en')),
  prefs_json JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(prefs_json) = 'object'),
  created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at BIGINT NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  disabled_at BIGINT CHECK(disabled_at BETWEEN 0 AND 9007199254740991),
  UNIQUE(device_hash),
  FOREIGN KEY(auth_session_hash, user_id) REFERENCES sessions(token_hash, user_id) ON DELETE CASCADE
);
CREATE INDEX native_push_tokens_user ON native_push_tokens(user_id, created_at);
CREATE INDEX native_push_tokens_enabled ON native_push_tokens(user_id) WHERE disabled_at IS NULL;

-- A blocked account keeps no reachable device even if a session row is removed
-- by a writer that bypasses the HTTP revocation paths; the worker also
-- re-checks the account status at delivery time.
CREATE FUNCTION wp09_revoke_blocked_tokens() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.status = 'blocked' AND OLD.status IS DISTINCT FROM 'blocked' THEN
    DELETE FROM native_push_tokens WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER users_wp09_revoke_tokens AFTER UPDATE OF status ON users FOR EACH ROW EXECUTE FUNCTION wp09_revoke_blocked_tokens();
