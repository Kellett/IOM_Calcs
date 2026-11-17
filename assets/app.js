(function () {
  'use strict';

  var IOM = window.IOM;
  var DATA = IOM.data;
  var STORAGE_KEY = 'iom-calc-state-v1';

  var state = load();
  var built = null;

  function $(id) { return document.getElementById(id); }

  function numGems(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

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
      if (typeof saved.fishingDock === 'string' && saved.fishingDock) base.fishingDock = saved.fishingDock;
      if (isFinite(Number(saved.fishingPlaytime))) base.fishingPlaytime = Number(saved.fishingPlaytime);
      if (isFinite(Number(saved.gemsPerHour))) base.gemsPerHour = Number(saved.gemsPerHour);
      if (saved.gemsManualRate !== undefined) base.gemsManualRate = !!saved.gemsManualRate;
      if (Array.isArray(saved.fishingUpgrades)) base.fishingUpgrades = saved.fishingUpgrades;
      if (Array.isArray(saved.fishingEnhance)) base.fishingEnhance = saved.fishingEnhance;
      if (Array.isArray(saved.fishingSkills)) base.fishingSkills = saved.fishingSkills;
      if (Array.isArray(saved.fishingTributes)) base.fishingTributes = saved.fishingTributes;
      if (saved.raw && typeof saved.raw === 'object') base.raw = saved.raw;
      if (saved.gems && typeof saved.gems === 'object') {
        Object.keys(base.gems).forEach(function (k) {
          if (saved.gems[k] !== undefined) base.gems[k] = saved.gems[k];
        });
      }
      if (saved.obeliskHp !== undefined) base.obeliskHp = saved.obeliskHp;
      if (saved.obeliskArmour !== undefined) base.obeliskArmour = saved.obeliskArmour;
      if (saved.obeliskRelic !== undefined) base.obeliskRelic = saved.obeliskRelic;
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

    var dockRow = document.createElement('label');
    dockRow.className = 'check';
    dockRow.style.display = 'inline-flex';
    dockRow.style.gap = '8px';
    dockRow.style.margin = '0 0 14px';
    var dockName = document.createElement('span');
    dockName.textContent = 'Dock';
    var dockSelect = document.createElement('select');
    IOM.dockNames().forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      dockSelect.appendChild(opt);
    });
    dockSelect.value = state.fishingDock;
    dockSelect.addEventListener('change', function () {
      state.fishingDock = dockSelect.value;
      save();
      renderFishing();
    });
    dockRow.appendChild(dockName);
    dockRow.appendChild(dockSelect);
    host.appendChild(dockRow);

    var playRow = document.createElement('label');
    playRow.className = 'check';
    playRow.style.display = 'inline-flex';
    playRow.style.gap = '8px';
    playRow.style.margin = '14px 0 0';
    var playName = document.createElement('span');
    playName.textContent = 'Lootbug active hours per day';
    var playInput = document.createElement('input');
    playInput.type = 'number';
    playInput.min = '0';
    playInput.max = '24';
    playInput.step = '1';
    playInput.style.width = '70px';
    playInput.value = String(m.playtime);
    playInput.addEventListener('change', function () {
      var value = Number(playInput.value);
      if (!isFinite(value) || value < 0 || value > 24) {
        playInput.value = String(state.fishingPlaytime);
        return;
      }
      state.fishingPlaytime = value;
      save();
      renderFishing();
    });
    playRow.appendChild(playName);
    playRow.appendChild(playInput);
    host.appendChild(playRow);

    var gemsRow = document.createElement('div');
    gemsRow.className = 'controls';
    gemsRow.style.margin = '14px 0 0';
    var gemsLabel = document.createElement('label');
    var gemsName = document.createElement('span');
    gemsName.textContent = 'Gems per hour';
    var gemsInput = document.createElement('input');
    gemsInput.type = 'number';
    gemsInput.min = '0';
    gemsInput.step = '1';
    gemsInput.style.width = '90px';
    var manual = !!state.gemsManualRate;
    var gemRate = IOM.gemsIncome(state);
    gemsInput.readOnly = !manual;
    gemsInput.value = String(Math.round(gemRate));
    gemsInput.title = manual
      ? 'Your own figure, used for the time-to-afford column.'
      : 'Net gems per hour from the Gems tab. Tick the box to type your own.';
    gemsInput.addEventListener('change', function () {
      var value = Number(gemsInput.value);
      if (!isFinite(value) || value < 0) {
        gemsInput.value = String(Math.round(IOM.gemsIncome(state)));
        return;
      }
      state.gemsPerHour = value;
      save();
      renderFishing();
    });
    gemsLabel.appendChild(gemsName);
    gemsLabel.appendChild(gemsInput);
    gemsRow.appendChild(gemsLabel);

    var manualLabel = document.createElement('label');
    manualLabel.className = 'check';
    var manualBox = document.createElement('input');
    manualBox.type = 'checkbox';
    manualBox.checked = manual;
    manualBox.addEventListener('change', function () {
      state.gemsManualRate = manualBox.checked;
      save();
      renderFishing();
    });
    var manualText = document.createElement('span');
    manualText.textContent = 'Type my own rate';
    manualLabel.appendChild(manualBox);
    manualLabel.appendChild(manualText);
    gemsRow.appendChild(manualLabel);
    host.appendChild(gemsRow);

    if (!manual && !state.version) {
      var gemsHint = document.createElement('p');
      gemsHint.className = 'hint';
      gemsHint.textContent = 'Import an export to fill this from the Gems tab.';
      host.appendChild(gemsHint);
    }

    var warning = document.createElement('p');
    warning.className = 'notice';
    warning.style.margin = '0 0 14px';
    warning.textContent = 'Work in progress. Tick rate now covers the clock, lootbug ticks and the double/triple/5x chain. Fish per hour assumes every point of power is on the selected dock and uses its base tick requirement; the upgraded column shows the other case. Catch chance per roll still needs the fish power ratings, which are not in the export.';
    host.appendChild(warning);

    var cards = document.createElement('div');
    cards.className = 'cards';
    [
      { label: 'Ticks per hour', value: IOM.formatNumber(m.ticksPerHour), sub: IOM.formatNumber(m.clockTicks) + ' clock + ' + IOM.formatNumber(m.lootbugTicks) + ' lootbug' },
      { label: 'Tick interval', value: m.interval.toFixed(2) + 's', sub: '60s base less ' + IOM.formatNumber(m.reduction) + 's reduction' },
      { label: 'Fish per catch', value: IOM.formatNumber(m.perCatch), sub: m.dockName + ', all power there' },
      { label: m.dockName + ' fish per hour', value: IOM.formatNumber(m.fishPerHour), sub: m.dockTicks + ' ticks per catch' },
      { label: 'Lootbug ticks', value: IOM.formatNumber(m.lootbugTicks), sub: 'per hour on top of the clock' },
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
      ['Dock power', IOM.formatNumber(m.dockPower) + 'x' + (m.tier2 ? ' (tier 2)' : ' (tier 1)')],
      ['Shiny chance / multi', (m.shiny * 100).toFixed(1) + '% at ' + IOM.formatNumber(m.shinyMulti) + 'x'],
      ['Super shiny chance / multi', (m.superShiny * 100).toFixed(1) + '% at ' + IOM.formatNumber(m.superMulti) + 'x'],
      ['Income multiplier', IOM.formatNumber(m.income) + 'x'],
      ['Tick reduction', IOM.formatNumber(m.reduction) + 's'],
      ['Tick speed stat', IOM.formatNumber(m.speed * 100) + '% (not used)'],
      ['Lootbug spawn / triple / loot', IOM.formatNumber(m.lootSpawn) + ' / ' + (m.lootTriple * 100).toFixed(0) + '% / ' + IOM.formatNumber(m.lootMulti) + 'x'],
      ['Lootbug active hours', m.playtime + ' per day'],
      ['Expected ticks per event', IOM.formatNumber(m.expectedTicks)],
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
      '<th class="num">Rolls per hour</th><th class="num">Upgraded</th></tr></thead>';
    var db = document.createElement('tbody');
    m.docks.forEach(function (dock) {
      var tr = document.createElement('tr');
      cell(tr, dock.name);
      cell(tr, String(dock.ticks) + (dock.upgraded !== dock.ticks ? ' (' + dock.upgraded + ')' : ''), 'num');
      cell(tr, IOM.formatNumber(dock.rollsPerHour), 'num');
      cell(tr, IOM.formatNumber(dock.rollsPerHourUpgraded), 'num');
      db.appendChild(tr);
    });
    dt.appendChild(db);
    dockTable.appendChild(dt);
    host.appendChild(dockTable);

    var dockNote = document.createElement('p');
    dockNote.className = 'hint';
    dockNote.style.marginTop = '10px';
    dockNote.textContent = 'A tick advances every unlocked dock at once, so these rolls happen in parallel. Bracketed numbers are the upgraded tick requirement from skills and tributes.';
    host.appendChild(dockNote);

    var adv = IOM.fishingAdvisor(state);
    var advTitle = document.createElement('h3');
    advTitle.textContent = 'Upgrade advisor';
    host.appendChild(advTitle);

    var advNote = document.createElement('p');
    advNote.className = 'hint';
    advNote.textContent = 'Only purchases that are not maxed. Growth is the change in fish per hour on this dock; rank is growth per million of the cost, so fish and gem rows are ranked separately. Time uses this dock and the gems per hour above.';
    host.appendChild(advNote);

    if (!adv.rows.length) {
      var done = document.createElement('p');
      done.className = 'hint';
      done.textContent = 'Every modelled purchase is maxed.';
      host.appendChild(done);
    } else if (!(adv.fishPerHour > 0)) {
      var need = document.createElement('p');
      need.className = 'hint';
      need.textContent = 'Import an export first. The ranking needs a fish rate to measure growth against.';
      host.appendChild(need);
    } else {
    ['Fish upgrades', 'Gem enhancements', 'Skill tree'].forEach(function (group) {
      var groupRows = adv.rows.filter(function (row) { return row.group === group; });
      if (!groupRows.length) return;
      var heading = document.createElement('h4');
      heading.textContent = group;
      host.appendChild(heading);

      var advWrap = document.createElement('div');
      advWrap.className = 'table-scroll';
      var unit = group === 'Fish upgrades' ? 'fish' : 'gems';
      var advTable = document.createElement('table');
      advTable.innerHTML = '<thead><tr><th>Purchase</th><th class="num">Level</th>' +
        '<th class="num">Next cost</th><th class="num">Growth</th>' +
        '<th class="num">Gain per million ' + unit + '</th><th class="num">Time</th><th>Note</th></tr></thead>';
      var advBody = document.createElement('tbody');
      groupRows.forEach(function (row) {
        var tr = document.createElement('tr');
        cell(tr, row.name);
        cell(tr, row.level + ' / ' + row.max, 'num');
        cell(tr, IOM.formatNumber(row.cost) + ' ' + row.currency, 'num');
        cell(tr, row.growth === null ? '-' : (row.growth * 100).toFixed(2) + '%', 'num');
        cell(tr, row.rank === null ? '-' : row.rank.toFixed(2), 'num');
        cell(tr, row.time === null ? '-' : IOM.formatDuration(row.time), 'num');
        cell(tr, row.note || '');
        advBody.appendChild(tr);
      });
      advTable.appendChild(advBody);
      advWrap.appendChild(advTable);
      host.appendChild(advWrap);
    });
    }

    var advFoot = document.createElement('p');
    advFoot.className = 'hint';
    advFoot.textContent = 'Fish cards and legendary tributes are not in this ranking. Their growth needs per-fish power ratings and tribute costs, which the sheet keeps as a separate planner.';
    host.appendChild(advFoot);

    var note = document.createElement('p');
    note.className = 'hint';
    note.style.marginTop = '14px';
    note.textContent = 'Tick interval is 60 seconds less the flat Fishing Tick Reduction stat, which already includes every source. The wiki gives the same base, and both community sheets compute the same figure from upgrade levels. The tick speed stat is shown for reference and is not a divisor. Lootbug ticks follow the new sheet: base cooldown, game speed, spawn rate, triple chance and loot multiplier, scaled by active hours. Fish per hour uses the total tick rate, so it reads higher than the sheet main Fish/Time cell, which counts the clock only. Angler ticks are not included because the export does not carry the Angler level.';
    host.appendChild(note);
  }

  function prefillObelisk() {
    if (state.obeliskHp || state.obeliskArmour) return;
    var next = state.obeliskLevel ? IOM.obeliskLookup(state.obeliskLevel + 1, state.armourFactor) : null;
    if (!next) return;
    state.obeliskHp = String(next.hp);
    state.obeliskArmour = String(next.armour);
    $('obelisk-hp').value = state.obeliskHp;
    $('obelisk-armour').value = state.obeliskArmour;
  }

  function gemsSelect(labelText, options, value, handler) {
    var label = document.createElement('label');
    label.textContent = labelText;
    var select = document.createElement('select');
    options.forEach(function (pair) {
      var opt = document.createElement('option');
      opt.value = pair[0];
      opt.textContent = pair[1];
      select.appendChild(opt);
    });
    select.value = value;
    select.addEventListener('change', function () { handler(select.value); });
    label.appendChild(select);
    return label;
  }

  function gemsNumber(labelText, value, step, handler) {
    var label = document.createElement('label');
    label.textContent = labelText;
    var input = document.createElement('input');
    input.type = 'number';
    input.step = String(step || 1);
    input.min = '0';
    input.style.width = '90px';
    input.value = String(value);
    input.addEventListener('change', function () {
      var parsed = Number(input.value);
      if (!isFinite(parsed) || parsed < 0) { input.value = String(value); return; }
      handler(parsed);
    });
    label.appendChild(input);
    return label;
  }

  function renderGems() {
    var host = $('gems-results');
    var controls = $('gems-controls');
    host.innerHTML = '';
    controls.innerHTML = '';

    if (!state.version) {
      var empty = document.createElement('p');
      empty.className = 'notice';
      empty.textContent = 'Import your export first. The gem receipt needs a good deal more of it than the ore maths does.';
      host.appendChild(empty);
      return;
    }

    function changed() {
      save();
      renderGems();
      renderFishing();
    }

    var m = IOM.gemsModel(state);
    var g = state.gems;

    var row = document.createElement('div');
    row.className = 'controls';
    row.appendChild(gemsSelect('Autofiring', [
      ['gem', 'Gem bomb'], ['battery', 'Battery bomb'], ['d20', 'D20 bomb'],
      ['cherry', 'Cherry bomb'], ['plenty', 'Bomb of Plenty'],
      ['transmuter', 'Transmuter'], ['veinmorpher', 'Veinmorpher'],
    ], g.autofire, function (v) { g.autofire = v; changed(); }));
    row.appendChild(gemsSelect('Cherry charges go to', [
      ['gem', 'Gem bombs'], ['battery', 'Battery bomb'], ['d20', 'D20 bomb'],
    ], g.cherryTarget, function (v) { g.cherryTarget = v; changed(); }));
    row.appendChild(gemsNumber('Bombs unlocked', g.bombsUnlocked, 1, function (v) {
      g.bombsUnlocked = Math.round(v); changed();
    }));
    row.appendChild(gemsNumber('Stonks gems', g.stonksGems, 1, function (v) { g.stonksGems = v; changed(); }));
    row.appendChild(gemsNumber('Lootbug spawn (game min)', g.spawnMinutes, 0.1, function (v) { g.spawnMinutes = v; changed(); }));
    row.appendChild(gemsNumber('Other fuel / hour', g.fuelPerHour, 0.1, function (v) { g.fuelPerHour = v; changed(); }));
    controls.appendChild(row);

    var row2 = document.createElement('div');
    row2.className = 'controls';
    var founder = document.createElement('label');
    founder.className = 'check';
    var founderBox = document.createElement('input');
    founderBox.type = 'checkbox';
    founderBox.checked = !!g.founder;
    founderBox.addEventListener('change', function () { g.founder = founderBox.checked; changed(); });
    founder.appendChild(founderBox);
    var founderText = document.createElement('span');
    founderText.textContent = 'Founder';
    founder.appendChild(founderText);
    row2.appendChild(founder);
    if (g.founder) {
      row2.appendChild(gemsNumber('VIP tier', g.founderTier, 1, function (v) {
        g.founderTier = Math.max(1, Math.round(v)); changed();
      }));
    }
    var magnets = document.createElement('label');
    magnets.className = 'check';
    var magnetBox = document.createElement('input');
    magnetBox.type = 'checkbox';
    magnetBox.checked = !!g.chargeMagnets;
    magnetBox.addEventListener('change', function () { g.chargeMagnets = magnetBox.checked; changed(); });
    magnets.appendChild(magnetBox);
    var magnetText = document.createElement('span');
    magnetText.textContent = 'Use Charge Magnets';
    magnets.appendChild(magnetText);
    row2.appendChild(magnets);
    controls.appendChild(row2);

    var buysWrap = document.createElement('div');
    buysWrap.className = 'controls';
    var buysLabel = document.createElement('span');
    buysLabel.className = 'hint';
    buysLabel.style.margin = '0 10px 0 0';
    buysLabel.textContent = 'Lootbug buffs you always buy:';
    buysWrap.appendChild(buysLabel);
    m.paidBuffs.forEach(function (buff) {
      if (!buff.weight) return;
      var label = document.createElement('label');
      label.className = 'check';
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = g.lootbugBuys.indexOf(buff.id) >= 0;
      box.addEventListener('change', function () {
        var list = g.lootbugBuys.filter(function (id) { return id !== buff.id; });
        if (box.checked) list.push(buff.id);
        g.lootbugBuys = list;
        changed();
      });
      label.appendChild(box);
      var buffText = document.createElement('span');
      buffText.textContent = buff.label + ' (' + buff.cost + ' gems)';
      label.appendChild(buffText);
      buysWrap.appendChild(label);
    });
    controls.appendChild(buysWrap);

    var cards = document.createElement('div');
    cards.className = 'cards';
    [
      { label: 'Net gems per hour', value: IOM.formatNumber(m.net), sub: 'gross less what the drones burn' },
      { label: 'Gross', value: IOM.formatNumber(m.gross), sub: (m.claims.toFixed(1) + ' freebie claims, ' + m.bugs.toFixed(0) + ' lootbugs an hour') },
      { label: 'Recurring spend', value: '-' + IOM.formatNumber(m.spendingTotal), sub: 'fuel, plus any lootbug buffs you buy' },
      { label: 'Offline gems per hour', value: IOM.formatNumber(m.offline), sub: 'gem bomb recharges only' },
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
    table.innerHTML = '<thead><tr><th>Source</th><th class="num">Gems / hour</th></tr></thead>';
    var body = document.createElement('tbody');

    m.lines.forEach(function (line) {
      var tr = document.createElement('tr');
      tr.className = 'receipt-parent';
      var name = cell(tr, line.label);
      if (line.note) tip(name, line.note);
      cell(tr, line.amount === 0 ? '0' : IOM.formatNumber(line.amount), 'num');
      body.appendChild(tr);
      (line.children || []).forEach(function (child) {
        var sub = document.createElement('tr');
        sub.className = 'receipt-child';
        cell(sub, child.label);
        cell(sub, child.amount === 0 ? '0' : IOM.formatNumber(child.amount), 'num');
        body.appendChild(sub);
      });
    });

    var grossRow = document.createElement('tr');
    grossRow.className = 'receipt-total';
    cell(grossRow, 'Gross');
    cell(grossRow, IOM.formatNumber(m.gross), 'num');
    body.appendChild(grossRow);

    m.spending.forEach(function (line) {
      var tr = document.createElement('tr');
      tr.className = 'receipt-child';
      var name = cell(tr, line.label);
      if (line.detail) tip(name, line.detail);
      cell(tr, '-' + IOM.formatNumber(-line.amount), 'num');
      body.appendChild(tr);
    });

    var netRow = document.createElement('tr');
    netRow.className = 'receipt-total';
    cell(netRow, 'Net');
    cell(netRow, IOM.formatNumber(m.net) + ' /hr', 'num');
    body.appendChild(netRow);

    table.appendChild(body);
    wrap.appendChild(table);
    host.appendChild(wrap);

    var note = document.createElement('p');
    note.className = 'hint';
    note.style.marginTop = '14px';
    note.textContent = 'Gem chance is 3% plus 0.1% per pet quest, times 1.25 once a legendary tribute is at level 3. '
      + 'Freebie claims run on game speed, and the cooldown, pack gems, instant refresh, jackpot and Stonks stats all come from the export. '
      + 'Lootbug spawns are one per 20 game minutes times the spawn rate stat, triple chance folded in. '
      + 'The 10x Bomb Recharge and Game Speed lootbug buffs are added as their own lines, as the gross with the buff less the gross without it. '
      + 'Not modelled: one-off payouts (codes, events, bundles), the freebie banking cap, gifts and other jackpots that pay gems, '
      + 'the damage meter and event item chests, and anything the export cannot see.';
    host.appendChild(note);
  }

  function renderObelisk() {
    var host = $('obelisk-results');    host.innerHTML = '';
    var hp = IOM.parseNumber($('obelisk-hp').value);
    var armour = IOM.parseNumber($('obelisk-armour').value);
    // Fights start at 30 seconds. The export carries obelisk_timer_add, which
    // the game labels Bonus Obelisk Fight Length. The relic sits outside the
    // exported stats, so its share is typed in.
    var timerAdd = IOM.resolve(state).totals.obelisk_timer_add;
    var relicBonus = IOM.parseNumber($('obelisk-relic').value);
    var duration = 30 + (isFinite(relicBonus) ? relicBonus : 0) + (isFinite(timerAdd) ? timerAdd : 0);
    var m = IOM.obeliskModel(state, isFinite(hp) ? hp : 0, isFinite(armour) ? armour : 0, duration);

    var cards = document.createElement('div');
    cards.className = 'cards';
    [
      { label: 'Average damage per hit', value: IOM.formatNumber(m.perHit) },
      { label: 'Damage per second', value: IOM.formatNumber(m.dps) },
      { label: 'Time to break', value: m.seconds === null ? '-' : IOM.formatDuration(m.seconds / 3600) },
      { label: 'Fights needed', value: m.fights === null ? '-' : IOM.formatNumber(m.fights), sub: m.duration ? m.duration + 's per fight (30 base + relic + bonus length)' : 'no fight length' },
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

    var lengthNote = document.createElement('p');
    lengthNote.className = 'hint';
    lengthNote.textContent = 'Bonus length is obelisk_timer_add from your export, which the game calls Bonus Obelisk Fight Length. The fight length relic is not part of that stat, so its share is the one number this panel asks for. Your last export held 100 of it.';
    host.appendChild(lengthNote);
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

  // What each tracked stat means and what the calculators do with it. The
  // wording that names a stat comes from the game's own string table; the rest
  // describes how engine.js consumes it. Stats marked reference only are
  // carried by the export but change no number here.
  var STAT_NOTES = {
    ores_per_screen: 'Ore types on a floor screen. Multiplies ore income and caps how many veins a screen can hold.',
    multi_rock_chance: 'Triple Rock Chance: chance an ore counts three times, applied as a chance with a 3x multiplier.',
    ore_income_multi: 'Straight multiplier on ore income.',
    golden_ore_chance: 'Golden Ore Chance: chance an ore rolls golden.',
    golden_ore_multi: 'Multiplier when an ore rolls golden.',
    golden_floor_chance: 'Golden Floor Chance: first of the four floor rolls. The tiers chain golden, then rainbow, then galactic, then prismatic.',
    golden_floor_multi: 'Multiplier when a floor rolls golden.',
    rainbow_floor_chance: 'Rainbow Floor Chance: checked inside the golden roll.',
    rainbow_floor_multi: 'Multiplier when a floor rolls rainbow.',
    galactic_floor_chance: 'Galactic Floor Chance: checked inside the rainbow roll.',
    galactic_floor_multi: 'Multiplier when a floor rolls galactic.',
    prismatic_floor_chance: 'Prismatic Floor Chance: innermost of the four floor rolls.',
    prismatic_floor_multi: 'Multiplier when a floor rolls prismatic.',
    void_portal_base_multi: 'Void Portal Base Multiplier: applied before the ordinary portal multiplier.',
    void_portal_chance: 'Void Portal Chance: chance an ore is portaled into a different ore. Portaled ore can also become a vein, of the portaled ore type.',
    void_portal_multi: 'Multiplies the portal share on top of the base multiplier.',
    golden_void_portal_chance: 'Golden Void Portal Chance: chance a portal rolls golden.',
    golden_void_portal_multi: 'Multiplier when a portal rolls golden.',
    rainbow_void_portal_chance: 'Rainbow Void Portal Chance: checked inside the golden portal roll.',
    rainbow_void_portal_multi: 'Multiplier when a portal rolls rainbow.',
    galactic_void_portal_chance: 'Galactic Void Portal Chance: checked inside the rainbow portal roll.',
    galactic_void_portal_multi: 'Multiplier when a portal rolls galactic.',
    free_craft_chance: 'Free Craft Chance: chance a craft costs nothing. Enters as 1/(1-chance), so it is capped just under 100%.',
    double_craft_chance: 'Chance a craft yields 2x bars.',
    triple_craft_chance: 'Chance a craft yields 3x bars.',
    craft_5x_chance: 'Chance a craft yields 5x bars.',
    craft_10x_chance: 'Chance a craft yields 10x bars.',
    craft_20x_chance: 'Chance a craft yields 20x bars.',
    craft_100x_chance: 'Chance a craft yields 100x bars.',
    bar_output_multi: 'Bar Output Multiplier: applied to crafted and transmuted bars alike.',
    bar_craft_cost_multi: 'Bar Craft Cost: fraction of the normal cost to craft a bar. Lower is better and the engine clamps it to 0 to 1.',
    bomb_of_plenty_multi: 'Bomb of Plenty Multi: ore multiplier while Bomb of Plenty is in use.',
    bomb_of_plenty_chance: 'Held at 1 when Bomb of Plenty is selected on Loadout and 0 otherwise, so it is not typed in.',
    bomb_of_plenty_make_gold_chance: 'Chance Bomb of Plenty pays gold instead of ore. Used by the Bomb tab.',
    bomb_transmuter_multi: 'Bars produced per transmute while the Transmuter is in use.',
    bomb_transmuter_chance: 'Held at 1 when Transmuter is selected on Loadout and 0 otherwise, so it is not typed in.',
    bomb_trans_apply_bop_chance: 'Chance the Transmuter also applies the Bomb of Plenty multiplier. Used by the Bomb tab.',
    game_speed_multi: 'Game Speed: multiplies everything time based, so it enters both the ore rate and the vein rate.',
    chain_fuel_grade: 'Fuel grade of the Chain drone. Its effect is already inside your export.',
    is_drone_chain_equipped_and_fueled: 'Whether the Chain drone is equipped and fuelled.',
    frogger_fuel_grade: 'Fuel grade of the Frogger drone.',
    prism_fuel_grade: 'Fuel grade of the Prism drone.',
    is_drone_prism_equipped: 'Whether the Prism drone is equipped.',
    is_drone_prism_equipped_and_fueled: 'Whether the Prism drone is equipped and fuelled.',
    minotaur_fuel_grade: 'Fuel grade of the Minotaur drone.',
    is_drone_minotaur_equipped_and_fueled: 'Whether the Minotaur drone is equipped and fuelled.',
    ore_sell_price_multi: 'Ore Sell Price: gold per bar arrives through the ore table rather than this stat.',
    midas_fuel_grade: 'Fuel grade of the Midas drone.',
    midas_gold_multi: 'Gold multiplier from the Midas drone.'
  };

  // Carried by the export but read by nothing in engine.js.
  var REF_ONLY = new Set([
    'chain_fuel_grade', 'is_drone_chain_equipped_and_fueled',
    'frogger_fuel_grade',
    'prism_fuel_grade', 'is_drone_prism_equipped', 'is_drone_prism_equipped_and_fueled',
    'minotaur_fuel_grade', 'is_drone_minotaur_equipped_and_fueled',
    'ore_sell_price_multi', 'midas_fuel_grade', 'midas_gold_multi'
  ]);

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
      var note = STAT_NOTES[stat.name];
      var source;
      if (IOM.DRIVEN_STATS.has(stat.name)) {
        source = 'Set by the bomb pick on Loadout.';
      } else if (REF_ONLY.has(stat.name)) {
        source = 'The calculators do not use it, so editing it changes no number here.';
      } else {
        source = state.fromExport[stat.name] ? 'Came from your export.' : 'Not in your export, so type a value here.';
      }
      tip(nameCell, (note || humanise(stat.name) + ' (' + stat.type + ').') + ' ' + source);
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
    renderGems();
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
  $('obelisk-relic').value = state.obeliskRelic !== undefined ? state.obeliskRelic : '30';
  $('obelisk-relic').addEventListener('input', function () {
    state.obeliskRelic = $('obelisk-relic').value;
    save();
    renderObelisk();
  });
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
