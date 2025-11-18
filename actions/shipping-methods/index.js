/*
Copyright 2025
Licensed under the Apache License, Version 2.0
*/

const { Core } = require('@adobe/aio-sdk');
const { webhookVerify, getAdobeCommerceClient } = require('../../lib/adobe-commerce');
const { HTTP_OK } = require('../../lib/http');
const FilesLib = require('@adobe/aio-lib-files');

// ---------- Small utilities (English comments) ----------
const b64decode = (b64) => { try { return Buffer.from(b64, 'base64').toString('utf8'); } catch { return '{}'; } };
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

// Ultra-tolerant boolean (checkboxes/toggles)
function isTruthy(v) {
  if (v === true) return true;
  if (typeof v === 'number') return v > 0;
  const s = String(v ?? '').trim().toLowerCase();
  return ['true','1','yes','y','si','sí','on','checked','enable','enabled'].includes(s);
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

// Store filter (STRICT from Files JSON): empty list => DO NOT show
function storesMatch(request, storesFromJson) {
  const allow = toArray(storesFromJson).map(canonStoreToken).filter(Boolean);
  if (!allow.length) return false; // strict: empty JSON list hides the carrier
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
  // Fallback: sum items like in the legacy logic
  const itemArrays = [
    req?.items,
    req?.cart?.items,
    req?.quote?.items,
    req?.cartItems,
    req?.package_items
  ].filter(Array.isArray);
  let sum = 0;
  for (const arr of itemArrays) {
    for (const it of arr) {
      const qty = Number(it?.qty ?? it?.qty_ordered ?? it?.quantity ?? it?.qty_to_ship ?? it?.qtyOrdered) || 1;
      const rowCandidates = [
        it?.row_total_with_discount, it?.base_row_total_with_discount,
        it?.row_total_incl_tax,      it?.base_row_total_incl_tax,
        it?.row_total,               it?.base_row_total
      ];
      let row = rowCandidates.map(Number).find(n => Number.isFinite(n) && n >= 0);
      if (!Number.isFinite(row)) {
        const price = Number(it?.price_incl_tax ?? it?.base_price_incl_tax ?? it?.price ?? it?.base_price);
        row = (Number.isFinite(price) && price >= 0) ? price * qty : 0;
      }
      if (row > 0) sum += row;
    }
    if (sum > 0) break;
  }
  return sum > 0 ? sum : 0;
}

// --------- EXACT legacy item-count logic (for price_per_item) ----------
function extractCartItemCount(req = {}) {
  // quick shortcuts
  const quick = [ req?.totals?.items_qty, req?.items_qty ];
  for (const q of quick) {
    const n = Number(q);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  // common arrays
  const candidates = [
    req?.items,
    req?.cart?.items,
    req?.quote?.items,
    req?.cartItems,
    req?.package_items
  ];
  for (const arr of candidates) {
    if (Array.isArray(arr) && arr.length) {
      let sum = 0;
      for (const it of arr) {
        const q = Number(it?.qty ?? it?.qty_ordered ?? it?.quantity ?? it?.qty_to_ship ?? it?.qtyOrdered);
        if (Number.isFinite(q) && q > 0) sum += q; else sum += 1;
      }
      return sum;
    }
  }
  // deep scan fallback
  let total = 0;
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v) && k.toLowerCase().includes('items')) {
        for (const it of v) {
          const q = Number(it?.qty ?? it?.qty_ordered ?? it?.quantity ?? it?.qty_to_ship ?? it?.qtyOrdered);
          if (Number.isFinite(q) && q > 0) total += q; else total += 1;
        }
      } else if (v && typeof v === 'object') {
        walk(v);
      }
    }
  })(req);
  return total || 1; // at least 1
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

// ---------- NEW: string picker to avoid empty/undefined method titles ----------
function pickString(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
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
    const cartItemCount = extractCartItemCount(request);
    logger.info(`cartTotal = ${cartTotal}; cartItemCount = ${cartItemCount}`);

    // Config
    const DEFAULT_PRICE = Number(params.DEFAULT_PRICE ?? 0) || 0; // default price = 0
    const COMMERCE_BASE_URL = params.COMMERCE_BASE_URL || process.env.COMMERCE_BASE_URL; // should end with /rest/
    if (!COMMERCE_BASE_URL) return ok([errorOp('Missing COMMERCE_BASE_URL')]);

    // Init Files (non-fatal)
    let files = null;
    try { files = await initFiles(); } catch (e) { logger.warn(`aio-lib-files init failed: ${e.message}`); }

    // Fetch carriers from Commerce REST
    let carriers = [];
    try {
      const commerce = await getAdobeCommerceClient({ ...params, COMMERCE_BASE_URL });
      const response = await commerce.getOopeShippingCarriers();
      if (!response.success || !Array.isArray(response.message)) {
        const snippetSource = response.body ?? response.message ?? 'Unknown error';
        const snippet = typeof snippetSource === 'string'
          ? snippetSource
          : JSON.stringify(snippetSource);
        return ok([errorOp(`Commerce API error: ${snippet.replace(/\s+/g, ' ').slice(0, 160)}`)]);
      }
      carriers = response.message;
    } catch (e) {
      return ok([errorOp(`Commerce client error: ${e.message}`)]);
    }

    // Build operations with REST active + min/max + stores + customer_groups
    const ops = [];
    for (const c of carriers) {
      if (!c) continue;
      if (!isActiveFromRest(c.active)) continue; // only active from REST

      // Files key: prefer REST code; fallback to method/title slug
      const fallbackTitle = String(c.method_name ?? c.title ?? 'Shipping Method');
      const codeKey       = String(c.code ?? slugify(fallbackTitle, 'custom'));

      // Read customization JSON (method_name, price/value, carrier_title, min/max, stores, customer_groups, price_per_item)
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

      // --------- CHANGED BLOCK: Titles / Codes only ----------
      const methodTitle  = pickString(
        custom.method_name,
        custom.method_title,
        custom.name,
        c.method_name,
        c.method_title,
        c.methodName,
        c.title,
        'Shipping Method'
      );

      const methodCode   = slugify(
        pickString(
          custom.code,
          c.code,
          custom.method_name,
          c.method_name,
          methodTitle
        ),
        `${(c.code || 'custom')}_shipping`
      );

      const carrierTitle = pickString(
        custom.carrier_title,
        c.carrier_title,
        c.title,
        'Fulcrum Custom Shipping'
      );
      // --------- END CHANGED BLOCK ----------

      // Price base (unit)
      const unitPrice = (pickNumber(custom.price, custom.value) !== null)
        ? pickNumber(custom.price, custom.value)
        : DEFAULT_PRICE;

      // Legacy-proven price_per_item behavior (snake o camel)
      const ppiRaw = (custom.price_per_item !== undefined) ? custom.price_per_item : custom.pricePerItem;
      const pricePerItem = isTruthy(ppiRaw);

      const finalPrice = pricePerItem ? (unitPrice * (cartItemCount || 0)) : unitPrice;

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
          { key: 'cart_item_count', value: String(cartItemCount) },
          { key: 'min', value: min === null ? 'none' : String(min) },
          { key: 'max', value: max === null ? 'none' : String(max) },
          { key: 'req_store', value: String(extractStore(request) ?? 'unknown') },
          { key: 'cfg_stores', value: JSON.stringify(toArray(custom.stores)) },
          { key: 'price_per_item', value: String(!!pricePerItem) },
          { key: 'unit_price', value: String(unitPrice) }
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
