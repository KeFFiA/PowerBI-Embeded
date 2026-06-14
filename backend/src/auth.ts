import { ConfidentialClientApplication, type AuthenticationResult } from '@azure/msal-node';
import { config } from './config';
import { logger } from './logger';

/** Raised when the service principal cannot obtain an Azure AD token. */
export class AadAuthError extends Error {
  status = 502;
  constructor(message: string) {
    super(message);
    this.name = 'AadAuthError';
  }
}

/**
 * Acquires an Azure AD (Microsoft Entra ID) access token for the Power BI REST
 * API using the OAuth 2.0 client-credentials flow (service principal).
 *
 * The client secret lives ONLY here, on the server, sourced from environment
 * variables. It is never sent to the browser.
 *
 * MSAL caches tokens in memory and transparently refreshes them, so calling
 * getPowerBiAccessToken() on every request is cheap.
 */
const cca = new ConfidentialClientApplication({
  auth: {
    clientId: config.env.AAD_CLIENT_ID,
    authority: `${config.env.AAD_AUTHORITY_HOST}/${config.env.AAD_TENANT_ID}`,
    clientSecret: config.env.AAD_CLIENT_SECRET,
  },
});

export async function getPowerBiAccessToken(): Promise<string> {
  let result: AuthenticationResult | null;
  try {
    result = await cca.acquireTokenByClientCredential({
      scopes: [config.env.POWERBI_SCOPE],
    });
  } catch (err) {
    logger.error({ err }, 'Failed to acquire AAD token via client credentials');
    throw new AadAuthError('Azure AD authentication failed. Check tenant/client/secret and API permissions.');
  }

  if (!result?.accessToken) {
    throw new AadAuthError('Azure AD returned no access token.');
  }
  return result.accessToken;
}
