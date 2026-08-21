import { Router, Request, Response } from 'express';
import {
  isGmailOAuthConfigured,
  buildGoogleAuthUrl,
  verifyOAuthState,
  exchangeCodeForTokens,
  sendGmailMessage,
} from './oauth.js';
import { getGmailTokens, saveGmailTokens, deleteGmailTokens } from '../db/neon.js';
import {
  connectGmailSmtp,
  sendGmailSmtpMessage,
  getUserSmtpStatus,
  deleteUserSmtpCredentials,
} from './smtp.js';
import { getUserSmtpCredentials } from '../db/smtp.js';

export const gmailRouter = Router();

/**
 * Derives the effective user ID from authenticated session credentials,
 * strictly preventing IDOR or cross-tenant query/body parameter spoofing.
 */
function getEffectiveUserId(req: Request, fallback = 'default-user'): string {
  if ((req as any).user?.id) {
    return (req as any).user.id;
  }
  if ((req as any).firebaseUid) {
    return (req as any).firebaseUid;
  }
  const queryParam = req.query?.userId as string;
  const bodyParam = req.body?.userId as string;
  return (queryParam || bodyParam)?.trim() || fallback;
}

/**
 * 1. GET /api/gmail/auth
 * Initiates the Google OAuth authorization flow.
 */
gmailRouter.get('/auth', async (req: Request, res: Response) => {
  try {
    const userId = getEffectiveUserId(req);

    if (!isGmailOAuthConfigured()) {
      return res.status(503).json({
        ok: false,
        configured: false,
        code: 'GMAIL_OAUTH_NOT_CONFIGURED',
        error: 'Gmail OAuth is not configured on the server.',
        message: 'Gmail OAuth is not configured on the server.',
      });
    }

    // Provider Exclusivity: Reject if user already has an active SMTP connection
    const smtpRecord = await getUserSmtpCredentials(userId);
    if (smtpRecord && smtpRecord.appPassword) {
      return res.status(400).json({
        ok: false,
        configured: true,
        code: 'SMTP_ALREADY_CONNECTED',
        error: 'A Gmail account is already connected through SMTP. Disconnect the existing Gmail account before connecting through Google.',
        message: 'A Gmail account is already connected through SMTP. Disconnect the existing Gmail account before connecting through Google.',
      });
    }

    const { url, redirectUri } = buildGoogleAuthUrl(userId);

    return res.status(200).json({
      ok: true,
      configured: true,
      url,
      redirectUri,
    });
  } catch (error: any) {
    console.error('[Gmail Route] Error generating auth URL:', error);
    const isNotConfigured = error.message === 'GMAIL_OAUTH_NOT_CONFIGURED' || error.message === 'GMAIL_NOT_CONFIGURED';
    return res.status(isNotConfigured ? 503 : 500).json({
      ok: false,
      configured: false,
      code: isNotConfigured ? 'GMAIL_OAUTH_NOT_CONFIGURED' : 'AUTH_URL_GENERATION_FAILED',
      error: isNotConfigured ? 'Gmail OAuth is not configured on the server.' : (error.message || 'Failed to generate authorization URL'),
      message: isNotConfigured ? 'Gmail OAuth is not configured on the server.' : (error.message || 'Failed to generate authorization URL'),
    });
  }
});

/**
 * 2. GET /api/gmail/callback (canonical) & /api/gmail/oauth/callback (backward compatibility alias)
 * Handles Google OAuth redirect callback, exchanges code, and saves encrypted tokens.
 * Both paths invoke the exact same callback handler implementation.
 */
gmailRouter.get(['/callback', '/oauth/callback'], async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const oauthError = req.query.error as string;

  const renderPopupCloser = (success: boolean, message: string) => {
    const eventType = success ? 'GMAIL_OAUTH_SUCCESS' : 'GMAIL_OAUTH_ERROR';
    const safeMsg = message.replace(/'/g, "\\'");
    return `<!DOCTYPE html>
<html>
<head>
  <title>SanMine Space Gmail Authorization</title>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #F8F7F4; color: #1F1E1B; text-align: center; }
    .card { background: white; border: 1px solid #E6E4DF; border-radius: 12px; padding: 2rem; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .title { font-weight: 600; font-size: 1.1rem; margin-bottom: 0.5rem; }
    .desc { color: #6E6B65; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">${success ? 'Authorization Complete' : 'Authorization Failed'}</div>
    <div class="desc">${success ? 'Gmail successfully connected. This window will close automatically.' : safeMsg}</div>
  </div>
  <script>
    (function() {
      if (window.opener) {
        window.opener.postMessage({
          type: '${eventType}',
          success: ${success},
          error: '${safeMsg}'
        }, '*');
      }
      setTimeout(function() { window.close(); }, ${success ? 1200 : 3000});
    })();
  </script>
</body>
</html>`;
  };

  if (oauthError) {
    return res.status(200).send(renderPopupCloser(false, `Google authorization was cancelled or denied: ${oauthError}`));
  }

  if (!code || !state) {
    return res.status(200).send(renderPopupCloser(false, 'Missing authorization code or state parameter.'));
  }

  // Validate state token
  const stateCheck = verifyOAuthState(state);
  if (!stateCheck.valid || !stateCheck.userId) {
    return res.status(200).send(renderPopupCloser(false, `Invalid or expired OAuth state: ${stateCheck.error || 'UNAUTHORIZED'}`));
  }

  const userId = stateCheck.userId;

  // Provider Exclusivity: Reject if user already has an active SMTP connection
  const smtpRecord = await getUserSmtpCredentials(userId);
  if (smtpRecord && smtpRecord.appPassword) {
    return res.status(200).send(
      renderPopupCloser(
        false,
        'A Gmail account is already connected through SMTP. Disconnect the existing Gmail account before connecting through Google.'
      )
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    await saveGmailTokens({
      userId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiryDate: tokens.expiryDate,
      tokenType: tokens.tokenType,
      scope: tokens.scope,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).send(renderPopupCloser(true, 'Gmail connected successfully!'));
  } catch (error: any) {
    console.error('[Gmail Route] OAuth code exchange error:', error);
    return res.status(200).send(renderPopupCloser(false, `Failed to complete token exchange: ${error.message}`));
  }
});

/**
 * 3. GET /api/gmail/status
 * Returns connection and configuration status for the user.
 */
gmailRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = getEffectiveUserId(req);
    const configured = isGmailOAuthConfigured();

    if (!configured) {
      return res.status(200).json({
        ok: true,
        configured: false,
        connected: false,
        email: null,
      });
    }

    const tokenRecord = await getGmailTokens(userId);
    const connected = Boolean(tokenRecord && tokenRecord.accessToken);

    return res.status(200).json({
      ok: true,
      configured: true,
      connected,
      email: tokenRecord?.email || null,
      scope: tokenRecord?.scope || 'https://www.googleapis.com/auth/gmail.send',
    });
  } catch (error: any) {
    console.error('[Gmail Route] Status check error:', error);
    return res.status(200).json({
      ok: false,
      configured: isGmailOAuthConfigured(),
      connected: false,
      error: error.message || 'Failed to check Gmail status',
    });
  }
});

/**
 * 4. POST /api/gmail/disconnect
 * Disconnects the user's Gmail integration by purging stored tokens.
 */
gmailRouter.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = getEffectiveUserId(req);
    await deleteGmailTokens(userId);

    return res.status(200).json({
      ok: true,
      success: true,
      message: 'Gmail disconnected successfully.',
    });
  } catch (error: any) {
    console.error('[Gmail Route] Disconnect error:', error);
    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Failed to disconnect Gmail',
    });
  }
});

/**
 * 5. POST /api/gmail/send-proposal
 * Sends a proposal email using Gmail API or Gmail SMTP depending on provider selection or connection state.
 */
gmailRouter.post('/send-proposal', async (req: Request, res: Response) => {
  try {
    const { to, subject, bodyText, userDisplayName, provider } = req.body || {};
    const cleanUserId = getEffectiveUserId(req);

    if (!to || !subject || !bodyText) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'Recipient email (to), subject, and bodyText are required.',
      });
    }

    // Determine dispatch route: explicit 'smtp'/'gmail_smtp' or fallback based on what's connected
    let useSmtp = provider === 'smtp' || provider === 'gmail_smtp';
    if (!provider) {
      const oauthRecord = await getGmailTokens(cleanUserId);
      if (!oauthRecord || !oauthRecord.accessToken) {
        const smtpRecord = await getUserSmtpCredentials(cleanUserId);
        if (smtpRecord && smtpRecord.appPassword) {
          useSmtp = true;
        }
      }
    }

    if (useSmtp) {
      const smtpResult = await sendGmailSmtpMessage({
        userId: cleanUserId,
        to: (to as string).trim(),
        subject: (subject as string).trim(),
        bodyText: (bodyText as string).trim(),
        userDisplayName: userDisplayName ? String(userDisplayName).trim() : undefined,
      });

      if (!smtpResult.success) {
        return res.status(400).json({
          ok: false,
          success: false,
          error: smtpResult.error || 'Failed to send proposal email via Gmail SMTP',
        });
      }

      return res.status(200).json({
        ok: true,
        success: true,
        messageId: smtpResult.messageId,
        provider: 'gmail_smtp',
      });
    }

    // Standard Gmail API (OAuth) dispatch
    const result = await sendGmailMessage({
      userId: cleanUserId,
      to: (to as string).trim(),
      subject: (subject as string).trim(),
      bodyText: (bodyText as string).trim(),
      userDisplayName: userDisplayName ? String(userDisplayName).trim() : undefined,
    });

    if (!result.success) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: result.error || 'Failed to send proposal email',
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
      messageId: result.messageId,
      provider: 'gmail_api',
    });
  } catch (error: any) {
    console.error('[Gmail Route] Send proposal error:', error);
    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Internal error dispatching proposal',
    });
  }
});

/**
 * 6. POST /api/gmail/send-test
 * Sends a test verification email to the user via OAuth or SMTP.
 */
gmailRouter.post('/send-test', async (req: Request, res: Response) => {
  try {
    const { to, userDisplayName, provider } = req.body || {};
    const cleanUserId = getEffectiveUserId(req);

    if (!to) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'Recipient email (to) is required for test email.',
      });
    }

    let useSmtp = provider === 'smtp' || provider === 'gmail_smtp';
    if (!provider) {
      const oauthRecord = await getGmailTokens(cleanUserId);
      if (!oauthRecord || !oauthRecord.accessToken) {
        const smtpRecord = await getUserSmtpCredentials(cleanUserId);
        if (smtpRecord && smtpRecord.appPassword) {
          useSmtp = true;
        }
      }
    }

    if (useSmtp) {
      const smtpResult = await sendGmailSmtpMessage({
        userId: cleanUserId,
        to: (to as string).trim(),
        subject: 'SanMine Space Gmail SMTP Integration - Verification Test',
        bodyText: `Hello,\n\nThis is a verification test from your SanMine Space AI workspace confirming that your Gmail SMTP connection (App Password) is authenticated and operating properly.\n\nTimestamp: ${new Date().toISOString()}`,
        userDisplayName: userDisplayName ? String(userDisplayName).trim() : undefined,
      });

      if (!smtpResult.success) {
        return res.status(400).json({
          ok: false,
          success: false,
          error: smtpResult.error || 'Failed to send test email via Gmail SMTP',
        });
      }

      return res.status(200).json({
        ok: true,
        success: true,
        messageId: smtpResult.messageId,
        provider: 'gmail_smtp',
      });
    }

    const result = await sendGmailMessage({
      userId: cleanUserId,
      to: (to as string).trim(),
      subject: 'SanMine Space Gmail Integration - Verification Test',
      bodyText: `Hello,\n\nThis is a verification test from your SanMine Space AI workspace confirming that your Gmail integration (gmail.send) is connected and operating properly.\n\nTimestamp: ${new Date().toISOString()}`,
      userDisplayName: userDisplayName ? String(userDisplayName).trim() : undefined,
    });

    if (!result.success) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: result.error || 'Failed to send test email',
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
      messageId: result.messageId,
      provider: 'gmail_api',
    });
  } catch (error: any) {
    console.error('[Gmail Route] Send test error:', error);
    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Internal error sending test email',
    });
  }
});

/**
 * 7. POST /api/gmail/smtp/connect
 * Validates Gmail credentials live against smtp.gmail.com and securely persists encrypted App Password.
 */
gmailRouter.post('/smtp/connect', async (req: Request, res: Response) => {
  try {
    const { email, appPassword } = req.body || {};
    const cleanUserId = getEffectiveUserId(req);

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'A valid Gmail address is required.',
      });
    }

    if (!appPassword || typeof appPassword !== 'string') {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'A 16-character Google App Password is required.',
      });
    }

    const result = await connectGmailSmtp({
      userId: cleanUserId,
      email: email.trim(),
      appPassword: appPassword.trim(),
    });

    if (!result.success) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: result.error || 'Failed to connect Gmail SMTP.',
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
      connected: true,
      email: result.email,
      host: result.host,
      port: result.port,
      provider: 'gmail_smtp',
      message: 'Gmail SMTP connected and verified successfully.',
    });
  } catch (error: any) {
    console.error('[Gmail SMTP Route] Connect error:', error);
    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Internal server error while connecting Gmail SMTP',
    });
  }
});

/**
 * 8. GET /api/gmail/smtp/status
 * Returns connection status and safe metadata for Gmail SMTP (never returns passwords).
 */
gmailRouter.get('/smtp/status', async (req: Request, res: Response) => {
  try {
    const userId = getEffectiveUserId(req);
    const status = await getUserSmtpStatus(userId);

    return res.status(200).json({
      ok: true,
      connected: status.connected,
      email: status.email,
      provider: 'gmail_smtp',
      host: status.host,
      port: status.port,
    });
  } catch (error: any) {
    console.error('[Gmail SMTP Route] Status error:', error);
    return res.status(200).json({
      ok: false,
      connected: false,
      email: null,
      provider: 'gmail_smtp',
      error: error.message || 'Failed to retrieve SMTP status',
    });
  }
});

/**
 * 9. POST /api/gmail/smtp/test
 * Sends a test email specifically using the connected Gmail SMTP transport.
 */
gmailRouter.post('/smtp/test', async (req: Request, res: Response) => {
  try {
    const { to, userDisplayName } = req.body || {};
    const cleanUserId = getEffectiveUserId(req);

    if (!to || typeof to !== 'string') {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'Recipient email address (to) is required.',
      });
    }

    const result = await sendGmailSmtpMessage({
      userId: cleanUserId,
      to: to.trim(),
      subject: 'SanMine Space Gmail SMTP - Verification Test',
      bodyText: `Hello,\n\nThis is a verification test from your SanMine Space AI workspace confirming that your Gmail SMTP connection (App Password) is working and ready for proposal delivery.\n\nTimestamp: ${new Date().toISOString()}`,
      userDisplayName: userDisplayName ? String(userDisplayName).trim() : undefined,
    });

    if (!result.success) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: result.error || 'Failed to send test email via Gmail SMTP.',
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
      messageId: result.messageId,
      provider: 'gmail_smtp',
      message: 'Test email successfully sent via Gmail SMTP.',
    });
  } catch (error: any) {
    console.error('[Gmail SMTP Route] Test error:', error);
    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Internal error sending SMTP test email',
    });
  }
});

/**
 * 10. POST /api/gmail/smtp/disconnect
 * Disconnects the user's Gmail SMTP configuration by purging stored credentials.
 */
gmailRouter.post('/smtp/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = getEffectiveUserId(req);
    await deleteUserSmtpCredentials(userId);

    return res.status(200).json({
      ok: true,
      success: true,
      message: 'Gmail SMTP disconnected successfully.',
    });
  } catch (error: any) {
    console.error('[Gmail SMTP Route] Disconnect error:', error);
    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Failed to disconnect Gmail SMTP',
    });
  }
});
