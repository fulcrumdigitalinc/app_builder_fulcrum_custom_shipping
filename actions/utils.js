function errorResponse(statusCode, error) {
  return {
    statusCode,
    body: { ok: false, error }
  };
}
module.exports = {
  errorResponse
};
