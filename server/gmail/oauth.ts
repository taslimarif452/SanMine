import crypto from 'node:crypto';
import { getGmailTokens, saveGmailTokens, deleteGmailTokens, GmailTokenRecord } from '../db/neon.js';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export const CANONICAL_PRODUCTION_REDIRECT_URI = 'https://sanmine.space/api/gmail/callback';
export const LEGACY_COMPATIBILITY_REDIRECT_URI = 'https://sanmine.space/api/gmail/oauth/callback';
export const DEV_DEFAULT_REDIRECT_URI = 'http://localhost:3000/api/gmail/callback';

export interface StatePayload {
  userId: string;
  timestamp: number;
  nonce: string;
}

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GMAIL_API_SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// Cache consumed nonces to prevent replay attacks (valid for 15 minutes)
const consumedNonces = new Set<string>();

/**
 * Cleanly resolves Google OAuth credentials without fallback chains.
 * In production, strictly enforces the canonical redirect URI (https://sanmine.space/api/gmail/callback).
 */
export function getOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
  
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  const envRedirect = process.env.GOOGLE_REDIRECT_URI?.trim();

  let redirectUri: string;
  if (isProd) {
    // In production, enforce canonical redirect URI
    if (envRedirect && envRedirect !== CANONICAL_PRODUCTION_REDIRECT_URI && envRedirect !== LEGACY_COMPATIBILITY_REDIRECT_URI) {
      console.warn(
        `[Gmail OAuth Warning] GOOGLE_REDIRECT_URI in production is '${envRedirect}', which differs from canonical '${CANONICAL_PRODUCTION_REDIRECT_URI}'. Using canonical URI.`
      );
    }
    redirectUri = CANONICAL_PRODUCTION_REDIRECT_URI;
  } else {
    redirectUri = envRedirect || DEV_DEFAULT_REDIRECT_URI;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

/**
 * Validates whether all mandatory OAuth variables are configured.
 * GMAIL_OAUTH_STATE_SECRET is strictly mandatory with no fallback.
 */
export function getStateSecret(): string | null {
  const secret = process.env.GMAIL_OAUTH_STATE_SECRET?.trim();
  return secret || null;
}

export function isGmailOAuthConfigured(): boolean {
  const config = getOAuthConfig();
  const stateSecret = getStateSecret();
  return Boolean(config.clientId && config.clientSecret && stateSecret);
}

/**
 * Creates a cryptographically signed, tamper-resistant OAuth state token.
 */
export function createOAuthState(userId: string): string {
  const stateSecret = getStateSecret();
  if (!stateSecret) {
    throw new Error('GMAIL_OAUTH_NOT_CONFIGURED');
  }

  const payload: StatePayload = {
    userId: userId.trim(),
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr, 'utf8').toString('base64url');
  
  const hmac = crypto.createHmac('sha256', stateSecret);
  hmac.update(payloadB64);
  const signature = hmac.digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Validates the OAuth state token against tampering, replay, and expiration.
 */
export function verifyOAuthState(stateStr: string): { valid: boolean; userId?: string; error?: string } {
  const stateSecret = getStateSecret();
  if (!stateSecret) {
    return { valid: false, error: 'GMAIL_OAUTH_NOT_CONFIGURED' };
  }

  if (!stateStr || typeof stateStr !== 'string') {
    return { valid: false, error: 'STATE_MISSING' };
  }

  const parts = stateStr.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'STATE_MALFORMED' };
  }

  const [payloadB64, providedSig] = parts;

  // Verify HMAC signature
  const hmac = crypto.createHmac('sha256', stateSecret);
  hmac.update(payloadB64);
  const expectedSig = hmac.digest('base64url');

  const providedBuffer = Buffer.from(providedSig);
  const expectedBuffer = Buffer.from(expectedSig);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { valid: false, error: 'STATE_SIGNATURE_INVALID' };
  }

  try {
    const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload: StatePayload = JSON.parse(payloadStr);

    if (!payload.userId || !payload.timestamp || !payload.nonce) {
      return { valid: false, error: 'STATE_PAYLOAD_INVALID' };
    }

    // Reject state older than 15 minutes
    const MAX_AGE_MS = 15 * 60 * 1000;
    if (Date.now() - payload.timestamp > MAX_AGE_MS) {
      return { valid: false, error: 'STATE_EXPIRED' };
    }

    // Replay attack prevention
    if (consumedNonces.has(payload.nonce)) {
      return { valid: false, error: 'STATE_ALREADY_USED' };
    }

    consumedNonces.add(payload.nonce);
    // Cleanup nonce after 20 minutes
    setTimeout(() => consumedNonces.delete(payload.nonce), 20 * 60 * 1000);

    return { valid: true, userId: payload.userId };
  } catch (err: any) {
    return { valid: false, error: 'STATE_DECODE_FAILED' };
  }
}

/**
 * Builds Google OAuth Consent URL.
 */
export function buildGoogleAuthUrl(userId: string): { url: string; redirectUri: string } {
  if (!isGmailOAuthConfigured()) {
    throw new Error('GMAIL_OAUTH_NOT_CONFIGURED');
  }

  const config = getOAuthConfig();
  const state = createOAuthState(userId);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GMAIL_SEND_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return {
    url: `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`,
    redirectUri: config.redirectUri,
  };
}

/**
 * Exchanges authorization code for OAuth access and refresh tokens.
 * Matches the redirect URI used during initial consent generation.
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUriOverride?: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  tokenType?: string;
  scope?: string;
}> {
  const config = getOAuthConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error('GMAIL_NOT_CONFIGURED');
  }

  const primaryRedirectUri = redirectUriOverride || config.redirectUri;

  const performExchange = async (uri: string) => {
    const params = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: uri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    const data = await response.json();
    return { ok: response.ok && !data.error, data };
  };

  // Attempt primary exchange
  let result = await performExchange(primaryRedirectUri);

  // If failed and no explicit override was provided, in production attempt fallback between canonical and legacy
  if (!result.ok && !redirectUriOverride && (process.env.NODE_ENV === 'production' || !!process.env.VERCEL)) {
    const fallbackUri = primaryRedirectUri === CANONICAL_PRODUCTION_REDIRECT_URI
      ? LEGACY_COMPATIBILITY_REDIRECT_URI
      : CANONICAL_PRODUCTION_REDIRECT_URI;
    const retryResult = await performExchange(fallbackUri);
    if (retryResult.ok) {
      result = retryResult;
    }
  }

  if (!result.ok) {
    const errorDescription = result.data?.error_description || result.data?.error || 'Code exchange failed';
    throw new Error(`OAUTH_EXCHANGE_FAILED: ${errorDescription}`);
  }

  const data = result.data;
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  const expiryDate = Date.now() + expiresIn * 1000;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiryDate,
    tokenType: data.token_type || 'Bearer',
    scope: data.scope || GMAIL_SEND_SCOPE,
  };
}

/**
 * Refreshes an expired access token using the stored refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiryDate: number;
}> {
  const config = getOAuthConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error('GMAIL_NOT_CONFIGURED');
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    const errorDescription = data.error_description || data.error || 'Token refresh failed';
    throw new Error(`TOKEN_REFRESH_FAILED: ${errorDescription}`);
  }

  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  const expiryDate = Date.now() + expiresIn * 1000;

  return {
    accessToken: data.access_token,
    expiryDate,
  };
}

/**
 * Obtains a valid access token for the user, refreshing if expired.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const tokenRecord = await getGmailTokens(userId);
  if (!tokenRecord || !tokenRecord.accessToken) {
    throw new Error('GMAIL_NOT_CONNECTED');
  }

  // If token is valid for at least 2 more minutes, reuse it
  const isExpiringSoon = tokenRecord.expiryDate ? Date.now() + 2 * 60 * 1000 > tokenRecord.expiryDate : false;

  if (!isExpiringSoon) {
    return tokenRecord.accessToken;
  }

  if (!tokenRecord.refreshToken) {
    // If no refresh token available, return current access token if not completely expired
    return tokenRecord.accessToken;
  }

  // Refresh token
  const refreshed = await refreshAccessToken(tokenRecord.refreshToken);
  
  await saveGmailTokens({
    ...tokenRecord,
    accessToken: refreshed.accessToken,
    expiryDate: refreshed.expiryDate,
    updatedAt: new Date().toISOString(),
  });

  return refreshed.accessToken;
}

/**
 * Dispatches an email via Google Workspace Gmail API using gmail.send scope.
 */
export async function sendGmailMessage(params: {
  userId: string;
  to: string;
  subject: string;
  bodyText: string;
  userDisplayName?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const accessToken = await getValidAccessToken(params.userId);

    const displayName = params.userDisplayName ? params.userDisplayName.replace(/[^\w\s]/gi, '') : 'SanMine Space';
    const emailLines = [
      `To: ${params.to.trim()}`,
      `Subject: ${params.subject.trim()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      params.bodyText,
    ];

    const rawMessage = emailLines.join('\r\n');
    const encodedMessage = Buffer.from(rawMessage, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await fetch(GMAIL_API_SEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errorMsg = data.error?.message || 'Failed to send message through Gmail API';
      return { success: false, error: errorMsg };
    }

    return {
      success: true,
      messageId: data.id,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error executing Gmail message dispatch',
    };
  }
}
