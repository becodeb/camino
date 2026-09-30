#!/usr/bin/env node
// Fetches a full export of the pilot playtest data and writes it under
// exports/ (gitignored) with a timestamp in the filename. No dependencies:
// plain fetch and fs.
//
// Reads EXPORT_TOKEN and PLAYTEST_URL from ~/.credentials/camino-prueba.env
// by parsing the file itself (never printed, never logged). That file is
// expected to look like:
//   EXPORT_TOKEN=...
//   PLAYTEST_URL=https://camino-prueba.becode.com.ar
//
// Usage: node tools/export-playtest.mjs

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const CREDENTIALS_PATH = path.join(homedir(), '.credentials', 'camino-prueba.env');

function parseEnvFile(text) {
  const vars = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function readCredentials() {
  let text;
  try {
    text = readFileSync(CREDENTIALS_PATH, 'utf8');
  } catch {
    throw new Error(`could not read ${CREDENTIALS_PATH} (expected EXPORT_TOKEN and PLAYTEST_URL)`);
  }
  const vars = parseEnvFile(text);
  if (!vars.EXPORT_TOKEN) throw new Error(`EXPORT_TOKEN missing from ${CREDENTIALS_PATH}`);
  if (!vars.PLAYTEST_URL) throw new Error(`PLAYTEST_URL missing from ${CREDENTIALS_PATH}`);
  return { exportToken: vars.EXPORT_TOKEN, playtestUrl: vars.PLAYTEST_URL.replace(/\/$/, '') };
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

async function fetchExport(baseUrl, token, format, table) {
  const url = new URL('/api/export', baseUrl);
  url.searchParams.set('format', format);
  if (table) url.searchParams.set('table', table);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`export request failed: ${res.status} ${res.statusText} (${url.pathname}${url.search})`);
  }
  return format === 'json' ? res.json() : res.text();
}

async function main() {
  const { exportToken, playtestUrl } = readCredentials();

  const [json, sessionsCsv, eventsCsv] = await Promise.all([
    fetchExport(playtestUrl, exportToken, 'json'),
    fetchExport(playtestUrl, exportToken, 'csv', 'sessions'),
    fetchExport(playtestUrl, exportToken, 'csv', 'events'),
  ]);

  const outDir = path.join(process.cwd(), 'exports');
  mkdirSync(outDir, { recursive: true });
  const stamp = timestamp();
  const base = path.join(outDir, `playtest-${stamp}`);

  writeFileSync(`${base}.json`, JSON.stringify(json, null, 2), 'utf8');
  writeFileSync(`${base}.sessions.csv`, sessionsCsv, 'utf8');
  writeFileSync(`${base}.events.csv`, eventsCsv, 'utf8');

  console.log(`wrote ${base}.json`);
  console.log(`wrote ${base}.sessions.csv`);
  console.log(`wrote ${base}.events.csv`);
}

main().catch((err) => {
  console.error(`export-playtest failed: ${err.message}`);
  process.exit(1);
});
