// Optional Notion sync. The Notion API does not allow direct browser calls
// (no CORS, and the integration token can't be shipped client-side safely),
// so this posts to a small proxy — see /server — that the user runs and
// points at their own Notion integration + database.
const Notion = {
  async getConfig() {
    const proxyUrl = await DB.getSetting('notion_proxy_url', '');
    const databaseId = await DB.getSetting('notion_database_id', '');
    const enabled = await DB.getSetting('notion_enabled', false);
    return { proxyUrl, databaseId, enabled };
  },

  async setConfig({ proxyUrl, databaseId, enabled }) {
    if (proxyUrl !== undefined) await DB.setSetting('notion_proxy_url', proxyUrl);
    if (databaseId !== undefined) await DB.setSetting('notion_database_id', databaseId);
    if (enabled !== undefined) await DB.setSetting('notion_enabled', enabled);
  },

  // Fire-and-forget: never blocks the fast-capture flow. Returns true/false.
  async syncExpense(expense) {
    const { proxyUrl, databaseId, enabled } = await this.getConfig();
    if (!enabled || !proxyUrl || !databaseId) return false;
    try {
      const res = await fetch(proxyUrl.replace(/\/$/, '') + '/notion/expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ databaseId, expense }),
      });
      return res.ok;
    } catch (err) {
      console.warn('Notion sync falló (¿proxy apagado o sin internet?):', err.message);
      return false;
    }
  },

  async testConnection() {
    const { proxyUrl, databaseId } = await this.getConfig();
    if (!proxyUrl || !databaseId) return { ok: false, message: 'Falta la URL del proxy o el ID de la base de datos.' };
    try {
      const res = await fetch(proxyUrl.replace(/\/$/, '') + '/notion/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ databaseId }),
      });
      const data = await res.json().catch(() => ({}));
      return res.ok ? { ok: true, message: 'Conectado ✅' } : { ok: false, message: data.error || 'El proxy respondió con error.' };
    } catch (err) {
      return { ok: false, message: 'No se pudo contactar el proxy: ' + err.message };
    }
  },
};

window.Notion = Notion;
