// The /admin page: a small self-contained HTML page (no React, no build
// step) for el docente to run the class and watch the pilot live.
// - Login with the password (ADMIN_PASSWORD): POST /api/admin/login sets a
//   signed HttpOnly cookie (12 h); nothing secret is kept by the page.
// - The class panel: two big buttons, "Quedan 5 minutos" and "Terminar la
//   clase" (with a confirm), plus "Cancelar aviso"; who is playing now, on
//   which step, who finished the route ("terminó") and who did the survey.
//   Demo sessions are not listed (only counted).
// - Every session (older ones too), the delete button and the exports.
// It polls /api/admin/summary every 5 s. Andika is embedded as a data: URI
// copy of src/fonts/andika-400-latin.woff2 (server/admin/fonts/, same OFL
// license) so this route stays self-contained and never calls Google Fonts.

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
<meta name="robots" content="noindex">
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
  --yellow: #f0d27a;
  --blue: #7298c1;
  --blue-ink: #3d6ea5;
  --green: #8fae4f;
  --green-ink: #4f7a2a;
  --red: #c9574a;
  --shadow: rgba(84, 62, 38, 0.18);
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
main { max-width: 1100px; margin: 0 auto; }
h1 { font-size: 1.35rem; margin: 0 0 4px; }
h2 { font-size: 1.1rem; margin: 0 0 10px; }
.sub { color: var(--ink-2); margin: 0 0 16px; font-size: 0.92rem; }
.card {
  background: var(--sheet);
  border-radius: 14px 10px 15px 9px / 10px 15px 9px 14px;
  box-shadow: 3px 4px 0 var(--shadow);
  padding: 16px 18px;
  margin-bottom: 16px;
}
label { display: block; font-size: 0.95rem; margin-bottom: 6px; }
input[type=password] {
  font: inherit;
  font-size: 1.1rem;
  padding: 10px 12px;
  border: 2.5px solid var(--ink);
  border-radius: 10px 8px 11px 7px;
  width: min(100%, 300px);
  margin: 0 8px 8px 0;
  background: #fff;
}
button {
  font: inherit;
  padding: 9px 16px;
  border: 2.5px solid var(--ink);
  border-radius: 10px 8px 11px 7px / 8px 11px 7px 10px;
  background: var(--orange);
  color: var(--ink);
  cursor: pointer;
  box-shadow: 2px 3px 0 var(--shadow);
}
button:hover { filter: brightness(1.05); }
button:active { transform: translate(1px, 2px); box-shadow: 1px 1px 0 var(--shadow); }
button:disabled { opacity: 0.5; cursor: default; }
button.secondary { background: var(--sheet); }
.big-buttons { display: flex; gap: 16px; flex-wrap: wrap; align-items: stretch; }
.big {
  min-height: 92px;
  min-width: 260px;
  flex: 1 1 260px;
  font-size: 1.45rem;
  font-weight: 700;
  padding: 14px 22px;
  display: flex; align-items: center; justify-content: center; gap: 14px;
}
.big svg { width: 54px; height: 54px; flex: none; }
.big.warn { background: var(--yellow); }
.big.stop { background: #e69a8c; }
.big.stop.is-confirm { background: var(--red); color: #fff; }
.class-state { margin: 12px 0 0; font-size: 1rem; min-height: 1.5em; }
.class-state b { color: var(--blue-ink); }
.stats { display: flex; gap: 28px; flex-wrap: wrap; margin-bottom: 8px; }
.stat .n { font-size: 2rem; font-weight: 700; line-height: 1.1; }
.stat .label { font-size: 0.85rem; color: var(--ink-2); }
.stat.done .n { color: var(--green-ink); }
table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid rgba(43,38,34,0.15); vertical-align: middle; }
th { color: var(--ink-2); font-weight: 700; }
.class-table td { font-size: 1rem; }
.yes { color: var(--green-ink); font-weight: 700; font-size: 1.25rem; }
.no { color: rgba(43,38,34,0.35); }
.flag { display: inline-block; width: 28px; height: 22px; vertical-align: -4px; }
.active-row { color: var(--green-ink); font-weight: 700; }
.error { color: var(--red); }
button.del { padding: 3px 9px; font-size: 0.8rem; background: var(--sheet); border-color: var(--red); color: var(--red); box-shadow: none; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.exports { display: flex; gap: 8px; flex-wrap: wrap; }
.status { font-size: 0.85rem; color: var(--ink-2); margin-top: 8px; min-height: 1.2em; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
details summary { cursor: pointer; font-weight: 700; padding: 4px 0; }
.note { font-size: 0.85rem; color: var(--ink-2); margin: 8px 0 0; }
.scroll { overflow-x: auto; }
[hidden] { display: none !important; }
</style>
</head>
<body>
<main>
<div class="top">
  <div>
    <h1>Panel del docente — Prueba piloto de Camino</h1>
    <p class="sub">Avisá el final de la clase en todas las compus, mirá quién terminó y exportá los datos anónimos.</p>
  </div>
  <button type="button" class="secondary" id="logout" hidden>Salir</button>
</div>

<section class="card" id="login-card" hidden>
  <h2>Entrar</h2>
  <form id="login-form">
    <label for="password">Contraseña del docente</label>
    <input id="password" type="password" autocomplete="current-password" required>
    <button type="submit" id="login-btn">Entrar</button>
  </form>
  <div class="status" id="login-status" role="status"></div>
</section>

<div id="panel" hidden>
<section class="card" aria-labelledby="class-h">
  <h2 id="class-h">La clase</h2>
  <div class="big-buttons">
    <button type="button" class="big warn" id="five-min">
      <svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="32" r="22" fill="#fbf7ee" stroke="#2b2622" stroke-width="3.5"/><path d="M30 32 L30 17 M30 32 L41 38" stroke="#2b2622" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M22 6 L38 6" stroke="#2b2622" stroke-width="4" stroke-linecap="round"/></svg>
      Quedan 5 minutos
    </button>
    <button type="button" class="big stop" id="end-class">
      <svg viewBox="0 0 60 60" aria-hidden="true"><path d="M14 54 L14 8" stroke="#2b2622" stroke-width="4" stroke-linecap="round"/><path d="M15 9 C26 4 34 15 47 9 L47 33 C34 39 26 28 15 33 Z" fill="#fbf7ee" stroke="#2b2622" stroke-width="3.5" stroke-linejoin="round"/></svg>
      <span id="end-label">Terminar la clase</span>
    </button>
  </div>
  <p class="class-state" id="class-state" role="status"></p>
  <button type="button" class="secondary" id="cancel-warn" hidden>Cancelar aviso de 5 minutos</button>
  <p class="note">Las compus reciben el aviso en unos segundos. Una compu sin internet lo recibe cuando vuelve la conexión (hasta 2 horas).</p>
</section>

<section class="card" aria-labelledby="now-h">
  <h2 id="now-h">Esta clase <small>(sesiones vistas en las últimas 2 horas)</small></h2>
  <div class="stats">
    <div class="stat"><div class="n" id="c-active">—</div><div class="label">jugando ahora</div></div>
    <div class="stat"><div class="n" id="c-sessions">—</div><div class="label">sesiones en la clase</div></div>
    <div class="stat done"><div class="n" id="c-done">—</div><div class="label">terminaron (bandera verde)</div></div>
    <div class="stat done"><div class="n" id="c-survey">—</div><div class="label">hicieron la encuesta</div></div>
  </div>
  <div class="scroll">
    <table class="class-table">
      <thead><tr><th>Código</th><th>Grado</th><th>Está en</th><th>Terminó</th><th>Encuesta</th><th>Visto</th></tr></thead>
      <tbody id="class-rows"></tbody>
    </table>
  </div>
  <p class="note" id="demo-note"></p>
</section>

<section class="card">
  <details>
    <summary>Todas las sesiones</summary>
    <div class="stats" id="grade-stats"></div>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>Código</th><th>Grado</th><th>División</th><th>Inicio</th><th>Visto</th>
            <th>Duración</th><th>Paso</th><th>Estado</th><th>Eventos</th><th><span class="sr">Borrar</span></th>
          </tr>
        </thead>
        <tbody id="sessions"></tbody>
      </table>
    </div>
  </details>
</section>

<section class="card">
  <div class="exports">
    <button class="secondary" id="export-json">Exportar todo (JSON)</button>
    <button class="secondary" id="export-sessions-csv">Sesiones (CSV)</button>
    <button class="secondary" id="export-events-csv">Eventos (CSV)</button>
  </div>
  <div class="status" id="status" role="status"></div>
</section>
</div>
</main>

<script>
(function () {
  var STEP = {
    setup: 'preparación', character: 'personaje', tool_check: 'probar los botones', ladder: 'escalera de niveles',
    free_play: 'juego libre', typing: 'Teclas del bosque', wardrobe: 'vestidor', survey: 'encuesta', goodbye: 'despedida',
    class_end: 'actividad terminada'
  };
  var FLAG = '<svg class="flag" viewBox="0 0 28 22" aria-hidden="true"><path d="M3 21 L3 2" stroke="#2b2622" stroke-width="2.4" stroke-linecap="round"/><path d="M4 3 C10 0 15 6 24 3 L24 13 C15 16 10 10 4 13 Z" fill="#8fae4f" stroke="#2b2622" stroke-width="2" stroke-linejoin="round"/></svg>';
  var statusEl = document.getElementById('status');
  var timer = null;
  var confirmTimer = null;
  var endConfirm = false;

  function $(id) { return document.getElementById(id); }
  function show(el, on) { el.hidden = !on; }
  function say(el, text, isError) { el.textContent = text; el.className = (el.className.replace(/ ?error/g, '')) + (isError ? ' error' : ''); }

  function api(url, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    opts.headers = Object.assign({ 'x-camino-admin': '1' }, opts.headers || {});
    return fetch(url, opts);
  }

  function fmtDuration(seconds) {
    if (seconds == null) return '—';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + 'm ' + s + 's';
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtAgo(iso) {
    if (!iso) return '—';
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return 'hace ' + s + ' s';
    if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
    return fmtTime(iso);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loggedOut(msg) {
    if (timer) { clearInterval(timer); timer = null; }
    show($('panel'), false);
    show($('logout'), false);
    show($('login-card'), true);
    say($('login-status'), msg || '', !!msg);
    $('password').focus();
  }
  function loggedIn() {
    show($('login-card'), false);
    show($('panel'), true);
    show($('logout'), true);
    refresh();
    if (timer) clearInterval(timer);
    timer = setInterval(refresh, 5000);
  }

  function renderClass(data) {
    var live = data.commands || [];
    var end = live.filter(function (c) { return c.kind === 'end_class'; })[0];
    var warn = live.filter(function (c) { return c.kind === 'five_min' && !c.cancelled; })[0];
    var text = '';
    if (end) text = 'Clase terminada a las <b>' + fmtTime(end.at) + '</b>: las compus muestran «Actividad terminada» y se cierran solas.';
    else if (warn) text = 'Aviso de 5 minutos enviado a las <b>' + fmtTime(warn.at) + '</b>: cada chico termina lo que está haciendo, el vestidor y la encuesta.';
    $('class-state').innerHTML = text;
    show($('cancel-warn'), !!warn && !end);

    var cc = data.class_counts || { sessions: 0, route_done: 0, survey_done: 0 };
    $('c-active').textContent = data.active_now;
    $('c-sessions').textContent = cc.sessions;
    $('c-done').textContent = cc.route_done;
    $('c-survey').textContent = cc.survey_done;
    var now = Date.now();
    var rows = data.sessions.filter(function (s) { return s.in_class; }).map(function (s) {
      var active = !s.ended_at && (now - new Date(s.last_seen_at).getTime()) < data.active_window_minutes * 60000;
      var where = s.ended_at ? ('terminada' + (s.end_reason === 'class_end' ? ' (fin de clase)' : '')) : (STEP[s.current_step] || s.current_step || '—');
      return '<tr class="' + (active ? 'active-row' : '') + '" data-id="' + escapeHtml(s.session_id) + '">' +
        '<td>' + escapeHtml(s.code) + '</td>' +
        '<td>' + escapeHtml(s.grade) + '°</td>' +
        '<td>' + escapeHtml(where) + '</td>' +
        '<td class="' + (s.route_done ? 'yes' : 'no') + '" data-done="' + (s.route_done ? '1' : '0') + '">' + (s.route_done ? FLAG + ' ✓' : '—') + '</td>' +
        '<td class="' + (s.survey_done ? 'yes' : 'no') + '" data-survey="' + (s.survey_done ? '1' : '0') + '">' + (s.survey_done ? '✓' : '—') + '</td>' +
        '<td>' + fmtAgo(s.last_seen_at) + '</td>' +
        '</tr>';
    });
    $('class-rows').innerHTML = rows.join('') || '<tr><td colspan="6">Nadie jugando en esta clase todavía.</td></tr>';
    $('demo-note').textContent = data.demo_hidden ? ('Hay ' + data.demo_hidden + ' sesión(es) de demo: no se muestran ni se exportan, y se borran solas a las 24 horas.') : '';
  }

  function renderAll(data) {
    var stats = $('grade-stats');
    stats.innerHTML = '';
    Object.keys(data.counts_by_grade).sort().forEach(function (g) {
      var div = document.createElement('div');
      div.className = 'stat';
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
        '<td><button type="button" class="del" data-id="' + escapeHtml(s.session_id) + '" data-code="' + escapeHtml(s.code) + '" title="Borrar esta sesión">Borrar</button></td>' +
        '</tr>';
    });
    $('sessions').innerHTML = rows.join('') || '<tr><td colspan="10">Sin sesiones todavía.</td></tr>';
  }

  function refresh() {
    return api('/api/admin/summary')
      .then(function (res) {
        if (res.status === 401) { loggedOut('La sesión venció: entrá otra vez.'); return null; }
        if (!res.ok) throw new Error('Error al consultar (' + res.status + ').');
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        say(statusEl, 'Actualizado ' + new Date().toLocaleTimeString('es-AR'), false);
        renderClass(data);
        renderAll(data);
      })
      .catch(function (err) { say(statusEl, err.message, true); });
  }

  function command(url, body, done) {
    return api(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (res) {
        if (res.status === 401) { loggedOut('La sesión venció: entrá otra vez.'); return; }
        if (!res.ok) throw new Error('No se pudo enviar (' + res.status + ').');
        say(statusEl, done, false);
        return refresh();
      })
      .catch(function (err) { say(statusEl, err.message, true); });
  }

  function resetConfirm() {
    endConfirm = false;
    $('end-class').classList.remove('is-confirm');
    $('end-label').textContent = 'Terminar la clase';
  }

  $('five-min').addEventListener('click', function () {
    command('/api/admin/commands', { kind: 'five_min' }, 'Aviso de 5 minutos enviado.');
  });
  $('end-class').addEventListener('click', function () {
    if (!endConfirm) {
      endConfirm = true;
      $('end-class').classList.add('is-confirm');
      $('end-label').textContent = '¿Seguro? Tocá otra vez para terminar';
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(resetConfirm, 6000);
      return;
    }
    clearTimeout(confirmTimer);
    resetConfirm();
    command('/api/admin/commands', { kind: 'end_class' }, 'Clase terminada: las compus se cierran en unos segundos.');
  });
  $('cancel-warn').addEventListener('click', function () {
    command('/api/admin/commands/cancel', {}, 'Aviso cancelado.');
  });

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = $('password').value;
    $('login-btn').disabled = true;
    fetch('/api/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) })
      .then(function (res) {
        $('login-btn').disabled = false;
        if (res.ok) { $('password').value = ''; loggedIn(); return; }
        if (res.status === 429) return res.json().then(function (b) { say($('login-status'), 'Demasiados intentos. Probá de nuevo en ' + Math.ceil((b.retry_after_s || 600) / 60) + ' minutos.', true); });
        if (res.status === 503) { say($('login-status'), 'El servidor no tiene contraseña configurada (ADMIN_PASSWORD).', true); return; }
        say($('login-status'), 'Contraseña incorrecta.', true);
        $('password').select();
      })
      .catch(function () { $('login-btn').disabled = false; say($('login-status'), 'Sin conexión con el servidor.', true); });
  });

  $('logout').addEventListener('click', function () {
    fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).then(function () { loggedOut(''); });
  });

  function download(url, filename) {
    api(url)
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
      .catch(function (err) { say(statusEl, err.message, true); });
  }

  // Removes a check or test session (and its events) after a confirm.
  $('sessions').addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('button.del');
    if (!btn) return;
    if (!confirm('¿Borrar la sesión «' + btn.dataset.code + '» y todos sus eventos? No se puede deshacer.')) return;
    btn.disabled = true;
    api('/api/admin/sessions/' + encodeURIComponent(btn.dataset.id), { method: 'DELETE' })
      .then(function (res) {
        if (!res.ok && res.status !== 404) throw new Error('No se pudo borrar (' + res.status + ').');
        return refresh();
      })
      .then(function () { say(statusEl, 'Sesión «' + btn.dataset.code + '» borrada.', false); })
      .catch(function (err) { btn.disabled = false; say(statusEl, err.message, true); });
  });
  $('export-json').addEventListener('click', function () { download('/api/admin/export?format=json', 'prueba-piloto.json'); });
  $('export-sessions-csv').addEventListener('click', function () { download('/api/admin/export?format=csv&table=sessions', 'sessions.csv'); });
  $('export-events-csv').addEventListener('click', function () { download('/api/admin/export?format=csv&table=events', 'events.csv'); });

  api('/api/admin/me').then(function (res) {
    if (res.ok) loggedIn();
    else if (res.status === 503) loggedOut('El servidor no tiene contraseña configurada (ADMIN_PASSWORD).');
    else loggedOut('');
  }).catch(function () { loggedOut('Sin conexión con el servidor.'); });
})();
</script>
</body>
</html>
`;
