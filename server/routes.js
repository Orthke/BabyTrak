import { Router } from 'express';
import db from './db.js';

const router = Router();

/* ----------------------------- helpers ----------------------------- */

const asInt = (v) => (v ? 1 : 0);
const ok = (res, data) => res.json(data);
const notFound = (res) => res.status(404).json({ error: 'Not found' });
const badRequest = (res, msg) => res.status(400).json({ error: msg });

// Resolve the baby scope from query (?babyId=) or body.baby_id.
const babyScope = (req) => {
  const raw = req.query.babyId ?? req.body?.baby_id;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Resolve the caregiver scope from query (?caregiverId=) or body.caregiver_id.
const caregiverScope = (req) => {
  const raw = req.query.caregiverId ?? req.body?.caregiver_id;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/* ------------------------------ babies ----------------------------- */

router.get('/babies', (req, res) => {
  ok(res, db.prepare('SELECT * FROM babies ORDER BY created_at ASC, id ASC').all());
});

const babyFields = (b) => ({
  name: b.name.trim(),
  birthdate: b.birthdate || null,
  gender: b.gender === 'boy' ? 'boy' : 'girl',
  weight_grams: b.weight_grams ?? null,
  weight_unit: b.weight_unit || 'lb_oz',
  height_cm: b.height_cm ?? null,
  height_unit: b.height_unit || 'in',
});

router.post('/babies', (req, res) => {
  const b = req.body;
  if (!b.name || !b.name.trim()) return badRequest(res, 'Name is required');
  const info = db
    .prepare(
      `INSERT INTO babies (name, birthdate, gender, weight_grams, weight_unit, height_cm, height_unit)
       VALUES (@name, @birthdate, @gender, @weight_grams, @weight_unit, @height_cm, @height_unit)`
    )
    .run(babyFields(b));
  ok(res, db.prepare('SELECT * FROM babies WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/babies/:id', (req, res) => {
  const b = req.body;
  if (!b.name || !b.name.trim()) return badRequest(res, 'Name is required');
  const info = db
    .prepare(
      `UPDATE babies SET name=@name, birthdate=@birthdate, gender=@gender, weight_grams=@weight_grams,
       weight_unit=@weight_unit, height_cm=@height_cm, height_unit=@height_unit WHERE id=@id`
    )
    .run({ id: req.params.id, ...babyFields(b) });
  if (info.changes === 0) return notFound(res);
  ok(res, db.prepare('SELECT * FROM babies WHERE id = ?').get(req.params.id));
});

// Deleting a baby removes all of its entries too (cascade in app code).
const deleteBaby = db.transaction((id) => {
  db.prepare('DELETE FROM feedings WHERE baby_id = ?').run(id);
  db.prepare('DELETE FROM pumps WHERE baby_id = ?').run(id);
  db.prepare('DELETE FROM diapers WHERE baby_id = ?').run(id);
  db.prepare('DELETE FROM med_doses WHERE baby_id = ?').run(id);
  db.prepare('DELETE FROM milestones WHERE baby_id = ?').run(id);
  db.prepare('DELETE FROM sleeps WHERE baby_id = ?').run(id);
  db.prepare('DELETE FROM measurements WHERE baby_id = ?').run(id);
  db.prepare('DELETE FROM temperatures WHERE baby_id = ?').run(id);
  db.prepare('DELETE FROM blood_pressures WHERE baby_id = ?').run(id);
  db.prepare('DELETE FROM blood_sugars WHERE baby_id = ?').run(id);
  return db.prepare('DELETE FROM babies WHERE id = ?').run(id);
});

router.delete('/babies/:id', (req, res) => {
  const info = deleteBaby(req.params.id);
  if (info.changes === 0) return notFound(res);
  ok(res, { deleted: true });
});

/* ---------------------------- caregivers --------------------------- */
// Parents/others who track only their own medications.

router.get('/caregivers', (req, res) => {
  ok(res, db.prepare('SELECT * FROM caregivers ORDER BY created_at ASC, id ASC').all());
});

router.post('/caregivers', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return badRequest(res, 'Name is required');
  const info = db.prepare('INSERT INTO caregivers (name) VALUES (?)').run(name);
  ok(res, db.prepare('SELECT * FROM caregivers WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/caregivers/:id', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return badRequest(res, 'Name is required');
  const info = db.prepare('UPDATE caregivers SET name = ? WHERE id = ?').run(name, req.params.id);
  if (info.changes === 0) return notFound(res);
  ok(res, db.prepare('SELECT * FROM caregivers WHERE id = ?').get(req.params.id));
});

// Deleting a caregiver removes their logged doses too.
const deleteCaregiver = db.transaction((id) => {
  db.prepare('DELETE FROM med_doses WHERE caregiver_id = ?').run(id);
  db.prepare('DELETE FROM temperatures WHERE caregiver_id = ?').run(id);
  db.prepare('DELETE FROM blood_pressures WHERE caregiver_id = ?').run(id);
  db.prepare('DELETE FROM blood_sugars WHERE caregiver_id = ?').run(id);
  return db.prepare('DELETE FROM caregivers WHERE id = ?').run(id);
});

router.delete('/caregivers/:id', (req, res) => {
  const info = deleteCaregiver(req.params.id);
  if (info.changes === 0) return notFound(res);
  ok(res, { deleted: true });
});

/* ------------------------------ feedings --------------------------- */
// Unified: type 'breast' | 'bottle' | 'both'.

router.get('/feedings', (req, res) => {
  const baby = babyScope(req);
  if (!baby) return ok(res, []);
  ok(res, db.prepare('SELECT * FROM feedings WHERE baby_id = ? ORDER BY start_time DESC').all(baby));
});

router.post('/feedings', (req, res) => {
  const b = req.body;
  const baby = babyScope(req);
  if (!baby) return badRequest(res, 'baby_id is required');
  const type = ['breast', 'bottle', 'both'].includes(b.type) ? b.type : 'breast';
  const info = db
    .prepare(
      `INSERT INTO feedings (baby_id, type, start_time, end_time, left_seconds, right_seconds, bottle_seconds, amount, unit, milk_type, comment)
       VALUES (@baby_id, @type, @start_time, @end_time, @left_seconds, @right_seconds, @bottle_seconds, @amount, @unit, @milk_type, @comment)`
    )
    .run({
      baby_id: baby,
      type,
      start_time: b.start_time,
      end_time: b.end_time ?? null,
      left_seconds: b.left_seconds ?? 0,
      right_seconds: b.right_seconds ?? 0,
      bottle_seconds: b.bottle_seconds ?? 0,
      amount: b.amount ?? null,
      unit: b.unit ?? 'ml',
      milk_type: b.milk_type ?? 'breast',
      comment: b.comment ?? null,
    });
  ok(res, db.prepare('SELECT * FROM feedings WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/feedings/:id', (req, res) => {
  const b = req.body;
  const type = ['breast', 'bottle', 'both'].includes(b.type) ? b.type : 'breast';
  const info = db
    .prepare(
      `UPDATE feedings SET type=@type, start_time=@start_time, end_time=@end_time, left_seconds=@left_seconds,
       right_seconds=@right_seconds, bottle_seconds=@bottle_seconds, amount=@amount, unit=@unit,
       milk_type=@milk_type, comment=@comment WHERE id=@id`
    )
    .run({
      id: req.params.id,
      type,
      start_time: b.start_time,
      end_time: b.end_time ?? null,
      left_seconds: b.left_seconds ?? 0,
      right_seconds: b.right_seconds ?? 0,
      bottle_seconds: b.bottle_seconds ?? 0,
      amount: b.amount ?? null,
      unit: b.unit ?? 'ml',
      milk_type: b.milk_type ?? 'breast',
      comment: b.comment ?? null,
    });
  if (info.changes === 0) return notFound(res);
  ok(res, db.prepare('SELECT * FROM feedings WHERE id = ?').get(req.params.id));
});

router.delete('/feedings/:id', (req, res) => {
  const info = db.prepare('DELETE FROM feedings WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res);
  ok(res, { deleted: true });
});

/* ------------------------------ diapers ---------------------------- */

router.get('/diapers', (req, res) => {
  const baby = babyScope(req);
  if (!baby) return ok(res, []);
  ok(res, db.prepare('SELECT * FROM diapers WHERE baby_id = ? ORDER BY time DESC').all(baby));
});

const STOOL_AMOUNTS = ['light', 'medium', 'heavy', 'blowout'];
const STOOL_TEXTURES = ['runny', 'seedy', 'pasty', 'mushy', 'pebbles'];
const oneOf = (val, allowed) => (allowed.includes(val) ? val : null);

router.post('/diapers', (req, res) => {
  const b = req.body;
  const baby = babyScope(req);
  if (!baby) return badRequest(res, 'baby_id is required');
  const dirty = asInt(b.dirty);
  // Stool detail is only kept for dirty diapers.
  const info = db
    .prepare(
      `INSERT INTO diapers (baby_id, time, wet, dirty, stool_amount, stool_color, stool_texture, comment)
       VALUES (@baby_id, @time, @wet, @dirty, @stool_amount, @stool_color, @stool_texture, @comment)`
    )
    .run({
      baby_id: baby,
      time: b.time,
      wet: asInt(b.wet),
      dirty,
      stool_amount: dirty ? oneOf(b.stool_amount, STOOL_AMOUNTS) : null,
      stool_color: dirty && b.stool_color ? String(b.stool_color) : null,
      stool_texture: dirty ? oneOf(b.stool_texture, STOOL_TEXTURES) : null,
      comment: b.comment ?? null,
    });
  ok(res, db.prepare('SELECT * FROM diapers WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/diapers/:id', (req, res) => {
  const b = req.body;
  const dirty = asInt(b.dirty);
  const info = db
    .prepare(
      `UPDATE diapers SET time=@time, wet=@wet, dirty=@dirty, stool_amount=@stool_amount,
       stool_color=@stool_color, stool_texture=@stool_texture, comment=@comment WHERE id=@id`
    )
    .run({
      id: req.params.id,
      time: b.time,
      wet: asInt(b.wet),
      dirty,
      stool_amount: dirty ? oneOf(b.stool_amount, STOOL_AMOUNTS) : null,
      stool_color: dirty && b.stool_color ? String(b.stool_color) : null,
      stool_texture: dirty ? oneOf(b.stool_texture, STOOL_TEXTURES) : null,
      comment: b.comment ?? null,
    });
  if (info.changes === 0) return notFound(res);
  ok(res, db.prepare('SELECT * FROM diapers WHERE id = ?').get(req.params.id));
});

router.delete('/diapers/:id', (req, res) => {
  const info = db.prepare('DELETE FROM diapers WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res);
  ok(res, { deleted: true });
});

/* ------------------------------- pumps ----------------------------- */

router.get('/pumps', (req, res) => {
  const baby = babyScope(req);
  if (!baby) return ok(res, []);
  ok(res, db.prepare('SELECT * FROM pumps WHERE baby_id = ? ORDER BY start_time DESC').all(baby));
});

router.post('/pumps', (req, res) => {
  const b = req.body;
  const baby = babyScope(req);
  if (!baby) return badRequest(res, 'baby_id is required');
  const info = db
    .prepare(
      `INSERT INTO pumps (baby_id, start_time, end_time, amount, unit, duration_seconds, comment)
       VALUES (@baby_id, @start_time, @end_time, @amount, @unit, @duration_seconds, @comment)`
    )
    .run({
      baby_id: baby,
      start_time: b.start_time,
      end_time: b.end_time ?? null,
      amount: b.amount ?? null,
      unit: b.unit ?? 'ml',
      duration_seconds: b.duration_seconds ?? 0,
      comment: b.comment ?? null,
    });
  ok(res, db.prepare('SELECT * FROM pumps WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/pumps/:id', (req, res) => {
  const b = req.body;
  const info = db
    .prepare(
      `UPDATE pumps SET start_time=@start_time, end_time=@end_time, amount=@amount, unit=@unit,
       duration_seconds=@duration_seconds, comment=@comment WHERE id=@id`
    )
    .run({
      id: req.params.id,
      start_time: b.start_time,
      end_time: b.end_time ?? null,
      amount: b.amount ?? null,
      unit: b.unit ?? 'ml',
      duration_seconds: b.duration_seconds ?? 0,
      comment: b.comment ?? null,
    });
  if (info.changes === 0) return notFound(res);
  ok(res, db.prepare('SELECT * FROM pumps WHERE id = ?').get(req.params.id));
});

router.delete('/pumps/:id', (req, res) => {
  const info = db.prepare('DELETE FROM pumps WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res);
  ok(res, { deleted: true });
});

/* --------------------------- medications --------------------------- */
// Catalog of medication names for the dropdown (presets + user-added custom).

const MED_UNITS = ['pills', 'mg', 'drops', 'ml'];
const medUnit = (u) => (MED_UNITS.includes(u) ? u : 'ml');
const medCategory = (c) => (c === 'caregiver' ? 'caregiver' : 'baby');

// Optional ?category=baby|caregiver filters which dropdown the catalog feeds.
// Presets are kept in their seeded (curated) order — so the most common meds
// like Tylenol and Ibuprofen lead — with user-added customs sorted after.
router.get('/medications', (req, res) => {
  const { category } = req.query;
  if (category === 'baby' || category === 'caregiver') {
    return ok(res, db.prepare('SELECT * FROM medications WHERE category = ? ORDER BY is_custom ASC, id ASC').all(category));
  }
  ok(res, db.prepare('SELECT * FROM medications ORDER BY is_custom ASC, id ASC').all());
});

router.post('/medications', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return badRequest(res, 'Medication name is required');
  const unit = medUnit(req.body?.default_unit);
  const category = medCategory(req.body?.category);
  // Reuse the existing catalog entry if this name already exists in the same
  // category (case-insensitive) so the dropdown doesn't accumulate duplicates.
  const existing = db
    .prepare('SELECT * FROM medications WHERE name = ? COLLATE NOCASE AND category = ?')
    .get(name, category);
  if (existing) return ok(res, existing);
  const info = db
    .prepare('INSERT INTO medications (name, default_unit, category, is_custom) VALUES (?, ?, ?, 1)')
    .run(name, unit, category);
  ok(res, db.prepare('SELECT * FROM medications WHERE id = ?').get(info.lastInsertRowid));
});

// Remove a custom medication from the catalog (presets are protected).
router.delete('/medications/:id', (req, res) => {
  const med = db.prepare('SELECT * FROM medications WHERE id = ?').get(req.params.id);
  if (!med) return notFound(res);
  if (!med.is_custom) return badRequest(res, 'Built-in medications cannot be removed');
  db.prepare('DELETE FROM medications WHERE id = ?').run(req.params.id);
  ok(res, { deleted: true });
});

/* ---------------------------- med doses ---------------------------- */
// Logged doses given to a baby.

router.get('/med-doses', (req, res) => {
  const caregiver = caregiverScope(req);
  if (caregiver) {
    return ok(res, db.prepare('SELECT * FROM med_doses WHERE caregiver_id = ? ORDER BY time DESC').all(caregiver));
  }
  const baby = babyScope(req);
  if (!baby) return ok(res, []);
  ok(res, db.prepare('SELECT * FROM med_doses WHERE baby_id = ? ORDER BY time DESC').all(baby));
});

router.post('/med-doses', (req, res) => {
  const b = req.body;
  const caregiver = caregiverScope(req);
  const baby = caregiver ? null : babyScope(req);
  if (!caregiver && !baby) return badRequest(res, 'baby_id or caregiver_id is required');
  const name = (b.name || '').trim();
  if (!name) return badRequest(res, 'Medication name is required');
  const info = db
    .prepare(
      `INSERT INTO med_doses (baby_id, caregiver_id, name, amount, unit, time, comment)
       VALUES (@baby_id, @caregiver_id, @name, @amount, @unit, @time, @comment)`
    )
    .run({
      baby_id: baby,
      caregiver_id: caregiver,
      name,
      amount: b.amount == null || b.amount === '' ? null : Number(b.amount),
      unit: medUnit(b.unit),
      time: b.time,
      comment: b.comment ?? null,
    });
  ok(res, db.prepare('SELECT * FROM med_doses WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/med-doses/:id', (req, res) => {
  const b = req.body;
  const name = (b.name || '').trim();
  if (!name) return badRequest(res, 'Medication name is required');
  const info = db
    .prepare(
      `UPDATE med_doses SET name=@name, amount=@amount, unit=@unit, time=@time, comment=@comment WHERE id=@id`
    )
    .run({
      id: req.params.id,
      name,
      amount: b.amount == null || b.amount === '' ? null : Number(b.amount),
      unit: medUnit(b.unit),
      time: b.time,
      comment: b.comment ?? null,
    });
  if (info.changes === 0) return notFound(res);
  ok(res, db.prepare('SELECT * FROM med_doses WHERE id = ?').get(req.params.id));
});

router.delete('/med-doses/:id', (req, res) => {
  const info = db.prepare('DELETE FROM med_doses WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res);
  ok(res, { deleted: true });
});

/* -------------------------- milestone types ------------------------ */
// Catalog of milestone titles for the dropdown (presets + user-added custom).

// Presets are kept in their seeded (developmental) order, with user-added
// customs sorted after.
router.get('/milestone-types', (req, res) => {
  ok(res, db.prepare('SELECT * FROM milestone_types ORDER BY is_custom ASC, id ASC').all());
});

router.post('/milestone-types', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return badRequest(res, 'Milestone name is required');
  // Reuse the existing catalog entry if this name already exists
  // (case-insensitive) so the dropdown doesn't accumulate duplicates.
  const existing = db.prepare('SELECT * FROM milestone_types WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) return ok(res, existing);
  const info = db.prepare('INSERT INTO milestone_types (name, is_custom) VALUES (?, 1)').run(name);
  ok(res, db.prepare('SELECT * FROM milestone_types WHERE id = ?').get(info.lastInsertRowid));
});

// Remove a custom milestone from the catalog (presets are protected).
router.delete('/milestone-types/:id', (req, res) => {
  const type = db.prepare('SELECT * FROM milestone_types WHERE id = ?').get(req.params.id);
  if (!type) return notFound(res);
  if (!type.is_custom) return badRequest(res, 'Built-in milestones cannot be removed');
  db.prepare('DELETE FROM milestone_types WHERE id = ?').run(req.params.id);
  ok(res, { deleted: true });
});

/* ---------------------------- milestones --------------------------- */
// A milestone reached by a baby: a time, a title (name), and optional comment.

router.get('/milestones', (req, res) => {
  const baby = babyScope(req);
  if (!baby) return ok(res, []);
  ok(res, db.prepare('SELECT * FROM milestones WHERE baby_id = ? ORDER BY time DESC').all(baby));
});

router.post('/milestones', (req, res) => {
  const b = req.body;
  const baby = babyScope(req);
  if (!baby) return badRequest(res, 'baby_id is required');
  const name = (b.name || '').trim();
  if (!name) return badRequest(res, 'Milestone name is required');
  const info = db
    .prepare('INSERT INTO milestones (baby_id, name, time, comment) VALUES (@baby_id, @name, @time, @comment)')
    .run({ baby_id: baby, name, time: b.time, comment: b.comment ?? null });
  ok(res, db.prepare('SELECT * FROM milestones WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/milestones/:id', (req, res) => {
  const b = req.body;
  const name = (b.name || '').trim();
  if (!name) return badRequest(res, 'Milestone name is required');
  const info = db
    .prepare('UPDATE milestones SET name=@name, time=@time, comment=@comment WHERE id=@id')
    .run({ id: req.params.id, name, time: b.time, comment: b.comment ?? null });
  if (info.changes === 0) return notFound(res);
  ok(res, db.prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id));
});

router.delete('/milestones/:id', (req, res) => {
  const info = db.prepare('DELETE FROM milestones WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res);
  ok(res, { deleted: true });
});

/* ------------------------------- sleeps ---------------------------- */
// Nap/sleep sessions. A row with end_time NULL is an in-progress nap (live
// timer); stopping it sets end_time.

router.get('/sleeps', (req, res) => {
  const baby = babyScope(req);
  if (!baby) return ok(res, []);
  ok(res, db.prepare('SELECT * FROM sleeps WHERE baby_id = ? ORDER BY start_time DESC').all(baby));
});

// The current in-progress nap for a baby, or null. Lets the UI restore a running
// timer after a reload without scanning the whole list.
router.get('/sleeps/active', (req, res) => {
  const baby = babyScope(req);
  if (!baby) return ok(res, null);
  const active = db
    .prepare('SELECT * FROM sleeps WHERE baby_id = ? AND end_time IS NULL ORDER BY start_time DESC')
    .get(baby);
  ok(res, active ?? null);
});

router.post('/sleeps', (req, res) => {
  const b = req.body;
  const baby = babyScope(req);
  if (!baby) return badRequest(res, 'baby_id is required');
  const start = b.start_time || new Date().toISOString();
  const end = b.end_time ?? null;
  // Starting a nap: if one is already running, return it instead of stacking a
  // second active nap.
  if (end === null) {
    const existing = db
      .prepare('SELECT * FROM sleeps WHERE baby_id = ? AND end_time IS NULL ORDER BY start_time DESC')
      .get(baby);
    if (existing) return ok(res, existing);
  }
  const info = db
    .prepare('INSERT INTO sleeps (baby_id, start_time, end_time, comment) VALUES (@baby_id, @start_time, @end_time, @comment)')
    .run({ baby_id: baby, start_time: start, end_time: end, comment: b.comment ?? null });
  ok(res, db.prepare('SELECT * FROM sleeps WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/sleeps/:id', (req, res) => {
  const b = req.body;
  const info = db
    .prepare('UPDATE sleeps SET start_time=@start_time, end_time=@end_time, comment=@comment WHERE id=@id')
    .run({
      id: req.params.id,
      start_time: b.start_time,
      end_time: b.end_time ?? null,
      comment: b.comment ?? null,
    });
  if (info.changes === 0) return notFound(res);
  ok(res, db.prepare('SELECT * FROM sleeps WHERE id = ?').get(req.params.id));
});

router.delete('/sleeps/:id', (req, res) => {
  const info = db.prepare('DELETE FROM sleeps WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res);
  ok(res, { deleted: true });
});

/* --------------------------- measurements -------------------------- */
// Weight and/or length(height) recorded at a point in time. Values are stored
// canonically (grams / cm); the unit is kept so the UI can display in the
// originally-entered units.

const WEIGHT_UNITS = ['lb_oz', 'kg', 'g'];
const HEIGHT_UNITS = ['in', 'cm'];
const numOrNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

const measurementFields = (b) => ({
  time: b.time,
  weight_grams: numOrNull(b.weight_grams),
  weight_unit: WEIGHT_UNITS.includes(b.weight_unit) ? b.weight_unit : 'lb_oz',
  height_cm: numOrNull(b.height_cm),
  height_unit: HEIGHT_UNITS.includes(b.height_unit) ? b.height_unit : 'in',
  comment: b.comment ?? null,
});

router.get('/measurements', (req, res) => {
  const baby = babyScope(req);
  if (!baby) return ok(res, []);
  ok(res, db.prepare('SELECT * FROM measurements WHERE baby_id = ? ORDER BY time DESC').all(baby));
});

router.post('/measurements', (req, res) => {
  const baby = babyScope(req);
  if (!baby) return badRequest(res, 'baby_id is required');
  const fields = measurementFields(req.body);
  if (fields.weight_grams == null && fields.height_cm == null) {
    return badRequest(res, 'A weight or height is required');
  }
  const info = db
    .prepare(
      `INSERT INTO measurements (baby_id, time, weight_grams, weight_unit, height_cm, height_unit, comment)
       VALUES (@baby_id, @time, @weight_grams, @weight_unit, @height_cm, @height_unit, @comment)`
    )
    .run({ baby_id: baby, ...fields });
  ok(res, db.prepare('SELECT * FROM measurements WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/measurements/:id', (req, res) => {
  const fields = measurementFields(req.body);
  if (fields.weight_grams == null && fields.height_cm == null) {
    return badRequest(res, 'A weight or height is required');
  }
  const info = db
    .prepare(
      `UPDATE measurements SET time=@time, weight_grams=@weight_grams, weight_unit=@weight_unit,
       height_cm=@height_cm, height_unit=@height_unit, comment=@comment WHERE id=@id`
    )
    .run({ id: req.params.id, ...fields });
  if (info.changes === 0) return notFound(res);
  ok(res, db.prepare('SELECT * FROM measurements WHERE id = ?').get(req.params.id));
});

router.delete('/measurements/:id', (req, res) => {
  const info = db.prepare('DELETE FROM measurements WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res);
  ok(res, { deleted: true });
});

/* --------------------------- temperatures -------------------------- */
// A temperature reading for a baby OR a caregiver (exactly one owner set), like
// med_doses. Stored in the unit it was entered in.

const TEMP_UNITS = ['F', 'C'];
const tempUnit = (u) => (TEMP_UNITS.includes(u) ? u : 'F');
const TEMP_METHODS = ['oral', 'forehead', 'axillary'];
const tempMethod = (m) => (TEMP_METHODS.includes(m) ? m : 'oral');

router.get('/temperatures', (req, res) => {
  const caregiver = caregiverScope(req);
  if (caregiver) {
    return ok(res, db.prepare('SELECT * FROM temperatures WHERE caregiver_id = ? ORDER BY time DESC').all(caregiver));
  }
  const baby = babyScope(req);
  if (!baby) return ok(res, []);
  ok(res, db.prepare('SELECT * FROM temperatures WHERE baby_id = ? ORDER BY time DESC').all(baby));
});

router.post('/temperatures', (req, res) => {
  const b = req.body;
  const caregiver = caregiverScope(req);
  const baby = caregiver ? null : babyScope(req);
  if (!caregiver && !baby) return badRequest(res, 'baby_id or caregiver_id is required');
  const temp = numOrNull(b.temp);
  if (temp == null) return badRequest(res, 'A temperature reading is required');
  const info = db
    .prepare(
      `INSERT INTO temperatures (baby_id, caregiver_id, time, temp, unit, method, comment)
       VALUES (@baby_id, @caregiver_id, @time, @temp, @unit, @method, @comment)`
    )
    .run({
      baby_id: baby,
      caregiver_id: caregiver,
      time: b.time,
      temp,
      unit: tempUnit(b.unit),
      method: tempMethod(b.method),
      comment: b.comment ?? null,
    });
  ok(res, db.prepare('SELECT * FROM temperatures WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/temperatures/:id', (req, res) => {
  const b = req.body;
  const temp = numOrNull(b.temp);
  if (temp == null) return badRequest(res, 'A temperature reading is required');
  const info = db
    .prepare('UPDATE temperatures SET time=@time, temp=@temp, unit=@unit, method=@method, comment=@comment WHERE id=@id')
    .run({
      id: req.params.id,
      time: b.time,
      temp,
      unit: tempUnit(b.unit),
      method: tempMethod(b.method),
      comment: b.comment ?? null,
    });
  if (info.changes === 0) return notFound(res);
  ok(res, db.prepare('SELECT * FROM temperatures WHERE id = ?').get(req.params.id));
});

router.delete('/temperatures/:id', (req, res) => {
  const info = db.prepare('DELETE FROM temperatures WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res);
  ok(res, { deleted: true });
});

/* ------------------------- blood pressures ------------------------- */
// A blood-pressure reading for a baby OR a caregiver (exactly one owner set),
// like temperatures. Systolic/diastolic in mmHg; pulse (bpm) is optional.

const intOrNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));

router.get('/blood-pressures', (req, res) => {
  const caregiver = caregiverScope(req);
  if (caregiver) {
    return ok(res, db.prepare('SELECT * FROM blood_pressures WHERE caregiver_id = ? ORDER BY time DESC').all(caregiver));
  }
  const baby = babyScope(req);
  if (!baby) return ok(res, []);
  ok(res, db.prepare('SELECT * FROM blood_pressures WHERE baby_id = ? ORDER BY time DESC').all(baby));
});

router.post('/blood-pressures', (req, res) => {
  const b = req.body;
  const caregiver = caregiverScope(req);
  const baby = caregiver ? null : babyScope(req);
  if (!caregiver && !baby) return badRequest(res, 'baby_id or caregiver_id is required');
  const systolic = intOrNull(b.systolic);
  const diastolic = intOrNull(b.diastolic);
  if (systolic == null || diastolic == null) return badRequest(res, 'Systolic and diastolic are required');
  const info = db
    .prepare(
      `INSERT INTO blood_pressures (baby_id, caregiver_id, time, systolic, diastolic, pulse, comment)
       VALUES (@baby_id, @caregiver_id, @time, @systolic, @diastolic, @pulse, @comment)`
    )
    .run({
      baby_id: baby,
      caregiver_id: caregiver,
      time: b.time,
      systolic,
      diastolic,
      pulse: intOrNull(b.pulse),
      comment: b.comment ?? null,
    });
  ok(res, db.prepare('SELECT * FROM blood_pressures WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/blood-pressures/:id', (req, res) => {
  const b = req.body;
  const systolic = intOrNull(b.systolic);
  const diastolic = intOrNull(b.diastolic);
  if (systolic == null || diastolic == null) return badRequest(res, 'Systolic and diastolic are required');
  const info = db
    .prepare('UPDATE blood_pressures SET time=@time, systolic=@systolic, diastolic=@diastolic, pulse=@pulse, comment=@comment WHERE id=@id')
    .run({
      id: req.params.id,
      time: b.time,
      systolic,
      diastolic,
      pulse: intOrNull(b.pulse),
      comment: b.comment ?? null,
    });
  if (info.changes === 0) return notFound(res);
  ok(res, db.prepare('SELECT * FROM blood_pressures WHERE id = ?').get(req.params.id));
});

router.delete('/blood-pressures/:id', (req, res) => {
  const info = db.prepare('DELETE FROM blood_pressures WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res);
  ok(res, { deleted: true });
});

/* -------------------------- blood sugars --------------------------- */
// A blood-sugar (glucose) reading for a baby OR a caregiver (exactly one owner
// set), like temperatures. Stored in the unit it was entered in; `context`
// records the situation (fasting, before/after a meal, bedtime, random).

const SUGAR_UNITS = ['mg/dL', 'mmol/L'];
const sugarUnit = (u) => (SUGAR_UNITS.includes(u) ? u : 'mg/dL');
const SUGAR_CONTEXTS = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'random'];
const sugarContext = (c) => (SUGAR_CONTEXTS.includes(c) ? c : 'random');

router.get('/blood-sugars', (req, res) => {
  const caregiver = caregiverScope(req);
  if (caregiver) {
    return ok(res, db.prepare('SELECT * FROM blood_sugars WHERE caregiver_id = ? ORDER BY time DESC').all(caregiver));
  }
  const baby = babyScope(req);
  if (!baby) return ok(res, []);
  ok(res, db.prepare('SELECT * FROM blood_sugars WHERE baby_id = ? ORDER BY time DESC').all(baby));
});

router.post('/blood-sugars', (req, res) => {
  const b = req.body;
  const caregiver = caregiverScope(req);
  const baby = caregiver ? null : babyScope(req);
  if (!caregiver && !baby) return badRequest(res, 'baby_id or caregiver_id is required');
  const value = numOrNull(b.value);
  if (value == null) return badRequest(res, 'A blood sugar reading is required');
  const info = db
    .prepare(
      `INSERT INTO blood_sugars (baby_id, caregiver_id, time, value, unit, context, comment)
       VALUES (@baby_id, @caregiver_id, @time, @value, @unit, @context, @comment)`
    )
    .run({
      baby_id: baby,
      caregiver_id: caregiver,
      time: b.time,
      value,
      unit: sugarUnit(b.unit),
      context: sugarContext(b.context),
      comment: b.comment ?? null,
    });
  ok(res, db.prepare('SELECT * FROM blood_sugars WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/blood-sugars/:id', (req, res) => {
  const b = req.body;
  const value = numOrNull(b.value);
  if (value == null) return badRequest(res, 'A blood sugar reading is required');
  const info = db
    .prepare('UPDATE blood_sugars SET time=@time, value=@value, unit=@unit, context=@context, comment=@comment WHERE id=@id')
    .run({
      id: req.params.id,
      time: b.time,
      value,
      unit: sugarUnit(b.unit),
      context: sugarContext(b.context),
      comment: b.comment ?? null,
    });
  if (info.changes === 0) return notFound(res);
  ok(res, db.prepare('SELECT * FROM blood_sugars WHERE id = ?').get(req.params.id));
});

router.delete('/blood-sugars/:id', (req, res) => {
  const info = db.prepare('DELETE FROM blood_sugars WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res);
  ok(res, { deleted: true });
});

/* ------------------------------ timeline --------------------------- */

router.get('/timeline', (req, res) => {
  const baby = babyScope(req);
  if (!baby) return ok(res, []);
  const feedings = db
    .prepare('SELECT * FROM feedings WHERE baby_id = ?')
    .all(baby)
    .map((r) => ({ ...r, kind: 'feed', when: r.start_time }));
  const pumps = db
    .prepare('SELECT * FROM pumps WHERE baby_id = ?')
    .all(baby)
    .map((r) => ({ ...r, kind: 'pump', when: r.start_time }));
  const diapers = db
    .prepare('SELECT * FROM diapers WHERE baby_id = ?')
    .all(baby)
    .map((r) => ({ ...r, kind: 'diaper', when: r.time }));
  const meds = db
    .prepare('SELECT * FROM med_doses WHERE baby_id = ?')
    .all(baby)
    .map((r) => ({ ...r, kind: 'med', when: r.time }));
  const milestones = db
    .prepare('SELECT * FROM milestones WHERE baby_id = ?')
    .all(baby)
    .map((r) => ({ ...r, kind: 'milestone', when: r.time }));
  const sleeps = db
    .prepare('SELECT * FROM sleeps WHERE baby_id = ?')
    .all(baby)
    .map((r) => ({ ...r, kind: 'sleep', when: r.start_time }));
  const measurements = db
    .prepare('SELECT * FROM measurements WHERE baby_id = ?')
    .all(baby)
    .map((r) => ({ ...r, kind: 'measurement', when: r.time }));
  const temperatures = db
    .prepare('SELECT * FROM temperatures WHERE baby_id = ?')
    .all(baby)
    .map((r) => ({ ...r, kind: 'temperature', when: r.time }));
  const bloodPressures = db
    .prepare('SELECT * FROM blood_pressures WHERE baby_id = ?')
    .all(baby)
    .map((r) => ({ ...r, kind: 'bp', when: r.time }));
  const bloodSugars = db
    .prepare('SELECT * FROM blood_sugars WHERE baby_id = ?')
    .all(baby)
    .map((r) => ({ ...r, kind: 'sugar', when: r.time }));

  const all = [...feedings, ...pumps, ...diapers, ...meds, ...milestones, ...sleeps, ...measurements, ...temperatures, ...bloodPressures, ...bloodSugars].sort(
    (a, b) => (a.when < b.when ? 1 : -1)
  );
  ok(res, all);
});

/* ------------------------------- stats ----------------------------- */
// Timestamps are stored as UTC ISO strings, but "a day" means a calendar day
// in the *user's* timezone (sent as ?tz=, an IANA name), not the server's —
// otherwise entries near midnight land in the wrong day whenever the two
// zones differ.

const resolveTz = (raw) => {
  if (typeof raw !== 'string' || !raw) return undefined;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: raw });
    return raw;
  } catch {
    return undefined; // unknown zone name: fall back to server time
  }
};

// YYYY-MM-DD of an instant, in the given timezone (or server-local if none).
const dayKeyIn = (tz) => (iso) => new Date(iso).toLocaleDateString('en-CA', tz ? { timeZone: tz } : undefined);

// Human label for a day key, independent of server timezone. All-time spans can
// cross new year, where a bare "Jul 16" would be ambiguous.
const dayLabel = (key, withYear = false) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: '2-digit' } : {}),
    timeZone: 'UTC',
  });

// Bounds for the all-time window. Stored timestamps are ISO strings, so a
// lexicographic range spanning them keeps the SQL identical to the bounded case.
const MIN_ISO = '0000-01-01T00:00:00.000Z';
const MAX_ISO = '9999-12-31T23:59:59.999Z';

// Resolve the requested window to a list of day keys plus a padded UTC query
// range. Three modes: a rolling range (?days=, ending today in the user's tz),
// a single calendar day (?date=YYYY-MM-DD, which takes precedence), or
// everything (?days=all). The padded range over-fetches by a day on each side
// (real UTC offsets are within ±14h); rows are then trimmed exactly by day-key
// membership.
const dayWindow = (dateParam, daysParam, tz) => {
  const singleDay = /^\d{4}-\d{2}-\d{2}$/.test(dateParam);
  // All-time: no cutoff, and `keys` is left for the caller to fill from the days
  // that actually have data. A contiguous span back to the first entry can be
  // arbitrarily long and mostly empty, and one stray far-off timestamp
  // shouldn't stretch the axis by years.
  if (!singleDay && String(daysParam) === 'all') {
    return { all: true, days: 0, keys: null, sinceIso: MIN_ISO, untilIso: MAX_ISO };
  }
  const days = singleDay ? 1 : Math.max(1, Math.min(90, Number(daysParam) || 14));
  const lastKey = singleDay ? dateParam : dayKeyIn(tz)(new Date().toISOString());
  const keys = [];
  const d = new Date(`${lastKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    keys.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const since = new Date(`${keys[0]}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 1);
  const until = new Date(`${lastKey}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + 2);
  return { all: false, days, keys, sinceIso: since.toISOString(), untilIso: until.toISOString() };
};

// Sorted distinct day keys across every row that carries a timestamp — the
// bucket list for the all-time window.
const keysFromRows = (dayKey, ...groups) =>
  [...new Set(groups.flatMap(([rows, field]) => rows.map((r) => dayKey(r[field]))))].sort();

router.get('/stats', (req, res) => {
  const baby = babyScope(req);

  const tz = resolveTz(req.query.tz);
  const dateParam = typeof req.query.date === 'string' ? req.query.date : '';
  const win = dayWindow(dateParam, req.query.days, tz);
  const dayKey = dayKeyIn(tz);
  const windowKeys = win.all ? null : new Set(win.keys);
  const inWindow = (iso) => !windowKeys || windowKeys.has(dayKey(iso));

  const empty = {
    days: win.days,
    daily: [],
    totals: { breastCount: 0, bottleCount: 0, diaperCount: 0, bottleMl: 0, breastMinutes: 0, leftMinutes: 0, rightMinutes: 0, pumpCount: 0, pumpMl: 0 },
    milkSplit: { breast: 0, formula: 0 },
  };
  if (!baby) return ok(res, empty);

  const feedings = db
    .prepare('SELECT * FROM feedings WHERE baby_id = ? AND start_time >= ? AND start_time < ?')
    .all(baby, win.sinceIso, win.untilIso)
    .filter((r) => inWindow(r.start_time));
  const pumps = db
    .prepare('SELECT * FROM pumps WHERE baby_id = ? AND start_time >= ? AND start_time < ?')
    .all(baby, win.sinceIso, win.untilIso)
    .filter((r) => inWindow(r.start_time));
  const diapers = db
    .prepare('SELECT * FROM diapers WHERE baby_id = ? AND time >= ? AND time < ?')
    .all(baby, win.sinceIso, win.untilIso)
    .filter((r) => inWindow(r.time));

  const keys = win.all
    ? keysFromRows(dayKey, [feedings, 'start_time'], [pumps, 'start_time'], [diapers, 'time'])
    : win.keys;
  const multiYear = new Set(keys.map((k) => k.slice(0, 4))).size > 1;

  // A feed has a breast portion if it's a breast/both feed, a bottle portion if bottle/both.
  const hasBreast = (f) => f.type === 'breast' || f.type === 'both';
  const hasBottle = (f) => f.type === 'bottle' || f.type === 'both';

  const buckets = {};
  for (const key of keys) {
    buckets[key] = {
      date: key,
      label: dayLabel(key, multiYear),
      breastCount: 0,
      breastMinutes: 0,
      leftMinutes: 0,
      rightMinutes: 0,
      bottleCount: 0,
      bottleMl: 0,
      pumpCount: 0,
      pumpMl: 0,
      diaperWet: 0,
      diaperDirty: 0,
      diaperCount: 0,
    };
  }

  const toMl = (amount, unit) => (unit === 'oz' ? amount * 29.5735 : amount);

  for (const r of feedings) {
    const k = dayKey(r.start_time);
    if (!buckets[k]) continue;
    if (hasBreast(r)) {
      buckets[k].breastCount += 1;
      buckets[k].breastMinutes += Math.round((r.left_seconds + r.right_seconds) / 60);
      buckets[k].leftMinutes += Math.round(r.left_seconds / 60);
      buckets[k].rightMinutes += Math.round(r.right_seconds / 60);
    }
    if (hasBottle(r) && r.amount != null) {
      buckets[k].bottleCount += 1;
      buckets[k].bottleMl += Math.round(toMl(r.amount, r.unit));
    }
  }
  for (const r of pumps) {
    const k = dayKey(r.start_time);
    if (!buckets[k]) continue;
    buckets[k].pumpCount += 1;
    buckets[k].pumpMl += Math.round(toMl(r.amount || 0, r.unit));
  }
  for (const r of diapers) {
    const k = dayKey(r.time);
    if (!buckets[k]) continue;
    buckets[k].diaperCount += 1;
    if (r.wet) buckets[k].diaperWet += 1;
    if (r.dirty) buckets[k].diaperDirty += 1;
  }

  const daily = Object.values(buckets);

  const breastFeeds = feedings.filter(hasBreast);
  const bottleFeeds = feedings.filter((f) => hasBottle(f) && f.amount != null);

  const totals = {
    breastCount: breastFeeds.length,
    bottleCount: bottleFeeds.length,
    diaperCount: diapers.length,
    pumpCount: pumps.length,
    bottleMl: Math.round(bottleFeeds.reduce((s, r) => s + toMl(r.amount, r.unit), 0)),
    pumpMl: Math.round(pumps.reduce((s, r) => s + toMl(r.amount || 0, r.unit), 0)),
    breastMinutes: Math.round(breastFeeds.reduce((s, r) => s + (r.left_seconds + r.right_seconds) / 60, 0)),
    leftMinutes: Math.round(breastFeeds.reduce((s, r) => s + r.left_seconds / 60, 0)),
    rightMinutes: Math.round(breastFeeds.reduce((s, r) => s + r.right_seconds / 60, 0)),
  };

  // Milk source: breast nursing counts as breast milk; a bottle counts by its content.
  const milkSplit = { breast: 0, formula: 0 };
  for (const f of feedings) {
    if (hasBreast(f)) milkSplit.breast += 1;
    if (hasBottle(f) && f.amount != null) milkSplit[f.milk_type === 'formula' ? 'formula' : 'breast'] += 1;
  }

  ok(res, { days: win.all ? daily.length : win.days, daily, totals, milkSplit });
});

/* ------------------------- caregiver views ------------------------- */
// Caregivers only track medications, so their history is just the dose list
// (shaped like a timeline item) and their stats are dose counts.

router.get('/caregiver-timeline', (req, res) => {
  const caregiver = caregiverScope(req);
  if (!caregiver) return ok(res, []);
  const meds = db
    .prepare('SELECT * FROM med_doses WHERE caregiver_id = ? ORDER BY time DESC')
    .all(caregiver)
    .map((r) => ({ ...r, kind: 'med', when: r.time }));
  const temperatures = db
    .prepare('SELECT * FROM temperatures WHERE caregiver_id = ?')
    .all(caregiver)
    .map((r) => ({ ...r, kind: 'temperature', when: r.time }));
  const bloodPressures = db
    .prepare('SELECT * FROM blood_pressures WHERE caregiver_id = ?')
    .all(caregiver)
    .map((r) => ({ ...r, kind: 'bp', when: r.time }));
  const bloodSugars = db
    .prepare('SELECT * FROM blood_sugars WHERE caregiver_id = ?')
    .all(caregiver)
    .map((r) => ({ ...r, kind: 'sugar', when: r.time }));
  const all = [...meds, ...temperatures, ...bloodPressures, ...bloodSugars].sort((a, b) => (a.when < b.when ? 1 : -1));
  ok(res, all);
});

router.get('/caregiver-stats', (req, res) => {
  const caregiver = caregiverScope(req);

  // Same day-window handling as /stats: days are calendar days in the user's
  // timezone (?tz=), a single ?date= takes precedence over the rolling range.
  const tz = resolveTz(req.query.tz);
  const dateParam = typeof req.query.date === 'string' ? req.query.date : '';
  const win = dayWindow(dateParam, req.query.days, tz);
  const dayKey = dayKeyIn(tz);
  const windowKeys = win.all ? null : new Set(win.keys);
  const inWindow = (iso) => !windowKeys || windowKeys.has(dayKey(iso));

  const empty = { days: win.days, daily: [], totals: { doseCount: 0, medCount: 0 }, byMed: [], medSeries: [] };
  if (!caregiver) return ok(res, empty);

  const doses = db
    .prepare('SELECT * FROM med_doses WHERE caregiver_id = ? AND time >= ? AND time < ?')
    .all(caregiver, win.sinceIso, win.untilIso)
    .filter((r) => inWindow(r.time));

  const keys = win.all ? keysFromRows(dayKey, [doses, 'time']) : win.keys;
  const multiYear = new Set(keys.map((k) => k.slice(0, 4))).size > 1;

  const byMed = {};
  for (const r of doses) {
    byMed[r.name] = (byMed[r.name] || 0) + 1;
  }
  const byMedList = Object.entries(byMed)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Stack the daily chart by medication, capping direct series to keep the
  // legend readable — anything past the cap folds into a single "Other" series.
  const MAX_SERIES = 8;
  const seriesNames = byMedList.slice(0, MAX_SERIES).map((m) => m.name);
  const hasOther = byMedList.length > MAX_SERIES;

  const buckets = {};
  for (const key of keys) {
    const bucket = { date: key, label: dayLabel(key, multiYear), doseCount: 0 };
    for (const name of seriesNames) bucket[name] = 0;
    if (hasOther) bucket.Other = 0;
    buckets[key] = bucket;
  }

  for (const r of doses) {
    const k = dayKey(r.time);
    const bucket = buckets[k];
    if (!bucket) continue;
    bucket.doseCount += 1;
    if (seriesNames.includes(r.name)) bucket[r.name] += 1;
    else if (hasOther) bucket.Other += 1;
  }

  const daily = Object.values(buckets);
  const totals = { doseCount: doses.length, medCount: byMedList.length };
  const medSeries = hasOther ? [...seriesNames, 'Other'] : seriesNames;

  ok(res, { days: win.all ? daily.length : win.days, daily, totals, byMed: byMedList, medSeries });
});

export default router;
