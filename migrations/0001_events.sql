-- Calendario condiviso: gli orari sono minuti dall'inizio del giorno locale.
-- La fine a mezzanotte è rappresentata da 1440; gli intervalli sono [inizio, fine).
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
  owner TEXT NOT NULL CHECK (owner IN ('school', 'town')),
  event_date TEXT NOT NULL CHECK (length(event_date) = 10),
  start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute INTEGER NOT NULL CHECK (end_minute BETWEEN 1 AND 1440 AND end_minute > start_minute),
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS events_date_time ON events (event_date, start_minute, end_minute);
