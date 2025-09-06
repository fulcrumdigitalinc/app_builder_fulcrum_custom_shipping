/*
Copyright 2025
Licensed under the Apache License, Version 2.0
*/

const { Core } = require('@adobe/aio-sdk');
const { webhookVerify } = require('../../lib/adobe-commerce');
const { HTTP_OK } = require('../../lib/http');
const fetch = require('node-fetch');
const FilesLib = require('@adobe/aio-lib-files');

// ---------- Small utilities (English comments) ----------
const b64decode = (b64) => { try { return Buffer.from(b64, 'base64').toString('utf8'); } catch { return '{}'; } };
const normalizeBaseUrl = (u = '') => (u && !u.endsWith('/') ? `${u}/` : u);
const slugify = (s, f = 'method') => ((s ?? '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')) || f;

const ok = (ops) => ({ statusCode: HTTP_OK, body: JSON.stringify(ops) });
const addOp = (value) => ({ op: 'add', path: 'result', value });
const errorOp = (title) => addOp({
  carrier_code: 'FULCRUM',
  carrier_title: 'Fulcrum Custom Shipping (ERROR)',
  method: 'fulcrum_error',
  method_title: String(title).slice(0, 140),
  amount: 0, price: 0, cost: 0,
  additional_data: [{ key: 'source', value: 'shipping-methods error' }]
});

// Accept REST "active" values like true/1/"1"/"true"/"yes"/"y"/"si"/"sí"/"on"
function isActiveFromRest(v) {
  if (v === true) return true;
  if (typeof v === 'number') return v > 0;
  const s = String(v ?? '').trim().toLowerCase();
  return ['true','1','yes','y','si','sí','on'].includes(s);
}

// Numbers for generic fields (e.g., price). 0 is valid here.
function pickNumber(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Limits for min/max where 0 (or "0") and empty mean "no restriction"
function pickLimit(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = typeof v === 'string' ? v.trim() : v;
    if (s === '' || s === ' ') continue; // empty → no restriction
    const n = Number(s);
    if (!Number.isFinite(n)) continue;
    if (n === 0) continue;               // 0 → no restriction
    return n;
  }
  return null; // no restriction
}

// Parse list-like config values: array, JSON-stringified array, or comma-separated string
function toArray(v) {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {}
    return v.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [v];
}

// Resolve store / customer group from request (best-effort)
function extractStore(req = {}) {
  const cands = [
    req?.store_code, req?.storeCode, req?.store?.code,
    req?.storeId, req?.store_id, req?.quote?.store_id,
    req?.extension_attributes?.store_id, req?.address?.store_id
  ];
  for (const v of cands) { if (v !== undefined && v !== null && String(v).trim() !== '') return String(v); }
  return null;
}
function extractCustomerGroup(req = {}) {
  const cands = [
    req?.customer_group_id, req?.customer_group, req?.customerGroupId,
    req?.customer?.group_id, req?.quote?.customer_group_id,
    req?.extension_attributes?.customer_group_id
  ];
  for (const v of cands) { if (v !== undefined && v !== null && String(v).trim() !== '') return String(v); }
  return null;
}

// Normalize store tokens to reduce mismatches: "1" <-> "default"
function canonStoreToken(x) {
  const s = String(x ?? '').trim().toLowerCase();
  if (s === '1') return 'default';
  return s;
}

// Store filter (STRICT from Files JSON):
// - If no store view is selected in JSON (empty/missing), DO NOT show.
// - Otherwise, case-insensitive match; accept "*" / "all"; allow "1" <-> "default" equivalence.
// - If we cannot resolve request store, we do not block (keep behavior).
function storesMatch(request, storesFromJson) {
  const allow = toArray(storesFromJson).map(canonStoreToken).filter(Boolean);
  if (!allow.length) return false; // ← strict: empty JSON list hides the carrier
  const reqStore = extractStore(request);
  if (reqStore == null) return true; // don't block if request store unknown
  const r = canonStoreToken(reqStore);
  return allow.some(a => (a === '*' || a === 'all' || a === r));
}

// Customer group filter: allow if no config; else exact id (case-insensitive)
function groupsMatch(request, cfgGroups) {
  const allow = toArray(cfgGroups);
  if (!allow.length) return true; // no restriction
  const cg = extractCustomerGroup(request);
  if (cg == null) return true; // do not block if missing
  const r = String(cg).toLowerCase();
  return allow.some(g => String(g).toLowerCase() === r);
}

// --------- Cart total: robust extraction ----------
function extractCartTotal(req = {}) {
  const cands = [
    // Totals
    req?.totals?.grand_total, req?.totals?.base_grand_total,
    req?.grand_total, req?.base_grand_total,
    // Package values
    req?.package_value_with_discount, req?.packageValueWithDiscount,
    req?.package_value, req?.packageValue,
    // Subtotals (incl/excl tax)
    req?.subtotal_incl_tax, req?.base_subtotal_incl_tax,
    req?.totals?.subtotal_with_discount, req?.totals?.base_subtotal_with_discount,
    req?.subtotal_with_discount, req?.base_subtotal_with_discount,
    req?.subtotal, req?.base_subtotal
  ];
  for (const v of cands) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  // Fallback: sum items
  try {
    const items = req?.items || req?.quote?.items || [];
    let sum = 0;
    for (const it of items) {
      const qty = Number(it?.qty ?? it?.qty_ordered ?? it?.quantity ?? 1) || 1;
      const row =
        pickNumber(it?.base_row_total_incl_tax, it?.row_total_incl_tax,
                   it?.base_row_total, it?.row_total) ??
        (Number(it?.base_price ?? it?.price) * qty);
      if (Number.isFinite(row)) sum += row;
    }
    if (sum > 0) return sum;
  } catch {}
  return 0;
}

// ---------- Files (read carrier customization JSON) ----------
async function initFiles() {
  if (FilesLib?.init) return FilesLib.init();
  throw new Error('Unable to initialize aio-lib-files');
}

async function readCustomFromFiles(files, code, logger) {
  if (!code) return {};
  const keys = [
    `carrier_custom_${code}.json`,
    `carrier_custom_${code}`, // legacy fallback
  ];
  for (const key of keys) {
    try {
      const buf = await files.read(key);
      if (!buf) continue;
      const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
      try {
        const json = JSON.parse(text);
        if (json && typeof json === 'object') return json;
      } catch (e) {
        logger.warn(`Invalid JSON in ${key}: ${e.message}`);
      }
    } catch { /* not found; try next */ }
  }
  return {};
}

// ---------- IMS token (client_credentials; scope optional) ----------
async function getAccessToken(clientId, clientSecret, scopes = 'commerce_api') {
  const url = 'https://ims-na1.adobelogin.com/ims/token/v3';
  const form = {
    grant_type: 'client_credentials',
    client_id: String(clientId || ''),
    client_secret: String(clientSecret || '')
  };
  if (scopes && String(scopes).trim()) form.scope = String(scopes);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `IMS HTTP ${res.status}`);
  }
  return json.access_token;
}

// ---------- Main action ----------
async function main(params) {
  const logger = Core.Logger('shipping-methods', { level: params.LOG_LEVEL || 'info' });

  try {
    const { success, error } = webhookVerify(params);
    if (!success) return ok([errorOp(`Webhook verify: ${error}`)]);

    // raw-http:true → incoming body is base64-encoded JSON
    const payload = JSON.parse(b64decode(params.__ow_body || 'e30='));
    const request = payload?.rateRequest || {};
    const cartTotal = extractCartTotal(request);
    logger.info(`cartTotal inferred = ${cartTotal}`);

    // Config
    const DEFAULT_PRICE = Number(params.DEFAULT_PRICE ?? 0) || 0; // default price = 0
    const COMMERCE_BASE_URL   = params.COMMERCE_BASE_URL   || process.env.COMMERCE_BASE_URL; // should end with /rest/
    const OAUTH_CLIENT_ID     = params.OAUTH_CLIENT_ID     || process.env.OAUTH_CLIENT_ID;
    const OAUTH_CLIENT_SECRET = params.OAUTH_CLIENT_SECRET || process.env.OAUTH_CLIENT_SECRET;
    const OAUTH_SCOPES        = params.OAUTH_SCOPES        || process.env.OAUTH_SCOPES || 'commerce_api';
    if (!COMMERCE_BASE_URL) return ok([errorOp('Missing COMMERCE_BASE_URL')]);
    const base = normalizeBaseUrl(COMMERCE_BASE_URL);

    // Init Files (non-fatal)
    let files = null;
    try { files = await initFiles(); } catch (e) { logger.warn(`aio-lib-files init failed: ${e.message}`); }

    // Fetch carriers from Commerce REST
    let carriers = [];
    try {
      const token = await getAccessToken(OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_SCOPES);
      const r = await fetch(`${base}V1/oope_shipping_carrier`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });
      const raw = await r.text();
      try { carriers = JSON.parse(raw); } catch { carriers = []; }
      if (!r.ok || !Array.isArray(carriers)) {
        const snippet = String(raw || '').replace(/\s+/g, ' ').slice(0, 160);
        return ok([errorOp(`REST HTTP ${r.status} ${snippet}`)]);
      }
    } catch (e) {
      return ok([errorOp(`REST fetch error: ${e.message}`)]);
    }

    // Build operations with REST active + min/max + stores + customer_groups
    const ops = [];
    for (const c of carriers) {
      if (!c) continue;
      if (!isActiveFromRest(c.active)) continue; // only active from REST

      // Files key: prefer REST code; fallback to method/title slug
      const fallbackTitle = String(c.method_name ?? c.title ?? 'Shipping Method');
      const codeKey       = String(c.code ?? slugify(fallbackTitle, 'custom'));

      // Read customization JSON (method_name, price/value, carrier_title, min/max, stores, customer_groups)
      let custom = {};
      if (files) {
        try { custom = await readCustomFromFiles(files, codeKey, logger); }
        catch (e) { logger.warn(`readCustomFromFiles failed for ${codeKey}: ${e.message}`); }
      }

      // --- Filters ---
      // MIN/MAX (min inclusive, max exclusive) — 0/empty => no restriction
      const min = pickLimit(custom.minimum, custom.min, custom.minimum_amount);
      const max = pickLimit(custom.maximum, custom.max, custom.maximum_amount);
      if (min !== null && cartTotal < min) continue;
      if (max !== null && cartTotal >= max) continue;

      // STORES (STRICT from JSON)
      if (!storesMatch(request, custom.stores)) continue;

      // CUSTOMER GROUPS (from JSON)
      if (!groupsMatch(request, custom.customer_groups)) continue;

      // Titles
      const methodTitle  = String(custom.method_name ?? c.method_name ?? c.title ?? 'Shipping Method');
      const methodCode   = slugify(custom.method_name ?? c.method_name ?? c.code ?? methodTitle, `${(c.code || 'custom')}_shipping`);
      const carrierTitle = String(custom.carrier_title ?? c.title ?? 'Fulcrum Custom Shipping');

      // Price: JSON price/value → fallback to DEFAULT_PRICE (0)
      const priceFromJson = pickNumber(custom.price, custom.value);
      const finalPrice    = (priceFromJson !== null) ? priceFromJson : DEFAULT_PRICE;

      ops.push(addOp({
        carrier_code:  c.code || 'CUSTOM',
        carrier_title: carrierTitle,
        method:        methodCode,
        method_title:  methodTitle,
        amount:        finalPrice,
        price:         finalPrice,
        cost:          finalPrice,
        additional_data: [
          { key: 'source', value: files ? 'REST + Files (min/max + stores + groups)' : 'REST (min/max + stores + groups)' },
          { key: 'code_key', value: codeKey },
          { key: 'cart_total', value: String(cartTotal) },
          { key: 'min', value: min === null ? 'none' : String(min) },
          { key: 'max', value: max === null ? 'none' : String(max) },
          { key: 'req_store', value: String(extractStore(request) ?? 'unknown') },
          { key: 'cfg_stores', value: JSON.stringify(toArray(custom.stores)) }
        ]
      }));
    }

    if (ops.length === 0) return ok([errorOp('No matching carriers after filters')]);
    return ok(ops);

  } catch (e) {
    return ok([errorOp(`Exception: ${String(e.message || e).slice(0, 140)}`)]);
  }
}

exports.main = main;
