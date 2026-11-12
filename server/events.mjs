/** Operazioni sull'archivio D1. Il chiamante deve fornire un'identità verificata dal server. */
const roles = new Set(['ced', 'school', 'town']);

export class ForbiddenError extends Error {}

function checkIdentity(identity) {
  if (!identity || typeof identity.id !== 'string' || !identity.id.trim() || !roles.has(identity.role)) {
    throw new Error('Identità verificata richiesta');
  }
}

function validate(event) {
  if (!event || typeof event.title !== 'string' || event.title.trim().length < 1 || event.title.trim().length > 100 ||
      !['school', 'town'].includes(event.owner) || typeof event.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(event.date) || !validDate(event.date) ||
      !Number.isInteger(event.startMinute) || !Number.isInteger(event.endMinute) ||
      event.startMinute < 0 || event.startMinute >= 1440 || event.endMinute > 1440 ||
      event.endMinute <= event.startMinute || (event.notes !== undefined &&
      (typeof event.notes !== 'string' || event.notes.length > 2000))) {
    throw new TypeError('Evento non valido');
  }
  return {...event, title:event.title.trim(), notes:(event.notes || '').trim()};
}

function validDate(date) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0,10) === date;
}

const columns = `id, title, owner, event_date AS date, start_minute AS startMinute,
                 end_minute AS endMinute, notes, created_by AS createdBy,
                 created_at AS createdAt, updated_at AS updatedAt`;

export async function listEvents(db, identity) {
  checkIdentity(identity);
  const result = await db.prepare(`SELECT ${columns} FROM events ORDER BY event_date, start_minute, id`).all();
  return result.results;
}

export async function createEvent(db, identity, data) {
  checkIdentity(identity);
  const event = validate(data), id = crypto.randomUUID();
  if (event.owner !== identity.role) throw new ForbiddenError('Ente non autorizzato');
  await db.prepare(`INSERT INTO events
    (id,title,owner,event_date,start_minute,end_minute,notes,created_by)
    VALUES (?,?,?,?,?,?,?,?)`).bind(id,event.title,event.owner,event.date,event.startMinute,event.endMinute,event.notes,identity.id).run();
  return db.prepare(`SELECT ${columns} FROM events WHERE id=?`).bind(id).first();
}

export async function updateEvent(db, identity, id, data) {
  checkIdentity(identity);
  if (typeof id !== 'string' || !id) throw new TypeError('Identificativo non valido');
  const event = validate(data);
  if (event.owner !== identity.role) throw new ForbiddenError('Ente non autorizzato');
  const result = await db.prepare(`UPDATE events SET title=?,owner=?,event_date=?,start_minute=?,end_minute=?,notes=?,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND owner=?`).bind(event.title,event.owner,event.date,event.startMinute,event.endMinute,event.notes,id,identity.role).run();
  if (!result.meta.changes) return null;
  return db.prepare(`SELECT ${columns} FROM events WHERE id=?`).bind(id).first();
}

export async function deleteEvent(db, identity, id) {
  checkIdentity(identity);
  if (typeof id !== 'string' || !id) throw new TypeError('Identificativo non valido');
  const result = await db.prepare('DELETE FROM events WHERE id=? AND owner=?').bind(id,identity.role).run();
  return result.meta.changes > 0;
}

export async function findConflicts(db, identity, data, excludeId = '') {
  checkIdentity(identity);
  const event = validate(data);
  if (typeof excludeId !== 'string') throw new TypeError('Identificativo non valido');
  const result = await db.prepare(`SELECT ${columns} FROM events
    WHERE event_date=? AND start_minute<? AND end_minute>? AND id<>?
    ORDER BY start_minute, id`).bind(event.date,event.endMinute,event.startMinute,excludeId).all();
  return result.results;
}
