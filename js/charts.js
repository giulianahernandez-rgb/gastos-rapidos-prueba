// Minimal, dependency-free chart rendering for the dashboard.
// Follows the categorical palette + mark specs from the dataviz skill:
// fixed hue order (never cycled per-render), thin bars with a rounded
// data-end, value at the tip, text in ink tokens (never the series color).
const CATEGORICAL_SLOTS = [
  { light: '#2a78d6', dark: '#3987e5' }, // 1 blue
  { light: '#eb6834', dark: '#d95926' }, // 2 orange
  { light: '#1baf7a', dark: '#199e70' }, // 3 aqua
  { light: '#eda100', dark: '#c98500' }, // 4 yellow
  { light: '#e87ba4', dark: '#d55181' }, // 5 magenta
  { light: '#008300', dark: '#008300' }, // 6 green
  { light: '#4a3aa7', dark: '#9085e9' }, // 7 violet
  { light: '#e34948', dark: '#e66767' }, // 8 red
];
const OVERFLOW_COLOR = { light: '#898781', dark: '#898781' }; // muted — categories beyond slot 8 fold here

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function categoryColor(index) {
  const slot = index < CATEGORICAL_SLOTS.length ? CATEGORICAL_SLOTS[index] : OVERFLOW_COLOR;
  return slot[currentTheme()];
}

// No fixed currency/locale is assumed — just a "$" prefix with grouped
// digits, since the app doesn't know which currency the user tracks in.
function formatCurrency(amount) {
  const n = Number(amount) || 0;
  const formatted = new Intl.NumberFormat('es', {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
  return '$' + formatted;
}

// data: [{ id, label, emoji, amount, colorIndex }] — pre-sorted by caller.
function renderCategoryBarChart(container, data) {
  container.innerHTML = '';
  if (!data.length) {
    const empty = document.createElement('p');
    empty.className = 'chart-empty';
    empty.textContent = 'Todavía no hay gastos en este rango.';
    container.appendChild(empty);
    return;
  }
  const max = Math.max(...data.map((d) => d.amount), 0.01);

  data.forEach((row) => {
    const wrap = document.createElement('div');
    wrap.className = 'cat-bar-row';

    const head = document.createElement('div');
    head.className = 'cat-bar-head';
    head.innerHTML = `<span class="cat-bar-label"><span aria-hidden="true">${row.emoji}</span> ${escapeHtml(row.label)}</span>` +
      `<span class="cat-bar-value">${formatCurrency(row.amount)}</span>`;
    wrap.appendChild(head);

    const track = document.createElement('div');
    track.className = 'cat-bar-track';
    const fill = document.createElement('div');
    fill.className = 'cat-bar-fill';
    const pct = Math.max((row.amount / max) * 100, 3);
    fill.style.width = pct + '%';
    fill.style.background = categoryColor(row.colorIndex);
    track.appendChild(fill);
    wrap.appendChild(track);

    container.appendChild(wrap);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

window.Charts = { categoryColor, formatCurrency, renderCategoryBarChart, escapeHtml };
