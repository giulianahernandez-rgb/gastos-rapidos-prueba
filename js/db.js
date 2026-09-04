// IndexedDB wrapper — persistent storage for expenses, categories and settings.
// Kept dependency-free so the whole app runs from static files (PWA-friendly).
const DB_NAME = 'gastos_rapidos_db';
const DB_VERSION = 2;
const STORE_EXPENSES = 'expenses';
const STORE_CATEGORIES = 'categories';
const STORE_SETTINGS = 'settings';
const STORE_GOALS = 'goals';
const STORE_RECURRING = 'recurring';

const DEFAULT_CATEGORIES = [
  { id: 'comida', label: 'Comida', emoji: '🍔', builtin: true, order: 0 },
  { id: 'transporte', label: 'Transporte', emoji: '🚌', builtin: true, order: 1 },
  { id: 'ropa', label: 'Ropa', emoji: '👕', builtin: true, order: 2 },
  { id: 'entretenimiento', label: 'Entretenimiento', emoji: '🎬', builtin: true, order: 3 },
  { id: 'deporte', label: 'Deporte', emoji: '⚽', builtin: true, order: 4 },
  { id: 'gasolina', label: 'Gasolina', emoji: '⛽', builtin: true, order: 5 },
];

const PAYMENT_METHODS = [
  { id: 'efectivo', label: 'Efectivo', emoji: '💵' },
  { id: 'credito', label: 'Tarjeta de crédito', emoji: '💳' },
  { id: 'debito', label: 'Tarjeta de débito', emoji: '💳' },
  { id: 'transferencia', label: 'Transferencia', emoji: '🔁' },
];

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_EXPENSES)) {
        const store = db.createObjectStore(STORE_EXPENSES, { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date');
        store.createIndex('category', 'category');
      }
      if (!db.objectStoreNames.contains(STORE_CATEGORIES)) {
        const catStore = db.createObjectStore(STORE_CATEGORIES, { keyPath: 'id' });
        catStore.transaction.oncomplete = () => {
          const tx = db.transaction(STORE_CATEGORIES, 'readwrite');
          const s = tx.objectStore(STORE_CATEGORIES);
          DEFAULT_CATEGORIES.forEach((c) => s.put(c));
        };
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_GOALS)) {
        db.createObjectStore(STORE_GOALS, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_RECURRING)) {
        db.createObjectStore(STORE_RECURRING, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrapReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  DEFAULT_CATEGORIES,
  PAYMENT_METHODS,

  async addExpense(expense) {
    const store = await tx(STORE_EXPENSES, 'readwrite');
    const record = { ...expense, createdAt: Date.now(), synced: false };
    const id = await wrapReq(store.add(record));
    return { ...record, id };
  },

  async updateExpense(id, changes) {
    const store = await tx(STORE_EXPENSES, 'readwrite');
    const existing = await wrapReq(store.get(id));
    if (!existing) throw new Error('Gasto no encontrado');
    const updated = { ...existing, ...changes, id };
    await wrapReq(store.put(updated));
    return updated;
  },

  async deleteExpense(id) {
    const store = await tx(STORE_EXPENSES, 'readwrite');
    await wrapReq(store.delete(id));
  },

  async getAllExpenses() {
    const store = await tx(STORE_EXPENSES, 'readonly');
    const all = await wrapReq(store.getAll());
    return all.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  },

  async getExpense(id) {
    const store = await tx(STORE_EXPENSES, 'readonly');
    return wrapReq(store.get(id));
  },

  async getCategories() {
    const store = await tx(STORE_CATEGORIES, 'readonly');
    const all = await wrapReq(store.getAll());
    const list = all.length ? all : DEFAULT_CATEGORIES;
    // IndexedDB's default getAll() order is primary-key order, not insertion
    // order — sort explicitly so the grid matches the intended, and the
    // categorical palette slot assignment stays stable.
    return list.slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  },

  async addCategory(label) {
    const diacriticsStart = String.fromCharCode(0x0300);
    const diacriticsEnd = String.fromCharCode(0x036f);
    const DIACRITICS = new RegExp('[' + diacriticsStart + '-' + diacriticsEnd + ']', 'g');
    const id = 'custom_' + label.toLowerCase().normalize('NFD').replace(DIACRITICS, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '_' + Date.now().toString(36);
    const store = await tx(STORE_CATEGORIES, 'readwrite');
    const existing = await wrapReq(store.getAll());
    const nextOrder = existing.reduce((max, c) => Math.max(max, c.order ?? 0), -1) + 1;
    const cat = { id, label, emoji: '🏷️', builtin: false, order: nextOrder };
    await wrapReq(store.add(cat));
    return cat;
  },

  async setCategoryBudget(categoryId, budget) {
    const store = await tx(STORE_CATEGORIES, 'readwrite');
    let cat = await wrapReq(store.get(categoryId));
    if (!cat) {
      // built-in categories only get written to the store the first time
      // they need a field of their own (budget) — until then getCategories()
      // serves them straight from DEFAULT_CATEGORIES.
      cat = DEFAULT_CATEGORIES.find((c) => c.id === categoryId);
      if (!cat) throw new Error('Categoría no encontrada');
    }
    cat = { ...cat, budget: budget > 0 ? budget : undefined };
    await wrapReq(store.put(cat));
    return cat;
  },

  /* ---------- Goals (savings) ---------- */
  async getGoals() {
    const store = await tx(STORE_GOALS, 'readonly');
    const all = await wrapReq(store.getAll());
    return all.sort((a, b) => b.createdAt - a.createdAt);
  },

  async addGoal(label, target) {
    const store = await tx(STORE_GOALS, 'readwrite');
    const goal = { label, target, current: 0, createdAt: Date.now() };
    const id = await wrapReq(store.add(goal));
    return { ...goal, id };
  },

  async addGoalContribution(id, amount) {
    const store = await tx(STORE_GOALS, 'readwrite');
    const goal = await wrapReq(store.get(id));
    if (!goal) throw new Error('Meta no encontrada');
    goal.current = Math.max(0, (goal.current || 0) + amount);
    await wrapReq(store.put(goal));
    return goal;
  },

  async deleteGoal(id) {
    const store = await tx(STORE_GOALS, 'readwrite');
    await wrapReq(store.delete(id));
  },

  /* ---------- Recurring (fixed) expenses ---------- */
  async getRecurring() {
    const store = await tx(STORE_RECURRING, 'readonly');
    const all = await wrapReq(store.getAll());
    return all.sort((a, b) => a.createdAt - b.createdAt);
  },

  async addRecurring(recurring) {
    const store = await tx(STORE_RECURRING, 'readwrite');
    const record = { ...recurring, loggedMonths: [], createdAt: Date.now() };
    const id = await wrapReq(store.add(record));
    return { ...record, id };
  },

  async deleteRecurring(id) {
    const store = await tx(STORE_RECURRING, 'readwrite');
    await wrapReq(store.delete(id));
  },

  async markRecurringLogged(id, monthKey) {
    const store = await tx(STORE_RECURRING, 'readwrite');
    const rec = await wrapReq(store.get(id));
    if (!rec) return;
    rec.loggedMonths = [...new Set([...(rec.loggedMonths || []), monthKey])];
    await wrapReq(store.put(rec));
    return rec;
  },

  async getSetting(key, fallback) {
    const store = await tx(STORE_SETTINGS, 'readonly');
    const row = await wrapReq(store.get(key));
    return row ? row.value : fallback;
  },

  async setSetting(key, value) {
    const store = await tx(STORE_SETTINGS, 'readwrite');
    await wrapReq(store.put({ key, value }));
  },
};

window.DB = DB;
