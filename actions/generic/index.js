/*
Simple generic action used in tests. It validates required headers,
forwards a request with fetch, and wraps errors consistently.
*/

const { Core } = require('@adobe/aio-sdk');
const fetch = require('node-fetch');
const { errorResponse, checkMissingRequestInputs } = require('../utils');

async function main(params = {}) {
  const logger = Core.Logger('generic', { level: params.LOG_LEVEL || 'info' });

  const missing = checkMissingRequestInputs(params, [], ['authorization']);
  if (missing) {
    return errorResponse(400, missing);
  }

  try {
    const response = await fetch('https://example.com');
    if (!response.ok) {
      const err = new Error(`Unexpected status ${response.status}`);
      logger.error(err);
      return errorResponse(500, 'server error');
    }
    const body = await response.json();
    return { statusCode: 200, body };
  } catch (e) {
    logger.error(e);
    return errorResponse(500, 'server error');
  }
}

module.exports = { main };
