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

  function refreshOreSelects() {
    fillOreSelect($('floor-ore'), true);
    fillOreSelect($('farm-ore'), false);
    document.querySelectorAll('.ore-locked').forEach(function (box) {
      box.checked = !!state.showLockedOres;
    });
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

    DATA.stats.forEach(function (stat) {
      var tr = document.createElement('tr');
      var nameCell = cell(tr, stat.name);
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
        src.className = 'src';
        src.textContent = row.source + ' → ' + row.stat;
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
          baseCell.textContent = IOM.formatNumber(baseOf(row, index));
          baseCell.style.color = 'var(--muted)';
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

  function renderFloors() {
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

  function refreshAll() {
    renderStatus();
    refreshOreSelects();
    renderCards();
    $('bomb-in-use').value = state.bomb;
    renderMods();
    renderStats();
    renderFloors();
    renderFarm();
    renderBomb();
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
      save();
      recalc();
      refreshAll();
      report.className = 'notice ok';
      report.textContent = 'Imported ' + result.known.length + ' stats from ' + (parsed.version || 'the export') + '.';
      if (result.unknown.length) {
        report.textContent += ' ' + result.unknown.length + ' keys are not used by this calculator yet.';
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

  ['floor-ore', 'floor-metric', 'floor-void'].forEach(function (id) {
    $(id).addEventListener('change', renderFloors);
  });
  ['farm-ore', 'farm-amount', 'farm-unit', 'farm-void'].forEach(function (id) {
    $(id).addEventListener('input', renderFarm);
    $(id).addEventListener('change', renderFarm);
  });

  fillBombInUse();
  renderCards();
  bindCard('card-ore', 'ore');
  bindCard('card-bar', 'bar');

  document.querySelectorAll('.ore-locked').forEach(function (box) {
    box.addEventListener('change', function () {
      state.showLockedOres = box.checked;
      save();
      refreshOreSelects();
      renderFloors();
      renderFarm();
    });
  });
  refreshOreSelects();
  recalc();
  refreshAll();
})();
