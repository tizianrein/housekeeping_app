CREATE TABLE IF NOT EXISTS objekte (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  adresse TEXT,
  emoji TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS einheiten (
  id TEXT PRIMARY KEY,
  objekt_id TEXT NOT NULL,
  typ TEXT,
  bez TEXT,
  mieter TEXT,
  m2 REAL,
  km_m2 REAL,
  km_monat REAL,
  nk_monat REAL,
  letzte_erhoehung TEXT,
  naechste_erhoehungen TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (objekt_id) REFERENCES objekte(id)
);

CREATE TABLE IF NOT EXISTS schaeden (
  id TEXT PRIMARY KEY,
  titel TEXT NOT NULL,
  beschreibung TEXT,
  objekt_id TEXT NOT NULL,
  einheit_id TEXT,
  kategorie TEXT,
  prioritaet TEXT,
  status TEXT DEFAULT 'offen',
  kosten REAL DEFAULT 0,
  handwerker_id TEXT,
  erstellt TEXT,
  fotos TEXT,
  historie TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS handwerker (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gewerk TEXT,
  tel TEXT,
  notiz TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS wartung (
  id TEXT PRIMARY KEY,
  titel TEXT NOT NULL,
  objekt_id TEXT,
  intervall TEXT,
  naechster TEXT,
  notiz TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_einheiten_objekt ON einheiten(objekt_id);
CREATE INDEX IF NOT EXISTS idx_schaeden_objekt ON schaeden(objekt_id);
CREATE INDEX IF NOT EXISTS idx_schaeden_status ON schaeden(status);