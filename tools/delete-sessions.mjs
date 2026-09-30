#!/usr/bin/env node
// Deletes check or test sessions (and, by the cascade, their events) from
// the pilot playtest's database through DELETE /api/admin/sessions/:id, the
// endpoint behind /admin's "Borrar" button. For the sessions a scripted
// check made (tools/check-session.mjs prints SESSION_IDS=…).
//
// Reads ADMIN_TOKEN and PLAYTEST_URL from ~/.credentials/camino-prueba.env
// (parsed here, never printed), like tools/export-playtest.mjs.
//
// Usage: node tools/delete-sessions.mjs <id,id,…>   (or SESSION_IDS=<id,id,…>)

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const CREDENTIALS_PATH = path.join(homedir(), '.credentials', 'camino-prueba.env');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readCredentials() {
  let text;
  try {
    text = readFileSync(CREDENTIALS_PATH, 'utf8');
  } catch {
    throw new Error(`could not read ${CREDENTIALS_PATH} (expected ADMIN_TOKEN and PLAYTEST_URL)`);
  }
  const vars = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const eq = line.indexOf('=');
    if (!line || line.startsWith('#') || eq === -1) continue;
    vars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  if (!vars.ADMIN_TOKEN) throw new Error(`ADMIN_TOKEN missing from ${CREDENTIALS_PATH}`);
  if (!vars.PLAYTEST_URL) throw new Error(`PLAYTEST_URL missing from ${CREDENTIALS_PATH}`);
  return { token: vars.ADMIN_TOKEN, base: vars.PLAYTEST_URL.replace(/\/$/, '') };
}

async function main() {
  const arg = process.argv.slice(2).join(',').replace(/SESSION_IDS=/g, '');
  const ids = arg.split(',').map((x) => x.trim()).filter(Boolean);
  if (!ids.length || !ids.every((x) => UUID.test(x))) throw new Error('usage: node tools/delete-sessions.mjs <uuid,uuid,…>');
  const { token, base } = readCredentials();
  let failed = 0;
  for (const id of ids) {
    const res = await fetch(`${base}/api/admin/sessions/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    if (res.ok) console.log(`deleted ${id} and its events`);
    else { failed++; console.log(`not deleted ${id}: ${res.status} ${body.error ?? res.statusText}`); }
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(`delete-sessions failed: ${err.message}`);
  process.exit(1);
});
