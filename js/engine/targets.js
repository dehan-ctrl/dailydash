// Target-record selection. Pure. Targets are date-versioned coach prescriptions;
// settings may override them with a fixed custom target set.
export function latestTargets(all) {
  return [...all].sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))[0];
}

export function targetsFor(all, d) {
  const sorted = [...all].sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
  return sorted.find((t) => t.effectiveDate <= d) ?? sorted.at(-1);
}

// The targets the app coaches against: the coach prescription unless the user
// selected manual targets in Settings (Macro targets → Custom).
export function activeTargets(settings, coachTargets) {
  if (settings?.targetMode === 'custom' && settings.customTargets?.kcal) {
    return { ...settings.customTargets, source: 'custom' };
  }
  return { ...coachTargets, source: 'coach' };
}
