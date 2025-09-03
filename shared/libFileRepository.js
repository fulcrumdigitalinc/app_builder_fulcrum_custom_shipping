// /shared/libFileRepository.js
// Unified repository: low-level Files wrapper + JSON helpers + Carriers repository
// Keeps original writeFile/readFile signatures.
// CommonJS throughout.
/* eslint-disable node/no-extraneous-require */
const filesLib = require('@adobe/aio-lib-files');

// ==============================
// Low-level Files API (original)
// ==============================

async function getClient() {
  return filesLib.init();
}

/**
 * Write content to a file (binary or string).
 * NOTE: Signature preserved: (filePath, data)
 * Content-Type fixed to application/octet-stream (OK for JSON buffers too).
 * @param {string} filePath
 * @param {string|Buffer} data
 */
async function writeFile(filePath, data) {
  const files = await getClient();
  await files.write(filePath, data, { contentType: 'application/octet-stream' });
}

/**
 * Read the content of a file as Buffer.
 * NOTE: Signature preserved: (filePath) -> Buffer
 * @param {string} filePath
 * @returns {Promise<Buffer>}
 */
async function readFile(filePath) {
  const files = await getClient();
  const fileBuffer = await files.read(filePath);
  return fileBuffer;
}

// ==============================
// Generic JSON & file utilities
// ==============================

/**
 * Write an object as pretty JSON (atomic).
 * @param {string} filePath
 * @param {any} obj
 */
async function writeJson(filePath, obj) {
  const buf = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
  await writeFile(filePath, buf);
}

/**
 * Read JSON safely; returns defaultValue if file is missing.
 * @param {string} filePath
 * @param {any} [defaultValue=null]
 */
async function readJson(filePath, defaultValue = null) {
  try {
    const buf = await readFile(filePath);
    const txt = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
    if (!txt) return defaultValue;
    return JSON.parse(txt);
  } catch (e) {
    const notFound =
      (e && e.status === 404) ||
      /not\s*found|nosuchkey/i.test(String(e && e.message || ''));
    if (notFound) return defaultValue;
    throw e;
  }
}

/**
 * Delete a file if it exists (idempotent).
 * @param {string} filePath
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deleteFile(filePath) {
  const files = await getClient();
  try {
    await files.delete(filePath);
    return true;
  } catch (e) {
    const notFound =
      (e && e.status === 404) ||
      /not\s*found|nosuchkey/i.test(String(e && e.message || ''));
    if (notFound) return false;
    throw e;
  }
}

/**
 * List files by prefix.
 * @param {string} prefix
 * @returns {Promise<string[]>} array of names
 */
async function listFiles(prefix) {
  const files = await getClient();
  const items = await files.list(prefix);
  return (items || []).map(i => i.name);
}

// ==============================
// Carriers Repository (reusable)
// ==============================

const CARRIERS_BASE_PREFIX = 'fulcrum/carriers'; // virtual folder in Files: fulcrum/carriers/<storeKey>.json

// ---- helpers for carriers ----

function normalizeStoreKey(store) {
  if (Array.isArray(store) && store.length > 0) {
    // Ensure consistent key for arrays (sorted, joined by comma)
    return store.map(String).map(s => s.trim()).filter(Boolean).sort().join(',');
  }
  if (typeof store === 'string' && store.trim()) return store.trim();
  return 'default';
}

function carriersPath(store) {
  const key = normalizeStoreKey(store);
  return `${CARRIERS_BASE_PREFIX}/${key}.json`;
}

function nextId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function asBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function asNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asArray(x) {
  if (Array.isArray(x)) return x;
  if (x == null || x === '') return [];
  return [x];
}

// ---- public API for carriers ----

/**
 * Load carriers array for a given store (or "default").
 * @param {string|string[]} store
 * @returns {Promise<Array>}
 */
async function loadCarriers(store) {
  return readJson(carriersPath(store), []);
}

/**
 * Persist carriers array for a given store.
 * @param {string|string[]} store
 * @param {Array} carriers
 */
async function saveCarriers(store, carriers) {
  await writeJson(carriersPath(store), Array.isArray(carriers) ? carriers : []);
}

/**
 * List all carriers (alias of loadCarriers).
 * @param {string|string[]} store
 * @returns {Promise<Array>}
 */
async function listCarriers(store) {
  return loadCarriers(store);
}

/**
 * Add a new carrier (returns the created carrier, with id if missing).
 * @param {string|string[]} store
 * @param {Object} carrier
 * @returns {Promise<Object>}
 */
async function addCarrier(store, carrier) {
  const carriers = await loadCarriers(store);

  const normalized = {
    id: carrier.id || nextId(),
    code: carrier.code ?? '',
    method_name: carrier.method_name ?? '',
    price: asNumberOrNull(carrier.price),
    enabled: asBool(carrier.enabled),
    // multiselects
    customer_groups: asArray(carrier.customer_groups).map(String),
    stores: asArray(carrier.stores).map(String),
    countries: asArray(carrier.countries).map(String),
    // optional rules
    minimum: asNumberOrNull(carrier.minimum),
    maximum: asNumberOrNull(carrier.maximum),
    price_per_item: asBool(carrier.price_per_item),
    sort_order: asNumberOrNull(carrier.sort_order),
    title: carrier.title ?? '',
    hint: carrier.hint ?? '',
  };

  carriers.push(normalized);
  await saveCarriers(store, carriers);
  return normalized;
}

/**
 * Update a carrier by id (patch/merge). Returns the updated carrier.
 * @param {string|string[]} store
 * @param {string} id
 * @param {Object} patch
 * @returns {Promise<Object>}
 */
async function updateCarrier(store, id, patch) {
  const carriers = await loadCarriers(store);
  const idx = carriers.findIndex(c => String(c.id) === String(id));
  if (idx === -1) throw new Error(`Carrier not found: ${id}`);

  const current = carriers[idx];
  const merged = { ...current, ...patch };

  // Type normalization
  if ('price' in merged) merged.price = asNumberOrNull(merged.price);
  if ('enabled' in merged) merged.enabled = asBool(merged.enabled);
  if ('price_per_item' in merged) merged.price_per_item = asBool(merged.price_per_item);
  if ('minimum' in merged) merged.minimum = asNumberOrNull(merged.minimum);
  if ('maximum' in merged) merged.maximum = asNumberOrNull(merged.maximum);
  if ('sort_order' in merged) merged.sort_order = asNumberOrNull(merged.sort_order);
  if ('customer_groups' in merged) merged.customer_groups = asArray(merged.customer_groups).map(String);
  if ('stores' in merged) merged.stores = asArray(merged.stores).map(String);
  if ('countries' in merged) merged.countries = asArray(merged.countries).map(String);

  carriers[idx] = merged;
  await saveCarriers(store, carriers);
  return merged;
}

/**
 * Delete a carrier by id. Returns true if deleted.
 * @param {string|string[]} store
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function deleteCarrier(store, id) {
  const carriers = await loadCarriers(store);
  const next = carriers.filter(c => String(c.id) !== String(id));
  const changed = next.length !== carriers.length;
  if (changed) await saveCarriers(store, next);
  return changed;
}

/**
 * Upsert convenience: if id exists -> update, else -> create.
 * @param {string|string[]} store
 * @param {Object} carrier
 * @returns {Promise<Object>}
 */
async function upsertCarrier(store, carrier) {
  if (carrier && carrier.id) {
    return updateCarrier(store, carrier.id, carrier);
  }
  return addCarrier(store, carrier);
}

// ==============================
// Exports
// ==============================

module.exports = {
  // Low-level (original)
  writeFile,
  readFile,

  // Generic helpers
  writeJson,
  readJson,
  deleteFile,
  listFiles,

  // Carriers repository
  loadCarriers,
  saveCarriers,
  listCarriers,
  addCarrier,
  updateCarrier,
  deleteCarrier,
  upsertCarrier,

  // Carriers helpers in case needed externally
  carriersPath,
  normalizeStoreKey,
};
