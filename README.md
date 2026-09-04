# Gastos Rápidos

Registro de gastos personales en menos de 20 segundos, inspirado en un atajo de
iPhone: abrir, tocar, listo. PWA instalable en el home screen, sin cuentas,
sin backend obligatorio — todo se guarda en el propio dispositivo (IndexedDB).

## Flujo de captura

Home → **Nuevo gasto** → Importe (teclado tipo calculadora) → Nota (opcional,
"Omitir" con un toque) → Fecha (hoy preseleccionado) → Categoría (toque único)
→ Método de pago (toque único) → ✅ confirmación y vuelta a Home.

Cada paso avanza solo con el toque de la opción — no hay botón "Siguiente"
salvo en el teclado numérico (OK).

## Correr en local

El navegador bloquea IndexedDB y Service Workers cuando el archivo se abre
directamente (`file://`), así que hace falta un servidor estático simple:

```bash
cd gastos-rapidos
python -m http.server 5173
# o: npx serve .
```

Abrir `http://localhost:5173` en el navegador del celular (misma red Wi-Fi,
usando la IP de la compu) o en el navegador de escritorio.

## Instalar en el iPhone (PWA)

1. Abrir la URL en Safari.
2. Compartir → **Agregar a pantalla de inicio**.
3. Listo — abre a pantalla completa, sin barra de navegador, con ícono propio.

Para que funcione fuera de la red local hace falta publicarla en un hosting
estático real (ver "Desplegar" abajo) — Safari no permite instalar una PWA
servida desde `localhost` de otra máquina.

## Desplegar

Es un sitio 100% estático (`index.html` + `css/` + `js/` + `manifest.json` +
`sw.js` + `icons/`). Cualquier hosting estático sirve: GitHub Pages, Netlify,
Vercel, Cloudflare Pages. Solo hay que servir la carpeta `gastos-rapidos/`
completa por HTTPS (requisito de los Service Workers).

## Datos y estructura

Todo se guarda en IndexedDB (`gastos_rapidos_db`), sin depender de red:

- **expenses**: `date`, `amount`, `category`, `categoryId`, `paymentMethod`,
  `note`, `createdAt`, `synced`.
- **categories**: las 6 predefinidas (Comida, Transporte, Ropa,
  Entretenimiento, Deporte, Gasolina) + las que el usuario agregue con "Otra".
- **settings**: tema, configuración de Notion.

`js/db.js` centraliza todo el acceso — es el único lugar que sabría qué
cambiar si el día de mañana esto se conecta a un backend real en vez de
IndexedDB.

Desde Ajustes → **Exportar gastos (JSON)** se descarga un respaldo completo.

## Dashboard / historial

Pantalla accesible desde el ícono 📊 del home o "Ver historial": total del
período, gasto por categoría (barras, ordenadas de mayor a menor), filtro por
rango de fechas (mes actual / 7 días / 30 días / todo) y por categoría, y la
lista de movimientos (tocar uno para editarlo o eliminarlo).

## Sincronización con Notion (opcional)

La API de Notion no admite llamadas directas desde el navegador (sin CORS) y
requiere un token secreto que no debe viajar al cliente — por eso la
integración necesita el pequeño proxy incluido en `server/server.js` (cero
dependencias npm, solo Node).

1. Crear una integración en <https://www.notion.so/my-integrations> y copiar
   su token (`secret_...`).
2. Compartir tu base de datos de Notion con esa integración (··· → Conexiones).
3. La base de datos necesita estas propiedades: **Nombre** (título),
   **Importe** (número), **Fecha** (fecha), **Categoria** (selección),
   **Metodo de pago** (selección), **Nota** (texto).
4. Levantar el proxy:
   ```bash
   cd server
   NOTION_TOKEN=secret_xxx PORT=8787 node server.js
   ```
5. En la app: Ajustes → activar "Activar sincronización", poner la URL del
   proxy (`http://localhost:8787` o donde lo despliegues) y el ID de la base
   de datos de Notion (los 32 caracteres del final de su URL). "Probar
   conexión" confirma que quedó bien.

Cada gasto nuevo intenta sincronizarse en segundo plano; si falla (proxy
apagado, sin internet) el gasto igual queda guardado localmente — la
sincronización nunca bloquea ni retrasa la captura.

## Estructura del proyecto

```
gastos-rapidos/
├── index.html          pantallas + markup de la SPA
├── manifest.json        metadata PWA
├── sw.js                 service worker (cache offline del app shell)
├── css/styles.css        estilos (mobile-first, modo oscuro por defecto)
├── js/
│   ├── db.js              IndexedDB: gastos, categorías, ajustes
│   ├── charts.js          gráfico de barras por categoría (paleta validada)
│   ├── notion.js          cliente del proxy de Notion (opcional)
│   └── app.js             flujo de pasos, dashboard, ajustes
├── icons/                 íconos PWA / apple-touch-icon
├── scripts/generate-icons.js  genera los PNG de icons/ (ya generados)
└── server/server.js       proxy opcional para Notion (Node puro, sin deps)
```
