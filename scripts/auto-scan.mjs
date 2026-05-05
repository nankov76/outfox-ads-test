#!/usr/bin/env node
// Auto-scan — fetches Meta Ads Library data and writes results to data/latest.json
// Sends Telegram notification with diff vs previous scan.
// Runs on GitHub Actions cron. Single-tenant: only owner's tokens.

import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';

const FB_TOKEN = process.env.FB_TOKEN;
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

if (!FB_TOKEN) {
  console.error('FB_TOKEN secret not set'); process.exit(1);
}

const BRANDS_FILE = 'scripts/brands.json';
const DATA_DIR = 'data';
const LATEST_FILE = path.join(DATA_DIR, 'latest.json');
const HISTORY_DIR = path.join(DATA_DIR, 'history');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchBrandAds(query, country = 'BG') {
  // Meta Graph API v21.0 ads_archive endpoint
  const url = new URL('https://graph.facebook.com/v21.0/ads_archive');
  url.searchParams.set('access_token', FB_TOKEN);
  url.searchParams.set('search_terms', query);
  url.searchParams.set('ad_reached_countries', JSON.stringify([country]));
  url.searchParams.set('ad_active_status', 'ACTIVE');
  url.searchParams.set('limit', '50');
  url.searchParams.set('fields', 'id,page_name,ad_creation_time,ad_creative_bodies,ad_snapshot_url,impressions,spend,publisher_platforms');

  const res = await fetch(url, {method: 'GET'});
  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 401 || /access token/i.test(txt)) {
      throw new Error(`AUTH_ERROR: FB token invalid or expired (${res.status})`);
    }
    throw new Error(`API ${res.status}: ${txt.substring(0, 200)}`);
  }
  const data = await res.json();
  return data.data || [];
}

async function loadJson(filepath, fallback) {
  if (!existsSync(filepath)) return fallback;
  try { return JSON.parse(await readFile(filepath, 'utf8')); }
  catch { return fallback; }
}

async function sendTelegram(text) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    console.log('Telegram not configured, skipping notification.');
    return;
  }
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) console.error('Telegram failed:', await res.text());
  } catch (e) {
    console.error('Telegram error:', e.message);
  }
}

function buildDiffMessage(brands, prev, scanDate) {
  const prevMap = Object.fromEntries((prev?.brands || []).map(b => [b.name, b]));
  const lines = brands.map(b => {
    const old = prevMap[b.name];
    const oldCount = old?.count || 0;
    const delta = b.count - oldCount;
    let sym = '➖', emoji = '';
    if (!old) { sym = '🆕'; emoji = '(нов)'; }
    else if (delta > 0) { sym = '📈'; emoji = `(+${delta} нови)`; }
    else if (delta < 0) { sym = '📉'; emoji = `(${delta})`; }
    return `${sym} <b>${b.name}</b>: ${oldCount} → ${b.count} ${emoji}`.trim();
  }).join('\n');

  const totalNow = brands.reduce((s, b) => s + b.count, 0);
  const totalPrev = (prev?.brands || []).reduce((s, b) => s + b.count, 0);
  const totalDelta = totalNow - totalPrev;

  return [
    '🤖 <b>Auto-scan завършен</b>',
    `📅 ${scanDate.toLocaleString('bg-BG', {timeZone: 'Europe/Sofia', dateStyle: 'long', timeStyle: 'short'})}`,
    '',
    `✅ ${brands.length} бранда сканирани`,
    `📊 Общо: ${totalNow} (${totalDelta >= 0 ? '+' : ''}${totalDelta})`,
    '',
    lines,
    '',
    '🔗 https://nankov76.github.io/outfox-ads-test/',
  ].join('\n');
}

async function main() {
  const config = await loadJson(BRANDS_FILE, {country: 'BG', brands: []});
  if (!config.brands?.length) {
    console.error('No brands configured in', BRANDS_FILE);
    process.exit(1);
  }

  console.log(`Scanning ${config.brands.length} brands in ${config.country}...`);

  const scanDate = new Date();
  const results = [];
  const errors = [];

  for (const query of config.brands) {
    try {
      console.log(`  → ${query}`);
      const ads = await fetchBrandAds(query, config.country);
      const copies = ads.map(a => ({
        id: a.id,
        page: a.page_name,
        copy: (a.ad_creative_bodies || []).join(' | ').substring(0, 500),
        date: a.ad_creation_time,
        snapshot: a.ad_snapshot_url,
        impressions: a.impressions || null,
        spend: a.spend || null,
        platforms: a.publisher_platforms || [],
      }));
      results.push({name: query, count: copies.length, copies});
      await sleep(2000); // rate limit safety
    } catch (e) {
      console.error(`  ✗ ${query}: ${e.message}`);
      errors.push({brand: query, error: e.message});
      // If it's an auth error, abort early
      if (/AUTH_ERROR/.test(e.message)) {
        await sendTelegram(`⚠️ <b>Auto-scan failed</b>\n\nFacebook token е невалиден или изтекъл.\nПоднови го в GitHub Secrets → FB_TOKEN.\n\nГрешка: ${e.message}`);
        process.exit(1);
      }
    }
  }

  // Load previous for diff
  const prev = await loadJson(LATEST_FILE, null);

  // Write latest
  await mkdir(DATA_DIR, {recursive: true});
  const newScan = {
    timestamp: scanDate.toISOString(),
    country: config.country,
    source: 'auto-scan',
    brands: results,
    errors: errors.length ? errors : undefined,
  };
  await writeFile(LATEST_FILE, JSON.stringify(newScan, null, 2));

  // Write to history (one file per day)
  await mkdir(HISTORY_DIR, {recursive: true});
  const histFile = path.join(HISTORY_DIR, scanDate.toISOString().split('T')[0] + '.json');
  await writeFile(histFile, JSON.stringify(newScan, null, 2));

  // Send Telegram diff
  const msg = buildDiffMessage(results, prev, scanDate);
  await sendTelegram(msg);

  console.log('Done. Total ads:', results.reduce((s, r) => s + r.count, 0));
}

main().catch(async (e) => {
  console.error('Fatal:', e.message);
  await sendTelegram(`❌ <b>Auto-scan failed</b>\n\n${e.message}\n\nProvери GitHub Actions log.`);
  process.exit(1);
});
