// ── DPS Formulas ─────────────────────────────────────────────────────────────
// All functions are pure — no DOM or state references.

export function actualShotTime(theoretical, dex) {
  const reduced   = dex > 0 ? theoretical * (1 - Math.min(dex, 100) * 0.0015) : theoretical;
  return Math.min(theoretical, Math.max(5, reduced));
}

export function calcCritMult(critRaw, rawType, critStat) {
  const wc = critRaw > 0 ? critRaw : (rawType === 'minigun' ? 0.05 : 0);
  if (wc === 0) return 1.0;
  const baseCrit = Math.min(80, (5 + Math.round((critStat - 25) / 2.5)) * wc);
  if (baseCrit <= 0) return 1.0;
  return 1 + 4 * (baseCrit / 100);
}

export function calcReloadFrames(weaponReload, stat) {
  if (!weaponReload) return 0;
  return 15 + (124 - Math.max(0, Math.min(124, stat))) * weaponReload / 100;
}

// +0.3333%/pt beyond 25, capped at +25% at 100 — melee/chainsaw only
export function calcStrengthBoost(strengthStat, isMelee) {
  if (!isMelee) return 1.0;
  return 1 + Math.min(Math.max(0, strengthStat - 25), 75) / 300;
}

export function calcBurstDPS(w, strengthStat = 25) {
  const st  = actualShotTime(w.shot_time, 0);
  const sb  = calcStrengthBoost(strengthStat, w.melee || w.chainsaw);
  return w.dmg * sb * (60 / st);
}

export function calcSustainedDPS(w, { dexStat, critStat, reloadStat, strengthStat = 25 }) {
  const st = actualShotTime(w.shot_time, dexStat);
  const cm = calcCritMult(w.critRaw, w.rawType, critStat);
  const sb = calcStrengthBoost(strengthStat, w.melee || w.chainsaw);
  if (w.magShots > 0) {
    const cycleTime = w.magShots * st + calcReloadFrames(w.reloadType, reloadStat) + w.spinDelay;
    return (w.magDmg * sb * cm / cycleTime) * 60;
  }
  return w.dmg * sb * cm * (60 / st);
}

export function enrich(w, stats) {
  return {
    ...w,
    unlimited: w.melee || w.chainsaw || w.noAmmo,
    base:      calcBurstDPS(w, stats.strengthStat),
    sustained: calcSustainedDPS(w, stats),
  };
}
