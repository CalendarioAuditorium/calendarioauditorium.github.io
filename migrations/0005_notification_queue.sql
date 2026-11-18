-- Il trigger è parte della stessa transazione dell'INSERT dell'evento.
CREATE TABLE notification_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  recipient TEXT NOT NULL CHECK(recipient IN ('school','town')),
  title TEXT NOT NULL,
  owner TEXT NOT NULL,
  event_date TEXT NOT NULL,
  start_minute INTEGER NOT NULL,
  end_minute INTEGER NOT NULL,
  overlap INTEGER NOT NULL,
  other_slot INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claimed','sending','accepted','unknown','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL DEFAULT (unixepoch()),
  lease_until INTEGER,
  claim_token TEXT,
  gmail_id TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(event_id,recipient)
);
CREATE INDEX notification_queue_ready ON notification_queue(status,available_at);

CREATE TRIGGER enqueue_event_notifications AFTER INSERT ON events BEGIN
  INSERT INTO notification_queue(event_id,recipient,title,owner,event_date,start_minute,end_minute,overlap,other_slot)
  SELECT NEW.id, recipient, NEW.title, NEW.owner, NEW.event_date, NEW.start_minute, NEW.end_minute,
    EXISTS(SELECT 1 FROM events e WHERE e.id<>NEW.id AND e.event_date=NEW.event_date
      AND e.start_minute<NEW.end_minute AND e.end_minute>NEW.start_minute),
    CASE WHEN NEW.owner='school' THEN NEW.end_minute>840 ELSE NEW.start_minute<840 END
  FROM (SELECT 'school' AS recipient UNION ALL SELECT 'town')
  WHERE recipient<>NEW.owner
    OR (NEW.owner='school' AND NEW.end_minute>840)
    OR (NEW.owner='town' AND NEW.start_minute<840)
    OR EXISTS(SELECT 1 FROM events e WHERE e.id<>NEW.id AND e.event_date=NEW.event_date
      AND e.start_minute<NEW.end_minute AND e.end_minute>NEW.start_minute);
END;
