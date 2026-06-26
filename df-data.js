// ── Constants ────────────────────────────────────────────────────────────────
export const DATA_URL = 'https://fairview.deadfrontier.com/onlinezombiemmo/dfdata/get_allstats.php?printvars=1';
export const SNAPSHOT_URL = 'allstats_snapshot.txt';

export const TYPE_MAP = {
  chainsaw:'Chainsaw', crowbar:'Melee', knife:'Melee', bat:'Melee', axe:'Melee', sword:'Melee',
  autopistol:'Pistol', revolver:'Pistol',
  rifle:'Rifle', crossbow:'Rifle',
  shotgun:'Shotgun',
  submachinegun:'SMG',
  machinegun:'HMG', bigmachinegun:'HMG',
  minigun:'Minigun',
  grenadelauncher:'GL',
  flamethrower:'Flamethrower',
};
export const TYPE_ORDER = ['All','Melee','Chainsaw','Pistol','Rifle','Shotgun','SMG','HMG','Minigun','GL','Flamethrower','Other'];
export const TYPE_COLORS = {
  Melee:'#6ee7b7', Chainsaw:'#fbbf24', Pistol:'#93c5fd', Rifle:'#c4b5fd',
  Shotgun:'#f9a8d4', SMG:'#fdba74', HMG:'#fca5a5', Minigun:'#f87171',
  GL:'#e9d5ff', Flamethrower:'#fed7aa', Other:'#9ca3af',
};

// ── Parsing helpers ───────────────────────────────────────────────────────────
function safeDecode(s) {
  s = s.replace(/\+/g, ' ');
  s = s.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
  try { return decodeURIComponent(s); } catch(e) { return s; }
}
function stripHtmlEntities(s) {
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
}

// ── Item & Weapon Factory ─────────────────────────────────────────────────────
class ItemFactory {
  static FIELDS = {
    code:     { parse: v => v,                           def: '' },
    name:     { parse: v => v.replace(/`/g,"'").trim(),  def: '' },
    itemtype: { parse: v => v,                           def: '' },
  };

  static canBuild(raw) { return true; }

  static build(raw) {
    const item = {};
    for (const [key, { parse, def }] of Object.entries(this.FIELDS)) {
      const v = raw[key];
      item[key] = (v !== undefined && v !== '') ? parse(v) : def;
    }
    return item;
  }
}

class AmmoFactory extends ItemFactory {
  static canBuild(raw) { return raw._prefix === 'ammo'; }
}

export class WeaponFactory extends ItemFactory {
  static FIELDS = {
    ...ItemFactory.FIELDS,
    type:            { parse: v => v,                              def: ''    },
    shot_time:       { parse: parseFloat,                          def: 60    },
    calliber_type:   { parse: parseFloat,                          def: 0     },
    shots_fired:     { parse: v => Math.max(1, parseInt(v, 10)),   def: 1     },
    bullet_capacity: { parse: v => parseInt(v, 10),                def: 0     },
    reload_time:     { parse: parseFloat,                          def: 0     },
    spin_delay:      { parse: parseFloat,                          def: 0     },
    critical:        { parse: parseFloat,                          def: 0     },
    melee:           { parse: v => v === '1',                      def: false },
    chainsaw:        { parse: v => v === '1',                      def: false },
    no_ammo:         { parse: v => v === '1',                      def: false },
    cb_exclude:      { parse: v => v === '1',                      def: false },
    pro_type:        { parse: v => v,                              def: ''    },
    ammo_type:       { parse: v => v,                              def: ''    },
  };

  static canBuild(raw) { return raw._prefix === 'weapon'; }

  static build(raw) {
    const item = super.build(raw);
    const shots    = item.shots_fired;
    const dmg      = (item.calliber_type + 1) * shots;
    const magShots = item.bullet_capacity > 0 ? Math.floor(item.bullet_capacity / shots) : 0;
    let type = TYPE_MAP[item.type];
    if (!type) type = item.pro_type === 'pistol' ? 'Pistol' : item.pro_type === 'rifle' ? 'Rifle' : 'Other';
    return {
      ...item,
      rawType:    item.type,
      type,
      dmg,
      magShots,
      magDmg:     magShots * dmg,
      critRaw:    item.critical,
      reloadType: item.reload_time,
      spinDelay:  item.spin_delay,
      noAmmo:     item.no_ammo,
      cbExclude:  item.cb_exclude,
      ammoType:   item.ammo_type,
    };
  }
}

export function parseAllStats(raw) {
  raw = stripHtmlEntities(raw);
  if (raw.trimStart().startsWith('&')) raw = raw.trimStart().slice(1);

  const groups = {};
  const KEY_RE = /^([a-z]+)(\d+)_(.+)$/;
  for (const pair of raw.split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim();
    const val = safeDecode(pair.slice(eq + 1));
    const m = KEY_RE.exec(key);
    if (!m) continue;
    const gk = m[1] + ':' + m[2];
    if (!groups[gk]) groups[gk] = { _prefix: m[1] };
    groups[gk][m[3]] = val;
  }

  const weapons = [];
  const ammoMap = {};  // code → display name
  for (const raw of Object.values(groups)) {
    if (AmmoFactory.canBuild(raw)) {
      const a = AmmoFactory.build(raw);
      if (a.code && a.name) ammoMap[a.code] = a.name;
    } else if (WeaponFactory.canBuild(raw)) {
      const w = WeaponFactory.build(raw);
      if (w.name && w.dmg !== 0) weapons.push(w);
    }
  }
  return { weapons, ammoMap };
}
