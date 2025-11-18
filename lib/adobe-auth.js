/*
Copyright 2024 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const { context, getToken } = require('@adobe/aio-lib-ims');
const got = require('got');
const { allNonEmpty, nonEmpty } = require('./params');

const DEFAULT_IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

function coerceList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed !== undefined && parsed !== null) {
        return [parsed];
      }
    } catch (e) {
      // fall through to comma/space separated parsing
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((part) => part.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return [value];
}

function toStringList(value) {
  return coerceList(value)
    .map((entry) => (entry === undefined || entry === null ? '' : String(entry).trim()))
    .filter((entry) => entry.length > 0);
}

function resolveClientSecrets(params) {
  const fromList = toStringList(params.OAUTH_CLIENT_SECRETS);
  if (fromList.length > 0) {
    return fromList;
  }
  return toStringList(params.OAUTH_CLIENT_SECRET);
}

function resolveScopes(params) {
  return toStringList(params.OAUTH_SCOPES);
}

/**
 * Generate access token to connect with Adobe services based on the given parameters.
 * Note these credentials are now retrieved from the action parameters but in a real-world scenario they should be treated
 * as secrets and stored in a dedicated secret manager.
 *
 * @param {object} params action input parameters.
 * @returns {Promise<string>} returns the access token
 * @see https://developer.adobe.com/runtime/docs/guides/using/security_general/#secrets
 */
async function getAdobeAccessToken(params) {
  const clientSecrets = resolveClientSecrets(params);
  if (!clientSecrets.length) {
    throw new Error('Missing IMS client secret. Set OAUTH_CLIENT_SECRETS or OAUTH_CLIENT_SECRET.');
  }

  const scopes = resolveScopes(params);
  if (!scopes.length) {
    throw new Error('Missing IMS scopes. Populate OAUTH_SCOPES with at least one scope.');
  }

  const hasServiceAccountDetails =
    nonEmpty('OAUTH_TECHNICAL_ACCOUNT_ID', params.OAUTH_TECHNICAL_ACCOUNT_ID) &&
    nonEmpty('OAUTH_TECHNICAL_ACCOUNT_EMAIL', params.OAUTH_TECHNICAL_ACCOUNT_EMAIL) &&
    nonEmpty('OAUTH_IMS_ORG_ID', params.OAUTH_IMS_ORG_ID);

  if (hasServiceAccountDetails) {
    const config = {
      client_id: params.OAUTH_CLIENT_ID,
      client_secrets: clientSecrets,
      technical_account_id: params.OAUTH_TECHNICAL_ACCOUNT_ID,
      technical_account_email: params.OAUTH_TECHNICAL_ACCOUNT_EMAIL,
      ims_org_id: params.OAUTH_IMS_ORG_ID,
      scopes,
      env: params.AIO_CLI_ENV ?? 'prod',
    };
    await context.set('commerce-starter-kit-creds', config);
    return getToken('commerce-starter-kit-creds', {});
  }

  if (!nonEmpty('OAUTH_CLIENT_ID', params.OAUTH_CLIENT_ID)) {
    throw new Error('Missing IMS client id. Set OAUTH_CLIENT_ID.');
  }

  const tokenUrl = params.IMS_TOKEN_URL || DEFAULT_IMS_TOKEN_URL;
  let lastError;
  for (const secret of clientSecrets) {
    try {
      const response = await got.post(tokenUrl, {
        form: {
          grant_type: 'client_credentials',
          client_id: params.OAUTH_CLIENT_ID,
          client_secret: secret,
          scope: scopes.join(' '),
        },
        responseType: 'json',
        throwHttpErrors: false,
      });

      const body = response.body || {};
      if (response.statusCode >= 200 && response.statusCode < 300 && body.access_token) {
        return body.access_token;
      }

      const errorMessage = body.error_description || body.error || `IMS token request failed (${response.statusCode})`;
      lastError = new Error(errorMessage);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to obtain IMS access token with the provided credentials.');
}

/**
 * Generates the credentials for the Adobe services based on the given parameters.
 * Note these credentials are now retrieved from the action parameters but in a real-world scenario they should be treated
 * as secrets and stored in a dedicated secret manager.
 *
 * @param {object} params action input parameters.
 * @returns {Promise<{apiKey: string, imsOrgId: string, accessToken: string}>} the generated credentials
 */
async function resolveCredentials(params) {
  return {
    accessToken: await getAdobeAccessToken(params),
    imsOrgId: params.OAUTH_IMS_ORG_ID,
    apiKey: params.OAUTH_CLIENT_ID,
  };
}

/**
 * Resolve the authentication options based on the provided parameters.
 * Note that Commerce integration options is preferred over IMS authentication options.
 * @param {object} params action input parameters.
 * @returns {Promise<{imsOptions: object}|{integrationOptions: object}>} returns the resolved authentication options
 * @throws {Error} if neither Commerce integration options nor IMS options are provided as params
 */
async function resolveAuthOptions(params) {
  if (
    allNonEmpty(params, [
      'COMMERCE_CONSUMER_KEY',
      'COMMERCE_CONSUMER_SECRET',
      'COMMERCE_ACCESS_TOKEN',
      'COMMERCE_ACCESS_TOKEN_SECRET',
    ])
  ) {
    return {
      integrationOptions: {
        consumerKey: params.COMMERCE_CONSUMER_KEY,
        consumerSecret: params.COMMERCE_CONSUMER_SECRET,
        accessToken: params.COMMERCE_ACCESS_TOKEN,
        accessTokenSecret: params.COMMERCE_ACCESS_TOKEN_SECRET,
      },
    };
  }

  const imsClientSecrets = resolveClientSecrets(params);
  const imsScopes = resolveScopes(params);
  const hasImsClientId = nonEmpty('OAUTH_CLIENT_ID', params.OAUTH_CLIENT_ID);
  const hasServiceAccountDetails =
    hasImsClientId &&
    imsClientSecrets.length > 0 &&
    nonEmpty('OAUTH_TECHNICAL_ACCOUNT_ID', params.OAUTH_TECHNICAL_ACCOUNT_ID) &&
    nonEmpty('OAUTH_TECHNICAL_ACCOUNT_EMAIL', params.OAUTH_TECHNICAL_ACCOUNT_EMAIL) &&
    nonEmpty('OAUTH_IMS_ORG_ID', params.OAUTH_IMS_ORG_ID) &&
    imsScopes.length > 0;
  const hasClientCredentials = hasImsClientId && imsClientSecrets.length > 0 && imsScopes.length > 0;

  if (hasServiceAccountDetails || hasClientCredentials) {
    return { imsOptions: await resolveCredentials(params) };
  }

  throw new Error(
    "Can't resolve authentication options for the given params. " +
      'Please provide either IMS options (OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRETS/OAUTH_CLIENT_SECRET, OAUTH_SCOPES, and optionally OAUTH_TECHNICAL_ACCOUNT_ID/OAUTH_TECHNICAL_ACCOUNT_EMAIL/OAUTH_IMS_ORG_ID for service accounts) ' +
      'or Commerce integration options (COMMERCE_CONSUMER_KEY, COMMERCE_CONSUMER_SECRET, COMMERCE_ACCESS_TOKEN, COMMERCE_ACCESS_TOKEN_SECRET). ' +
      'See https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/connect/#authentication for additional details.'
  );
}

module.exports = {
  getAdobeAccessToken,
  resolveCredentials,
  resolveAuthOptions,
};
