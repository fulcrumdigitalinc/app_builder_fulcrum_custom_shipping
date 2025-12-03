/*
Common utilities shared across actions.
*/

function errorResponse(statusCode, message, logger) {
  if (logger && typeof logger.info === 'function') {
    logger.info(`${statusCode}: ${message}`);
  }
  return {
    error: {
      statusCode,
      body: {
        error: message,
      },
    },
  };
}

function getMissingKeys(obj, required) {
  return (required || []).filter((r) => {
    const segments = r.split('.');
    const last = segments[segments.length - 1];
    const traverse = segments.slice(0, -1).reduce((t, segment) => (t && t[segment] ? t[segment] : {}), obj);
    return traverse[last] === undefined || traverse[last] === '';
  });
}

function checkMissingRequestInputs(params, requiredParams = [], requiredHeaders = []) {
  let errorMessage = null;

  const headers = requiredHeaders.map((h) => h.toLowerCase());
  const missingHeaders = getMissingKeys(params.__ow_headers || {}, headers);
  if (missingHeaders.length > 0) {
    errorMessage = `missing header(s) '${missingHeaders}'`;
  }

  const missingParams = getMissingKeys(params, requiredParams);
  if (missingParams.length > 0) {
    errorMessage = errorMessage ? `${errorMessage} and ` : '';
    errorMessage += `missing parameter(s) '${missingParams}'`;
  }

  return errorMessage;
}

module.exports = {
  errorResponse,
  checkMissingRequestInputs,
};
