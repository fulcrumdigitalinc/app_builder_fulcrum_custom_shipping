const { Core } = require('@adobe/aio-sdk');
const FilesLib = require('@adobe/aio-lib-files');
const utils = require('../utils.js');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

async function initFiles() {
  if (FilesLib?.init) return FilesLib.init();
  throw new Error('Unable to initialize aio-lib-files');
}

exports.main = async function (params) {
  if (params.__ow_method === 'options') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  const logger = Core.Logger('delete-carrier', { level: params.LOG_LEVEL || 'info' });

  try {
    let code = params.code;
    if (!code && typeof params.__ow_body === 'string') {
      try { code = JSON.parse(params.__ow_body)?.code; } catch {}
    }
    if (!code && params.__ow_query) {
      const q = new URLSearchParams(params.__ow_query);
      code = q.get('code');
    }
    if (!code) return { statusCode: 400, headers: cors, body: { ok: false, message: 'Missing code' } };

    let commerce;
    try {
      commerce = await utils.initCommerceClient(params, logger);
    } catch (error) {
      return { statusCode: 500, headers: cors, body: { ok: false, message: error.message } };
    }

    let delRaw = '';
    let deletedInCommerce = false;
    try {
      const response = await commerce(`V1/oope_shipping_carrier/${encodeURIComponent(code)}`, {
        method: 'DELETE',
        responseType: 'text',
        resolveBodyOnly: false,
        throwHttpErrors: false,
      });
      delRaw = response.body;
      let delJson = null; try { delJson = JSON.parse(delRaw); } catch {}
      deletedInCommerce = response.statusCode >= 200 && response.statusCode < 300 && delJson && delJson.success === true;
    } catch (error) {
      return { statusCode: 502, headers: cors, body: { ok: false, message: `Failed to delete carrier: ${error.message}` } };
    }

    let stateDeleted = false;
    try {
      const files = await initFiles();
      const keyJson = `carrier_custom_${code}.json`;
      const keyLegacy = `carrier_custom_${code}`; 

      let deletedAny = false;
      try {
        await files.delete(keyJson);
        deletedAny = true;
      } catch (e1) {
        // ignore
      }
      try {
        await files.delete(keyLegacy);
        deletedAny = true;
      } catch (e2) {
        // ignore
      }
      stateDeleted = deletedAny;
    } catch (e) {
      logger.warn(`Files delete failed for ${code}: ${e.message}`);
    }

    return {
      statusCode: 200,
      headers: cors,
      body: { ok: true, code, deletedInCommerce, stateDeleted, delRaw }
    };

  } catch (e) {
    return { statusCode: 500, headers: cors, body: { ok: false, error: e.message } };
  }
};
