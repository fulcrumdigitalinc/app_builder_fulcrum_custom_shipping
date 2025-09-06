const { Core } = require('@adobe/aio-sdk');
const fetch = require('node-fetch');
const FilesLib = require('@adobe/aio-lib-files');
const utils = require('../utils.js');

function normalizeBaseUrl(u = '') { return u && !u.endsWith('/') ? (u + '/') : u; }

async function initFiles() {
  if (FilesLib?.init) return FilesLib.init();
  throw new Error('Unable to initialize aio-lib-files');
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.main = async function main(params) {
  const logger = Core.Logger('get-carriers', { level: params.LOG_LEVEL || 'info' });

  try {
    if ((params.__ow_method || '').toUpperCase() === 'OPTIONS') {
      return { statusCode: 200, headers: cors, body: {} };
    }

    const { COMMERCE_BASE_URL, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_SCOPES = 'commerce_api' } = params;
    if (!COMMERCE_BASE_URL) return { statusCode: 500, headers: cors, body: { ok: false, error: 'Missing COMMERCE_BASE_URL' } };
    const base = normalizeBaseUrl(COMMERCE_BASE_URL);

    const token = await utils.getAccessToken(OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_SCOPES);

    const endpoint = `${base}V1/oope_shipping_carrier`;
    const r = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    const raw = await r.text();
    let carriers = [];
    try { carriers = JSON.parse(raw); } catch {}
    if (!r.ok || !Array.isArray(carriers)) {
      return { statusCode: r.status || 502, headers: cors, body: { ok: false, error: 'Failed to fetch carriers', raw } };
    }

    const files = await initFiles();

    const enriched = await Promise.all(carriers.map(async (c) => {
      const keyJson = `carrier_custom_${c.code}.json`;
      const keyLegacy = `carrier_custom_${c.code}`;

      let method_name = null, value = null, minimum = null, maximum = null, customer_groups = [], price_per_item = false, stores = null;

      try {
        let text = null;

        try {
          const buf = await files.read(keyJson);
          if (buf) text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
        } catch (e1) {
          // ignore
          try {
            const buf2 = await files.read(keyLegacy);
            if (buf2) text = Buffer.isBuffer(buf2) ? buf2.toString('utf8') : String(buf2);
          } catch (e2) {
            // ignore
          }
        }

        if (text) {
          const custom = JSON.parse(text);
          if (custom && typeof custom === 'object') {
            method_name = custom.method_name ?? null;
            value       = (typeof custom.value === 'number')   ? custom.value   : null;
            minimum     = (typeof custom.minimum === 'number') ? custom.minimum : null;
            maximum     = (typeof custom.maximum === 'number') ? custom.maximum : null;

            if (Array.isArray(custom.customer_groups)) {
              customer_groups = custom.customer_groups.map((n) => Number(n)).filter((n) => Number.isInteger(n));
            }
            if (custom.price_per_item !== undefined) {
              price_per_item = !!custom.price_per_item;
            }
            if (Array.isArray(custom.stores)) {
              stores = custom.stores.map(String).filter(Boolean);
            }
          }
        }
      } catch (e) {
        logger.warn(`Files read failed for carrier ${c.code}: ${e.message}`);
      }

      return {
        id: c.id,
        code: c.code,
        title: c.title,
        stores: stores ?? c.stores,
        countries: c.countries,
        sort_order: c.sort_order,
        active: c.active,
        tracking_available: c.tracking_available,
        shipping_labels_available: c.shipping_labels_available,
        method_name, value, minimum, maximum, customer_groups,
        price_per_item
      };
    }));

    return { statusCode: 200, headers: cors, body: { ok: true, carriers: enriched } };
  } catch (e) {
    try { logger.error(e); } catch {}
    return { statusCode: 500, headers: cors, body: { ok: false, error: e.message } };
  }
};
