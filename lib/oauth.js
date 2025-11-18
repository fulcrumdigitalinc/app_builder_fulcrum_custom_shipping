/*
Copyright 2025
Licensed under the Apache License, Version 2.0
*/

function toArray(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) {
        // fall through to treat as plain string
      }
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return [value];
}

function firstNonEmptyFrom(value) {
  const arr = Array.isArray(value) ? value : toArray(value);
  for (const entry of arr) {
    if (entry === null || entry === undefined) continue;
    const str = String(entry).trim();
    if (str) return str;
  }
  return null;
}

function scopesToString(scopes, fallback = 'commerce_api') {
  const joined = toArray(scopes)
    .map((scope) => String(scope || '').trim())
    .filter(Boolean)
    .join(' ');
  return joined || fallback;
}

function resolveOAuthParams(params = {}, { defaultScope = 'commerce_api' } = {}) {
  const clientId = params.OAUTH_CLIENT_ID || process.env.OAUTH_CLIENT_ID;
  const clientSecret =
    firstNonEmptyFrom(params.OAUTH_CLIENT_SECRET) ||
    firstNonEmptyFrom(params.OAUTH_CLIENT_SECRETS) ||
    firstNonEmptyFrom(process.env.OAUTH_CLIENT_SECRET) ||
    firstNonEmptyFrom(process.env.OAUTH_CLIENT_SECRETS);
  const scopesInput =
    params.OAUTH_SCOPES !== undefined
      ? params.OAUTH_SCOPES
      : process.env.OAUTH_SCOPES !== undefined
        ? process.env.OAUTH_SCOPES
        : defaultScope;
  const scopes = scopesToString(scopesInput, defaultScope);

  return { clientId, clientSecret, scopes };
}

module.exports = {
  toArray,
  firstNonEmptyFrom,
  scopesToString,
  resolveOAuthParams,
};

