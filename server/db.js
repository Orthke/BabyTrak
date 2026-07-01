import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'babytrak.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Babies (profiles). weight/height carry their own unit so US/metric both work.
db.exec(`
  CREATE TABLE IF NOT EXISTS babies (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    birthdate    TEXT,                              -- 'YYYY-MM-DD'
    gender       TEXT NOT NULL DEFAULT 'girl',      -- 'boy' | 'girl'
    weight_grams REAL,                              -- canonical; null = unknown
    weight_unit  TEXT NOT NULL DEFAULT 'lb_oz',     -- display pref: 'lb_oz' | 'kg' | 'g'
    height_cm    REAL,                              -- canonical; null = unknown
    height_unit  TEXT NOT NULL DEFAULT 'in',        -- display pref: 'in' | 'cm'
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Caregivers (parents/others). They only track their own medications, so the
  -- profile is intentionally minimal compared to a baby.
  CREATE TABLE IF NOT EXISTS caregivers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Unified feeding: breast (nursing), bottle, or both in one session.
  CREATE TABLE IF NOT EXISTS feedings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    baby_id      INTEGER REFERENCES babies(id),
    type         TEXT NOT NULL DEFAULT 'breast',   -- 'breast' | 'bottle' | 'both'
    start_time   TEXT NOT NULL,
    end_time     TEXT,
    left_seconds  INTEGER NOT NULL DEFAULT 0,      -- breast portion
    right_seconds INTEGER NOT NULL DEFAULT 0,      -- breast portion
    bottle_seconds INTEGER NOT NULL DEFAULT 0,     -- bottle portion duration
    amount       REAL,                             -- bottle portion volume
    unit         TEXT NOT NULL DEFAULT 'ml',        -- 'ml' | 'oz'
    milk_type    TEXT NOT NULL DEFAULT 'breast',   -- 'breast' | 'formula'
    comment      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pumps (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    baby_id      INTEGER REFERENCES babies(id),
    start_time   TEXT NOT NULL,
    end_time     TEXT,
    amount       REAL,                             -- volume collected; null = not recorded
    unit         TEXT NOT NULL DEFAULT 'ml',        -- 'ml' | 'oz'
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    comment      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS diapers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    baby_id      INTEGER REFERENCES babies(id),
    time         TEXT NOT NULL,
    wet          INTEGER NOT NULL DEFAULT 0,        -- 0 | 1
    dirty        INTEGER NOT NULL DEFAULT 0,        -- 0 | 1
    stool_amount  TEXT,                             -- 'light'|'medium'|'heavy'|'blowout' (dirty only)
    stool_color   TEXT,                             -- named swatch (dirty only)
    stool_texture TEXT,                             -- 'runny'|'seedy'|'pasty'|'mushy'|'pebbles' (dirty only)
    comment      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Catalog of medications shown in the dropdown. Seeded with common ones;
  -- the user can append custom entries (is_custom = 1) that persist for reuse.
  -- Name is unique within a category (see idx_med_name_cat) rather than globally,
  -- so the same drug name can exist in both the baby and caregiver dropdowns.
  CREATE TABLE IF NOT EXISTS medications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    default_unit TEXT NOT NULL DEFAULT 'ml',         -- 'pills' | 'mg' | 'drops' | 'ml'
    category     TEXT NOT NULL DEFAULT 'baby',       -- 'baby' | 'caregiver' (which dropdown it shows in)
    is_custom    INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A logged dose given to a baby OR a caregiver. Exactly one of baby_id /
  -- caregiver_id is set. Name is denormalized so history survives even if the
  -- catalog entry is later removed.
  CREATE TABLE IF NOT EXISTS med_doses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    baby_id      INTEGER REFERENCES babies(id),
    caregiver_id INTEGER REFERENCES caregivers(id),
    name         TEXT NOT NULL,
    amount       REAL,                               -- dose given; null = not recorded
    unit         TEXT NOT NULL DEFAULT 'ml',         -- 'pills' | 'mg' | 'drops' | 'ml'
    time         TEXT NOT NULL,
    comment      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Catalog of milestone titles shown in the dropdown. Seeded with common infant
  -- developmental milestones; the user can append custom entries (is_custom = 1)
  -- that persist for reuse, mirroring the medications catalog.
  CREATE TABLE IF NOT EXISTS milestone_types (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    is_custom    INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A milestone a baby reached: a moment in time with a title and optional note.
  -- Name is denormalized so history survives even if the catalog entry is later
  -- removed.
  CREATE TABLE IF NOT EXISTS milestones (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    baby_id      INTEGER REFERENCES babies(id),
    name         TEXT NOT NULL,
    time         TEXT NOT NULL,
    comment      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A sleep/nap session. end_time NULL means the nap is still in progress: the
  -- live timer is derived from start_time vs. now, so it survives reloads and app
  -- closes. Stopping sets end_time; duration is simply end - start.
  CREATE TABLE IF NOT EXISTS sleeps (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    baby_id      INTEGER REFERENCES babies(id),
    start_time   TEXT NOT NULL,
    end_time     TEXT,
    comment      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A measurement taken at a point in time: weight and/or length(height). Values
  -- are stored canonically (grams / cm) with the unit the user entered in, so the
  -- same display preference as the baby profile can be honored. At least one of
  -- weight_grams / height_cm is set per row (the form requires it).
  CREATE TABLE IF NOT EXISTS measurements (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    baby_id      INTEGER REFERENCES babies(id),
    time         TEXT NOT NULL,
    weight_grams REAL,                              -- canonical; null = not recorded
    weight_unit  TEXT NOT NULL DEFAULT 'lb_oz',     -- display pref: 'lb_oz' | 'kg' | 'g'
    height_cm    REAL,                              -- canonical; null = not recorded
    height_unit  TEXT NOT NULL DEFAULT 'in',        -- display pref: 'in' | 'cm'
    comment      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A temperature reading taken at a point in time. Like med_doses it can belong
  -- to a baby OR a caregiver (exactly one is set). The value is stored in the
  -- unit it was entered in ('F' | 'C') since the conversion is trivial.
  CREATE TABLE IF NOT EXISTS temperatures (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    baby_id      INTEGER REFERENCES babies(id),
    caregiver_id INTEGER REFERENCES caregivers(id),
    time         TEXT NOT NULL,
    temp         REAL NOT NULL,                     -- value, in the given unit
    unit         TEXT NOT NULL DEFAULT 'F',         -- 'F' | 'C'
    method       TEXT NOT NULL DEFAULT 'oral',      -- 'oral' | 'forehead' | 'axillary'
    comment      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A blood-pressure reading for a baby OR a caregiver (exactly one owner set),
  -- like temperatures. Stored in mmHg (the universal cuff unit) so no conversion
  -- is needed. Pulse is optional — many cuffs report it alongside the reading.
  CREATE TABLE IF NOT EXISTS blood_pressures (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    baby_id      INTEGER REFERENCES babies(id),
    caregiver_id INTEGER REFERENCES caregivers(id),
    time         TEXT NOT NULL,
    systolic     INTEGER NOT NULL,                  -- top number, mmHg
    diastolic    INTEGER NOT NULL,                  -- bottom number, mmHg
    pulse        INTEGER,                           -- bpm; null = not recorded
    comment      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Lightweight migrations ---
function columnExists(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
}
function ensureColumn(table, col, def) {
  if (!columnExists(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
function tableExists(name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

for (const table of ['diapers', 'pumps']) {
  ensureColumn(table, 'baby_id', 'INTEGER REFERENCES babies(id)');
}
// Stool detail, only meaningful when a diaper is dirty (all null otherwise).
ensureColumn('diapers', 'stool_amount', 'TEXT');   // 'light' | 'medium' | 'heavy' | 'blowout'
ensureColumn('diapers', 'stool_color', 'TEXT');    // named swatch, e.g. 'yellow'
ensureColumn('diapers', 'stool_texture', 'TEXT');  // 'runny' | 'seedy' | 'pasty' | 'mushy' | 'pebbles'
ensureColumn('feedings', 'bottle_seconds', 'INTEGER NOT NULL DEFAULT 0');
// Babies created under the older weight/height-with-simple-unit schema.
ensureColumn('babies', 'weight_grams', 'REAL');
ensureColumn('babies', 'height_cm', 'REAL');
ensureColumn('babies', 'weight_unit', "TEXT NOT NULL DEFAULT 'lb_oz'");
ensureColumn('babies', 'height_unit', "TEXT NOT NULL DEFAULT 'in'");
// Caregiver medication tracking: doses can belong to a caregiver instead of a
// baby, and the catalog is split into baby vs. caregiver dropdowns.
ensureColumn('med_doses', 'caregiver_id', 'INTEGER REFERENCES caregivers(id)');
ensureColumn('medications', 'category', "TEXT NOT NULL DEFAULT 'baby'");
// Temperature reading method (added after the temperatures table shipped).
ensureColumn('temperatures', 'method', "TEXT NOT NULL DEFAULT 'oral'");

// Older databases created `medications.name` with a global UNIQUE constraint.
// Rebuild the table without it so a name can live in both categories; the
// (name, category) pair stays unique via idx_med_name_cat below.
const medSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='medications'").get()?.sql || '';
if (/UNIQUE/i.test(medSql)) {
  db.transaction(() => {
    db.exec(`
      ALTER TABLE medications RENAME TO medications_old;
      CREATE TABLE medications (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT NOT NULL,
        default_unit TEXT NOT NULL DEFAULT 'ml',
        category     TEXT NOT NULL DEFAULT 'baby',
        is_custom    INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO medications (id, name, default_unit, category, is_custom, created_at)
        SELECT id, name, default_unit, COALESCE(category, 'baby'), is_custom, created_at FROM medications_old;
      DROP TABLE medications_old;
    `);
  })();
}

// Fold the old split breast_feedings / bottle_feedings tables into `feedings`.
// Runs once: the legacy tables are dropped afterward so it can't repeat.
if (tableExists('breast_feedings') || tableExists('bottle_feedings')) {
  db.transaction(() => {
    if (tableExists('breast_feedings')) {
      ensureColumn('breast_feedings', 'baby_id', 'INTEGER');
      db.exec(`
        INSERT INTO feedings (baby_id, type, start_time, end_time, left_seconds, right_seconds, milk_type, comment, created_at)
        SELECT baby_id, 'breast', start_time, end_time, left_seconds, right_seconds, milk_type, comment, created_at
        FROM breast_feedings;
      `);
      db.exec('DROP TABLE breast_feedings;');
    }
    if (tableExists('bottle_feedings')) {
      ensureColumn('bottle_feedings', 'baby_id', 'INTEGER');
      db.exec(`
        INSERT INTO feedings (baby_id, type, start_time, end_time, amount, unit, milk_type, comment, created_at)
        SELECT baby_id, 'bottle', start_time, end_time, amount, unit, milk_type, comment, created_at
        FROM bottle_feedings;
      `);
      db.exec('DROP TABLE bottle_feedings;');
    }
  })();
}

// Seed the medication catalog once with common infant medications. Names are
// generic + common brand so they're recognizable; default_unit pre-selects the
// usual form. Users can still add their own and change units per dose.
const COMMON_MEDS = [
  ['Vitamin D drops', 'drops'],
  ['Acetaminophen (Infant Tylenol)', 'ml'],
  ['Ibuprofen (Infant Motrin)', 'ml'],
  ['Gripe water', 'ml'],
  ['Simethicone (gas drops)', 'drops'],
  ['Probiotic drops', 'drops'],
  ['Saline nasal drops', 'drops'],
  ['Multivitamin with Iron (Poly-Vi-Sol)', 'ml'],
  ['Famotidine (reflux)', 'ml'],
  ['Amoxicillin', 'ml'],
  ['Vitamin C drops', 'drops'],
  ['Teething tablets', 'pills'],
];
// Adult / caregiver medications. Tylenol and ibuprofen lead the list; the rest
// cover common over-the-counter and postpartum supplements. Users can add their
// own custom caregiver meds too.
const CAREGIVER_MEDS = [
  ['Tylenol (Acetaminophen)', 'pills'],
  ['Ibuprofen (Advil / Motrin)', 'pills'],
  ['Aspirin', 'pills'],
  ['Naproxen (Aleve)', 'pills'],
  ['Prenatal vitamin', 'pills'],
  ['Multivitamin', 'pills'],
  ['Vitamin D', 'pills'],
  ['Iron supplement', 'pills'],
  ['Stool softener (Colace)', 'pills'],
  ['Antacid (Tums)', 'pills'],
  ['Allergy (Benadryl)', 'pills'],
  ['Allergy (Claritin)', 'pills'],
];

const insMed = db.prepare('INSERT INTO medications (name, default_unit, category, is_custom) VALUES (?, ?, ?, 0)');
// Seed each catalog independently so an existing baby-only database still picks
// up the caregiver list when this version first runs.
if (db.prepare("SELECT COUNT(*) c FROM medications WHERE category = 'baby'").get().c === 0) {
  db.transaction(() => COMMON_MEDS.forEach(([name, unit]) => insMed.run(name, unit, 'baby')))();
}
if (db.prepare("SELECT COUNT(*) c FROM medications WHERE category = 'caregiver'").get().c === 0) {
  db.transaction(() => CAREGIVER_MEDS.forEach(([name, unit]) => insMed.run(name, unit, 'caregiver')))();
}

// Common infant/baby milestones, roughly in the order they tend to happen. The
// user can add their own (is_custom = 1) which persist for reuse.
const INFANT_MILESTONES = [
  'First smile',
  'Holds head up',
  'Responds to name',
  'First laugh',
  'Rolls over',
  'Sits without support',
  'First tooth',
  'Babbles',
  'First solid food',
  'Crawls',
  'Pulls to stand',
  'Claps hands',
  'Waves bye-bye',
  'First words',
  'Stands alone',
  'First steps',
  'Sleeps through the night',
  'First haircut',
];
const insMilestoneType = db.prepare('INSERT INTO milestone_types (name, is_custom) VALUES (?, 0)');
if (db.prepare('SELECT COUNT(*) c FROM milestone_types').get().c === 0) {
  db.transaction(() => INFANT_MILESTONES.forEach((name) => insMilestoneType.run(name)))();
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_feeding_baby ON feedings(baby_id);
  CREATE INDEX IF NOT EXISTS idx_diaper_baby ON diapers(baby_id);
  CREATE INDEX IF NOT EXISTS idx_pump_baby ON pumps(baby_id);
  CREATE INDEX IF NOT EXISTS idx_meddose_baby ON med_doses(baby_id);
  CREATE INDEX IF NOT EXISTS idx_meddose_caregiver ON med_doses(caregiver_id);
  CREATE INDEX IF NOT EXISTS idx_milestone_baby ON milestones(baby_id);
  CREATE INDEX IF NOT EXISTS idx_sleep_baby ON sleeps(baby_id);
  CREATE INDEX IF NOT EXISTS idx_measurement_baby ON measurements(baby_id);
  CREATE INDEX IF NOT EXISTS idx_temperature_baby ON temperatures(baby_id);
  CREATE INDEX IF NOT EXISTS idx_temperature_caregiver ON temperatures(caregiver_id);
  CREATE INDEX IF NOT EXISTS idx_bloodpressure_baby ON blood_pressures(baby_id);
  CREATE INDEX IF NOT EXISTS idx_bloodpressure_caregiver ON blood_pressures(caregiver_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_med_name_cat ON medications(name, category);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_milestone_type_name ON milestone_types(name);
`);

export default db;
