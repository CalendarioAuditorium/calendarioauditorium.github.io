-- Finestre di limitazione tentativi; la chiave non contiene indirizzi IP in chiaro.
CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 1)
);
CREATE INDEX IF NOT EXISTS login_attempts_window ON login_attempts(window_start);
