// Minimal Notion sync proxy — zero npm dependencies (Node built-ins only).
//
// Why this exists: the Notion API has no CORS support and expects a secret
// integration token, so the PWA (pure client-side, static files) cannot talk
// to Notion directly from the browser. This tiny server holds the token and
// forwards two calls on the PWA's behalf.
//
// Setup:
//   1. Create a Notion integration -> https://www.notion.so/my-integrations
//   2. Share your Notion database with that integration.
//   3. Set env vars and run:
//        NOTION_TOKEN=secret_xxx PORT=8787 node server/server.js
//   4. In the app's Ajustes screen, set "Notion proxy URL" to
//        http://localhost:8787  (or wherever you deploy this)
//      and paste the database ID.
const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8787;
const NOTION_TOKEN = process.env.NOTION_TOKEN || '';
const NOTION_VERSION = '2022-06-28';

function notionRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.notion.com',
        path,
        method,
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json;
          try { json = JSON.parse(data); } catch { json = { raw: data }; }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function expenseToNotionPage(databaseId, expense) {
  return {
    parent: { database_id: databaseId },
    properties: {
      Nombre: { title: [{ text: { content: expense.note || expense.category || 'Gasto' } }] },
      Importe: { number: Number(expense.amount) || 0 },
      Fecha: { date: { start: expense.date } },
      Categoria: { select: { name: expense.category } },
      'Metodo de pago': { select: { name: expense.paymentMethod } },
      Nota: { rich_text: [{ text: { content: expense.note || '' } }] },
    },
  };
}

function send(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  if (!NOTION_TOKEN) {
    return send(res, 500, { error: 'Falta la variable de entorno NOTION_TOKEN en el servidor.' });
  }

  try {
    if (req.method === 'POST' && req.url === '/notion/ping') {
      const { databaseId } = await readBody(req);
      const result = await notionRequest(`/v1/databases/${databaseId}`, 'GET');
      if (result.status >= 200 && result.status < 300) return send(res, 200, { ok: true });
      return send(res, result.status, { error: result.body?.message || 'No se pudo leer la base de datos.' });
    }

    if (req.method === 'POST' && req.url === '/notion/expense') {
      const { databaseId, expense } = await readBody(req);
      if (!databaseId || !expense) return send(res, 400, { error: 'Falta databaseId o expense.' });
      const page = expenseToNotionPage(databaseId, expense);
      const result = await notionRequest('/v1/pages', 'POST', page);
      if (result.status >= 200 && result.status < 300) return send(res, 200, { ok: true, id: result.body.id });
      return send(res, result.status, { error: result.body?.message || 'Notion rechazó la fila.' });
    }

    send(res, 404, { error: 'Ruta no encontrada.' });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Notion proxy escuchando en http://localhost:${PORT}`);
  if (!NOTION_TOKEN) console.warn('⚠️  NOTION_TOKEN no está definido — las llamadas a Notion fallarán.');
});
