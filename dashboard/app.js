// Token Radar — the dashboard (no framework, no network).
//
// Renders the ranked board from window.RADAR (data.js), a filterable table,
// a per-protocol detail view with the model's own breakdown, a live-token
// view set aside from the ranking, and a sandbox that recomputes every row
// from the snapshot figures under settings the reader chooses. State lives
// in the URL hash, so the board, a filtered view and a detail view each
// have a link: #tab=pre&q=…&category=…&detail=<slug>.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var WATCH = {};
  DATA.watchlist.forEach(function (s) { WATCH[s] = true; });

  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, watchOnly: false, tab: 'pre', sort: 'implied', dir: -1, selected: null };
  var sandbox = { base: DATA.model.base_multiple, up: DATA.model.growth_up, down: DATA.model.growth_down, applied: false };

  function $(id) { return document.getElementById(id); }
  function fmtUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function fmtPct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return '—';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the board's number. Same constants as lib/model.ts.
  function impliedOf(row, model) {
    var growth = row.change_7d === null || row.change_7d === undefined ? 0 : Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d));
    var weight = growth >= 0 ? model.growth_up : model.growth_down;
    var growthMult = Math.min(model.growth_mult_cap, Math.max(model.growth_mult_floor, 1 + (growth / 100) * weight));
    var age = row.age_days === null || row.age_days === undefined ? DATA.median_age_days : row.age_days;
    var ageMult = model.age_floor + (Math.min(Math.max(age, 0), model.age_days_cap) / model.age_days_cap) * model.age_range;
    if (row.age_days === null || row.age_days === undefined || row.age_days < model.young_age_days) ageMult *= model.young_factor;
    var breadthMult = 1 + model.breadth_step * Math.min(Math.max(row.chains.length - 1, 0), model.breadth_max_chains);
    var certaintyMult = row.change_7d === null || row.change_7d === undefined ? model.unknown_growth_factor : 1;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * ageMult * breadthMult * certaintyMult));
  }
  function modelOf() {
    return {
      base_multiple: sandbox.applied ? sandbox.base : DATA.model.base_multiple,
      growth_up: sandbox.applied ? sandbox.up : DATA.model.growth_up,
      growth_down: sandbox.applied ? sandbox.down : DATA.model.growth_down,
      growth_cap: DATA.model.growth_cap, growth_floor: DATA.model.growth_floor,
      growth_mult_cap: DATA.model.growth_mult_cap, growth_mult_floor: DATA.model.growth_mult_floor,
      age_floor: DATA.model.age_floor, age_range: DATA.model.age_range,
      age_days_cap: DATA.model.age_days_cap, young_age_days: DATA.model.young_age_days,
      young_factor: DATA.model.young_factor, breadth_step: DATA.model.breadth_step,
      breadth_max_chains: DATA.model.breadth_max_chains, unknown_growth_factor: DATA.model.unknown_growth_factor
    };
  }

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv.length !== 2) return;
      var k = kv[0], v = decodeURIComponent(kv[1]);
      if (k === 'q') state.q = v;
      else if (k === 'category') state.category = v;
      else if (k === 'chain') state.chain = v;
      else if (k === 'minTvl') state.minTvl = Number(v) || 0;
      else if (k === 'watchOnly') state.watchOnly = v === '1';
      else if (k === 'tab') state.tab = v === 'live' ? 'live' : 'pre';
      else if (k === 'detail') state.selected = v || null;
      else if (k === 'sort') state.sort = v;
    });
  }
  function writeHash() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') parts.push('category=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.minTvl) parts.push('minTvl=' + state.minTvl);
    if (state.watchOnly) parts.push('watchOnly=1');
    if (state.tab === 'live') parts.push('tab=live');
    if (state.selected) parts.push('detail=' + encodeURIComponent(state.selected));
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname + location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (state.watchOnly && !WATCH[r.slug]) return false;
      return true;
    });
  }
  function sortedRows(list) {
    var m = modelOf();
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var d = 0;
      if (key === 'name') d = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      else if (key === 'category') d = (a.category || '') < (b.category || '') ? -1 : (a.category || '') > (b.category || '') ? 1 : 0;
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'growth') d = (a.change_7d || 0) - (b.change_7d || 0);
      else if (key === 'age') d = (a.age_days || 0) - (b.age_days || 0);
      else if (key === 'rank') d = a.rank - b.rank;
      else d = impliedOf(a, m) - impliedOf(b, m);
      return d * state.dir || (a.rank - b.rank);
    });
  }

  function renderStats() {
    $('stats').innerHTML =
      '<div><dt>Snapshot date</dt><dd>' + esc(DATA.as_of) + '</dd></div>' +
      '<div><dt>Watchlist</dt><dd>' + DATA.watchlist_size + ' protocols</dd></div>' +
      '<div><dt>Board rows</dt><dd>' + DATA.board_size + '</dd></div>' +
      '<div><dt>Early finds</dt><dd>' + DATA.early_size + ' below the floor</dd></div>' +
      '<div><dt>Median age</dt><dd>' + DATA.median_age_days + ' days</dd></div>';
    $('source-line').textContent = 'Source: ' + DATA.source + '. Model ' + DATA.model_version +
      ': implied value = TVL x ' + DATA.model.base_multiple + ' x growth x age x breadth x certainty.';
  }

  function renderBoard() {
    var body = $('board-body');
    var list = sortedRows(filteredRows());
    $('count').textContent = list.length + ' of ' + DATA.board_size + ' rows' + (sandbox.applied ? ' — sandbox settings applied' : '');
    $('empty').hidden = list.length > 0;
    var m = modelOf();
    body.innerHTML = list.map(function (r) {
      var g = r.change_7d;
      var cls = g === null ? '' : g >= 0 ? 'up' : 'down';
      var hot = r.signal === 'Surging' || r.signal === 'Growing' ? ' hot' : '';
      return '<tr data-slug="' + esc(r.slug) + '" aria-selected="' + (state.selected === r.slug) + '" tabindex="0">' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong><br><span class="sub">' + esc(r.slug) + (WATCH[r.slug] ? ' · watchlist' : '') + '</span></td>' +
        '<td>' + esc(r.category || 'Other') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="tvl">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + cls + '">' + fmtPct(g) + '</td>' +
        '<td>' + fmtAge(r.age_days) + '</td>' +
        '<td><span class="badge' + hot + '">' + esc(r.signal) + '</span></td>' +
        '<td class="impl">' + fmtUsd(impliedOf(r, m)) + '</td></tr>';
    }).join('');
    body.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(tr.getAttribute('data-slug')); }
      });
    });
  }

  function renderLive() {
    $('live-body').innerHTML = DATA.live.map(function (r) {
      var g = r.change_7d;
      return '<tr><td><strong>' + esc(r.name) + '</strong></td><td>' + esc(r.category || 'Other') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + '</td>' +
        '<td class="tvl">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + (g === null ? '' : g >= 0 ? 'up' : 'down') + '">' + fmtPct(g) + '</td>' +
        '<td class="impl">' + (r.mcap_usd === null ? '—' : fmtUsd(r.mcap_usd)) + '</td></tr>';
    }).join('');
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    var m = DATA.model;
    var recomputed = impliedOf(row, m);
    $('detail-title').textContent = '#' + row.rank + ' — ' + row.name;
    $('detail-sub').textContent = (row.category || 'Other') + ' · ' + row.chains.join(', ') + ' · TVL ' + fmtUsd(row.tvl_usd) +
      ' · 7d ' + fmtPct(row.change_7d) + ' · age ' + fmtAge(row.age_days) + (WATCH[row.slug] ? ' · on the watchlist' : ' · early find below the floor');
    var growth = row.change_7d === null ? 0 : Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d));
    $('breakdown-body').innerHTML =
      '<tr><td>TVL</td><td>' + fmtUsd(row.tvl_usd) + '</td></tr>' +
      '<tr><td>Base (TVL × ' + m.base_multiple + ')</td><td>' + fmtUsd(Math.round(row.tvl_usd * m.base_multiple)) + '</td></tr>' +
      '<tr><td>Growth ' + fmtPct(row.change_7d) + ' → multiplier</td><td>× ' + row.growth_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td>Age ' + fmtAge(row.age_days) + ' → multiplier</td><td>× ' + row.age_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td>Breadth (' + row.chains.length + ' chains) → multiplier</td><td>× ' + row.breadth_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td>Certainty → multiplier</td><td>× ' + row.certainty_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td><strong>Implied value</strong></td><td><strong>' + fmtUsd(row.implied_value_usd) + '</strong></td></tr>';
    $('recompute').textContent = 'The page recomputes this row as ' + fmtUsd(recomputed) +
      (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') +
      ' This is an estimate, not a price. Growth shown is ' + growth.toFixed(1) + '% after clamping.';
    $('steps').innerHTML = row.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('detail').hidden = false;
    writeHash();
    // Instant scroll, not smooth: headless captures and deep links must land
    // on the detail view instead of mid-animation on a blank stretch.
    $('detail').scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  function renderSandboxRead() {
    var m = { base_multiple: sandbox.base, growth_up: sandbox.up, growth_down: sandbox.down,
      growth_cap: DATA.model.growth_cap, growth_floor: DATA.model.growth_floor,
      growth_mult_cap: DATA.model.growth_mult_cap, growth_mult_floor: DATA.model.growth_mult_floor,
      age_floor: DATA.model.age_floor, age_range: DATA.model.age_range, age_days_cap: DATA.model.age_days_cap,
      young_age_days: DATA.model.young_age_days, young_factor: DATA.model.young_factor,
      breadth_step: DATA.model.breadth_step, breadth_max_chains: DATA.model.breadth_max_chains,
      unknown_growth_factor: DATA.model.unknown_growth_factor };
    var best = DATA.rows.slice().sort(function (a, b) { return impliedOf(b, m) - impliedOf(a, m); })[0];
    $('sandbox-read').textContent = 'With these settings, rank 1 would be ' + best.name + ' at ' +
      fmtUsd(impliedOf(best, m)) + ' (board: ' + DATA.rows[0].name + ' at ' + fmtUsd(DATA.rows[0].implied_value_usd) + ').';
  }

  function fillSelects() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    $('category').innerHTML = '<option value="all">All categories</option>' + cats.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains); }, []))).sort();
    $('chain').innerHTML = '<option value="all">All chains</option>' + chains.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
  }

  function render() {
    $('tab-pre').setAttribute('aria-pressed', state.tab === 'pre' ? 'true' : 'false');
    $('tab-live').setAttribute('aria-pressed', state.tab === 'live' ? 'true' : 'false');
    $('board').hidden = state.tab !== 'pre';
    $('live').hidden = state.tab !== 'live';
    if (state.tab === 'pre') renderBoard();
    else renderLive();
    if (state.selected) {
      var found = DATA.rows.some(function (r) { return r.slug === state.selected; });
      if (found && $('detail').hidden) openDetail(state.selected);
    }
  }

  // Wire up.
  readHash();
  fillSelects();
  $('q').value = state.q;
  $('category').value = state.category;
  $('chain').value = state.chain;
  $('min-tvl').value = String(state.minTvl);
  $('watchlist-only').checked = state.watchOnly;
  $('q').addEventListener('input', function () { state.q = $('q').value; writeHash(); renderBoard(); });
  $('category').addEventListener('change', function () { state.category = $('category').value; writeHash(); renderBoard(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; writeHash(); renderBoard(); });
  $('min-tvl').addEventListener('change', function () { state.minTvl = Number($('min-tvl').value); writeHash(); renderBoard(); });
  $('watchlist-only').addEventListener('change', function () { state.watchOnly = $('watchlist-only').checked; writeHash(); renderBoard(); });
  $('clear').addEventListener('click', function () {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.watchOnly = false;
    $('q').value = ''; $('category').value = 'all'; $('chain').value = 'all'; $('min-tvl').value = '0'; $('watchlist-only').checked = false;
    writeHash(); renderBoard();
  });
  $('tab-pre').addEventListener('click', function () { state.tab = 'pre'; writeHash(); render(); });
  $('tab-live').addEventListener('click', function () { state.tab = 'live'; writeHash(); render(); });
  document.querySelectorAll('th button[data-sort]').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = k === 'name' || k === 'category' || k === 'rank' ? 1 : -1; }
      renderBoard();
    });
  });
  $('detail-close').addEventListener('click', function () {
    state.selected = null; $('detail').hidden = true; writeHash(); renderBoard();
  });
  ['base', 'up', 'down'].forEach(function (k) {
    $('in-' + k).addEventListener('input', function () {
      sandbox[k] = Number($('in-' + k).value);
      $('out-' + k).textContent = sandbox[k].toFixed(2);
      renderSandboxRead();
    });
  });
  $('apply-sandbox').addEventListener('click', function () { sandbox.applied = true; renderSandboxRead(); renderBoard(); });
  $('reset-sandbox').addEventListener('click', function () {
    sandbox.applied = false; sandbox.base = DATA.model.base_multiple; sandbox.up = DATA.model.growth_up; sandbox.down = DATA.model.growth_down;
    $('in-base').value = sandbox.base; $('in-up').value = sandbox.up; $('in-down').value = sandbox.down;
    $('out-base').textContent = sandbox.base.toFixed(2); $('out-up').textContent = sandbox.up.toFixed(2); $('out-down').textContent = sandbox.down.toFixed(2);
    renderSandboxRead(); renderBoard();
  });
  window.addEventListener('hashchange', function () { readHash(); render(); });

  renderStats();
  renderSandboxRead();
  render();
})();
