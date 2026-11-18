-- Registro senza dati dell'evento o destinatari. Non rimuove la notifica originale.
-- Applicare solo dopo verifica dello schema esistente e backup del database scelto.
CREATE TABLE notification_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER NOT NULL,
  observed_status TEXT NOT NULL CHECK(observed_status IN ('failed','unknown')),
  observed_attempts INTEGER NOT NULL CHECK(observed_attempts >= 0),
  decision TEXT NOT NULL CHECK(decision IN ('no_resend','delivery_confirmed','reopen')),
  reviewed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX notification_reviews_latest
  ON notification_reviews(notification_id,observed_status,observed_attempts,id DESC);

-- Anche gli inserimenti diretti devono riferirsi allo stato ancora corrente.
CREATE TRIGGER notification_reviews_snapshot BEFORE INSERT ON notification_reviews
WHEN NOT EXISTS (
  SELECT 1 FROM notification_queue q
  WHERE q.id=NEW.notification_id AND q.status=NEW.observed_status
    AND q.attempts=NEW.observed_attempts
)
BEGIN
  SELECT RAISE(ABORT,'notification review snapshot mismatch');
END;

CREATE TRIGGER notification_reviews_no_update BEFORE UPDATE ON notification_reviews
BEGIN
  SELECT RAISE(ABORT,'notification reviews are append only');
END;

CREATE TRIGGER notification_reviews_no_delete BEFORE DELETE ON notification_reviews
BEGIN
  SELECT RAISE(ABORT,'notification reviews are append only');
END;
