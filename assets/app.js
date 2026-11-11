(function () {
  'use strict';

  var IOM = window.IOM;
  var DATA = IOM.data;
  var STORAGE_KEY = 'iom-calc-state-v1';

  var state = load();
  var built = null;

  function $(id) { return document.getElementById(id); }

  function load() {
    var base = IOM.emptyState();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      var saved = JSON.parse(raw);
      if (saved.imported) Object.keys(saved.imported).forEach(function (k) { base.imported[k] = saved.imported[k]; });
      if (saved.fromExport) base.fromExport = saved.fromExport;
      if (saved.bases) base.bases = saved.bases;
      if (saved.bomb) base.bomb = saved.bomb;
      if (saved.worldsUnlocked !== undefined) base.worldsUnlocked = saved.worldsUnlocked;
      if (saved.showLockedOres) base.showLockedOres = true;
      if (isFinite(Number(saved.veinMorph))) base.veinMorph = Number(saved.veinMorph);
      if (isFinite(Number(saved.veinGolden))) base.veinGolden = Number(saved.veinGolden);
      if (isFinite(Number(saved.w4SpeedMod))) base.w4SpeedMod = Number(saved.w4SpeedMod);
      if (saved.w3SpeedFix !== undefined) base.w3SpeedFix = !!saved.w3SpeedFix;
      if (isFinite(Number(saved.vein2x))) base.vein2x = Number(saved.vein2x);
      if (saved.voidDrone !== undefined) base.voidDrone = !!saved.voidDrone;
      if (saved.tier2Dock !== undefined) base.tier2Dock = !!saved.tier2Dock;
      if (saved.obeliskHp !== undefined) base.obeliskHp = saved.obeliskHp;
      if (saved.obeliskArmour !== undefined) base.obeliskArmour = saved.obeliskArmour;
      if (saved.cards) {
        if (isFinite(Number(saved.cards.ore))) base.cards.ore = Number(saved.cards.ore);
        if (isFinite(Number(saved.cards.bar))) base.cards.bar = Number(saved.cards.bar);
      }
      if (Array.isArray(saved.toggles) && saved.toggles.length === base.toggles.length) base.toggles = saved.toggles;
      base.version = saved.version || null;
      base.time = saved.time || null;
      return base;
    } catch (err) {
      return base;
    }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (err) { /* private mode */ }
  }

  function recalc() {
    built = IOM.buildRows(state);
  }

  function renderCards() {
    $('card-ore').value = String(state.cards.ore);
    $('card-bar').value = String(state.cards.bar);
  }

  function bindCard(id, key) {
    $(id).addEventListener('change', function () {
      var parsed = IOM.parseNumber($(id).value);
      if (!isFinite(parsed) || parsed <= 0) { renderCards(); return; }
      state.cards[key] = parsed;
      save();
      recalc();
      renderFloors();
      renderFarm();
      renderBomb();
    });
  }

  function syncBombToggles() {
    DATA.input.forEach(function (row, index) {
      if (row.section !== 'Bomb') return;
      state.toggles[index].export = 0;
      state.toggles[index].use = state.bomb !== 'none' && row.source === state.bomb ? 1 : 0;
    });
  }

  function applyBomb(name) {
    state.bomb = name;
    syncBombToggles();
    save();
    recalc();
    renderMods();
    renderStats();
    renderFloors();
    renderFarm();
    renderBomb();
  }

  function fillBombInUse() {
    var select = $('bomb-in-use');
    select.innerHTML = '';
    var none = document.createElement('option');
    none.value = 'none';
    none.textContent = 'None';
    select.appendChild(none);
    IOM.bombOptions().forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    select.value = state.bomb;
    select.addEventListener('change', function () { applyBomb(select.value); });
  }

  function renderFishing() {
    var host = $('fishing-results');
    host.innerHTML = '';
    var m = IOM.fishingModel(state);

    var cards = document.createElement('div');
    cards.className = 'cards';
    [
      { label: 'Ticks per hour', value: IOM.formatNumber(m.ticksPerHour), sub: m.expectedTicks.toFixed(2) + ' ticks per cycle' },
      { label: 'Tick interval', value: m.interval.toFixed(3) + 's' },
      { label: 'Fish per tick', value: IOM.formatNumber(m.perTick) },
      { label: 'One dock, all power', value: IOM.formatNumber(m.fishPerHour), sub: 'not a real total' },
    ].forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'card';
      var label = document.createElement('div');
      label.className = 'label';
      label.textContent = item.label;
      var value = document.createElement('div');
      value.className = 'value';
      value.textContent = item.value;
      card.appendChild(label);
      card.appendChild(value);
      if (item.sub) {
        var sub = document.createElement('p');
        sub.className = 'sub';
        sub.textContent = item.sub;
        card.appendChild(sub);
      }
      cards.appendChild(card);
    });
    host.appendChild(cards);

    var wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    var table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Input</th><th class="num">Value</th></tr></thead>';
    var body = document.createElement('tbody');
    [
      ['Rod power', IOM.formatNumber(m.rod)],
      ['Drone capacity', IOM.formatNumber(m.capacity)],
      ['Drone power', IOM.formatNumber(m.dronePower)],
      ['Drone multiplier', IOM.formatNumber(m.droneMulti) + 'x'],
      ['Dock power', IOM.formatNumber(m.dock) + 'x' + (m.tier2Dock ? ' (tier 2)' : ' (not applied)')],
      ['Shiny chance / multi', (m.shiny * 100).toFixed(1) + '% at ' + IOM.formatNumber(m.shinyMulti) + 'x'],
      ['Super shiny chance / multi', (m.superShiny * 100).toFixed(1) + '% at ' + IOM.formatNumber(m.superMulti) + 'x'],
      ['Income multiplier', IOM.formatNumber(m.income) + 'x'],
      ['Tick speed / reduction', IOM.formatNumber(m.speed * 100) + '% and ' + IOM.formatNumber(m.reduction) + 's'],
    ].forEach(function (pair) {
      var tr = document.createElement('tr');
      cell(tr, pair[0]);
      cell(tr, pair[1], 'num');
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    host.appendChild(wrap);

    var dockTable = document.createElement('div');
    dockTable.className = 'table-scroll';
    dockTable.style.marginTop = '18px';
    var dt = document.createElement('table');
    dt.innerHTML = '<thead><tr><th>Dock</th><th class="num">Ticks to fill</th>' +
      '<th class="num">Rolls per hour</th></tr></thead>';
    var db = document.createElement('tbody');
    m.docks.forEach(function (dock) {
      var tr = document.createElement('tr');
      cell(tr, dock.name);
      cell(tr, String(dock.ticks) + (dock.upgraded !== dock.ticks ? ' (' + dock.upgraded + ')' : ''), 'num');
      cell(tr, IOM.formatNumber(dock.rollsPerHour), 'num');
      db.appendChild(tr);
    });
    dt.appendChild(db);
    dockTable.appendChild(dt);
    host.appendChild(dockTable);

    var dockNote = document.createElement('p');
    dockNote.className = 'hint';
    dockNote.style.marginTop = '10px';
    dockNote.textContent = 'A tick advances every unlocked dock at once, so these rolls happen in parallel. Bracketed numbers are the upgraded tick requirement from skills and tributes. Catch chance per roll needs the fish power rating for that dock, which the export does not carry.';
    host.appendChild(dockNote);

    var dockWrap = document.createElement('label');
    dockWrap.className = 'check';
    dockWrap.style.display = 'inline-flex';
    dockWrap.style.gap = '8px';
    dockWrap.style.margin = '0 0 14px';
    var dockBox = document.createElement('input');
    dockBox.type = 'checkbox';
    dockBox.checked = !!state.tier2Dock;
    dockBox.addEventListener('change', function () {
      state.tier2Dock = dockBox.checked;
      save();
      renderFishing();
    });
    dockWrap.appendChild(dockBox);
    dockWrap.appendChild(document.createTextNode('Fishing a tier 2 dock'));
    host.insertBefore(dockWrap, wrap);

    var warning = document.createElement('p');
    warning.className = 'notice';
    warning.style.margin = '0 0 14px';
    warning.textContent = 'Work in progress. Ticks and rolls per hour are solid. Fish per hour assumes every point of power goes to one dock, which is not how the game works: a tick advances every unlocked dock and your power is split between them. Capacities differ per fish and are not in the export, so per-dock catch rates still need the fish tables.';
    host.insertBefore(warning, cards);

    var note = document.createElement('p');
    note.className = 'hint';
    note.style.marginTop = '14px';
    note.textContent = 'Tick interval is (60 seconds minus your flat reduction) divided by tick speed as a percentage. Value per tick and the shiny chain are checked against the source sheet exactly; the tick interpretation is ours, so if the game disagrees this is the one number to correct.';
    host.appendChild(note);
  }

  function prefillObelisk() {
    if (state.obeliskHp || state.obeliskArmour) return;
    var next = state.obeliskLevel ? IOM.obeliskLookup(state.obeliskLevel + 1) : null;
    if (!next) return;
    state.obeliskHp = String(next.hp);
    state.obeliskArmour = String(next.armour);
    $('obelisk-hp').value = state.obeliskHp;
    $('obelisk-armour').value = state.obeliskArmour;
  }

  function renderObelisk() {
    var host = $('obelisk-results');
    host.innerHTML = '';
    var hp = IOM.parseNumber($('obelisk-hp').value);
    var armour = IOM.parseNumber($('obelisk-armour').value);
    var known = state.obeliskLevel ? IOM.obeliskLookup(state.obeliskLevel + 1) : null;
    var duration = known ? known.duration : 0;
    var m = IOM.obeliskModel(state, isFinite(hp) ? hp : 0, isFinite(armour) ? armour : 0, duration);

    var cards = document.createElement('div');
    cards.className = 'cards';
    [
      { label: 'Average damage per hit', value: IOM.formatNumber(m.perHit) },
      { label: 'Damage per second', value: IOM.formatNumber(m.dps) },
      { label: 'Time to break', value: m.seconds === null ? '-' : IOM.formatDuration(m.seconds / 3600) },
      { label: 'Fights needed', value: m.fights === null ? '-' : IOM.formatNumber(m.fights), sub: m.duration ? m.duration + 's per fight' : 'no fight length for this level' },
    ].forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'card';
      var label = document.createElement('div');
      label.className = 'label';
      label.textContent = item.label;
      var value = document.createElement('div');
      value.className = 'value';
      value.textContent = item.value;
      card.appendChild(label);
      card.appendChild(value);
      cards.appendChild(card);
    });
    host.appendChild(cards);

    var wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    var table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Roll</th><th class="num">Chance</th>' +
      '<th class="num">Multiplier</th><th class="num">Damage</th></tr></thead>';
    var body = document.createElement('tbody');
    m.tiers.forEach(function (tier) {
      var tr = document.createElement('tr');
      cell(tr, tier.name);
      cell(tr, (tier.chance * 100).toFixed(2) + '%', 'num');
      cell(tr, tier.mult > 1 ? IOM.formatNumber(tier.mult) + 'x' : '1x', 'num');
      cell(tr, IOM.formatNumber(tier.hit), 'num');
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    host.appendChild(wrap);

    var note = document.createElement('p');
    note.className = 'hint';
    note.style.marginTop = '14px';
    note.textContent = 'Armour comes off the base hit before crits, so if base damage cannot beat it the obelisk cannot be hurt at all, however high the crit multiplier. Crit rolls are sequential: a super crit needs the crit roll first, which is why the chances multiply.';
    host.appendChild(note);
  }

  function renderStatus() {
    var node = $('status');
    if (!state.version) {
      node.textContent = 'No export loaded. Rates are using the defaults from the source sheet.';
      node.className = 'status';
      return;
    }
    node.textContent = 'Export ' + state.version + ' loaded';
    node.className = 'status loaded';
  }

  var ANY_ORE = 'any';

  function fillOreSelect(select, allowAny) {
    var keep = select.value;
    var first = null;
    var kept = false;
    select.innerHTML = '';
    if (allowAny) {
      var any = document.createElement('option');
      any.value = ANY_ORE;
      any.textContent = 'Any ore';
      select.appendChild(any);
      first = ANY_ORE;
      if (keep === ANY_ORE) kept = true;
    }
    DATA.ores.forEach(function (ore) {
      var unlocked = IOM.isOreUnlocked(ore.id, state);
      if (!unlocked && !state.showLockedOres) return;
      var value = String(ore.id);
      if (first === null) first = value;
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = unlocked ? ore.name : ore.name + ' (locked)';
      select.appendChild(opt);
      if (value === keep) kept = true;
    });
    select.value = kept ? keep : (first || '');
  }

  function fillVeinSelect(select) {
    var keep = select.value;
    var first = null;
    var kept = false;
    select.innerHTML = '';
    DATA.veins.forEach(function (vein) {
      var unlocked = !state.worldsUnlocked || vein.world <= state.worldsUnlocked;
      if (!unlocked && !state.showLockedOres) return;
      var value = vein.name;
      if (first === null) first = value;
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = unlocked ? vein.name : vein.name + ' (locked)';
      select.appendChild(opt);
      if (value === keep) kept = true;
    });
    select.value = kept ? keep : (first || '');
  }

  function refreshOreSelects() {
    fillOreSelect($('floor-ore'), true);
    fillVeinSelect($('floor-vein'));
    fillOreSelect($('farm-ore'), false);
    document.querySelectorAll('.ore-locked').forEach(function (box) {
      box.checked = !!state.showLockedOres;
    });
  }

  function humanise(name) {
    return String(name)
      .replace(/_/g, ' ')
      .replace(/ multi$/, ' multiplier')
      .replace(/ percent$/, ' (%)')
      .replace(/ seconds$/, ' (seconds)')
      .replace(/^is /, '');
  }

  function explainRow(row) {
    var verbs = { add: 'adds to', multiply: 'multiplies', independent: 'adds independently to', replace: 'replaces' };
    var bases = {
      literal: 'typed in by hand on this row',
      stat: 'taken from your export',
      floorDebuff: 'the debuff on the floor you exported from',
    };
    return row.source + ' (' + row.section + ') ' + (verbs[row.method] || 'modifies') + ' ' +
      humanise(row.stat) + '. The starting value is ' + (bases[row.base.kind] || 'provided') + '.';
  }

  function tip(el, text) {
    var body = document.createElement('div');
    body.className = 'tip-body';
    body.textContent = text;
    el.appendChild(body);
    el.tabIndex = 0;
  }

  function cell(row, text, cls) {
    var td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    row.appendChild(td);
    return td;
  }

  // ---------------------------------------------------------------- stats

  function renderStats() {
    var body = document.querySelector('#stat-table tbody');
    body.innerHTML = '';

    var manual = DATA.stats.filter(function (stat) { return !state.fromExport[stat.name]; });
    var needed = manual.filter(function (stat) {
      return IOM.MATHS_STATS.has(stat.name) && !IOM.DRIVEN_STATS.has(stat.name);
    });
    var summary = $('stat-summary');
    if (!state.version) {
      summary.textContent = '';
    } else if (!needed.length) {
      summary.textContent = 'Every rate is complete from your export. ' +
        (manual.length ? manual.length + ' tracked stats were not in it, but none of them change a number.' : '');
    } else {
      summary.textContent = needed.length + ' stat' + (needed.length === 1 ? '' : 's') +
        ' that the calculators use did not come from your export: ' +
        needed.map(function (s2) { return s2.name; }).join(', ') + '. Type over them below.';
    }

    DATA.stats.forEach(function (stat) {
      var tr = document.createElement('tr');
      var nameCell = cell(tr, stat.name);
      nameCell.className = 'tip';
      tip(nameCell, humanise(stat.name) + ' (' + stat.type + '). ' +
        (state.fromExport[stat.name] ? 'Came from your export.' : 'Not in your export, so type a value here.'));
      if (!state.fromExport[stat.name]) {
        var badge = document.createElement('span');
        badge.className = 'manual';
        badge.textContent = 'manual';
        nameCell.appendChild(badge);
      }
      cell(tr, IOM.statType(stat.name));

      var inputCell = document.createElement('td');
      var input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.value = String(state.imported[stat.name]);
      input.addEventListener('change', function () {
        var parsed = IOM.parseNumber(input.value);
        if (!isFinite(parsed)) { input.value = String(state.imported[stat.name]); return; }
        state.imported[stat.name] = parsed;
        delete state.fromExport[stat.name];
        save();
        recalc();
        renderStats();
        renderFloors();
        renderFarm();
        renderBomb();
      });
      inputCell.appendChild(input);
      tr.appendChild(inputCell);

      cell(tr, '-', 'num total-cell');
      cell(tr, '-', 'num formatted-cell');
      body.appendChild(tr);
    });

    updateStatTotals();
  }

  function updateStatTotals() {
    var rows = document.querySelectorAll('#stat-table tbody tr');
    DATA.stats.forEach(function (stat, index) {
      var tr = rows[index];
      if (!tr) return;
      var value = built.totals[stat.name];
      tr.querySelector('.total-cell').textContent = IOM.formatNumber(value);
      tr.querySelector('.formatted-cell').textContent = IOM.formatValue(value, stat.type);
    });
  }

  function renderMods() {
    var host = $('mod-sources');
    host.innerHTML = '';

    var sections = {};
    DATA.input.forEach(function (row, index) {
      if (row.method === 'replace') return;
      // Floor rows come from the floor debuff table and follow the export floor.
      if (row.section === 'Floor') return;
      row.__index = index;
      (sections[row.section] = sections[row.section] || []).push(row);
    });

    Object.keys(sections).forEach(function (name) {
      var details = document.createElement('details');
      var summary = document.createElement('summary');
      summary.textContent = name + ' (' + sections[name].length + ')';
      details.appendChild(summary);

      var grid = document.createElement('div');
      grid.className = 'mod-grid';

      ['Source', 'Base', 'At export', 'In calc'].forEach(function (label) {
        var span = document.createElement('span');
        span.className = 'head';
        span.textContent = label;
        grid.appendChild(span);
      });

      sections[name].forEach(function (row) {
        var index = row.__index;
        var toggle = state.toggles[index];
        if (!toggle) return;

        var src = document.createElement('span');
        src.className = 'src tip';
        src.textContent = row.source + ' → ' + humanise(row.stat);
        tip(src, explainRow(row));
        grid.appendChild(src);

        var baseCell = document.createElement('span');
        if (row.base.kind === 'literal') {
          var input = document.createElement('input');
          input.type = 'text';
          input.inputMode = 'decimal';
          input.value = String(Object.prototype.hasOwnProperty.call(state.bases, index) ? state.bases[index] : row.base.value);
          input.style.width = '90px';
          input.addEventListener('change', function () {
            var parsed = IOM.parseNumber(input.value);
            if (!isFinite(parsed)) { input.value = String(baseOf(row, index)); return; }
            state.bases[index] = parsed;
            save(); recalc(); renderStats(); renderFloors(); renderFarm(); renderBomb();
          });
          baseCell.appendChild(input);
        } else {
          baseCell.textContent = IOM.formatNumber(baseOf(row, index))
            + (row.base.kind === 'stat' ? ' (from export)' : ' (floor debuff)');
          baseCell.style.color = 'var(--muted)';
          baseCell.className = 'tip';
          tip(baseCell, row.base.kind === 'stat'
            ? 'Comes from your export, not from this row. Toggle it to see what removing or adding it would do.'
            : 'The stat penalty on the floor you exported from.');
        }
        grid.appendChild(baseCell);

        [['export', 'At export'], ['use', 'In calc']].forEach(function (pair) {
          var holder = document.createElement('span');
          var box = document.createElement('input');
          box.type = 'checkbox';
          box.checked = !!toggle[pair[0]];
          box.addEventListener('change', function () {
            toggle[pair[0]] = box.checked ? 1 : 0;
            save(); recalc(); renderStats(); renderFloors(); renderFarm(); renderBomb();
          });
          holder.appendChild(box);
          grid.appendChild(holder);
        });
      });

      details.appendChild(grid);
      host.appendChild(details);
    });
  }

  function baseOf(row, index) {
    if (Object.prototype.hasOwnProperty.call(state.bases, index)) return state.bases[index];
    if (row.base.kind === 'literal') return row.base.value;
    if (row.base.kind === 'stat') return state.imported[row.base.key] || 0;
    return 0;
  }

  // ------------------------------------------------------------- best floor

  function renderVeinFloor() {
    var host = $('floor-results');
    var vein = IOM.veinByName($('floor-vein').value);
    host.innerHTML = '';
    if (!vein) {
      host.textContent = 'Pick a vein.';
      return;
    }

    var model = IOM.veinModel(state, vein);
    var best = model.rows[0];
    if (!best) {
      host.textContent = 'No floors for that vein.';
      return;
    }

    var cards = document.createElement('div');
    cards.className = 'cards';
    [
      { label: 'Best floor', value: String(best.floorId), sub: vein.name },
      { label: 'Veins per hour', value: IOM.formatNumber(best.rate) },
      { label: 'Veins per screen', value: IOM.formatNumber(model.veinsPerScreen) },
      { label: 'Variant multiplier', value: IOM.formatNumber(model.variant) + 'x' },
    ].forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'card';
      var label = document.createElement('div');
      label.className = 'label';
      label.textContent = item.label;
      var value = document.createElement('div');
      value.className = 'value';
      value.textContent = item.value;
      card.appendChild(label);
      card.appendChild(value);
      if (item.sub) {
        var sub = document.createElement('p');
        sub.className = 'sub';
        sub.textContent = item.sub;
        card.appendChild(sub);
      }
      cards.appendChild(card);
    });
    host.appendChild(cards);

    var wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    var table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Rank</th><th>Floor</th><th>Vein</th>' +
      '<th class="num">Veins/hr</th></tr></thead>';
    var body = document.createElement('tbody');
    model.rows.forEach(function (row, index) {
      var tr = document.createElement('tr');
      cell(tr, String(index + 1));
      cell(tr, String(row.floorId));
      cell(tr, vein.name);
      cell(tr, IOM.formatNumber(row.rate), 'num');
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    host.appendChild(wrap);

    var note = document.createElement('p');
    note.className = 'hint';
    note.style.marginTop = '14px';
    note.textContent = vein.name + ' runs floors ' + vein.firstFloor + ' to ' + vein.lastFloor +
      ' at rarity ' + vein.rarity + '. ' + (state.voidDrone
        ? 'Void portals are on at your ' +
          (IOM.resolve(state).totals.void_portal_chance * 100).toFixed(0) +
          '% chance, so a portaled ore can turn into a vein of its own zone.'
        : 'No Void Drone, so void portals are ignored, the same as the source sheet.');
    host.appendChild(note);
  }

  function renderFloors() {
    if ($('floor-mode').value === 'vein') {
      renderVeinFloor();
      return;
    }
    var selected = $('floor-ore').value;
    var anyOre = selected === ANY_ORE;
    var oreId = Number(selected);
    var metric = $('floor-metric').value;
    var useVoid = $('floor-void').checked;
    var host = $('floor-results');
    host.innerHTML = '';

    var ranked = anyOre
      ? IOM.rankAll(built.rows, metric, useVoid)
      : IOM.rankFloors(built.rows, oreId, metric, useVoid);
    if (!ranked.length) {
      host.textContent = 'No floor produces that ore with the current settings.';
      return;
    }

    var cards = document.createElement('div');
    cards.className = 'cards';
    var best = ranked[0];
    [
      { label: 'Best floor', value: String(best.floorId), sub: best.zone + ' · ' + best.oreName },
      { label: 'Ore per hour', value: IOM.formatNumber(best.oreHr) },
      { label: 'Bars per hour', value: IOM.formatNumber(best.barHr) },
      { label: 'Gold per hour', value: IOM.formatNumber(best.goldHr) },
    ].forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'card';
      var label = document.createElement('div');
      label.className = 'label';
      label.textContent = item.label;
      var value = document.createElement('div');
      value.className = 'value';
      value.textContent = item.value;
      card.appendChild(label);
      card.appendChild(value);
      if (item.sub) {
        var sub = document.createElement('p');
        sub.className = 'sub';
        sub.textContent = item.sub;
        card.appendChild(sub);
      }
      cards.appendChild(card);
    });
    host.appendChild(cards);

    var wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    var table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Rank</th><th>Floor</th><th>Zone</th><th>Ore</th>' +
      '<th class="num">Ore/hr</th><th class="num">Craft/hr</th><th class="num">Trans/hr</th>' +
      '<th class="num">Bars/hr</th><th class="num">Gold/hr</th></tr></thead>';
    var body = document.createElement('tbody');
    ranked.slice(0, 10).forEach(function (row, index) {
      var tr = document.createElement('tr');
      cell(tr, String(index + 1));
      cell(tr, String(row.floorId));
      cell(tr, row.zone);
      cell(tr, row.oreName);
      cell(tr, IOM.formatNumber(row.oreHr), 'num');
      cell(tr, IOM.formatNumber(row.craftHr), 'num');
      cell(tr, IOM.formatNumber(row.transHr), 'num');
      cell(tr, IOM.formatNumber(row.barHr), 'num');
      cell(tr, IOM.formatNumber(row.goldHr), 'num');
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    host.appendChild(wrap);

    if (anyOre && metric !== 'gold') {
      var note = document.createElement('p');
      note.className = 'hint';
      note.style.marginTop = '14px';
      note.textContent = 'Bars and ore are not worth the same from one ore to the next, so this only compares raw amounts. Switch to gold per hour for a like for like comparison.';
      host.appendChild(note);
    }
  }

  // -------------------------------------------------------------- farm time

  function renderFarm() {
    var oreId = Number($('farm-ore').value);
    var amount = IOM.parseNumber($('farm-amount').value);
    var unit = $('farm-unit').value;
    var useVoid = $('farm-void').checked;
    var host = $('farm-results');
    host.innerHTML = '';

    if (!isFinite(amount) || amount <= 0) {
      host.textContent = 'That is not an amount. Try 75000000, 75m or 7.5e7.';
      return;
    }

    var result = IOM.farmTime(built.rows, oreId, amount, unit, useVoid);
    if (!result) {
      host.textContent = 'No floor produces that ore with the current settings.';
      return;
    }

    var perHour = unit === 'bar' ? 'bars' : 'ore';
    var cards = document.createElement('div');
    cards.className = 'cards';
    [
      { label: 'Time needed', value: IOM.formatDuration(result.hours) },
      { label: 'Rate on the best floor', value: IOM.formatNumber(result.rate) + ' ' + perHour + '/hr' },
      { label: 'Farm on floor', value: String(result.row.floorId), sub: result.row.zone },
      { label: 'Amount per hour', value: IOM.formatNumber(result.rate * 24), sub: 'if you leave it running a day' },
    ].forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'card';
      var label = document.createElement('div');
      label.className = 'label';
      label.textContent = item.label;
      var value = document.createElement('div');
      value.className = 'value';
      value.textContent = item.value;
      card.appendChild(label);
      card.appendChild(value);
      if (item.sub) {
        var sub = document.createElement('p');
        sub.className = 'sub';
        sub.textContent = item.sub;
        card.appendChild(sub);
      }
      cards.appendChild(card);
    });
    host.appendChild(cards);
  }

  // ------------------------------------------------------------------- bomb

  function renderBomb() {
    var host = $('bomb-results');
    host.innerHTML = '';

    var model = IOM.bombModel(state);
    var plentyRange = 'Every floor';
    var transmuteRange = 'None';
    if (model.allTransmuter) {
      plentyRange = 'None';
      transmuteRange = 'Every floor';
    } else if (!model.allPlenty) {
      plentyRange = '1 to ' + (model.flip.floor - 1);
      transmuteRange = model.flip.floor + ' and up';
    }

    var cards = document.createElement('div');
    cards.className = 'cards';
    [
      { label: 'Bomb of Plenty', value: plentyRange },
      { label: 'Transmuter', value: transmuteRange },
      { label: 'Break-even', value: IOM.formatNumber(model.breakEven), sub: 'ore per bar' },
    ].forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'card';
      var label = document.createElement('div');
      label.className = 'label';
      label.textContent = item.label;
      var value = document.createElement('div');
      value.className = 'value';
      value.textContent = item.value;
      card.appendChild(label);
      card.appendChild(value);
      if (item.sub) {
        var sub = document.createElement('p');
        sub.className = 'sub';
        sub.textContent = item.sub;
        card.appendChild(sub);
      }
      cards.appendChild(card);
    });
    host.appendChild(cards);

    var note = document.createElement('p');
    note.className = 'hint';
    if (model.allTransmuter) {
      note.textContent = 'Every ore costs more than ' + IOM.formatNumber(model.breakEven) +
        ' ore per bar, so the Transmuter wins on all of them.';
    } else if (model.allPlenty) {
      note.textContent = 'No ore costs more than ' + IOM.formatNumber(model.breakEven) +
        ' ore per bar, so Bomb of Plenty stays ahead on all of them.';
    } else {
      note.textContent = 'It flips at ' + model.flip.name + ', first seen on floor ' + model.flip.floor +
        ', where a bar costs ' + model.flip.cost + ' ore. Cheaper bars go further when the ore is multiplied, dearer bars go further when the Transmuter drops them.';
    }
    host.appendChild(note);

    // Show the ores either side of the flip so the reasoning is visible.
    var index = model.ores.findIndex(function (ore) { return ore.fitsTransmuter; });
    var from = index < 0 ? Math.max(0, model.ores.length - 9) : Math.max(0, index - 5);
    var slice = model.ores.slice(from, from + 12);

    var wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    var table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Ore</th><th class="num">Ore per bar</th>' +
      '<th class="num">From floor</th><th>Better bomb</th></tr></thead>';
    var body = document.createElement('tbody');
    slice.forEach(function (ore) {
      var tr = document.createElement('tr');
      cell(tr, ore.name);
      cell(tr, String(ore.cost), 'num');
      cell(tr, ore.floor === null ? '-' : String(ore.floor), 'num');
      var pick = document.createElement('td');
      var span = document.createElement('span');
      if (ore.fitsTransmuter) span.className = 'winner';
      span.textContent = ore.fitsTransmuter ? 'Transmuter' : 'Bomb of Plenty';
      pick.appendChild(span);
      tr.appendChild(pick);
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    host.appendChild(wrap);
  }

  // -------------------------------------------------------------------- init

  function syncVoidBoxes() {
    ['floor-void', 'farm-void', 'vein-portals'].forEach(function (id) {
      var node = $(id);
      if (node) node.checked = !!state.voidDrone;
    });
  }

  function refreshAll() {
    renderStatus();
    syncVoidBoxes();
  refreshOreSelects();
    renderCards();
    $('bomb-in-use').value = state.bomb;
    renderMods();
    renderStats();
    renderFloors();
    renderFarm();
    renderBomb();
    renderFishing();
    renderObelisk();
  }

  function showTab(name) {
    document.querySelectorAll('#tabs button').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === name);
    });
    document.querySelectorAll('.panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === 'panel-' + name);
    });
  }

  document.querySelectorAll('#tabs button').forEach(function (btn) {
    btn.addEventListener('click', function () { showTab(btn.dataset.tab); });
  });

  $('do-import').addEventListener('click', function () {
    var report = $('import-report');
    try {
      var parsed = IOM.parseExport($('export-text').value);
      var result = IOM.applyExport(state, parsed);
      syncBombToggles();
      prefillObelisk();
      save();
      recalc();
      refreshAll();
      report.className = 'notice ok';
      var missing = DATA.stats.filter(function (stat) {
        return !state.fromExport[stat.name] && IOM.MATHS_STATS.has(stat.name) && !IOM.DRIVEN_STATS.has(stat.name);
      });
      report.textContent = 'Imported ' + result.known.length + ' stats from ' + (parsed.version || 'the export') + '.';
      report.textContent += missing.length
        ? ' Still needed by the calculators: ' + missing.map(function (s2) { return s2.name; }).join(', ') + '.'
        : ' Every rate is now complete, nothing to fill in.';
      if (result.unknown.length) {
        report.textContent += ' ' + result.unknown.length + ' keys are not used yet.';
      }
    } catch (err) {
      report.className = 'notice';
      report.textContent = err.message;
    }
  });

  $('do-reset').addEventListener('click', function () {
    if (!window.confirm('Clear the imported export and every adjustment?')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
    state = IOM.emptyState();
    $('export-text').value = '';
    recalc();
    refreshAll();
  });

  ['floor-ore', 'floor-metric', 'floor-vein'].forEach(function (id) {
    $(id).addEventListener('change', renderFloors);
  });
  $('floor-void').addEventListener('change', function () {
    state.voidDrone = $('floor-void').checked;
    syncVoidBoxes();
    save();
    renderFloors();
    renderFarm();
  });

  $('floor-mode').addEventListener('change', function () {
    var veins = $('floor-mode').value === 'vein';
    $('floor-vein-label').style.display = veins ? '' : 'none';
    $('floor-ore-label').style.display = veins ? 'none' : '';
    $('floor-metric-label').style.display = veins ? 'none' : '';
    renderFloors();
  });

  [['vein-morph', 'veinMorph'], ['vein-golden', 'veinGolden'], ['w4-speed', 'w4SpeedMod']].forEach(function (pair) {
    $(pair[0]).value = String(state[pair[1]]);
    $(pair[0]).addEventListener('change', function () {
      var value = IOM.parseNumber($(pair[0]).value);
      if (!isFinite(value)) { $(pair[0]).value = String(state[pair[1]]); return; }
      state[pair[1]] = value / 100;
      if (pair[1] === 'w4SpeedMod') state[pair[1]] = value;
      save();
      recalc();
      renderFloors();
    });
  });
  $('vein-portals').checked = !!state.voidDrone;
  $('vein-portals').addEventListener('change', function () {
    state.voidDrone = $('vein-portals').checked;
    syncVoidBoxes();
    save();
    recalc();
    renderFloors();
    renderFarm();
  });

  $('w3-speed').checked = !!state.w3SpeedFix;
  $('w3-speed').addEventListener('change', function () {
    state.w3SpeedFix = $('w3-speed').checked;
    save();
    recalc();
    renderFloors();
  });
  ['farm-ore', 'farm-amount', 'farm-unit'].forEach(function (id) {
    $(id).addEventListener('input', renderFarm);
    $(id).addEventListener('change', renderFarm);
  });
  $('farm-void').addEventListener('change', function () {
    state.voidDrone = $('farm-void').checked;
    syncVoidBoxes();
    save();
    renderFloors();
    renderFarm();
  });

  $('obelisk-hp').value = state.obeliskHp || '';
  $('obelisk-armour').value = state.obeliskArmour || '';
  prefillObelisk();
  ['obelisk-hp', 'obelisk-armour'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      var value = $(id).value;
      if (id === 'obelisk-hp') state.obeliskHp = value; else state.obeliskArmour = value;
      save();
      renderObelisk();
    });
  });

  fillBombInUse();
  renderCards();
  bindCard('card-ore', 'ore');
  bindCard('card-bar', 'bar');

  document.querySelectorAll('.ore-locked').forEach(function (box) {
    box.addEventListener('change', function () {
      state.showLockedOres = box.checked;
      save();
      syncVoidBoxes();
  refreshOreSelects();
      renderFloors();
      renderFarm();
    });
  });
  syncVoidBoxes();
  refreshOreSelects();
  recalc();
  refreshAll();
})();
