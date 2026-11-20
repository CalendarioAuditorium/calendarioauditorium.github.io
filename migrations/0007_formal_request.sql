-- Gli eventi esistenti partono con richiesta formale non effettuata.
ALTER TABLE events ADD COLUMN formal_request_done INTEGER NOT NULL DEFAULT 0
  CHECK (formal_request_done IN (0, 1));
