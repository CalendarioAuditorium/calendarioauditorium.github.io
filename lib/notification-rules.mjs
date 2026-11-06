/**
 * Prepara le notifiche per un nuovo evento. Non invia email e non legge dati.
 * Gli orari sono minuti locali [startMinute, endMinute), con 1440 = mezzanotte.
 */
export function planNotifications({event, actor, existingEvents}) {
  if (!['school', 'town', 'ced'].includes(actor)) throw new TypeError('Profilo non valido');
  if (!event || !['school', 'town'].includes(event.owner) || !/^\d{4}-\d{2}-\d{2}$/.test(event.date) ||
      !Number.isInteger(event.startMinute) || !Number.isInteger(event.endMinute) ||
      event.startMinute < 0 || event.endMinute > 1440 || event.endMinute <= event.startMinute || !Array.isArray(existingEvents)) {
    throw new TypeError('Evento non valido');
  }
  const conflicts = existingEvents.filter(other => other.id !== event.id && other.date === event.date &&
    event.startMinute < other.endMinute && event.endMinute > other.startMinute);
  const crossesOtherSlot = actor === 'school' ? event.endMinute > 840 : actor === 'town' ? event.startMinute < 840 : false;
  // Una sola notifica per ente, con tutte le ragioni pertinenti.
  if (conflicts.length) {
    return {recipients:['school', 'town'], reasons:crossesOtherSlot ? ['overlap', 'other_slot'] : ['overlap'], conflictIds:conflicts.map(item => item.id)};
  }
  if (crossesOtherSlot) return {recipients:['school', 'town'], reasons:['other_slot'], conflictIds:[]};
  return {recipients:actor === 'ced' ? ['school', 'town'] : [actor === 'school' ? 'town' : 'school'], reasons:['new_event'], conflictIds:[]};
}
