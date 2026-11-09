-- Gli identificativi sono gestiti dal provider; nessuna password è conservata qui.
CREATE TABLE IF NOT EXISTS managed_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ced','school','town')),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  provider_user_id TEXT NOT NULL UNIQUE,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0,1)),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS managed_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES managed_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS managed_sessions_user ON managed_sessions(user_id);
CREATE INDEX IF NOT EXISTS managed_sessions_expiry ON managed_sessions(expires_at);
