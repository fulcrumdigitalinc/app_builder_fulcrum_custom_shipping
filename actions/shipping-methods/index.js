const { Core } = require('@adobe/aio-sdk');
const { webhookErrorResponse, webhookVerify } = require('../../lib/adobe-commerce');
const { HTTP_OK } = require('../../lib/http');
const fetch = require('node-fetch');

// Use the unified repository (carriers live under fulcrum/carriers/<store>.json)
const {
  listCarriers,
} = require('/home/fcs/shared/libFileRepository.js');

// --- utils ---
const b64decode = (b64) => {
  try { return atob(b64); } catch { return Buffer.from(b64, 'base64').toString('utf8'); }
};

/**
 * Try to extract a reasonable cart/order total from many possible payload shapes.
 */
function extractCartTotal(request = {}) {
  const candidates = [
    request?.totals?.grand_total,
    request?.totals?.base_grand_total,
    request?.grand_total,
    request?.base_grand_total,
    request?.totals?.subtotal_with_discount,
    request?.totals?.base_subtotal_with_discount,
    request?.subtotal_with_discount,
    request?.base_subtotal_with_discount,
    request?.subtotal,
    request?.base_subtotal,
  ];

  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  // Fallback: sum items if total not provided
  const itemArrays = [
    request?.items,
    request?.cart?.items,
    request?.quote?.items,
    request?.cartItems,
    request?.package_items
  ].filter(Array.isArray);

  let sum = 0;
  for (const arr of itemArrays) {
    for (const it of arr) {
      const qty =
        Number(it?.qty ?? it?.qty_ordered ?? it?.quantity ?? it?.qty_to_ship ?? it?.qtyOrdered) || 1;

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

function toNum(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === 'string' && x.trim() === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function inRange(total, min, max) {
  if (min != null && total < min) return false;
  if (max != null && total >= max) return false;
  return true;
}

function slugify(s, fallback = 'method') {
  const str = (s ?? '').toString().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return str || fallback;
}

function createShippingOperation(value) {
  return { op: 'add', path: 'result', value };
}

/**
 * Extract customer group id from multiple possible places.
 */
function extractCustomerGroupIdFromCart(request = {}) {
  const candidates = [
    request?.cart?.customer?.group_id,
    request?.cart?.customer_group_id,
    request?.quote?.customer?.group_id,
    request?.quote?.customer_group_id,
    request?.customer?.group_id,
    request?.customer_group_id
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  // Deep scan as a last resort
  let found = null;
  (function walk(o) {
    if (!o || typeof o !== 'object' || found !== null) return;
    for (const [k, v] of Object.entries(o)) {
      if (k === 'group_id' || k === 'customer_group_id' || k === 'groupId' || k === 'customerGroupId') {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 0) { found = n; return; }
      }
      if (v && typeof v === 'object') walk(v);
      if (found !== null) return;
    }
  })(request);
  return found;
}

/**
 * Determine if the shopper is a guest (true/false) or unknown (null).
 */
function extractIsGuestFromCart(request = {}) {
  const candidates = [
    request?.cart?.customer_is_guest,
    request?.quote?.customer_is_guest,
    request?.customer_is_guest
  ];
  for (const v of candidates) {
    if (v === true || v === false) return v;
    if (v === 1 || v === 0) return Boolean(v);
    if (typeof v === 'string') {
      if (v.toLowerCase() === 'true') return true;
      if (v.toLowerCase() === 'false') return false;
    }
  }
  const id = Number(
    request?.cart?.customer_id ||
    request?.quote?.customer_id ||
    request?.customer_id
  );
  if (Number.isInteger(id) && id > 0) return false;
  return null;
}

/**
 * Best-effort extraction of item quantity in the cart.
 */
function extractCartItemCount(request = {}) {
  const quick = [
    request?.totals?.items_qty,
    request?.items_qty
  ];
  for (const q of quick) {
    const n = Number(q);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const candidates = [
    request?.items,
    request?.cart?.items,
    request?.quote?.items,
    request?.cartItems,
    request?.package_items
  ];
  for (const arr of candidates) {
    if (Array.isArray(arr) && arr.length) {
      let sum = 0;
      for (const it of arr) {
        const q = Number(
          it?.qty ?? it?.qty_ordered ?? it?.quantity ?? it?.qty_to_ship ?? it?.qtyOrdered
        );
        if (Number.isFinite(q) && q > 0) sum += q;
        else sum += 1;
      }
      return sum;
    }
  }
  // Deep scan fallback
  let total = 0;
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v) && k.toLowerCase().includes('items')) {
        for (const it of v) {
          const q = Number(
            it?.qty ?? it?.qty_ordered ?? it?.quantity ?? it?.qty_to_ship ?? it?.qtyOrdered
          );
          if (Number.isFinite(q) && q > 0) total += q;
          else total += 1;
        }
      } else if (v && typeof v === 'object') {
        walk(v);
      }
    }
  })(request);
  return total;
}

/**
 * Extract store code or id from the rate request (used to select the carriers set and/or filter).
 */
function extractStoreCodeFromCart(request = {}) {
  const candidates = [
    request?.store_code,
    request?.storeCode,
    request?.cart?.store_code,
    request?.quote?.store_code
  ];
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // Deep scan fallback
  let found = null;
  (function walk(o) {
    if (!o || typeof o !== 'object' || found !== null) return;
    for (const [k, v] of Object.entries(o)) {
      if ((k === 'store_code' || k === 'storeCode') && typeof v === 'string' && v.trim()) {
        found = v.trim(); return;
      }
      if (v && typeof v === 'object') walk(v);
      if (found !== null) return;
    }
  })(request);
  return found;
}
function extractStoreIdFromCart(request = {}) {
  const candidates = [
    request?.store_id,
    request?.storeId,
    request?.cart?.store_id,
    request?.quote?.store_id
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) return n;
  }
  // Deep scan fallback
  let found = null;
  (function walk(o) {
    if (!o || typeof o !== 'object' || found !== null) return;
    for (const [k, v] of Object.entries(o)) {
      if (k === 'store_id' || k === 'storeId') {
        const n = Number(v);
        if (Number.isInteger(n) && n > 0) { found = n; return; }
      }
      if (v && typeof v === 'object') walk(v);
      if (found !== null) return;
    }
  })(request);
  return found;
}

/**
 * Fallback parser for customer group arrays embedded in the carrier object (backward compatibility).
 */
function readGroupsFromCarrierObject(c = {}) {
  let raw =
    c.customer_groups ??
    c.customer_group_ids ??
    c.custom?.customer_groups ??
    c.extension_attributes?.customer_groups;

  if (Array.isArray(raw)) return raw.map(v => String(v)).filter(Boolean);
  if (typeof raw === 'number') return [String(raw)];
  if (raw == null) return [];

  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.map(v => String(v)).filter(Boolean);
      } catch (_) {}
    }
    return s.split(',').map(x => x.trim()).filter(Boolean);
  }
  return [];
}

async function main(params) {
  const logger = Core.Logger('shipping-methods', { level: params.LOG_LEVEL || 'info' });

  try {
    // Verify webhook signature first
    const { success, error } = webhookVerify(params);
    if (!success) {
      return webhookErrorResponse(`Failed to verify the webhook signature: ${error}`);
    }

    // Parse payload
    const payload = JSON.parse(b64decode(params.__ow_body));
    const { rateRequest: request } = payload || {};

    // Extract key signals from the cart
    const cartTotal = extractCartTotal(request);
    const cgFromCart = extractCustomerGroupIdFromCart(request);
    const isGuest = extractIsGuestFromCart(request);
    const cartGroupIdStr = (cgFromCart == null) ? null : String(cgFromCart);

    // Determine store code from request (or try mapping from store_id via get-stores action)
    let cartStoreCode = extractStoreCodeFromCart(request);
    if (!cartStoreCode) {
      // Optional: map store_id -> store_code using your existing "get-stores" action
      const ns = (process.env.AIO_runtime_namespace || params?.AIO_runtime_namespace);
      const host = (process.env.AIO_runtime_apihost || params?.AIO_runtime_apihost)
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '');
      const url = `https://${ns}.${host}/api/v1/web/application/`;

      const cartStoreId = extractStoreIdFromCart(request);
      if (cartStoreId != null) {
        try {
          const storesRes = await fetch(url + 'get-stores');
          if (storesRes.ok) {
            const sj = await storesRes.json().catch(() => ({}));
            const items = Array.isArray(sj.items) ? sj.items : [];
            for (const s of items) {
              const sid = Number(s?.id);
              if (Number.isInteger(sid) && sid === Number(cartStoreId)) {
                const code = (s?.code && String(s.code)) || String(sid);
                if (code) cartStoreCode = code;
                break;
              }
            }
          }
        } catch (_) { /* ignore mapping errors */ }
      }
    }
    const cartStoreCodeNorm = cartStoreCode ? String(cartStoreCode).toLowerCase() : null;

    // Load carriers directly from the repository:
    // first try the store-specific file, then fallback to "default" if empty
    let carriers = await listCarriers(cartStoreCode || 'default');
    if (!Array.isArray(carriers) || carriers.length === 0) {
      carriers = await listCarriers('default');
    }

    const cartItemCount = extractCartItemCount(request);

    // Build shipping method operations
    const operations = (await Promise.all(
      (carriers || [])
        .filter(c => !!c.active) // only active carriers
        .map(async (c) => {
          // Price resolution (new field "price", fallback to legacy "value")
          let price = toNum(c.price);
          if (price === null) price = toNum(c.value);

          // Range filters
          const minRaw = toNum(c.minimum);
          const maxRaw = toNum(c.maximum);
          const min = (minRaw === 0 ? null : minRaw);
          const max = (maxRaw === 0 ? null : maxRaw);
          if (!inRange(cartTotal, min, max)) return null;

          // Customer groups (prefer normalized array; fallback parser for legacy shapes)
          let groupIds = Array.isArray(c.customer_groups)
            ? c.customer_groups.map(String)
            : readGroupsFromCarrierObject(c);
          if (groupIds.length === 0) return null;

          // Group gating: if cart has group, require membership; otherwise skip "guest-only" when logged in
          if (cartGroupIdStr !== null) {
            if (!groupIds.includes(cartGroupIdStr)) return null;
          } else if (isGuest === false) {
            const onlyGuest = groupIds.length === 1 && groupIds[0] === '0';
            if (onlyGuest) return null;
          }

          // Store filter: if carrier restricts stores, require match
          let storeCodes = Array.isArray(c.stores) ? c.stores.map(String) : [];
          if (storeCodes.length > 0 && cartStoreCodeNorm) {
            const set = new Set(storeCodes.map(s => String(s).toLowerCase()));
            if (!set.has(cartStoreCodeNorm)) return null;
          }

          // Titles + method code
          const methodTitle = (
            (c.method_name && String(c.method_name)) ||
            (c.title && String(c.title)) ||
            'Shipping Method'
          );
          const methodCode = slugify(c.method_name, `${(c.code || 'custom')}_shipping`);

          // Price-per-item support (comes normalized in repo)
          const pricePerItem = !!c.price_per_item;
          const unit = price ?? 0;
          const finalPrice = pricePerItem ? (unit * (cartItemCount || 0)) : unit;

          return createShippingOperation({
            carrier_code: c.code || c.carrier_code || 'UNKNOWN',
            method: methodCode,
            method_title: methodTitle,
            price: finalPrice,
            cost: finalPrice,
            additional_data: [{ key: 'source', value: 'carriers-repository' }],
          });
        })
    )).filter(Boolean);

    if (operations.length === 0) {
      return {
        statusCode: HTTP_OK,
        body: [{ op: 'add', path: 'result', value: { skipped: true } }]
      };
    }

    return { statusCode: HTTP_OK, body: operations };

  } catch (e) {
    // On error, return "skipped" to avoid breaking the checkout shipping rates pipeline.
    return {
      statusCode: HTTP_OK,
      body: [{ op: 'add', path: 'result', value: { skipped: true } }]
    };
  }
}

exports.main = main;
