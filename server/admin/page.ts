// The /admin page: a small self-contained HTML page (no React, no build
// step) for el docente to watch the pilot live and export the data. The
// admin token is typed once and kept in sessionStorage; the page polls
// /api/admin/summary every 10s. Andika is embedded as a data: URI copy of
// src/fonts/andika-400-latin.woff2 (server/admin/fonts/, same OFL license)
// so this route stays self-contained and never calls Google Fonts either.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const andikaBase64 = readFileSync(path.join(here, 'fonts', 'andika-400-latin.woff2')).toString('base64');

export const ADMIN_PAGE_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panel del docente — Prueba piloto de Camino</title>
<style>
@font-face {
  font-family: 'Andika';
  font-style: normal;
  font-weight: 400;
  src: url('data:font/woff2;base64,${andikaBase64}') format('woff2');
}
:root {
  --paper: #f2e9d8;
  --sheet: #fbf7ee;
  --ink: #2b2622;
  --ink-2: #5e554c;
  --orange: #de8a56;
  --blue: #7298c1;
  --blue-ink: #3d6ea5;
  --green: #a4b86d;
  --red: #c9574a;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100dvh;
  background: var(--paper);
  color: var(--ink);
  font-family: 'Andika', system-ui, sans-serif;
  padding: 16px;
}
h1 { font-size: 1.3rem; margin: 0 0 4px; }
.sub { color: var(--ink-2); margin: 0 0 16px; font-size: 0.9rem; }
.card {
  background: var(--sheet);
  border-radius: 14px 10px 15px 9px / 10px 15px 9px 14px;
  box-shadow: 3px 4px 0 rgba(84, 62, 38, 0.15);
  padding: 14px 16px;
  margin-bottom: 16px;
}
label { display: block; font-size: 0.85rem; margin-bottom: 4px; }
input[type=password] {
  font: inherit;
  padding: 8px 10px;
  border: 2px solid var(--ink);
  border-radius: 8px;
  width: 220px;
  margin-right: 8px;
}
button {
  font: inherit;
  padding: 8px 14px;
  border: 2px solid var(--ink);
  border-radius: 8px;
  background: var(--orange);
  color: var(--ink);
  cursor: pointer;
}
button:hover { filter: brightness(1.05); }
button.secondary { background: var(--sheet); }
.stats { display: flex; gap: 24px; flex-wrap: wrap; }
.stat { min-width: 120px; }
.stat .n { font-size: 1.6rem; font-weight: 700; }
.stat .label { font-size: 0.8rem; color: var(--ink-2); }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid rgba(43,38,34,0.15); }
th { color: var(--ink-2); font-weight: 700; }
.active-row { color: var(--green); font-weight: 700; }
.error { color: var(--red); }
.exports { display: flex; gap: 8px; flex-wrap: wrap; }
#status { font-size: 0.8rem; color: var(--ink-2); margin-top: 8px; }
</style>
</head>
<body>
<h1>Panel del docente — Prueba piloto de Camino</h1>
<p class="sub">Dónde está cada chico, cuántos hay por grado y la exportación de los datos anónimos de la sesión.</p>

<div class="card">
  <label for="token">Token de administrador</label>
  <input id="token" type="password" placeholder="ADMIN_TOKEN" autocomplete="off">
  <button id="save">Guardar y actualizar</button>
  <div id="status"></div>
</div>

<div class="card">
  <div class="stats" id="stats">
    <div class="stat"><div class="n" id="active-now">—</div><div class="label">activos ahora</div></div>
  </div>
</div>

<div class="card">
  <table>
    <thead>
      <tr>
        <th>Código</th><th>Grado</th><th>División</th><th>Inicio</th><th>Visto</th>
        <th>Duración</th><th>Paso</th><th>Estado</th><th>Eventos</th>
      </tr>
    </thead>
    <tbody id="sessions"></tbody>
  </table>
</div>

<div class="card">
  <div class="exports">
    <button class="secondary" id="export-json">Exportar todo (JSON)</button>
    <button class="secondary" id="export-sessions-csv">Sesiones (CSV)</button>
    <button class="secondary" id="export-events-csv">Eventos (CSV)</button>
  </div>
</div>

<script>
(function () {
  var TOKEN_KEY = 'camino_admin_token';
  var tokenInput = document.getElementById('token');
  var statusEl = document.getElementById('status');
  var timer = null;

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(t) {
    try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) {}
  }

  var saved = getToken();
  if (saved) tokenInput.value = saved;

  function fmtDuration(seconds) {
    if (seconds == null) return '—';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + 'm ' + s + 's';
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(data) {
    document.getElementById('active-now').textContent = data.active_now;
    var stats = document.getElementById('stats');
    Array.from(stats.querySelectorAll('.grade-stat')).forEach(function (el) { el.remove(); });
    Object.keys(data.counts_by_grade).sort().forEach(function (g) {
      var div = document.createElement('div');
      div.className = 'stat grade-stat';
      div.innerHTML = '<div class="n">' + data.counts_by_grade[g] + '</div><div class="label">grado ' + escapeHtml(g) + '</div>';
      stats.appendChild(div);
    });

    var now = Date.now();
    var rows = data.sessions.map(function (s) {
      var active = !s.ended_at && (now - new Date(s.last_seen_at).getTime()) < data.active_window_minutes * 60000;
      var estado = s.ended_at ? ('terminada: ' + escapeHtml(s.end_reason || '')) : (active ? 'activa' : 'inactiva');
      return '<tr class="' + (active ? 'active-row' : '') + '">' +
        '<td>' + escapeHtml(s.code) + '</td>' +
        '<td>' + escapeHtml(s.grade) + '</td>' +
        '<td>' + escapeHtml(s.division || '—') + '</td>' +
        '<td>' + fmtTime(s.started_at) + '</td>' +
        '<td>' + fmtTime(s.last_seen_at) + '</td>' +
        '<td>' + fmtDuration(s.duration_seconds) + '</td>' +
        '<td>' + escapeHtml(s.current_step || '—') + '</td>' +
        '<td>' + estado + '</td>' +
        '<td>' + escapeHtml(s.event_count) + '</td>' +
        '</tr>';
    });
    document.getElementById('sessions').innerHTML = rows.join('') || '<tr><td colspan="9">Sin sesiones todavía.</td></tr>';
  }

  function refresh() {
    var token = getToken();
    if (!token) { statusEl.textContent = 'Escribí el token para ver los datos.'; statusEl.className = ''; return; }
    fetch('/api/admin/summary', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (res) {
        if (res.status === 401) throw new Error('Token incorrecto.');
        if (res.status === 503) throw new Error('El servidor no tiene ADMIN_TOKEN configurado.');
        if (!res.ok) throw new Error('Error al consultar (' + res.status + ').');
        return res.json();
      })
      .then(function (data) {
        statusEl.textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-AR');
        statusEl.className = '';
        render(data);
      })
      .catch(function (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'error';
      });
  }

  function download(url, filename) {
    var token = getToken();
    if (!token) { statusEl.textContent = 'Escribí el token primero.'; statusEl.className = 'error'; return; }
    fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      .then(function (res) {
        if (!res.ok) throw new Error('No se pudo exportar (' + res.status + ').');
        return res.blob();
      })
      .then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(function (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'error';
      });
  }

  document.getElementById('save').addEventListener('click', function () {
    setToken(tokenInput.value.trim());
    if (timer) clearInterval(timer);
    refresh();
    timer = setInterval(refresh, 10000);
  });
  document.getElementById('export-json').addEventListener('click', function () {
    download('/api/admin/export?format=json', 'prueba-piloto.json');
  });
  document.getElementById('export-sessions-csv').addEventListener('click', function () {
    download('/api/admin/export?format=csv&table=sessions', 'sessions.csv');
  });
  document.getElementById('export-events-csv').addEventListener('click', function () {
    download('/api/admin/export?format=csv&table=events', 'events.csv');
  });

  if (saved) { refresh(); timer = setInterval(refresh, 10000); }
})();
</script>
</body>
</html>
`;
