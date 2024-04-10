CREATE TABLE sources (
  hashpath TEXT PRIMARY KEY,
  duration_s REAL NOT NULL,
  chromaprint BLOB NOT NULL
) WITHOUT ROWID;

CREATE INDEX sources_idx ON sources (duration_s, chromaprint);