(() => {
  'use strict';

  /* ---------- helpers ---------- */
  function todayISO() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }
  function isoFromToday(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }
  function formatDateLabel(iso) {
    if (iso === todayISO()) return 'Hoy';
    if (iso === isoFromToday(-1)) return 'Ayer';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }
  function $(id) { return document.getElementById(id); }
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(id).classList.add('active');
  }

  /* ---------- category color index cache (stable across renders) ---------- */
  let categoryOrder = []; // list of category ids in stored order — index = palette slot
  function colorIndexFor(catId) {
    const i = categoryOrder.indexOf(catId);
    return i === -1 ? categoryOrder.length : i;
  }

  /* ---------- draft state for the capture flow ---------- */
  let draft = null;
  function resetDraft() {
    draft = {
      amountStr: '0',
      amount: 0,
      note: '',
      date: todayISO(),
      category: null, categoryLabel: '', categoryEmoji: '',
      paymentMethod: null, paymentLabel: '',
    };
  }

  /* ==================================================================
     STEP 1 — AMOUNT (numeric keypad)
     ================================================================== */
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
  function buildKeypad() {
    const pad = $('keypad');
    pad.innerHTML = '';
    KEYS.forEach((k) => {
      const btn = document.createElement('button');
      btn.className = 'key-btn' + (k === '⌫' ? ' key-clear' : '');
      btn.textContent = k;
      btn.type = 'button';
      btn.addEventListener('click', () => onKeyPress(k));
      pad.appendChild(btn);
    });
  }
  function onKeyPress(k) {
    let s = draft.amountStr;
    if (k === '⌫') {
      s = s.length > 1 ? s.slice(0, -1) : '0';
    } else if (k === '.') {
      if (!s.includes('.')) s += '.';
    } else {
      if (s === '0') s = k;
      else if (s.length < 10) s += k;
    }
    const decimals = s.split('.')[1];
    if (decimals && decimals.length > 2) return;
    draft.amountStr = s;
    renderAmount();
  }
  function renderAmount() {
    $('amount-value').textContent = draft.amountStr;
    const val = parseFloat(draft.amountStr) || 0;
    $('btn-amount-ok').disabled = val <= 0;
  }
  function openAmountStep() {
    resetDraft();
    renderAmount();
    showScreen('screen-amount');
  }

  /* ==================================================================
     STEP 2 — NOTE
     ================================================================== */
  function openNoteStep() {
    $('note-input').value = draft.note || '';
    showScreen('screen-note');
    setTimeout(() => $('note-input').focus(), 50);
  }
  function continueFromNote() {
    draft.note = $('note-input').value.trim().slice(0, 80);
    openDateStep();
  }

  /* ==================================================================
     STEP 3 — DATE
     ================================================================== */
  function openDateStep() {
    draft.date = draft.date || todayISO();
    $('date-input').value = draft.date;
    showScreen('screen-date');
  }
  function pickDate(iso) {
    draft.date = iso;
    openCategoryStep();
  }

  /* ==================================================================
     STEP 4 — CATEGORY
     ================================================================== */
  async function openCategoryStep() {
    const cats = await DB.getCategories();
    categoryOrder = cats.map((c) => c.id);
    const grid = $('category-grid');
    grid.innerHTML = '';
    cats.forEach((cat, idx) => {
      const tile = document.createElement('button');
      tile.className = 'choice-tile';
      tile.type = 'button';
      tile.innerHTML = `<span class="emoji">${cat.emoji}</span><span>${Charts.escapeHtml(cat.label)}</span>`;
      tile.addEventListener('click', () => {
        draft.category = cat.id;
        draft.categoryLabel = cat.label;
        draft.categoryEmoji = cat.emoji;
        draft.categoryColorIndex = idx;
        openPaymentStep();
      });
      grid.appendChild(tile);
    });
    const addTile = document.createElement('button');
    addTile.className = 'choice-tile add-tile';
    addTile.type = 'button';
    addTile.innerHTML = `<span class="emoji">➕</span><span>Otra</span>`;
    addTile.addEventListener('click', openCategoryPrompt);
    grid.appendChild(addTile);

    showScreen('screen-category');
  }
  function openCategoryPrompt() {
    $('category-prompt-input').value = '';
    $('category-prompt-backdrop').classList.add('active');
    setTimeout(() => $('category-prompt-input').focus(), 50);
  }
  function closeCategoryPrompt() {
    $('category-prompt-backdrop').classList.remove('active');
  }
  async function saveCategoryPrompt() {
    const label = $('category-prompt-input').value.trim();
    if (!label) return;
    const cat = await DB.addCategory(label);
    closeCategoryPrompt();
    const cats = await DB.getCategories();
    categoryOrder = cats.map((c) => c.id);
    draft.category = cat.id;
    draft.categoryLabel = cat.label;
    draft.categoryEmoji = cat.emoji;
    draft.categoryColorIndex = categoryOrder.indexOf(cat.id);
    openPaymentStep();
  }

  /* ==================================================================
     STEP 5 — PAYMENT METHOD
     ================================================================== */
  function openPaymentStep() {
    const list = $('payment-list');
    list.innerHTML = '';
    DB.PAYMENT_METHODS.forEach((pm) => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.type = 'button';
      chip.innerHTML = `<span class="emoji">${pm.emoji}</span><span>${pm.label}</span>`;
      chip.addEventListener('click', () => {
        draft.paymentMethod = pm.id;
        draft.paymentLabel = pm.label;
        finalizeExpense();
      });
      list.appendChild(chip);
    });
    showScreen('screen-payment');
  }

  /* ==================================================================
     CONFIRMATION + SAVE
     ================================================================== */
  async function finalizeExpense() {
    const amount = parseFloat(draft.amountStr) || 0;
    const expense = {
      amount,
      note: draft.note || '',
      date: draft.date,
      category: draft.categoryLabel,
      categoryId: draft.category,
      paymentMethod: draft.paymentLabel,
    };
    const saved = await DB.addExpense(expense);
    Notion.syncExpense(expense).then((ok) => {
      if (ok) DB.updateExpense(saved.id, { synced: true });
    });

    $('confirm-summary').textContent =
      `${Charts.formatCurrency(amount)} · ${draft.categoryEmoji} ${draft.categoryLabel} · ${formatDateLabel(draft.date)}`;
    showScreen('screen-confirm');
    refreshHomeTotal();
    setTimeout(() => showScreen('screen-home'), 1300);
  }

  async function refreshHomeTotal() {
    const all = await DB.getAllExpenses();
    const today = todayISO();
    const sum = all.filter((e) => e.date === today).reduce((s, e) => s + e.amount, 0);
    $('home-today-amount').textContent = Charts.formatCurrency(sum);
  }

  /* ==================================================================
     DASHBOARD / HISTORY
     ================================================================== */
  let dashRange = 'month';
  let dashCategory = 'all';

  function rangeStart(range) {
    const now = new Date();
    if (range === 'month') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    if (range === '7d') return isoFromToday(-6);
    if (range === '30d') return isoFromToday(-29);
    return null; // all
  }
  function rangeLabel(range) {
    return { month: 'este mes', '7d': 'últimos 7 días', '30d': 'últimos 30 días', all: 'todo' }[range];
  }

  async function openDashboard() {
    showScreen('screen-dashboard');
    await loadDashboard();
  }

  async function loadDashboard() {
    const all = await DB.getAllExpenses();
    const cats = await DB.getCategories();
    categoryOrder = cats.map((c) => c.id);
    const catById = Object.fromEntries(cats.map((c) => [c.id, c]));

    const start = rangeStart(dashRange);
    let filtered = start ? all.filter((e) => e.date >= start) : all.slice();
    if (dashCategory !== 'all') filtered = filtered.filter((e) => e.categoryId === dashCategory);

    // stat tile
    const total = filtered.reduce((s, e) => s + e.amount, 0);
    $('stat-label').textContent = 'Total · ' + rangeLabel(dashRange) + (dashCategory !== 'all' && catById[dashCategory] ? ' · ' + catById[dashCategory].label : '');
    $('stat-value').textContent = Charts.formatCurrency(total);

    // category filter chips — built from categories actually present in range (before category filter)
    let inRange = start ? all.filter((e) => e.date >= start) : all.slice();
    const presentIds = [...new Set(inRange.map((e) => e.categoryId))];
    const chipRow = $('category-filter-row');
    chipRow.innerHTML = '';
    const allChip = document.createElement('button');
    allChip.className = 'filter-chip' + (dashCategory === 'all' ? ' active' : '');
    allChip.textContent = 'Todas';
    allChip.addEventListener('click', () => { dashCategory = 'all'; loadDashboard(); });
    chipRow.appendChild(allChip);
    presentIds.forEach((id) => {
      const cat = catById[id];
      if (!cat) return;
      const chip = document.createElement('button');
      chip.className = 'filter-chip' + (dashCategory === id ? ' active' : '');
      chip.textContent = `${cat.emoji} ${cat.label}`;
      chip.addEventListener('click', () => { dashCategory = id; loadDashboard(); });
      chipRow.appendChild(chip);
    });

    // category bar chart (aggregated over `filtered`)
    const byCat = new Map();
    filtered.forEach((e) => {
      const key = e.categoryId || e.category;
      if (!byCat.has(key)) byCat.set(key, 0);
      byCat.set(key, byCat.get(key) + e.amount);
    });
    const chartData = [...byCat.entries()]
      .map(([id, amount]) => {
        const cat = catById[id] || { label: id, emoji: '🏷️' };
        return { id, label: cat.label, emoji: cat.emoji, amount, colorIndex: colorIndexFor(id) };
      })
      .sort((a, b) => b.amount - a.amount);
    Charts.renderCategoryBarChart($('category-chart'), chartData);

    // expense list
    const list = $('expense-list');
    list.innerHTML = '';
    if (!filtered.length) {
      list.innerHTML = '<p class="empty-state">Sin gastos en este rango todavía.</p>';
    } else {
      filtered.forEach((e) => {
        const row = document.createElement('div');
        row.className = 'expense-row';
        const cat = catById[e.categoryId] || { emoji: '🏷️' };
        row.innerHTML = `
          <div class="expense-emoji">${cat.emoji}</div>
          <div class="expense-info">
            <div class="expense-title">${Charts.escapeHtml(e.note || e.category)}</div>
            <div class="expense-meta">${formatDateLabel(e.date)} · ${Charts.escapeHtml(e.paymentMethod)}</div>
          </div>
          <div class="expense-amount">${Charts.formatCurrency(e.amount)}</div>`;
        row.addEventListener('click', () => openExpenseSheet(e.id));
        list.appendChild(row);
      });
    }
  }

  /* ---------- edit / delete sheet ---------- */
  let sheetExpenseId = null;
  function openExpenseSheet(id) {
    sheetExpenseId = id;
    $('expense-sheet-backdrop').classList.add('active');
  }
  function closeExpenseSheet() {
    $('expense-sheet-backdrop').classList.remove('active');
  }
  async function openEditModal(id) {
    const e = await DB.getExpense(id);
    if (!e) return;
    $('edit-amount').value = e.amount;
    $('edit-note').value = e.note || '';
    $('edit-date').value = e.date;

    const cats = await DB.getCategories();
    const catSelect = $('edit-category');
    catSelect.innerHTML = cats.map((c) => `<option value="${c.id}" ${c.id === e.categoryId ? 'selected' : ''}>${c.emoji} ${Charts.escapeHtml(c.label)}</option>`).join('');

    const paySelect = $('edit-payment');
    paySelect.innerHTML = DB.PAYMENT_METHODS.map((p) => `<option value="${p.id}" ${p.label === e.paymentMethod ? 'selected' : ''}>${p.emoji} ${p.label}</option>`).join('');

    $('edit-modal-backdrop').dataset.id = id;
    $('edit-modal-backdrop').classList.add('active');
  }
  function closeEditModal() {
    $('edit-modal-backdrop').classList.remove('active');
  }
  async function saveEditModal() {
    const id = Number($('edit-modal-backdrop').dataset.id);
    const cats = await DB.getCategories();
    const catId = $('edit-category').value;
    const cat = cats.find((c) => c.id === catId);
    const payId = $('edit-payment').value;
    const pay = DB.PAYMENT_METHODS.find((p) => p.id === payId);
    await DB.updateExpense(id, {
      amount: parseFloat($('edit-amount').value) || 0,
      note: $('edit-note').value.trim().slice(0, 80),
      date: $('edit-date').value || todayISO(),
      categoryId: catId,
      category: cat ? cat.label : catId,
      paymentMethod: pay ? pay.label : payId,
    });
    closeEditModal();
    loadDashboard();
    refreshHomeTotal();
  }
  async function deleteExpense(id) {
    if (!confirm('¿Eliminar este gasto?')) return;
    await DB.deleteExpense(id);
    loadDashboard();
    refreshHomeTotal();
  }

  /* ==================================================================
     SETTINGS
     ================================================================== */
  async function openSettings() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    $('toggle-theme').checked = isLight;

    const cfg = await Notion.getConfig();
    $('toggle-notion').checked = !!cfg.enabled;
    $('notion-proxy-url').value = cfg.proxyUrl || '';
    $('notion-database-id').value = cfg.databaseId || '';
    $('notion-status').textContent = '';
    $('notion-status').className = 'status-msg';

    showScreen('screen-settings');
  }
  function applyTheme(light) {
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
    try { localStorage.setItem('gastos_theme', light ? 'light' : 'dark'); } catch (e) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#f9f9f7' : '#0d0d0d');
  }

  /* ==================================================================
     WIRE UP EVENTS
     ================================================================== */
  function init() {
    buildKeypad();
    resetDraft();

    // Home
    $('btn-new-expense').addEventListener('click', openAmountStep);
    $('btn-open-dashboard').addEventListener('click', openDashboard);
    $('btn-open-dashboard-2').addEventListener('click', openDashboard);
    $('btn-open-settings').addEventListener('click', openSettings);

    // Amount step
    $('btn-amount-ok').addEventListener('click', () => {
      draft.amount = parseFloat(draft.amountStr) || 0;
      if (draft.amount > 0) openNoteStep();
    });
    $('btn-amount-cancel').addEventListener('click', () => showScreen('screen-home'));
    $('btn-amount-cancel-2').addEventListener('click', () => showScreen('screen-home'));

    // Note step
    $('btn-note-continue').addEventListener('click', continueFromNote);
    $('btn-note-skip').addEventListener('click', () => { draft.note = ''; openDateStep(); });
    $('note-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') continueFromNote(); });
    $('btn-note-back').addEventListener('click', () => showScreen('screen-amount'));
    $('btn-note-cancel').addEventListener('click', () => showScreen('screen-home'));

    // Date step
    $('chip-today').addEventListener('click', () => pickDate(todayISO()));
    $('chip-yesterday').addEventListener('click', () => pickDate(isoFromToday(-1)));
    $('date-input').addEventListener('change', (e) => pickDate(e.target.value));
    $('btn-date-back').addEventListener('click', () => showScreen('screen-note'));
    $('btn-date-cancel').addEventListener('click', () => showScreen('screen-home'));

    // Category step
    $('btn-category-back').addEventListener('click', () => showScreen('screen-date'));
    $('btn-category-cancel').addEventListener('click', () => showScreen('screen-home'));
    $('category-prompt-cancel').addEventListener('click', closeCategoryPrompt);
    $('category-prompt-save').addEventListener('click', saveCategoryPrompt);
    $('category-prompt-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveCategoryPrompt(); });

    // Payment step
    $('btn-payment-back').addEventListener('click', () => showScreen('screen-category'));
    $('btn-payment-cancel').addEventListener('click', () => showScreen('screen-home'));

    // Dashboard
    $('btn-dashboard-close').addEventListener('click', () => showScreen('screen-home'));
    $('btn-dashboard-settings').addEventListener('click', openSettings);
    document.querySelectorAll('#range-filter-row .filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#range-filter-row .filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        dashRange = chip.dataset.range;
        loadDashboard();
      });
    });

    // Expense sheet
    $('sheet-edit').addEventListener('click', () => { closeExpenseSheet(); openEditModal(sheetExpenseId); });
    $('sheet-delete').addEventListener('click', () => { closeExpenseSheet(); deleteExpense(sheetExpenseId); });
    $('sheet-cancel').addEventListener('click', closeExpenseSheet);
    $('expense-sheet-backdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeExpenseSheet(); });

    // Edit modal
    $('btn-edit-cancel').addEventListener('click', closeEditModal);
    $('btn-edit-save').addEventListener('click', saveEditModal);
    $('edit-modal-backdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeEditModal(); });

    // Category prompt backdrop click-away
    $('category-prompt-backdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeCategoryPrompt(); });

    // Settings
    $('btn-settings-close').addEventListener('click', () => showScreen('screen-home'));
    $('toggle-theme').addEventListener('change', (e) => applyTheme(e.target.checked));
    $('toggle-notion').addEventListener('change', (e) => Notion.setConfig({ enabled: e.target.checked }));
    $('notion-proxy-url').addEventListener('change', (e) => Notion.setConfig({ proxyUrl: e.target.value.trim() }));
    $('notion-database-id').addEventListener('change', (e) => Notion.setConfig({ databaseId: e.target.value.trim() }));
    $('btn-notion-test').addEventListener('click', async () => {
      const statusEl = $('notion-status');
      statusEl.textContent = 'Probando…';
      statusEl.className = 'status-msg';
      const result = await Notion.testConnection();
      statusEl.textContent = result.message;
      statusEl.className = 'status-msg ' + (result.ok ? 'ok' : 'err');
    });
    $('btn-export-json').addEventListener('click', exportJSON);

    refreshHomeTotal();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  async function exportJSON() {
    const all = await DB.getAllExpenses();
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gastos-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
