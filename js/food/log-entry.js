export function makeEntryId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `entry:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

export function withEntryId(entry, idFactory = makeEntryId) {
  return entry?.entryId ? entry : { ...entry, entryId: idFactory() };
}

export function ensureEntryIds(log, idFactory = makeEntryId) {
  let changed = false;
  for (const meal of log?.meals || []) {
    for (let i = 0; i < (meal.entries || []).length; i += 1) {
      if (!meal.entries[i]?.entryId) {
        meal.entries[i] = withEntryId(meal.entries[i], idFactory);
        changed = true;
      }
    }
  }
  return changed;
}

export function findEntryLocation(log, target) {
  if (target?.entryId) {
    for (let meal = 0; meal < (log?.meals || []).length; meal += 1) {
      const index = (log.meals[meal].entries || []).findIndex((entry) => entry.entryId === target.entryId);
      if (index >= 0) return { meal, index };
    }
  }
  if (Number.isInteger(target?.meal) && Number.isInteger(target?.index) && log?.meals?.[target.meal]?.entries?.[target.index]) {
    return { meal: target.meal, index: target.index };
  }
  return null;
}

export function updateLogEntry(log, target, entry, nextMeal = target?.meal) {
  const loc = findEntryLocation(log, target);
  if (!loc) return false;
  const entryId = target.entryId || log.meals[loc.meal].entries[loc.index]?.entryId;
  const updated = withEntryId({ ...entry, entryId }, () => entryId || makeEntryId());
  if (nextMeal === loc.meal) {
    log.meals[loc.meal].entries[loc.index] = updated;
  } else {
    log.meals[loc.meal].entries.splice(loc.index, 1);
    log.meals[nextMeal].entries.push(updated);
  }
  return true;
}
