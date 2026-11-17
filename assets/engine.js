// Calculation engine. Mirrors the spreadsheet's Floors and Main tabs.
(function (root) {
  'use strict';

  var DATA = root.GAME_DATA;
  var FDATA = root.FISHING_DATA || { upgradeCosts: {} };
  var params = DATA.params;

  var oresById = new Map(DATA.ores.map(function (o) { return [o.id, o]; }));
  var floorsById = new Map(DATA.floors.map(function (f) { return [f.id, f]; }));

  // Which world an ore belongs to, and the first floor it turns up on.
  var oreWorld = new Map();
  var oreFirstFloor = new Map();
  DATA.floors.forEach(function (f) {
    [f.oreA.id, f.oreB.id].forEach(function (id) {
      if (!oreFirstFloor.has(id) || f.id < oreFirstFloor.get(id)) {
        oreFirstFloor.set(id, f.id);
        oreWorld.set(id, f.world);
      }
    });
  });

  var debuffsByFloor = new Map();
  DATA.floorDebuffs.forEach(function (d) {
    if (!debuffsByFloor.has(d.floorId)) debuffsByFloor.set(d.floorId, []);
    debuffsByFloor.get(d.floorId).push(d);
  });

  // Stat metadata comes from the Stat table, with the Input table filling in
  // anything that only exists as a modifier target.
  var meta = new Map();
  DATA.stats.forEach(function (s) {
    meta.set(s.name, { name: s.name, group: s.group, type: s.type });
  });
  DATA.input.forEach(function (row) {
    if (meta.has(row.stat)) return;
    meta.set(row.stat, {
      name: row.stat,
      group: row.section,
      type: row.type === 'multi-%' ? 'multi' : row.type,
    });
  });

  // Vein stats are not in the Stat table but the export carries them.
  var VEIN_STATS = {
    vein_spawn_rate_multi: 'multi',
    vein_income_multi: 'multi',
    golden_vein_chance: 'chance',
    golden_vein_multi: 'multi',
    rainbow_vein_chance: 'chance',
    rainbow_vein_multi: 'multi',
    gleaming_vein_chance: 'chance',
    gleaming_vein_multi: 'multi',
  };

  var replaceDefaults = new Map(DATA.replaceDefaults.map(function (d) { return [d.name, d.value]; }));
  var SUFFIX = new Map();
  DATA.notation.forEach(function (n) {
    if (n.short) SUFFIX.set(String(n.short).toLowerCase(), n.value);
  });
  Object.keys(VEIN_STATS).forEach(function (name) {
    if (meta.has(name)) return;
    meta.set(name, { name: name, group: 'Veins', type: VEIN_STATS[name] });
  });

  var FISH_STATS = {
    fishing_rod_power: 'number',
    fishing_drone_capacity: 'number',
    fishing_drone_power: 'number',
    fishing_drone_multiplier: 'multi',
    fishing_tier2_dock_multi: 'multi',
    fishing_income_multi: 'multi',
    fishing_shiny_chance: 'chance',
    fishing_shiny_multi: 'multi',
    fishing_super_shiny_chance: 'chance',
    fishing_super_shiny_multi: 'multi',
    fishing_tick_speed: 'number',
    fishing_tick_reduction_seconds: 'number',
    fishing_double_tick_chance: 'chance',
    fishing_triple_tick_chance: 'chance',
    fishing_5x_tick_chance: 'chance',
    fishing_income_multi: 'multi',
    lootbug_spawn_rate: 'number',
    lootbug_triple_chance: 'chance',
    lootbug_loot_multi: 'multi',
  };

  Object.keys(FISH_STATS).forEach(function (name) {
    if (meta.has(name)) return;
    meta.set(name, { name: name, group: 'Fishing', type: FISH_STATS[name] });
  });

  var OBELISK_STATS = {
    pickaxe_damage: 'number',
    pickaxe_attack_speed_per_second: 'number',
    pickaxe_crit_chance: 'chance',
    pickaxe_crit_damage: 'multi',
    pickaxe_super_crit_chance: 'chance',
    pickaxe_super_crit_damage: 'multi',
    pickaxe_ultra_crit_chance: 'chance',
    pickaxe_ultra_crit_damage: 'multi',
    pickaxe_omega_crit_chance: 'chance',
    pickaxe_omega_crit_damage: 'multi',
    obelisk_armor_reduction: 'number',
    obelisk_timer_add: 'number',
  };

  Object.keys(OBELISK_STATS).forEach(function (name) {
    if (meta.has(name)) return;
    meta.set(name, { name: name, group: 'Obelisk', type: OBELISK_STATS[name] });
  });

  var NOTATION = DATA.notation.slice().sort(function (a, b) { return b.value - a.value; });

  function num(v, fallback) {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
  }

  // Expected multiplier of a binary choice, with the next event nested inside
  // it so a floor roll only happens on the floors you actually reach.
  function embin(chance, multi, nest) {
    var inner = num(nest, 1);
    var c = num(chance, 0);
    c = c < 0 ? 0 : c > 1 ? 1 : c;
    return c * num(multi, 1) * inner + (1 - c);
  }

  function oreCardOf(ore, state) {
    return ore.hasOreCard ? num(state.cards.ore, 1) : 1;
  }

  function barCardOf(ore, state) {
    return ore.hasBarCard ? num(state.cards.bar, 1) : 1;
  }

  // Reads plain numbers, exponents and the game's own suffixes: 75.0no, 1.5k,
  // 2.4sp. Commas and spaces are ignored.
  function parseNumber(text) {
    if (typeof text === 'number') return text;
    var raw = String(text === undefined || text === null ? '' : text)
      .trim()
      .toLowerCase()
      .replace(/[,\s]/g, '');
    if (!raw) return NaN;
    var plain = Number(raw);
    if (isFinite(plain)) return plain;

    var match = raw.match(/^(-?)(\d*\.?\d+)([a-z]+)$/);
    if (!match) return NaN;
    var value = Number(match[1] + match[2]);
    var suffix = match[3];
    if (SUFFIX.has(suffix)) return value * SUFFIX.get(suffix);
    var eng = suffix.match(/^e(\d+)$/);
    if (eng) return value * Math.pow(10, Number(eng[1]));
    return NaN;
  }

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function isOreUnlocked(oreId, state) {
    if (!state.worldsUnlocked) return true;
    var world = oreWorld.get(oreId);
    if (!world) return true;
    return world <= state.worldsUnlocked;
  }

  // Stats that some calculator actually reads. Anything outside this set can be
  // missing from an export without changing a single number.
  var MATHS_STATS = new Set([
    'ores_per_screen', 'multi_rock_chance', 'ore_income_multi', 'game_speed_multi',
    'golden_ore_chance', 'golden_ore_multi', 'golden_floor_chance', 'golden_floor_multi',
    'rainbow_floor_chance', 'rainbow_floor_multi', 'galactic_floor_chance', 'galactic_floor_multi',
    'prismatic_floor_chance', 'prismatic_floor_multi',
    'void_portal_chance', 'void_portal_base_multi', 'void_portal_multi',
    'golden_void_portal_chance', 'golden_void_portal_multi',
    'rainbow_void_portal_chance', 'rainbow_void_portal_multi',
    'galactic_void_portal_chance', 'galactic_void_portal_multi',
    'bomb_of_plenty_chance', 'bomb_of_plenty_multi', 'bomb_transmuter_chance', 'bomb_transmuter_multi',
    'bar_output_multi', 'free_craft_chance', 'double_craft_chance', 'triple_craft_chance',
    'craft_5x_chance', 'craft_10x_chance', 'craft_20x_chance', 'craft_100x_chance',
    'vein_spawn_rate_multi', 'vein_income_multi', 'golden_vein_chance', 'golden_vein_multi',
    'rainbow_vein_chance', 'rainbow_vein_multi', 'gleaming_vein_chance', 'gleaming_vein_multi',
    'fishing_rod_power', 'fishing_drone_capacity', 'fishing_drone_power',
    'fishing_drone_multiplier', 'fishing_tier2_dock_multi', 'fishing_income_multi',
    'fishing_shiny_chance', 'fishing_shiny_multi',
    'fishing_super_shiny_chance', 'fishing_super_shiny_multi',
    'fishing_tick_speed', 'fishing_tick_reduction_seconds',
    'bomb_trans_apply_bop_chance', 'bomb_of_plenty_make_gold_chance',
  ]);

  // Set by a control rather than typed in.
  var DRIVEN_STATS = new Set(['bomb_of_plenty_chance', 'bomb_transmuter_chance']);

  function statType(name) {
    var m = meta.get(name);
    return m ? m.type : 'number';
  }

  function emptyState() {
    var imported = {};
    DATA.stats.forEach(function (s) { imported[s.name] = num(s.imported, 0); });
    return {
      imported: imported,
      fromExport: {},
      bases: {},
      cards: { ore: num(params.cards.ore, 1), bar: num(params.cards.bar, 1) },
      bomb: 'none',
      exportFloor: num(params.exportFloor, 1),
      worldsUnlocked: null,
      vein2x: 0,
      voidDrone: false,
      fishingDock: 'Lake',
      fishingPlaytime: 24,
      fishingUpgrades: [],
      fishingEnhance: [],
      fishingSkills: [],
      fishingTributes: [],
      gemsPerHour: 0,
      gemsManualRate: false,
      obeliskLevel: null,
      armourFactor: 1,
      veinMorph: 0.143,
      veinGolden: 0.143,
      w3SpeedFix: true,
      w4SpeedMod: 0.8,
      showLockedOres: false,
      // The gems receipt reads more of the export than the ore maths does, so
      // the raw stats are kept whole rather than only the tracked ones.
      raw: {},
      gems: {
        autofire: 'gem',
        cherryTarget: 'gem',
        lootbugBuys: [],
        founder: false,
        founderTier: 1,
        chargeMagnets: false,
        bombsUnlocked: 12,
        stonksGems: 200,
        spawnMinutes: 20,
        gameSpeedBuffMulti: 2,
        fuelPerHour: 0,
      },
      // The export already contains everything you had equipped, so every
      // adjustment starts switched off and the totals match the game.
      toggles: DATA.input.map(function (r) { return { export: r.withExport, use: r.withExport }; }),
      version: null,
      time: null,
    };
  }

  function parseExport(text) {
    var trimmed = String(text || '').trim();
    if (!trimmed) throw new Error('Nothing pasted.');
    var start = trimmed.indexOf('{');
    var end = trimmed.lastIndexOf('}');
    if (start < 0 || end < 0) throw new Error('No JSON object in that text.');
    var parsed;
    try {
      parsed = JSON.parse(trimmed.slice(start, end + 1));
    } catch (err) {
      throw new Error('That is not readable JSON: ' + err.message);
    }
    var stats = parsed.stats || parsed;
    return { version: parsed.version || null, time: parsed.time || null, stats: stats };
  }

  // Applies an export to a state. Returns what was recognised so the UI can
  // show which keys the sheet does not know about.
  function applyExport(state, parsed) {
    var known = [];
    var unknown = [];
    Object.keys(parsed.stats).forEach(function (key) {
      var value = parsed.stats[key];
      var m = meta.get(key);
      if (!m) {
        unknown.push(key);
        return;
      }
      var scaled = m.type === 'chance' ? num(value, 0) / 100 : num(value, 0);
      state.imported[key] = scaled;
      state.fromExport[key] = true;
      known.push(key);
    });

    // Drone rows know whether the game had them equipped and fuelled.
    DATA.input.forEach(function (row, idx) {
      if (row.section !== 'Drone') return;
      var key = 'is_drone_' + row.source.toLowerCase().replace(/[^a-z0-9]/g, '') + '_equipped_and_fueled';
      if (!(key in parsed.stats)) return;
      var active = num(parsed.stats[key], 0) ? 1 : 0;
      state.toggles[idx].export = active;
      state.toggles[idx].use = active;
    });

    if (isFinite(num(parsed.stats.current_floor, NaN))) {
      state.exportFloor = num(parsed.stats.current_floor, state.exportFloor);
    }
    if (isFinite(num(parsed.stats.obelisk_armor_reduction, NaN))) {
      state.armourFactor = num(parsed.stats.obelisk_armor_reduction, 1);
    }
    if (isFinite(num(parsed.stats.obelisk_level, NaN))) {
      state.obeliskLevel = num(parsed.stats.obelisk_level, 0);
    }
    if ('is_drone_void_equipped' in parsed.stats) {
      state.voidDrone = !!num(parsed.stats.is_drone_void_equipped, 0);
    }
    if (isFinite(num(parsed.stats.vein_2x_spawn_array, NaN))) {
      state.vein2x = num(parsed.stats.vein_2x_spawn_array, 0);
    }
    if (isFinite(num(parsed.stats.worlds_unlocked, NaN))) {
      state.worldsUnlocked = num(parsed.stats.worlds_unlocked, 0);
    }
    if (Array.isArray(parsed.stats.fishing_upgrades_array)) {
      state.fishingUpgrades = parsed.stats.fishing_upgrades_array.slice();
    }
    if (Array.isArray(parsed.stats.fishing_enhance_array)) {
      state.fishingEnhance = parsed.stats.fishing_enhance_array.slice();
    }
    if (Array.isArray(parsed.stats.skill_tree_nodes_array)) {
      state.fishingSkills = parsed.stats.skill_tree_nodes_array.slice();
    }
    if (Array.isArray(parsed.stats.fishing_legendary_tribute_levels_array)) {
      state.fishingTributes = parsed.stats.fishing_legendary_tribute_levels_array.slice();
    }

    state.version = parsed.version;
    state.time = parsed.time;
    state.raw = Object.assign({}, parsed.stats);
    return { known: known, unknown: unknown };
  }

  function baseValueOf(row, state, idx) {
    if (Object.prototype.hasOwnProperty.call(state.bases, idx)) return num(state.bases[idx], 0);
    if (row.base.kind === 'literal') return num(row.base.value, 0);
    if (row.base.kind === 'stat') return num(state.imported[row.base.key], 0);
    if (row.base.kind === 'floorDebuff') {
      var list = debuffsByFloor.get(state.exportFloor) || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].name === row.stat) return list[i].mod;
      }
    }
    return 0;
  }

  // A row's effect is the difference between leaving a thing out and putting
  // it in, expressed the way the stat itself scales.
  function modOf(row, state, idx) {
    var toggle = state.toggles[idx] || { export: 0, use: 0 };
    var base = baseValueOf(row, state, idx);
    var diff = toggle.use - toggle.export;

    if (row.type === 'chance') return base * diff;
    if (row.type === 'multi') {
      if (diff === 0) return 1;
      if (!base) return base;
      return Math.pow(base, diff);
    }
    if (row.type === 'multi-%') {
      return (1 + base * toggle.use) / (1 + base * toggle.export);
    }
    return base * diff;
  }

  function resolve(state) {
    var acc = new Map();
    meta.forEach(function (m, name) {
      acc.set(name, { adds: [], multiplies: [], independents: [] });
    });

    DATA.input.forEach(function (row, idx) {
      if (row.method === 'replace') return;
      var bucket = acc.get(row.stat);
      if (!bucket) return;
      var mod = modOf(row, state, idx);
      var entry = { label: row.source, mod: mod };
      if (row.method === 'add') bucket.adds.push(entry);
      else if (row.method === 'multiply') bucket.multiplies.push(entry);
      else if (row.method === 'independent') bucket.independents.push(entry);
    });

    var totals = {};
    var breakdown = {};

    acc.forEach(function (bucket, name) {
      var base = num(state.imported[name], 0);
      var added = bucket.adds.reduce(function (sum, e) { return sum + e.mod; }, base);
      var multiplied = bucket.multiplies.reduce(function (prod, e) { return prod * e.mod; }, added);
      var independent = 1 - bucket.independents.reduce(function (prod, e) {
        return prod * (1 - e.mod);
      }, 1 - multiplied);
      var replace = replaceDefaults.get(name);
      totals[name] = replace ? replace : independent;
      breakdown[name] = {
        base: base, added: added, multiplied: multiplied,
        independent: independent, replace: replace,
        adds: bucket.adds, multiplies: bucket.multiplies, independents: bucket.independents,
      };
    });

    return { totals: totals, breakdown: breakdown };
  }

  // Floor debuffs are additive on chances and multiplicative on everything else.
  // The exported stats are the global totals, so only the target floor's
  // debuffs are applied here.
  function applyDebuffs(values, floorId, direction) {
    var list = debuffsByFloor.get(floorId) || [];
    list.forEach(function (d) {
      var type = statType(d.name);
      var current = num(values[d.name], type === 'chance' ? 0 : 1);
      if (type === 'chance') {
        values[d.name] = current + direction * d.mod;
      } else if (d.mod) {
        values[d.name] = direction > 0 ? current * d.mod : current / d.mod;
      }
    });
    return values;
  }

  function floorValues(floorId, totals) {
    var values = {};
    Object.keys(totals).forEach(function (k) { values[k] = totals[k]; });
    applyDebuffs(values, floorId, 1);
    return values;
  }

  function oreEm(v) {
    var floorChain = embin(v.golden_floor_chance, v.golden_floor_multi,
      embin(v.rainbow_floor_chance, v.rainbow_floor_multi,
        embin(v.galactic_floor_chance, v.galactic_floor_multi,
          embin(v.prismatic_floor_chance, v.prismatic_floor_multi, 1))));

    return num(v.ores_per_screen, 0)
      * embin(v.multi_rock_chance, 3)
      * num(v.ore_income_multi, 1)
      * embin(v.golden_ore_chance, v.golden_ore_multi)
      * floorChain
      * embin(v.bomb_of_plenty_chance, v.bomb_of_plenty_multi)
      * num(params.floorsPerHour, 0)
      * num(v.game_speed_multi, 1);
  }

  function craftEm(v) {
    var free = Math.min(num(v.free_craft_chance, 0), 0.999999);
    return 1 / (1 - free)
      * embin(v.double_craft_chance, 2)
      * embin(v.triple_craft_chance, 3)
      * embin(v.craft_5x_chance, 5)
      * embin(v.craft_10x_chance, 10)
      * embin(v.craft_20x_chance, 20)
      * embin(v.craft_100x_chance, 100)
      * num(v.bar_output_multi, 1);
  }

  function transEm(v) {
    return num(v.bomb_transmuter_chance, 0)
      * num(v.bomb_transmuter_multi, 1)
      * num(v.bar_output_multi, 1);
  }

  // Void portals feed ore back into the floor at the cost of the base shares.
  function voidShares(f, v) {
    var chain = embin(v.golden_void_portal_chance, v.golden_void_portal_multi,
      embin(v.rainbow_void_portal_chance, v.rainbow_void_portal_multi,
        embin(v.galactic_void_portal_chance, v.galactic_void_portal_multi, 1)));
    var chance = num(v.void_portal_chance, 0);
    var shared = chance * num(v.void_portal_base_multi, 1) * num(v.void_portal_multi, 1) * chain;

    var shareA = num(f.oreA.share, 0);
    var shareB = num(f.oreB.share, 0);
    var idA = f.oreA.id || 1;
    var idB = f.oreB.id || 1;

    return {
      a: shareA * (1 - chance) + (shareA / idA + shareB / idB) * shared,
      b: shareB * (1 - chance) + (shareB / idB) * shared,
    };
  }

  function buildRows(state) {
    var resolved = resolve(state);
    var totals = resolved.totals;
    var craft = craftEm(totals);
    var rows = [];

    DATA.floors.forEach(function (f) {
      var v = floorValues(f.id, totals);
      var em = oreEm(v);
      var transmute = transEm(v);
      var voids = voidShares(f, v);

      ['a', 'b'].forEach(function (slot) {
        var ref = slot === 'a' ? f.oreA : f.oreB;
        var ore = oresById.get(ref.id);
        if (!ore) return;
        var shares = { plain: num(ref.share, 0), portal: slot === 'a' ? voids.a : voids.b };

        [false, true].forEach(function (useVoid) {
          var share = useVoid ? shares.portal : shares.plain;
          if (!share) return;
          var oreHr = share * em * oreCardOf(ore, state);
          if (!isFinite(oreHr) || oreHr <= 0) return;
          var barCard = barCardOf(ore, state);
          var craftHr = oreHr / (num(ore.craftCost, 1) || 1) * craft * barCard;
          var transHr = oreHr * transmute * barCard;
          var barHr = craftHr + transHr;
          rows.push({
            floorId: f.id,
            world: f.world,
            zone: f.zone,
            oreId: ore.id,
            oreName: ore.name,
            useVoid: useVoid,
            oreHr: oreHr,
            craftHr: craftHr,
            transHr: transHr,
            barHr: barHr,
            goldHr: barHr * num(ore.barValue, 0) * barCard,
          });
        });
      });
    });

    return { rows: rows, totals: totals, breakdown: resolved.breakdown, craftEm: craft };
  }

  var METRIC = { ore: 'oreHr', bar: 'barHr', gold: 'goldHr' };

  function rankFloors(rows, oreId, metric, useVoid) {
    var key = METRIC[metric] || 'barHr';
    return rows
      .filter(function (r) { return r.oreId === oreId && r.useVoid === !!useVoid; })
      .sort(function (a, b) { return b[key] - a[key]; });
  }

  function rankAll(rows, metric, useVoid) {
    var key = METRIC[metric] || 'barHr';
    return rows
      .filter(function (r) { return r.useVoid === !!useVoid; })
      .sort(function (a, b) { return b[key] - a[key]; });
  }

  function farmTime(rows, oreId, amount, unit, useVoid) {
    var ranked = rankFloors(rows, oreId, unit === 'bar' ? 'bar' : 'ore', useVoid);
    var best = ranked[0];
    if (!best) return null;
    var rate = unit === 'bar' ? best.barHr : best.oreHr;
    if (!rate) return null;
    return { rate: rate, hours: amount / rate, row: best };
  }

  function setBomb(state, name) {
    var next = JSON.parse(JSON.stringify(state));
    DATA.input.forEach(function (row, idx) {
      if (row.section !== 'Bomb') return;
      next.toggles[idx].use = row.source === name ? 1 : 0;
    });
    return next;
  }

  function bombOptions() {
    var seen = [];
    DATA.input.forEach(function (row) {
      if (row.section === 'Bomb' && seen.indexOf(row.source) < 0) seen.push(row.source);
    });
    return seen;
  }

  // Bomb of Plenty multiplies the ore you dig, Transmuter drops bars directly
  // and can also apply a BoP stack. Which wins comes down to how many ore a bar
  // costs, so the answer is a cost threshold rather than a floor by itself.
  function bombModel(state) {
    var probe = JSON.parse(JSON.stringify(state));
    DATA.input.forEach(function (row, index) {
      if (row.section === 'Bomb') probe.toggles[index].use = 0;
    });

    var totals = resolve(probe).totals;
    var toMult = function (chance, mult) {
      return 1 + clamp01(num(chance, 0)) * (mult - 1);
    };

    var free = 1 / (1 - Math.min(clamp01(num(totals.free_craft_chance, 0)), 0.99));
    var craftMult = free
      * toMult(totals.double_craft_chance, 2)
      * toMult(totals.triple_craft_chance, 3)
      * toMult(totals.craft_5x_chance, 5)
      * toMult(totals.craft_10x_chance, 10)
      * toMult(totals.craft_20x_chance, 20)
      * toMult(totals.craft_100x_chance, 100);

    var plentyMulti = Math.max(1, num(totals.bomb_of_plenty_multi, 1));
    var transmuteMulti = Math.max(1, num(totals.bomb_transmuter_multi, 1));
    var transmutePlentyChance = clamp01(num(totals.bomb_trans_apply_bop_chance, 0));
    var plentyGoldChance = clamp01(num(totals.bomb_of_plenty_make_gold_chance, 0));
    var goldChance = clamp01(num(totals.golden_ore_chance, 0));
    var goldMulti = Math.max(1, num(totals.golden_ore_multi, 1));

    // A BoP stack can also roll the golden ore, but only if the rock was not
    // already going to be golden, so the two chances are combined rather than added.
    var combinedGold = goldChance + (1 - goldChance) * plentyGoldChance;
    var plentyOre = plentyMulti * (combinedGold * goldMulti + (1 - combinedGold));
    var plainOre = goldChance * goldMulti + (1 - goldChance);
    var withChance = function (chance) {
      return chance * plentyOre + (1 - chance) * plainOre;
    };

    var plentyBars = craftMult * withChance(1);
    var transmuteOre = withChance(transmutePlentyChance);
    var transmuteCraftBars = craftMult * transmuteOre;
    var transmuteDirectBars = transmuteMulti * transmuteOre;
    var breakEven = transmuteDirectBars > 0
      ? (plentyBars - transmuteCraftBars) / transmuteDirectBars
      : Infinity;

    var costMulti = clamp01(num(totals.bar_craft_cost_multi, 1));
    var firstFloor = {};
    DATA.floors.forEach(function (f) {
      [f.oreA.id, f.oreB.id].forEach(function (id) {
        if (!firstFloor[id] || f.id < firstFloor[id]) firstFloor[id] = f.id;
      });
    });

    var ores = DATA.ores.map(function (ore) {
      var cost = costMulti
        ? Math.round(num(ore.baseCost, 0) * costMulti)
        : num(ore.craftCost, 0);
      return {
        id: ore.id,
        name: ore.name,
        cost: cost,
        floor: firstFloor[ore.id] || null,
        fitsTransmuter: cost > breakEven,
      };
    }).sort(function (a, b) { return a.cost - b.cost; });

    var flip = null;
    ores.forEach(function (ore) {
      if (!ore.fitsTransmuter || !ore.floor) return;
      if (flip === null || ore.floor < flip.floor) flip = ore;
    });

    return {
      breakEven: breakEven,
      craftMult: craftMult,
      plentyMulti: plentyMulti,
      transmuteMulti: transmuteMulti,
      transmutePlentyChance: transmutePlentyChance,
      ores: ores,
      flip: flip,
      allPlenty: ores.every(function (o) { return !o.fitsTransmuter; }),
      allTransmuter: ores.every(function (o) { return o.fitsTransmuter; }),
    };
  }

  // Floor speed penalties from the sheet's IFS ladder, then the world 3 and 4
  // modifiers, which were manual switches there too.
  var SPEED_STEPS = [[70, 1], [72, 0.75], [88, 1], [92, 0.75], [96, 1], [98, 0.75], [102, 1], [118, 1], [120, 0.7], [124, 0.6]];

  function veinSpeed(floor, state) {
    var factor = 1;
    for (var i = 0; i < SPEED_STEPS.length; i++) {
      if (floor <= SPEED_STEPS[i][0]) { factor = SPEED_STEPS[i][1]; break; }
    }
    if (floor >= 73 && floor <= 102) factor *= state.w3SpeedFix ? 1 : 0.7;
    if (floor >= 103) factor *= 1 - num(state.w4SpeedMod, 0);
    return factor;
  }

  function veinModel(state, vein) {
    var totals = resolve(state).totals;
    var morphChance = clamp01(num(state.veinMorph, 0));
    var morphGolden = clamp01(num(state.veinGolden, 0));

    var perScreen = num(totals.ores_per_screen, 0);
    var spawn = num(totals.vein_spawn_rate_multi, 1);
    var income = num(totals.vein_income_multi, 1);
    var rarity = Math.max(1, num(vein.rarity, 1));
    // The 2x research tick count comes from the export; it covers that many
    // veins in zone order, which is how the sheet's world toggles behave.
    var zoneIndex = DATA.veins.indexOf(vein) + 1;
    var research = zoneIndex > 0 && zoneIndex <= num(state.vein2x, 0) ? 2 : 1;
    var veinsPerScreen = morphChance * perScreen
      + (1 - morphChance) * Math.min(perScreen, spawn * research / rarity);

    var goldChance = clamp01(num(totals.golden_vein_chance, 0));
    var goldMulti = Math.max(1, num(totals.golden_vein_multi, 1));
    var rainbowChance = clamp01(num(totals.rainbow_vein_chance, 0));
    var rainbowMulti = Math.max(1, num(totals.rainbow_vein_multi, 1));
    var gleamChance = clamp01(num(totals.gleaming_vein_chance, 0));
    var gleamMulti = Math.max(1, num(totals.gleaming_vein_multi, 1));

    var variant = (morphGolden * goldMulti * (1 + goldChance * rainbowChance * (rainbowMulti - 1))
      + (1 - morphGolden) * ((1 - goldChance)
        + goldChance * (1 - rainbowChance) * goldMulti
        + goldChance * rainbowChance * goldMulti * rainbowMulti))
      * ((1 - gleamChance) + gleamChance * gleamMulti);

    // Void portals feed extra nodes in, weighted by the vein's own ore mix.
    // The sheet normalises this by ores per screen, which cancels out, leaving
    // just the share-weighted ore weights.
    // Portals only exist while the Void Drone is equipped. With it on, a share
    // of nodes become veins of the portaled ore's own zone (wiki: Drones,
    // Void Drone Mechanics).
    var portalChance = state.voidDrone ? clamp01(num(totals.void_portal_chance, 0)) : 0;
    var baseMulti = num(totals.void_portal_base_multi, 1) * num(totals.void_portal_multi, 1);
    var goldPortal = clamp01(num(totals.golden_void_portal_chance, 0));
    var goldPortalMulti = num(totals.golden_void_portal_multi, 1);
    var rainbowPortal = clamp01(num(totals.rainbow_void_portal_chance, 0));
    var rainbowPortalMulti = num(totals.rainbow_void_portal_multi, 1);
    var galacticPortal = clamp01(num(totals.galactic_void_portal_chance, 0));
    var galacticPortalMulti = num(totals.galactic_void_portal_multi, 1);

    var tier = [baseMulti, baseMulti * goldPortalMulti,
      baseMulti * goldPortalMulti * rainbowPortalMulti,
      baseMulti * goldPortalMulti * rainbowPortalMulti * galacticPortalMulti];
    var portalWeight = (1 - goldPortal) * tier[0]
      + goldPortal * (1 - rainbowPortal) * tier[1]
      + goldPortal * rainbowPortal * (1 - galacticPortal) * tier[2]
      + goldPortal * rainbowPortal * galacticPortal * tier[3];

    var span = vein.lastOre - vein.firstOre + 1;
    var oreWeight = function (id) {
      if (!id || id < vein.firstOre) return 0;
      return (id >= vein.lastOre ? span : id - vein.firstOre + 1) / id;
    };

    var rows = [];
    for (var floor = 1; floor <= DATA.floors.length; floor++) {
      var record = null;
      for (var i = 0; i < DATA.floors.length; i++) {
        if (DATA.floors[i].id === floor) { record = DATA.floors[i]; break; }
      }
      if (!record) continue;

      var inZone = floor >= vein.firstFloor && floor <= vein.lastFloor ? 1 : 0;
      var flat = (floor >= 103 && floor <= 106) || (floor >= 129 && floor <= 132) ? 0.4 : 1;
      var mix = num(record.oreA.share, 0) * oreWeight(record.oreA.id)
        + num(record.oreB.share, 0) * oreWeight(record.oreB.id);
      var weight = (1 - portalChance * flat) * inZone
        + portalChance * flat * mix * portalWeight;
      if (!weight) continue;

      var rate = veinsPerScreen
        * num(params.floorsPerHour, 0)
        * num(totals.game_speed_multi, 1)
        * veinSpeed(floor, state)
        * income
        * variant
        * weight;
      rows.push({ floorId: floor, rate: rate });
    }

    return {
      veinsPerScreen: veinsPerScreen,
      variant: variant,
      income: income,
      portalWeight: portalWeight,
      rows: rows.sort(function (a, b) { return b.rate - a.rate; }),
    };
  }

  function veinByName(name) {
    for (var i = 0; i < DATA.veins.length; i++) {
      if (DATA.veins[i].name === name) return DATA.veins[i];
    }
    return null;
  }

  // Fishing. A dock fills its meter with ticks, then rolls catch chance against
  // each fish. Values and the tick model follow the community sheet v3.2.2 and
  // the wiki; the 5x tick chance is a separate roll in the same cycle.
  function fishingModel(state) {
    var t = resolve(state).totals;
    var rod = num(t.fishing_rod_power, 0);
    var capacity = num(t.fishing_drone_capacity, 0);
    var dronePower = num(t.fishing_drone_power, 0);
    var droneMulti = num(t.fishing_drone_multiplier, 1);
    var income = num(t.fishing_income_multi, 1);

    // Tier 2 dock power applies from Cave onwards, which is where the game's
    // tier 2 boat upgrade starts. The export does not name the current dock.
    var dockDef = null;
    for (var d = 0; d < DATA.docks.length; d++) {
      if (DATA.docks[d].name === state.fishingDock) {
        dockDef = DATA.docks[d];
        break;
      }
    }
    if (!dockDef) dockDef = DATA.docks[0];
    var tier2Docks = ['Cave', 'Volcano', 'Sky', 'Solaris', 'Galaxy'];
    var tier2 = tier2Docks.indexOf(dockDef.name) >= 0;
    var dockPower = tier2 ? Math.max(1, num(t.fishing_tier2_dock_multi, 1)) : 1;

    var shiny = clamp01(num(t.fishing_shiny_chance, 0));
    var shinyMulti = Math.max(1, num(t.fishing_shiny_multi, 1));
    var superShiny = clamp01(num(t.fishing_super_shiny_chance, 0));
    var superMulti = Math.max(1, num(t.fishing_super_shiny_multi, 1));

    var variants = (1 - shiny)
      + shiny * (1 - superShiny) * shinyMulti
      + shiny * superShiny * shinyMulti * superMulti;

    // Fish per successful catch: dock power times income and the shiny chain.
    // Catch chance needs the fish power rating, which the export does not carry.
    var perCatch = (rod + capacity * dronePower * droneMulti) * dockPower * income * variants;

    // Wiki: 60 second base, reduced by the flat Fishing Tick Reduction stat.
    // Both community sheets compute the same figure from upgrade levels, and
    // the 3x elixir is already inside the reduction. The tick speed stat is a
    // separate display value, not a divisor.
    var base = 60;
    var reduction = num(t.fishing_tick_reduction_seconds, 0);
    var interval = Math.max(0.05, base - reduction);
    var clockTicks = 3600 / interval;

    // A tick event can roll double, triple and 5x at once. The expected number
    // of ticks is the sum over the eight combinations.
    var dbl = clamp01(num(t.fishing_double_tick_chance, 0));
    var tri = clamp01(num(t.fishing_triple_tick_chance, 0));
    var five = clamp01(num(t.fishing_5x_tick_chance, 0));
    var expectedTicks = 1 * (1 - dbl) * (1 - tri) * (1 - five)
      + 2 * dbl * (1 - tri) * (1 - five)
      + 3 * (1 - dbl) * tri * (1 - five)
      + 5 * (1 - dbl) * (1 - tri) * five
      + 6 * dbl * tri * (1 - five)
      + 10 * dbl * (1 - tri) * five
      + 15 * (1 - dbl) * tri * five
      + 30 * dbl * tri * five;

    // Lootbugs hand out fishing ticks as they spawn, which the old sheet never
    // counted. Formula from the new sheet: one hour over the base cooldown
    // (1/72h) after game speed and spawn rate, times three ticks, 11/140, and
    // twelve times the loot multiplier. Playtime scales the lot.
    var gameSpeed = Math.max(0.01, num(t.game_speed_multi, 1));
    var spawn = num(t.lootbug_spawn_rate, 0);
    var lootTriple = num(t.lootbug_triple_chance, 0);
    var lootMulti = Math.max(0, num(t.lootbug_loot_multi, 0));
    var playtime = Math.max(0, Math.min(24, num(state.fishingPlaytime, 24)));
    var lootbugTicks = 0;
    if (spawn > 0 && lootMulti > 0) {
      lootbugTicks = ((1 / 24) / ((1 / 72) / gameSpeed / spawn))
        * (3 * Math.min(1, lootTriple)) * (11 / 140) * (12 * lootMulti) * (playtime / 24);
    }

    var tickEvents = clockTicks + lootbugTicks;
    var ticksPerHour = tickEvents * expectedTicks;

    var docks = (DATA.docks || []).map(function (dock) {
      var ticks = Math.max(1, num(dock.base, 1));
      var upgraded = Math.max(1, num(dock.upgraded, ticks));
      return {
        name: dock.name,
        ticks: ticks,
        upgraded: upgraded,
        rollsPerHour: ticksPerHour / ticks,
        rollsPerHourUpgraded: ticksPerHour / upgraded,
      };
    });

    var dockTicks = Math.max(1, num(state.fishingDockTicks, num(dockDef.base, 1)));
    var catchesPerHour = ticksPerHour / dockTicks;

    return {
      perCatch: perCatch,
      perTick: perCatch,
      expectedTicks: expectedTicks,
      ticksPerHour: ticksPerHour,
      tickEvents: tickEvents,
      clockTicks: clockTicks,
      lootbugTicks: lootbugTicks,
      catchesPerHour: catchesPerHour,
      fishPerHour: perCatch * catchesPerHour,
      docks: docks,
      variants: variants,
      income: income,
      interval: interval,
      rod: rod,
      capacity: capacity,
      dronePower: dronePower,
      droneMulti: droneMulti,
      dockPower: dockPower,
      dock: dockPower,
      dockName: dockDef.name,
      dockTicks: dockTicks,
      tier2: tier2,
      tier2Dock: tier2,
      shiny: shiny,
      shinyMulti: shinyMulti,
      superShiny: superShiny,
      superMulti: superMulti,
      speed: Math.max(1, num(t.fishing_tick_speed, 100)) / 100,
      reduction: reduction,
      lootSpawn: spawn,
      lootTriple: lootTriple,
      lootMulti: lootMulti,
      playtime: playtime,
    };
  }

  var UPGRADE_NAMES = [
    'Fishing Rod', 'Fishing Drone (x1)', 'Upgrade Boat', 'Tick Speed',
    'Fish Multiplier', 'Rod Multiplier', 'Drone Multiplier', 'Double Tick Chance',
    'Fishing Drone (x2)', 'Shiny Fish Chance', 'Drone Base Power', 'Triple Tick Chance',
    'Upgrade Tier 2 Boat', 'Shiny Multiplier', 'Tier 2 Dock Power', 'Super Shiny Chance',
    'Poly Card Multi', 'Drone Cloner',
  ];
  var UPGRADE_MAX = [60, 50, 5, 40, 30, 20, 20, 30, 30, 25, 30, 25, 5, 20, 20, 20, 25, 30];

  var ENHANCE_NAMES = [
    'Fish Multiplier', 'Fishing Drone (x1)', 'Rod Multiplier', 'Tick Speed',
    'Drone Multiplier', 'Token Multiplier', 'Double Tick Chance', 'Tiny Notice Chance',
    'Shiny Multiplier', 'Fishing Drone (x3)', 'Tier 2 Dock Ticks', 'Triple Tick Chance',
    'Super Shiny Multi', 'Tier 2 Dock Power', 'Poly Card Multi',
  ];
  var ENHANCE_MAX = [255, 25, 20, 20, 25, 20, 20, 20, 20, 20, 10, 20, 20, 20, 20];
  var ENHANCE_COST = [
    { base: 500, step: 500, cap: 99999 },
    { base: 750, step: 500 },
    { base: 850, step: 750 },
    { base: 1000, step: 750 },
    { base: 1150, step: 850 },
    { base: 1250, step: 950 },
    { base: 1450, step: 1050 },
    { base: 1750, step: 1125 },
    { base: 1950, step: 1325 },
    { base: 2450, step: 1775 },
    { base: 15000, step: 5000 },
    { base: 4450, step: 3475 },
    { base: 5550, step: 4250 },
    { base: 7550, step: 4950 },
    { base: 9550, step: 6250 },
  ];

  var SKILL_NAMES = [
    'Fishing With Friends', 'Friendship Ended With Tier 1 Items',
    "Let's Pick Up The Pace", 'With This Fish I Summon Two More Fish',
    'Motley School', 'Completionist Gatekeeper',
  ];
  var SKILL_IDS = [42, 43, 44, 45, 51, 52];
  var SKILL_MAX = [3, 3, 3, 3, 3, 3];
  var SKILL_COST = [
    [5000, 6250, 7750],
    [6250, 7750, 9750],
    [5000, 6250, 7750],
    [6250, 7750, 9750],
    [12500, 15625, 19500],
    [12500, 15625, 19500],
  ];

  function enhanceCost(index, level) {
    var c = ENHANCE_COST[index];
    var value = c.base + c.step * level;
    return c.cap ? Math.min(c.cap, value) : value;
  }

  // Ranks every purchase that is not maxed by the rate gain per million of its
  // cost. Growth is measured by putting the state through fishingModel once
  // with that one purchase added, so the tick chain and dock meter come along.
  function fishingAdvisor(state) {
    var current = fishingModel(state);
    var base = current.fishPerHour;
    var gemRate = gemsIncome(state);
    var up = state.fishingUpgrades || [];
    var en = state.fishingEnhance || [];
    var sk = state.fishingSkills || [];
    var tribute = state.fishingTributes || [];
    var cloner = 1 + 0.05 * num(up[17], 0);
    var t2sum = 1 + 0.05 * num(up[14], 0) + 0.05 * num(en[13], 0);
    var abyss = num(tribute[5], 0) > 0 ? 3 : 0;
    // Tick speed levels subtract from the 60 second base before the 3x elixir
    // divides it, so one level moves the exported reduction by less than 0.5s.
    var hardReduction = 0.5 * num(up[3], 0) + 0.5 * num(en[3], 0) + 2 * num(sk[44], 0);
    var elixir = Math.max(1, (60 - hardReduction) / Math.max(0.05, current.interval));
    var rows = [];

    function trial(mutate) {
      var copy = Object.assign({}, state);
      copy.imported = Object.assign({}, state.imported);
      mutate(copy.imported, copy);
      return fishingModel(copy).fishPerHour;
    }

    function push(group, name, level, max, cost, currency, mutate, note) {
      if (level >= max) return;
      if (!(cost > 0)) return;
      var next = trial(mutate);
      var growth = base > 0 ? next / base - 1 : 0;
      rows.push({
        group: group,
        name: name,
        level: level,
        max: max,
        cost: cost,
        currency: currency,
        growth: growth,
        rank: growth / cost * 1e6,
        time: currency === 'fish'
          ? (base > 0 ? cost / base : null)
          : (gemRate > 0 ? cost / gemRate : null),
        note: note || '',
      });
    }

    UPGRADE_NAMES.forEach(function (name, index) {
      var level = num(up[index], 0);
      var max = UPGRADE_MAX[index];
      var costs = FDATA.upgradeCosts[name] || [];
      var cost = num(costs[level], 0);
      if (name === 'Poly Card Multi') {
        if (level < max) {
          rows.push({
            group: 'Fish upgrades', name: name, level: level, max: max,
            cost: cost, currency: 'fish', growth: null, rank: null, time: null,
            note: 'excluded: the sheet flags this growth as faulty',
          });
        }
        return;
      }
      push('Fish upgrades', name, level, max, cost, 'fish', function (imp, copy) {
        switch (index) {
          case 0: imp.fishing_rod_power *= 1.16; break;
          case 1: imp.fishing_drone_capacity += cloner; break;
          case 3: imp.fishing_tick_reduction_seconds += 0.5 / elixir; break;
          case 4: imp.fishing_income_multi *= (1 + 0.03 * (level + 1)) / (1 + 0.03 * level); break;
          case 5: imp.fishing_rod_power *= (1 + 0.04 * (level + 1)) / (1 + 0.04 * level); break;
          case 6: imp.fishing_drone_multiplier *= (1 + 0.06 * (level + 1)) / (1 + 0.06 * level); break;
          case 7: imp.fishing_double_tick_chance += 0.005; break;
          case 8: imp.fishing_drone_capacity += 2 * cloner; break;
          case 9: imp.fishing_shiny_chance += 0.005; break;
          case 10: imp.fishing_drone_power += 0.25; break;
          case 11: imp.fishing_triple_tick_chance += 0.0035; break;
          case 13: imp.fishing_shiny_multi *= (1 + 0.05 * (level + 1)) / (1 + 0.05 * level); break;
          case 14: imp.fishing_tier2_dock_multi *= (t2sum + 0.05) / t2sum; break;
          case 15: imp.fishing_super_shiny_chance += 0.01; break;
          case 17: imp.fishing_drone_capacity *= (1 + 0.05 * (level + 1)) / (1 + 0.05 * level); break;
          default: break;
        }
      }, name === 'Upgrade Boat' || name === 'Upgrade Tier 2 Boat' ? 'unlocks a dock, no rate change' : '');
    });

    ENHANCE_NAMES.forEach(function (name, index) {
      var level = num(en[index], 0);
      var max = ENHANCE_MAX[index];
      var cost = enhanceCost(index, level);
      if (name === 'Poly Card Multi') {
        if (level < max) {
          rows.push({
            group: 'Gem enhancements', name: name, level: level, max: max,
            cost: cost, currency: 'gems', growth: null, rank: null, time: null,
            note: 'excluded: the sheet flags this growth as faulty',
          });
        }
        return;
      }
      push('Gem enhancements', name, level, max, cost, 'gems', function (imp, copy) {
        switch (index) {
          case 0: imp.fishing_income_multi *= (1 + 0.05 * (level + 1)) / (1 + 0.05 * level); break;
          case 1: imp.fishing_drone_capacity += cloner; break;
          case 2: imp.fishing_rod_power *= (1 + 0.05 * (level + 1)) / (1 + 0.05 * level); break;
          case 3: imp.fishing_tick_reduction_seconds += 0.5 / elixir; break;
          case 4: imp.fishing_drone_multiplier *= (1 + 0.08 * (level + 1)) / (1 + 0.08 * level); break;
          case 6: imp.fishing_double_tick_chance += 0.005; break;
          case 8: imp.fishing_shiny_multi *= (1 + 0.05 * (level + 1)) / (1 + 0.05 * level); break;
          case 9: imp.fishing_drone_capacity += 3 * cloner; break;
          case 10: if (current.tier2) copy.fishingDockTicks = Math.max(1, current.dockTicks - 1); break;
          case 11: imp.fishing_triple_tick_chance += 0.004; break;
          case 12:
            var superBase = 3 + 0.15 * level + abyss;
            imp.fishing_super_shiny_multi *= (superBase + 0.15) / superBase;
            break;
          case 13: imp.fishing_tier2_dock_multi *= (t2sum + 0.05) / t2sum; break;
          default: break;
        }
      });
    });

    SKILL_NAMES.forEach(function (name, index) {
      var level = num(sk[SKILL_IDS[index]], 0);
      var max = SKILL_MAX[index];
      var cost = (SKILL_COST[index] || [])[level] || 0;
      push('Skill tree', name, level, max, cost, 'gems', function (imp, copy) {
        switch (index) {
          case 0:
            imp.fishing_drone_capacity += 5 * cloner;
            imp.fishing_income_multi *= (1 + 0.03 * (level + 1)) / (1 + 0.03 * level);
            break;
          case 2:
            imp.fishing_tick_reduction_seconds += 2 / elixir;
            imp.fishing_triple_tick_chance += 0.01;
            break;
          case 4:
            imp.fishing_drone_capacity += 5 * cloner;
            imp.fishing_rod_power *= (1 + 0.1 * (level + 1)) / (1 + 0.1 * level);
            break;
          default:
            break;
        }
      }, 'approximate: the sheet also applies pet and star components');
    });

    rows.sort(function (a, b) {
      if (a.rank === null && b.rank === null) return 0;
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return b.rank - a.rank;
    });

    return { rows: rows, fishPerHour: base, dockTicks: current.dockTicks };
  }

  // Gems. A receipt in the same shape as the Gems per hour panel at
  // gameutils.app/idle-obelisk-miner, whose author wrote the formulas from the
  // wiki. Every line was checked against that panel running this export, so
  // the numbers match it line for line.
  var GEM_BOMB_SECONDS = { gem: 315, cherry: 330, battery: 345, d20: 400 };
  var D20_CHARGE_SHARE = 0.05;
  var BATTERY_CHARGES = 2;
  var ITEM_MAGNET_CHANCE = 0.026;
  var FUEL_GEMS = 5;
  // Weights of 196: 50 to 100 gems 70 times, 150 to 300 four times, 1000 to
  // 3000 twice.
  var LOOTFROG_AVERAGE_GEMS = (6150 + 2 * 2000) / 196;
  var ELIXIR_BUFF_COUNT = 9;
  var ELIXIR_INTERVAL_BASE = 360;
  var ELIXIR_INTERVAL_PER_LEVEL = 15;

  // Game seconds one fuel lasts at grade 0, and per grade above it.
  var FUEL_TABLE = [
    { name: 'Bomb Bear', key: 'bear', base: 240, per: 12 },
    { name: 'Chain Bomber', key: 'chain', base: 220, per: 11 },
    { name: 'Midas', key: 'midas', base: 200, per: 10 },
    { name: 'Frogger', key: 'frogger', base: 180, per: 9 },
    { name: 'Veinseeker', key: 'veinseeker', base: 160, per: 8 },
    { name: 'Starburst', key: 'starburst', base: 140, per: 7 },
    { name: 'Elixir', key: 'elixir', base: 210, per: 10.5 },
    { name: 'Void', key: 'void', base: 180, per: 9 },
    { name: 'Angler', key: 'angler', base: 120, per: 6 },
    { name: 'Prism', key: 'prism', base: 70, per: 3.5 },
    { name: 'Minotaur', key: 'minotaur', base: 65, per: 3.25 },
  ];

  // One lootbug offers one buff, rolled by weight among the ones unlocked.
  // Obelisk level 10 adds the cherry charges, the Stone Vein research adds the
  // vein roll, the Telescope adds star spawn and auto-catch, and unlocking the
  // fishing Elixir buff removes the cherry charge roll.
  function lootbugFreeBuffs(flags) {
    return [
      { id: 'gems', label: 'Gems +2', weight: 30 },
      { id: 'item-chest', label: 'Item Chest +1', weight: 35 },
      { id: 'relic-chest', label: 'Relic Chest +1', weight: 5 },
      { id: 'cherry', label: 'Cherry Charges +10', weight: flags.cherry ? 20 : 0 },
      { id: 'ore-income', label: '2x Ore Income (2 min)', weight: 15 },
      { id: 'vein-spawn', label: '3x Vein Spawn Rate (2 min)', weight: flags.vein ? 20 : 0 },
      { id: 'game-speed', label: '2x Game Speed (2 min)', weight: 15 },
      { id: 'star-spawn', label: '2x Star Spawn Rate (2 min)', weight: flags.starSpawn },
      { id: 'auto-catch', label: '100% Auto-Catch (4 min)', weight: flags.autoCatch ? 20 : 0 },
    ];
  }

  function lootbugPaidBuffs(flags) {
    return [
      { id: 'item-chests', label: 'Item Chests +3', cost: 15, weight: flags.obelisk >= 37 ? 14 : 18 },
      { id: 'relic-chest', label: 'Relic Chest +1', cost: 15, weight: 10 },
      { id: 'cherry', label: 'Cherry Charges +100', cost: 15, weight: flags.cherry ? 20 : 0 },
      { id: 'ore-income', label: '2x Ore Income (10 min)', cost: 15, weight: 24 },
      { id: 'vein-spawn', label: '3x Vein Spawn Rate (10 min)', cost: 15, weight: flags.vein ? 20 : 0 },
      { id: 'game-speed', label: '2x Game Speed (10 min)', cost: 15, weight: 24 },
      { id: 'bomb-recharge', label: '10x Bomb Recharge (2 min)', cost: 15, weight: 3 },
      { id: 'star-spawn', label: '2x Star Spawn Rate (10 min)', cost: 25, weight: flags.starSpawn },
      { id: 'auto-catch', label: '100% Auto-Catch (20 min)', cost: 25, weight: flags.autoCatch ? 20 : 0 },
      { id: 'archaeology', label: 'Archaeology Banked Seconds', cost: 25, weight: flags.obelisk >= 30 ? 8 : 0 },
      { id: 'fishing-ticks', label: 'Fishing Ticks +12', cost: 35, weight: flags.obelisk >= 37 ? 11 : 0 },
    ];
  }

  function buffTotal(list) {
    return list.reduce(function (sum, b) { return sum + b.weight; }, 0);
  }

  function buffShare(list, id) {
    var total = buffTotal(list);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return total > 0 ? list[i].weight / total : 0;
    }
    return 0;
  }

  // Everything the gem receipt needs, normalised. Values the export carries as
  // percentages come back as fractions, and two stats are stripped back to
  // their unbuffed value when the export was taken with a timed buff running.
  function gemsInputs(state) {
    var t = resolve(state).totals;
    var raw = state.raw || {};
    var gems = state.gems || {};
    function pct(key) { return clamp01(num(raw[key], 0) / 100); }
    function val(key, fallback) { return num(raw[key], fallback); }
    function flag(key) {
      var v = raw[key];
      return v === true || (typeof v === 'number' && v > 0);
    }
    function at(key, index, fallback) {
      var list = raw[key];
      return Array.isArray(list) ? num(list[index], fallback) : fallback;
    }
    function anyPositive(key) {
      var list = raw[key];
      if (!Array.isArray(list)) return false;
      return list.some(function (v) { return num(v, 0) > 0; });
    }

    var obelisk = val('obelisk_level', 0);
    var uptime = raw.lootbug_and_elixir_uptime_array || [];
    var itemUptime = raw.item_uptime_array || [];
    var tribute = at('fishing_legendary_tribute_levels_array', 6, 0);
    var fishingBuff = obelisk >= 37;
    var autoCatch = pct('star_auto_catch_chance');
    var telescope = anyPositive('stars_star_level_array')
      || anyPositive('stars_regular_upgrades_array')
      || anyPositive('stars_super_star_upgrades_array');

    // The 10x Bomb Recharge lootbug buff is inside the exported recharge stat
    // while it is running, so it is divided back out and added as a line later.
    var bombRecharge = val('bomb_recharge_speed', 1);
    if (num(uptime[2], 0) > 0) bombRecharge = bombRecharge / 10;

    // Same for the Lootbug Lantern item buff. The Bomb Bear's bonus is already
    // in the exported stat and the calc keeps the drones as exported, so it is
    // left alone.
    var spawnMulti = val('lootbug_spawn_rate', 0);
    if (num(itemUptime[21], 0) > 0) spawnMulti = spawnMulti / (tribute >= 3 ? 6 : 3);

    var froggerLevel = at('drones_suit_level_array', 3, 0);
    var elixirLevel = at('drones_suit_level_array', 6, 0);
    var quest = at('pet_quest_array', 6, 0);
    var d20Charges = 20 + at('workshop_array', 11, 0);

    // Fuelled drones cost 5 gems a fuel to keep running, so the receipt takes
    // them off the bottom.
    var fuel = [];
    FUEL_TABLE.forEach(function (drone) {
      if (!flag('is_drone_' + drone.key + '_equipped_and_fueled')) return;
      var grade = val(drone.key + '_fuel_grade', 0);
      var seconds = (drone.base + drone.per * grade) * val('coal_fuel_duration_multi', 1)
        / (1 - Math.min(pct('coal_fuel_save_chance'), 0.99));
      fuel.push({ name: drone.name, seconds: seconds });
    });

    return {
      gameSpeed: num(t.game_speed_multi, 1),
      bombRecharge: bombRecharge,
      freeBomb: pct('bomb_free_chance'),
      cherry3x: pct('bomb_cherry3x_chance'),
      gemChance: (0.03 + quest * 0.001) * (tribute >= 3 ? 1.25 : 1),
      d20Charges: d20Charges,
      bombsUnlocked: num(gems.bombsUnlocked, 12),
      founderBomb: !!gems.founder,

      cooldownMinutes: val('freebie_cooldown_seconds', 600) / 60,
      packGems: val('freebie_gems_bonus', 0),
      instantRefresh: pct('freebie_refresh_chance'),
      jackpot: pct('freebie_5x_chance'),
      stonksChance: pct('stonks_chance'),
      stonksMulti: val('stonks_multi', 1),
      superStonks: pct('super_stonks_chance'),
      superStonksMulti: val('super_stonks_multi', 1),
      ultraStonks: pct('ultra_stonks_chance'),
      ultraStonksMulti: val('ultra_stonks_multi', 1),
      stonksGems: num(gems.stonksGems, 200),
      itemsPerChest: val('chest_items_bonus', 0),

      spawnMinutes: num(gems.spawnMinutes, 20),
      spawnMulti: spawnMulti,
      lootTriple: pct('lootbug_triple_chance'),
      lootMulti: val('lootbug_loot_multi', 1),
      goldenLootbug: pct('lootbug_golden_chance'),
      gemCostReduction: val('lootbug_gem_cost_reduction', 0),
      buffFlags: {
        obelisk: obelisk,
        cherry: obelisk >= 10 && !fishingBuff,
        vein: num(raw.vein_researched_array, -1) >= 0,
        starSpawn: telescope ? (autoCatch >= 0.75 ? 26 : 16) : 0,
        autoCatch: telescope && autoCatch < 0.75,
      },

      lootfrogEquipped: flag('is_drone_frogger_equipped'),
      froggerFuelled: flag('is_drone_frogger_equipped_and_fueled'),
      froggerLevel: froggerLevel,
      froggerGrade: val('frogger_fuel_grade', 0),
      lootfrogLootMulti: val('lootfrog_loot_multi', 1),
      lootfrogGemMulti: val('lootfrog_gem_loot_multi', 1),
      lootfrogGolden: pct('lootfrog_golden_chance'),
      lootfrogGoldenMulti: val('lootfrog_golden_multi', 2),
      lootfrogBig: pct('lootfrog_big_chance'),
      lootfrogBigMulti: val('lootfrog_big_multi', 5),
      lootfrogMassive: pct('lootfrog_massive_chance'),
      lootfrogMassiveMulti: val('lootfrog_massive_multi', 3),
      lootfrogTriple: pct('lootfrog_triple_spawn_chance'),
      lootfrog10x: pct('lootfrog_10x_spawn_chance'),

      elixirEquipped: flag('is_drone_elixir_equipped'),
      elixirFuelled: flag('is_drone_elixir_equipped_and_fueled'),
      elixirLevel: elixirLevel,
      elixirGrade: val('elixir_fuel_grade', 0),
      elixirCrit: pct('elixir_crit_chance'),
      elixirCritMulti: val('elixir_crit_multi', 1),
      fishingBuff: fishingBuff,

      fuel: fuel,
      worldCount: num(state.worldsUnlocked, 4) || 4,
      obelisk: obelisk,
    };
  }

  // Free bomb chance means a charge fires more than once; the cherry triple
  // chance multiplies cherry charges. Both are folded into the multipliers the
  // charge loop below uses.
  function gemChargeMultipliers(inputs) {
    var free = 1 / (1 - Math.min(Math.max(inputs.freeBomb, 0), 0.99));
    return {
      m: free,
      k: (1 + 2 * Math.min(Math.max(inputs.cherry3x, 0), 1)) * free,
      r: D20_CHARGE_SHARE * inputs.d20Charges,
      s: 1 / Math.max(inputs.bombsUnlocked - 1 + (inputs.founderBomb ? 1 : 0), 1),
    };
  }

  // A battery fire hands 2 charges and a D20 fire 5% of its refill to a random
  // other bomb, so the two feed each other. Solving the pair as a linear system
  // gives the average fire rates without stepping through it. The rates are in
  // charges per hour, so the bomb cooldowns cancel out of the answer.
  function gemChargeLoop(rates, target, mult) {
    var hitD20 = target === 'd20' ? 1 : 0;
    var hitBattery = target === 'battery' ? 1 : 0;
    var y = hitD20 * mult.k * mult.s * mult.r;
    var x = BATTERY_CHARGES * mult.s * (mult.m + hitD20 * mult.k);
    var v = mult.r * mult.s * (mult.m + hitBattery * mult.k);
    var g = hitBattery * mult.k * mult.s * BATTERY_CHARGES;
    var c = 1 - y;
    var s2 = 1 - g;
    var det = c * s2 - x * v;
    if (c <= 0 || s2 <= 0 || det <= 0) {
      return { loop: Infinity, cherry: Infinity, d20: Infinity, battery: Infinity };
    }
    var w = mult.m * rates.d20 + hitD20 * mult.k * rates.cherry;
    var tt = mult.m * rates.battery + hitBattery * mult.k * rates.cherry;
    var d20 = (w * s2 + x * tt) / det;
    var battery = (c * tt + v * w) / det;
    var loop = (mult.r * d20 + BATTERY_CHARGES * battery) * mult.s;
    return { loop: loop, cherry: mult.k * (rates.cherry + loop), d20: d20, battery: battery };
  }

  // One full receipt at a given game speed and bomb recharge factor. The buff
  // lines at the end are the difference between two runs of this.
  function gemsCore(inputs, play, factor) {
    var gs = inputs.gameSpeed * factor.gameSpeed;
    var br = inputs.bombRecharge * factor.recharge;
    var chance = inputs.gemChance;
    var mult = gemChargeMultipliers(inputs);
    var lines = [];

    function bombFires(seconds) {
      return 3600 * gs * br / seconds;
    }

    var claims = 60 / Math.max(inputs.cooldownMinutes, 0.01) * gs
      / (1 - Math.min(inputs.instantRefresh, 0.99));
    var stonksRoll = 1 - inputs.superStonks
      + inputs.superStonks * inputs.superStonksMulti
      * (1 + inputs.ultraStonks * (inputs.ultraStonksMulti - 1));
    var freebies = claims * (inputs.packGems + 4 * inputs.jackpot * inputs.packGems
      + inputs.stonksChance * inputs.stonksGems * inputs.stonksMulti * stonksRoll);
    lines.push({
      id: 'freebies',
      label: 'Freebie packs',
      amount: freebies,
      children: [
        { label: 'Pack gems', amount: claims * inputs.packGems },
        { label: 'Freebie jackpot', amount: claims * 4 * inputs.jackpot * inputs.packGems },
        { label: 'Stonks', amount: claims * inputs.stonksChance * inputs.stonksGems * inputs.stonksMulti * stonksRoll },
      ],
      note: 'The store freebie pack: ' + claims.toFixed(1) + ' claims an hour, each worth '
        + inputs.packGems + ' gems plus the jackpot and Stonks rolls.',
    });

    var gemRates = {
      cherry: bombFires(GEM_BOMB_SECONDS.cherry),
      battery: bombFires(GEM_BOMB_SECONDS.battery),
      d20: bombFires(GEM_BOMB_SECONDS.d20),
    };
    var gemLoop = gemChargeLoop(gemRates, play.cherryTarget, mult);
    var recharge = bombFires(GEM_BOMB_SECONDS.gem) * mult.m * chance;
    var loopGems = gemLoop.loop * mult.m * chance;
    var cherryGems = play.cherryTarget === 'gem' ? gemLoop.cherry * chance : 0;
    lines.push({
      id: 'gem-bombs',
      label: 'Gem bombs',
      amount: recharge + loopGems + cherryGems,
      children: [
        { label: 'Recharge fires', amount: recharge },
        { label: 'D20 & battery charges', amount: loopGems },
        { label: 'Cherry charges', amount: cherryGems },
      ],
      note: 'Gem bomb charges on a 315s cooldown, the charges D20 and battery fires hand it, '
        + 'and the cherry charges it fires free. Each fire rolls ' + (chance * 100).toFixed(2) + '% for a gem.',
    });

    var bugs = 60 / Math.max(inputs.spawnMinutes, 0.01) * inputs.spawnMulti
      * (1 + 2 * Math.min(Math.max(inputs.lootTriple, 0), 1)) * gs;
    var freeBuffs = lootbugFreeBuffs(inputs.buffFlags);
    var paidBuffs = lootbugPaidBuffs(inputs.buffFlags);
    var lootbugGems = bugs * buffShare(freeBuffs, 'gems') * (2 * inputs.lootMulti);
    lines.push({
      id: 'lootbugs',
      label: 'Lootbugs',
      amount: lootbugGems,
      children: [{ label: 'Gems buff rolls', amount: lootbugGems }],
      note: bugs.toFixed(1) + ' lootbugs an hour, ' + (buffShare(freeBuffs, 'gems') * 100).toFixed(1)
        + '% of which offer the gems buff, at 2 x ' + formatNumber(inputs.lootMulti) + ' loot multiplier.',
    });

    var frogs = 0;
    var perFrog = 0;
    if (inputs.lootfrogEquipped) {
      var interval = Math.max(30 - 1.5 * inputs.froggerLevel, 0.1) / Math.max(gs, 0.01);
      frogs = 3600 / interval
        * (1 + 2 * Math.min(inputs.lootfrogTriple, 1) + 9 * Math.min(inputs.lootfrog10x, 1));
      var big = 1 - inputs.lootfrogBig + inputs.lootfrogBig
        * ((1 - inputs.lootfrogMassive) * inputs.lootfrogBigMulti
          + inputs.lootfrogMassive * inputs.lootfrogBigMulti * inputs.lootfrogMassiveMulti);
      var golden = 1 + inputs.lootfrogGolden * (inputs.lootfrogGoldenMulti - 1);
      perFrog = LOOTFROG_AVERAGE_GEMS * inputs.lootfrogLootMulti * inputs.lootfrogGemMulti * big * golden;
    }
    lines.push({
      id: 'lootfrogs',
      label: 'Lootfrogs',
      amount: frogs * perFrog,
      children: [{ label: 'Gem loot', amount: frogs * perFrog }],
      note: inputs.lootfrogEquipped
        ? frogs.toFixed(1) + ' lootfrogs an hour at ' + formatNumber(perFrog) + ' gems each.'
        : 'The Frogger is not equipped.',
    });

    var elixir = { own: 0, loop: 0, cherry: 0 };
    if (inputs.elixirEquipped) {
      var buffs = ELIXIR_BUFF_COUNT + (inputs.fishingBuff ? 1 : 0);
      var buffInterval = Math.max(ELIXIR_INTERVAL_BASE - ELIXIR_INTERVAL_PER_LEVEL * inputs.elixirLevel, 1);
      var strength = (inputs.elixirFuelled ? 1.6 + 0.06 * inputs.elixirGrade : 1)
        * (1 + Math.min(inputs.elixirCrit, 1) * (inputs.elixirCritMulti - 1));
      // Share of the time the 10x Bomb Recharge buff is up, from a 60 second
      // probe: the buff rolls once per buff pool cycle and lasts 2 game minutes.
      var probe = Math.min(60 * strength / (buffs * buffInterval), 1);
      var extra = function (seconds) {
        return 9 * br / seconds * probe * 3600 * gs;
      };
      var elixirLoop = gemChargeLoop(
        { cherry: extra(GEM_BOMB_SECONDS.cherry), battery: extra(GEM_BOMB_SECONDS.battery), d20: extra(GEM_BOMB_SECONDS.d20) },
        play.cherryTarget,
        mult
      );
      elixir.own = extra(GEM_BOMB_SECONDS.gem) * mult.m * chance;
      elixir.loop = elixirLoop.loop * mult.m * chance;
      elixir.cherry = play.cherryTarget === 'gem' ? elixirLoop.cherry * chance : 0;
    }
    lines.push({
      id: 'elixir',
      label: 'Elixir Drone',
      amount: elixir.own + elixir.loop + elixir.cherry,
      children: [
        { label: 'Extra recharge fires', amount: elixir.own },
        { label: 'D20 & battery charges', amount: elixir.loop },
        { label: 'Cherry charges', amount: elixir.cherry },
      ],
      note: inputs.elixirEquipped
        ? 'The Elixir rolls one buff in '
          + (ELIXIR_BUFF_COUNT + (inputs.fishingBuff ? 1 : 0)) + ' every '
          + ((ELIXIR_INTERVAL_BASE - ELIXIR_INTERVAL_PER_LEVEL * inputs.elixirLevel) / gs).toFixed(0)
          + 's, and the 10x Bomb Recharge gives 9x the charges while it is up.'
        : 'The Elixir Drone is not equipped.',
    });

    var founder = { crates: 0, jackpot: 0, rolls: 0 };
    var crateCounts = null;
    if (play.founder) {
      var tier = Math.max(1, Math.round(num(play.founderTier, 1)));
      var worlds = Math.max(1, Math.min(4, inputs.worldCount));
      var minutes = 62 - 2 * tier;
      var doubleChance = tier >= 2 ? 0.12 + 0.06 * (tier - 2) : 0;
      var tripleChance = tier >= 7 ? 0.16 + 0.08 * (tier - 7) : 0;
      var goldenChance = tier >= 11 ? 0.1 + 0.02 * (tier - 11) : 0;
      var drops = 60 / minutes;
      var crates = (1 + doubleChance) * (1 + 2 * tripleChance);
      var crateGems = worlds * 10 * (1 + 4 * goldenChance);
      var hwm = [1, 2, 4, 25][worlds - 1];
      var cherriesPerCrate = Math.max(worlds * inputs.obelisk * 5, 50) * (1 + 4 * goldenChance);
      var founderLoop = gemChargeLoop({ cherry: drops * crates * cherriesPerCrate, battery: 0, d20: 0 }, play.cherryTarget, mult);
      crateCounts = {
        drops: drops * crates,
        chests: worlds * 2 * (1 + 4 * goldenChance),
      };
      founder.crates = drops * crates * crateGems;
      founder.jackpot = drops * crates * 0.01 * (inputs.obelisk >= 70 ? 3 : 1) * hwm * (inputs.obelisk * 10 + 50);
      founder.rolls = (founderLoop.loop * mult.m + (play.cherryTarget === 'gem' ? founderLoop.cherry : 0)) * chance;
    }
    lines.push({
      id: 'founder',
      label: 'Founder supply drops',
      amount: founder.crates + founder.jackpot + founder.rolls,
      children: [
        { label: 'Crate gems', amount: founder.crates },
        { label: 'Gem jackpot', amount: founder.jackpot },
        { label: 'Cherry charges', amount: founder.rolls },
      ],
      note: play.founder ? 'Supply drops every ' + (62 - 2 * Math.max(1, Math.round(num(play.founderTier, 1)))) + ' minutes at VIP tier ' + Math.round(num(play.founderTier, 1)) + '.' : 'Founder toggle is off.',
    });

    var magnets = { freebies: 0, lootbugs: 0, founder: 0 };
    if (play.chargeMagnets) {
      var chestsFree = claims * (1 + 4 * inputs.jackpot)
        + claims * inputs.stonksChance * 20 * inputs.stonksMulti * stonksRoll;
      var chestsBugs = bugs * inputs.lootMulti * buffShare(freeBuffs, 'item-chest');
      if (play.lootbugBuys.indexOf('item-chests') >= 0) {
        chestsBugs += bugs * inputs.lootMulti * 3 * buffShare(paidBuffs, 'item-chests');
      }
      var chestsFounder = crateCounts ? crateCounts.drops * crateCounts.chests : 0;
      var magnetLoop = gemChargeLoop({ cherry: 20, battery: 20, d20: 20 }, play.cherryTarget, mult);
      var perMagnet = ((20 + magnetLoop.loop) * mult.m
        + (play.cherryTarget === 'gem' ? magnetLoop.cherry : 0)) * chance;
      var perChest = inputs.itemsPerChest * ITEM_MAGNET_CHANCE * perMagnet;
      magnets.freebies = chestsFree * perChest;
      magnets.lootbugs = chestsBugs * perChest;
      magnets.founder = chestsFounder * perChest;
    }
    lines.push({
      id: 'magnets',
      label: 'Charge Magnets',
      amount: magnets.freebies + magnets.lootbugs + magnets.founder,
      children: [
        { label: 'From freebie packs', amount: magnets.freebies },
        { label: 'From lootbugs', amount: magnets.lootbugs },
        { label: 'From Founder supply drops', amount: magnets.founder },
      ],
      note: play.chargeMagnets
        ? 'Item chests from freebies, lootbugs and supply drops, at ' + (ITEM_MAGNET_CHANCE * 100).toFixed(1)
          + '% a magnet and ' + formatNumber(perMagnet) + ' gems a magnet.'
        : 'Use Charge Magnets is off in the playstyle.',
    });

    var frogger = { total: 0, direct: 0 };
    if (inputs.froggerFuelled) {
      var fireInterval = Math.max(30 - 1.5 * inputs.froggerLevel, 0.1) / Math.max(gs, 0.01);
      var autofires = 3600 / fireInterval;
      var bombsPerFire = (10 + 5 + inputs.froggerGrade) / 2;
      var fires = autofires * bombsPerFire;
      var bombCount = Math.max(inputs.bombsUnlocked + (inputs.founderBomb ? 1 : 0), 1);
      var perBomb = fires / bombCount / mult.m;
      var froggerLoop = gemChargeLoop({ cherry: perBomb, battery: perBomb, d20: perBomb }, play.cherryTarget, mult);
      frogger.total = ((perBomb + froggerLoop.loop) * mult.m
        + (play.cherryTarget === 'gem' ? froggerLoop.cherry : 0)) * chance;
      frogger.direct = fires / bombCount * chance;
    }
    lines.push({
      id: 'frogger',
      label: 'Frogger bombs',
      amount: frogger.total,
      children: [{ label: 'Gem bomb share', amount: frogger.total }],
      note: inputs.froggerFuelled
        ? 'A fuelled Frogger firing ' + formatNumber(frogger.total / Math.max(chance, 1e-9) / Math.max(mult.m, 1e-9))
          + ' gem feeds an hour, spread evenly over every unlocked bomb.'
        : 'The Frogger is not equipped and fuelled.',
    });

    var spending = [];
    var fuelCost = 0;
    (inputs.fuel || []).forEach(function (drone) {
      if (!(drone.seconds > 0)) return;
      var perHour = 3600 * gs / drone.seconds;
      var cost = perHour * FUEL_GEMS;
      fuelCost += cost;
      spending.push({ label: drone.name + ' fuel', amount: -cost, detail: perHour.toFixed(2) + ' fuel/hr' });
    });
    var manualFuel = num(play.fuelPerHour, 0);
    if (manualFuel > 0) {
      fuelCost += manualFuel * FUEL_GEMS;
      spending.push({ label: 'Other fuel bought', amount: -manualFuel * FUEL_GEMS, detail: manualFuel + ' fuel/hr' });
    }

    var lazyCost = 0;
    if (play.lootbugBuys.length) {
      var paidShare = (1 - inputs.goldenLootbug);
      play.lootbugBuys.forEach(function (id) {
        for (var i = 0; i < paidBuffs.length; i++) {
          if (paidBuffs[i].id !== id || !paidBuffs[i].weight) continue;
          var price = Math.max(paidBuffs[i].cost - inputs.gemCostReduction, 0);
          var cost = bugs * paidShare * buffShare(paidBuffs, id) * price;
          lazyCost += cost;
          spending.push({ label: paidBuffs[i].label, amount: -cost, detail: price + ' gems each' });
        }
      });
    }

    var gross = lines.reduce(function (sum, l) { return sum + l.amount; }, 0);
    return {
      lines: lines,
      gross: gross,
      spending: spending,
      spendingTotal: fuelCost + lazyCost,
      net: gross - fuelCost - lazyCost,
      offline: (play.autofire === 'gem' ? recharge : 0) + frogger.direct,
      details: { claims: claims, bugs: bugs, freeBuffs: freeBuffs, paidBuffs: paidBuffs, mult: mult },
    };
  }

  // What the fishing advisor divides gem costs by: the net figure the Gems tab
  // works out, unless a rate has been typed in by hand.
  function gemsIncome(state) {
    var manual = num(state.gemsPerHour, 0);
    if (state.gemsManualRate && manual > 0) return manual;
    return gemsModel(state).net;
  }

  // The playstyle leaves several things the export cannot know: which bomb is
  // autofired, where cherry charges go, and which lootbug buffs are bought.
  function gemsModel(state) {
    var inputs = gemsInputs(state);
    var play = Object.assign({
      autofire: 'gem',
      cherryTarget: 'gem',
      lootbugBuys: [],
      founder: false,
      founderTier: 1,
      chargeMagnets: false,
      fuelPerHour: 0,
      gameSpeedBuffMulti: 2,
    }, state.gems || {});

    var base = gemsCore(inputs, play, { gameSpeed: 1, recharge: 1 });
    var lines = base.lines.slice();

    // Lootbug buffs change game speed or bomb recharge for a slice of the time,
    // so their worth is the gross with the buff minus the gross without it.
    // Uptime is the buff's spawn share times its duration, and the site's own
    // constant is not reproducible from its published formula: every input is
    // linear (moving spawn rate, spawn interval, triple chance and loot
    // multiplier each moves the line exactly), but its uptime comes out at
    // 0.0319 where the formula gives 0.0431 for this export. Fitted so the two
    // buff lines match its output.
    var LOOTBUG_UPTIME_FIT = 0.36023;
    var bugsPerSecond = 60 / Math.max(inputs.spawnMinutes, 0.01) * inputs.spawnMulti
      * (1 + 2 * Math.min(Math.max(inputs.lootTriple, 0), 1)) / 3600;
    var freeBuffs = base.details.freeBuffs;
    var paidBuffs = base.details.paidBuffs;
    var gameSpeedRunning = num((state.raw || {}).item_uptime_array
      ? (state.raw.item_uptime_array[11] || 0) : 0, 0) > 3600;
    var buys = play.lootbugBuys;
    var uptimeRate = bugsPerSecond * LOOTBUG_UPTIME_FIT;
    var freeRaw = Math.min(uptimeRate * buffShare(freeBuffs, 'game-speed') * 120 * inputs.lootMulti, 1);
    var boughtShare = buys.indexOf('game-speed') >= 0 ? buffShare(paidBuffs, 'game-speed') : 0;
    var combinedRaw = Math.min(
      uptimeRate * (buffShare(freeBuffs, 'game-speed') * 120 + boughtShare * 600) * inputs.lootMulti,
      1
    );
    var rechargeRaw = Math.min(
      uptimeRate * (buys.indexOf('bomb-recharge') >= 0 ? buffShare(paidBuffs, 'bomb-recharge') : 0) * 120 * inputs.lootMulti,
      1
    );
    var freeUptime = freeRaw;
    var boughtUptime = Math.max(0, combinedRaw - freeRaw);
    var rechargeUptime = rechargeRaw;
    var buffMulti = Math.max(1, num(play.gameSpeedBuffMulti, 2));

    var freeGross = base.gross;
    var withFree = base.gross;
    var withBought = base.gross;
    if (!gameSpeedRunning && freeUptime > 0) {
      withFree = gemsCore(inputs, play, { gameSpeed: 1 + freeUptime * (buffMulti - 1), recharge: 1 }).gross;
      withBought = gemsCore(inputs, play, {
        gameSpeed: 1 + (freeUptime + Math.max(0, boughtUptime)) * (buffMulti - 1),
        recharge: 1,
      }).gross;
    }
    var rechargeGross = base.gross;
    if (rechargeUptime > 0) {
      rechargeGross = gemsCore(inputs, play, { gameSpeed: 1, recharge: 1 + 9 * rechargeUptime }).gross;
    }

    if (!gameSpeedRunning && freeUptime > 0) {
      lines.push({ id: 'speed-free', label: '2x Game Speed (lootbug buff, free)', amount: withFree - freeGross, children: [], note: 'On ' + (freeUptime * 100).toFixed(1) + '% of the time.' });
      if (boughtUptime > 0) {
        lines.push({ id: 'speed-bought', label: '2x Game Speed (lootbug buff, bought)', amount: withBought - withFree, children: [], note: 'On ' + (boughtUptime * 100).toFixed(1) + '% of the time.' });
      }
    }
    if (rechargeUptime > 0) {
      lines.push({ id: 'recharge-buff', label: '10x Bomb Recharge (lootbug buff)', amount: rechargeGross - base.gross, children: [], note: 'On ' + (rechargeUptime * 100).toFixed(1) + '% of the time.' });
    }

    var gross = lines.reduce(function (sum, l) { return sum + l.amount; }, 0);
    return {
      inputs: inputs,
      lines: lines,
      spending: base.spending,
      gross: gross,
      spendingTotal: base.spendingTotal,
      net: gross - base.spendingTotal,
      offline: base.offline,
      claims: base.details.claims,
      bugs: base.details.bugs,
      freeBuffs: freeBuffs,
      paidBuffs: paidBuffs,
      play: play,
      gameSpeedRunning: gameSpeedRunning,
      freeUptime: freeUptime,
      rechargeUptime: rechargeUptime,
    };
  }

  function IOM_format(v) {
    if (!isFinite(v)) return '-';
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }


  // Wiki: base health and armour both scale x2.8 per level to 60, then health
  // jumps to x30 and armour to x9.5 per level.
  // Obelisk damage. Crits roll in sequence: you only reach a super crit if the
  // crit roll passed, and so on, which is why the chances multiply.
  function obeliskBaseHealth(level) {
    if (level < 1) return 0;
    var value = level <= 60
      ? 1e5 * Math.pow(2.8, level - 1)
      : 1e5 * Math.pow(2.8, 60) * Math.pow(30, level - 60);
    return Math.round(value);
  }

  function obeliskBaseArmour(level) {
    if (level < 1) return 0;
    var value = level <= 60
      ? 10 * Math.pow(2.8, level - 1)
      : 10 * Math.pow(2.8, 60) * Math.pow(9.5, level - 60);
    return Math.round(value);
  }

  // Observed values from the game win over the formula, since armour is lowered
  // by upgrades and artifacts that the export does not fully describe.
  function obeliskLookup(level, armourFactor) {
    var factor = typeof armourFactor === 'number' && isFinite(armourFactor) ? armourFactor : 1;
    var list = DATA.obelisks || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].level === level) {
        var hit = list[i];
        return {
          level: level,
          hp: num(hit.hp, obeliskBaseHealth(level)),
          armour: num(hit.armour, obeliskBaseArmour(level) * factor),
          duration: num(hit.duration, 0),
        };
      }
    }
    if (level < 1) return null;
    return {
      level: level,
      hp: obeliskBaseHealth(level),
      armour: Math.round(obeliskBaseArmour(level) * factor),
      duration: 0,
    };
  }

  function obeliskModel(state, hp, armor, duration) {
    var t = resolve(state).totals;
    var damage = num(t.pickaxe_damage, 0);
    var speed = num(t.pickaxe_attack_speed_per_second, 0);

    var crit = Math.min(1, num(t.pickaxe_crit_chance, 0));
    var sup = Math.min(1, num(t.pickaxe_super_crit_chance, 0));
    var ultra = Math.min(1, num(t.pickaxe_ultra_crit_chance, 0));
    var omega = Math.min(1, num(t.pickaxe_omega_crit_chance, 0));

    var critMult = Math.max(1, num(t.pickaxe_crit_damage, 1));
    var supMult = Math.max(1, num(t.pickaxe_super_crit_damage, 1));
    var ultraMult = Math.max(1, num(t.pickaxe_ultra_crit_damage, 1));
    var omegaMult = Math.max(1, num(t.pickaxe_omega_crit_damage, 1));

    var tiers = [
      { name: 'Regular', chance: 1 - crit, mult: 1 },
      { name: 'Crit', chance: crit * (1 - sup), mult: critMult },
      { name: 'Super crit', chance: crit * sup * (1 - ultra), mult: critMult * supMult },
      { name: 'Ultra crit', chance: crit * sup * ultra * (1 - omega), mult: critMult * supMult * ultraMult },
      { name: 'Omega crit', chance: crit * sup * ultra * omega, mult: critMult * supMult * ultraMult * omegaMult },
    ];

    // Armour comes off the base hit before crits, per the wiki. If the base
    // cannot beat the armour, no crit can save it.
    var armour = Math.max(0, num(armor, 0));
    var base = damage - armour;
    var blocked = damage > 0 && base <= 0;

    var average = 0;
    tiers.forEach(function (tier) {
      tier.hit = Math.max(0, base) * tier.mult;
      average += tier.chance * tier.hit;
    });

    var perHit = average;
    var attacks = null;
    var seconds = null;
    var perFight = null;
    var fights = null;
    if (hp > 0 && perHit > 0) {
      attacks = Math.ceil(hp / perHit);
      seconds = speed > 0 ? attacks / speed : null;
      if (duration > 0) {
        perFight = perHit * speed * duration;
        fights = Math.ceil(hp / perFight);
      }
    }

    return {
      damage: damage,
      speed: speed,
      tiers: tiers,
      perHit: perHit,
      dps: perHit * speed,
      armour: armour,
      base: base,
      attacks: attacks,
      seconds: seconds,
      perFight: perFight,
      fights: fights,
      duration: duration,
      blocked: blocked,
    };
  }

  function formatNumber(v) {
    if (!isFinite(v)) return '-';
    var a = Math.abs(v);
    if (a === 0) return '0';
    if (a < 1000) {
      if (a >= 100) return v.toFixed(0);
      if (a >= 10) return v.toFixed(1);
      return v.toFixed(2);
    }
    var hit = NOTATION.find(function (n) { return a >= n.value; });
    if (!hit) return v.toExponential(2).replace('e+', 'e');
    var scaled = v / hit.value;
    var digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
    return scaled.toFixed(digits) + (hit.short || '');
  }

  function formatValue(value, type) {
    if (typeof value !== 'number' || !isFinite(value)) return '-';
    if (type === 'chance') return (value * 100).toFixed(2) + '%';
    if (type === 'multi') return formatNumber(value) + 'x';
    if (type === 'boolean') return value ? 'Yes' : 'No';
    return formatNumber(value);
  }

  function formatDuration(hours) {
    if (!isFinite(hours) || hours <= 0) return '-';
    var units = [
      { label: 'years', seconds: 31536000 },
      { label: 'days', seconds: 86400 },
      { label: 'hours', seconds: 3600 },
      { label: 'minutes', seconds: 60 },
    ];
    var seconds = hours * 3600;
    if (seconds < 1) return 'under a second';
    if (seconds < 60) return seconds.toFixed(0) + ' seconds';
    for (var i = 0; i < units.length; i++) {
      if (seconds >= units[i].seconds) {
        var whole = Math.floor(seconds / units[i].seconds);
        var rest = seconds - whole * units[i].seconds;
        var next = units[i + 1];
        var text = whole + ' ' + units[i].label;
        if (next) {
          var remainder = Math.floor(rest / next.seconds);
          if (remainder) text += ' ' + remainder + ' ' + next.label;
        }
        return text;
      }
    }
    return formatDuration(seconds / 3600);
  }

  root.IOM = {
    data: DATA,
    meta: meta,
    floorsById: floorsById,
    oresById: oresById,
    embin: embin,
    oreEm: oreEm,
    oreCardOf: oreCardOf,
    isOreUnlocked: isOreUnlocked,
    veinModel: veinModel,
    fishingModel: fishingModel,
    fishingAdvisor: fishingAdvisor,
    gemsModel: gemsModel,
    gemsIncome: gemsIncome,
    gemsInputs: gemsInputs,
    gemsCore: gemsCore,
    dockNames: function () {
      return DATA.docks.map(function (d) { return d.name; });
    },
    obeliskModel: obeliskModel,
    obeliskLookup: obeliskLookup,
    obeliskBaseHealth: obeliskBaseHealth,
    obeliskBaseArmour: obeliskBaseArmour,
    MATHS_STATS: MATHS_STATS,
    DRIVEN_STATS: DRIVEN_STATS,
    veinByName: veinByName,
    oreFirstFloor: oreFirstFloor,
    oreWorld: oreWorld,
    barCardOf: barCardOf,
    craftEm: craftEm,
    transEm: transEm,
    voidShares: voidShares,
    emptyState: emptyState,
    parseExport: parseExport,
    applyExport: applyExport,
    resolve: resolve,
    floorValues: floorValues,
    buildRows: buildRows,
    rankFloors: rankFloors,
    rankAll: rankAll,
    farmTime: farmTime,
    setBomb: setBomb,
    bombModel: bombModel,
    bombOptions: bombOptions,
    statType: statType,
    parseNumber: parseNumber,
    formatNumber: formatNumber,
    formatValue: formatValue,
    formatDuration: formatDuration,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
