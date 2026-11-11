// Calculation engine. Mirrors the spreadsheet's Floors and Main tabs.
(function (root) {
  'use strict';

  var DATA = root.GAME_DATA;
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

  var replaceDefaults = new Map(DATA.replaceDefaults.map(function (d) { return [d.name, d.value]; }));
  var SUFFIX = new Map();
  DATA.notation.forEach(function (n) {
    if (n.short) SUFFIX.set(String(n.short).toLowerCase(), n.value);
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
      showLockedOres: false,
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
    if (isFinite(num(parsed.stats.worlds_unlocked, NaN))) {
      state.worldsUnlocked = num(parsed.stats.worlds_unlocked, 0);
    }

    state.version = parsed.version;
    state.time = parsed.time;
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
