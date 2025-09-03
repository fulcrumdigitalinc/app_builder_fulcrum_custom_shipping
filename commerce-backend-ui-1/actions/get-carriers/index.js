const { Core } = require('@adobe/aio-sdk');

// Use the unified repository (carriers live under fulcrum/carriers/<store>.json)
const { listCarriers } = require('../../../shared/libFileRepository.js');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

/**
 * Normalize a "store" input: string | string[] | undefined
 * - undefined  -> 'default'
 * - 'a,b,c'    -> ['a','b','c']
 * - ['a','b']  -> ['a','b']
 */
function normalizeStoreParam(store) {
  if (Array.isArray(store)) {
    return store.map(String).map(s => s.trim()).filter(Boolean);
  }
  if (typeof store === 'string') {
    const s = store.trim();
    if (!s) return 'default';
    // allow comma-separated list to address multi-store files
    if (s.includes(',')) {
      return s.split(',').map(x => x.trim()).filter(Boolean);
    }
    return s;
  }
  return 'default';
}

exports.main = async function main(params) {
  const logger = Core.Logger('get-carriers', { level: params.LOG_LEVEL || 'info' });

  try {
    // CORS preflight
    if ((params.__ow_method || '').toUpperCase() === 'OPTIONS') {
      return { statusCode: 200, headers: cors, body: {} };
    }

    // Read store selector from query (GET) or params
    // Examples:
    //   ?store=default
    //   ?store=us,en
    //   ?store=us&store=en (multiple)
    const storeParam = params.store ?? params.query?.store;
    const storeKey = normalizeStoreParam(storeParam);

    // Load carriers from repository: try the requested store first, then fallback to "default" if empty
    let carriers = await listCarriers(storeKey);
    if (!Array.isArray(carriers) || carriers.length === 0) {
      if (String(storeKey) !== 'default') {
        carriers = await listCarriers('default');
      }
    }
    carriers = Array.isArray(carriers) ? carriers : [];

    // Shape output; keep "value" as a backward-compatible alias of "price"
    const enriched = carriers.map(c => ({
      id: c.id,
      code: c.code,
      title: c.title,
      stores: Array.isArray(c.stores) ? c.stores : (c.stores ? [String(c.stores)] : []),
      countries: Array.isArray(c.countries) ? c.countries : [],
      sort_order: c.sort_order ?? null,
      active: !!c.active, // some UIs expect "active" to toggle availability in Commerce UI
      tracking_available: !!c.tracking_available,
      shipping_labels_available: !!c.shipping_labels_available,

      // Custom fields managed by the repo
      method_name: c.method_name ?? null,
      price: (typeof c.price === 'number') ? c.price : null,
      // backward compatibility: legacy "value" mirrors price
      value: (typeof c.price === 'number') ? c.price : (typeof c.value === 'number' ? c.value : null),
      minimum: (typeof c.minimum === 'number') ? c.minimum : null,
      maximum: (typeof c.maximum === 'number') ? c.maximum : null,
      customer_groups: Array.isArray(c.customer_groups) ? c.customer_groups.map(String) : [],
      price_per_item: !!c.price_per_item,
    }));

    return { statusCode: 200, headers: cors, body: { ok: true, carriers: enriched } };
  } catch (e) {
    try { logger.error(e); } catch {}
    return { statusCode: 500, headers: cors, body: { ok: false, error: e.message } };
  }
};
