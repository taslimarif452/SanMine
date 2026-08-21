import nodemailer from 'nodemailer';
import {
  saveUserSmtpCredentials,
  getUserSmtpCredentials,
  getUserSmtpStatus,
  deleteUserSmtpCredentials,
  isSmtpEncryptionConfigured,
} from '../db/smtp.js';
import { isDatabaseConfigured, getGmailTokens } from '../db/neon.js';

/**
 * Normalizes and strips spaces from a Gmail App Password.
 * Users frequently copy 16-character passwords with spaces (e.g. "abcd efgh ijkl mnop").
 */
export function sanitizeAppPassword(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, '').trim();
}

/**
 * Validates format of Gmail/Google Workspace email address.
 */
export function isValidGmailAddress(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}

/**
 * Verifies SMTP credentials against smtp.gmail.com by performing a live handshake.
 * Tests SSL Port 465 first, then falls back to STARTTLS Port 587.
 */
export async function verifyGmailSmtpCredentials(
  email: string,
  appPassword: string
): Promise<{
  success: boolean;
  error?: string;
  host?: string;
  port?: number;
  secure?: boolean;
}> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = sanitizeAppPassword(appPassword);

  if (!cleanEmail || !isValidGmailAddress(cleanEmail)) {
    return {
      success: false,
      error: 'Please enter a valid Gmail or Google Workspace email address.',
    };
  }

  if (!cleanPass || cleanPass.length < 16) {
    return {
      success: false,
      error:
        'A 16-character Google App Password is required. Please create one in your Google Account (Security -> 2-Step Verification -> App Passwords).',
    };
  }

  // 1. Try SSL port 465 (Primary Gmail secure port)
  try {
    const transporter465 = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: cleanEmail,
        pass: cleanPass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });

    await transporter465.verify();
    return {
      success: true,
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
    };
  } catch (err465: any) {
    // 2. Try STARTTLS port 587
    try {
      const transporter587 = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: {
          user: cleanEmail,
          pass: cleanPass,
        },
        connectionTimeout: 10000,
        greetingTimeout: 8000,
        socketTimeout: 10000,
      });

      await transporter587.verify();
      return {
        success: true,
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
      };
    } catch (err587: any) {
      const rawMsg = (err465?.message || err587?.message || 'SMTP Authentication failed').toString();
      console.error('[Gmail SMTP Verification Failed]:', rawMsg);

      let cleanError = 'Google rejected the App Password. Please check that 2-Step Verification is ON and a valid 16-character App Password is used.';
      if (rawMsg.includes('Username and Password not accepted') || rawMsg.includes('535-5.7.8') || rawMsg.includes('535 5.7.8')) {
        cleanError = 'Invalid Gmail address or App Password. Note: Standard Google passwords are not accepted by Gmail SMTP; a 16-character App Password is required.';
      } else if (rawMsg.includes('ETIMEDOUT') || rawMsg.includes('ECONNREFUSED') || rawMsg.includes('ENOTFOUND')) {
        cleanError = 'Network timeout connecting to smtp.gmail.com. Please retry in a few moments.';
      }

      return {
        success: false,
        error: cleanError,
      };
    }
  }
}

/**
 * Connects and securely stores user's Gmail SMTP configuration after verifying authentication.
 */
export async function connectGmailSmtp(params: {
  userId: string;
  email: string;
  appPassword: string;
}): Promise<{
  success: boolean;
  error?: string;
  email?: string;
  host?: string;
  port?: number;
}> {
  const { userId, email, appPassword } = params;

  if (!isSmtpEncryptionConfigured()) {
    return {
      success: false,
      error: 'Server encryption secret (CREDENTIAL_ENCRYPTION_KEY) is not configured in server environment variables. Please set CREDENTIAL_ENCRYPTION_KEY (32+ chars) in your deployment settings before connecting SMTP.',
    };
  }

  // Provider Exclusivity: Reject if user already has an active Google OAuth Gmail connection
  const oauthRecord = await getGmailTokens(userId);
  if (oauthRecord && (oauthRecord.accessToken || oauthRecord.refreshToken)) {
    return {
      success: false,
      error: 'A Gmail account is already connected through Google. Disconnect the existing Gmail account before connecting Gmail manually through SMTP.',
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      success: false,
      error: 'Database persistence (DATABASE_URL / NEON_DATABASE_URL) is not configured on the server. Cannot securely store SMTP credentials.',
    };
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = sanitizeAppPassword(appPassword);

  const verification = await verifyGmailSmtpCredentials(cleanEmail, cleanPass);
  if (!verification.success) {
    return {
      success: false,
      error: verification.error || 'Failed to authenticate with Gmail SMTP.',
    };
  }

  await saveUserSmtpCredentials({
    userId,
    email: cleanEmail,
    appPassword: cleanPass,
    host: verification.host || 'smtp.gmail.com',
    port: verification.port || 465,
    secure: verification.secure !== false,
  });

  return {
    success: true,
    email: cleanEmail,
    host: verification.host,
    port: verification.port,
  };
}

/**
 * Sends an email message through Gmail SMTP using encrypted credentials loaded server-side.
 */
export async function sendGmailSmtpMessage(params: {
  userId: string;
  to: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  userDisplayName?: string;
}): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const { userId, to, subject, bodyText, bodyHtml, userDisplayName } = params;
  const creds = await getUserSmtpCredentials(userId);

  if (!creds || !creds.appPassword) {
    return {
      success: false,
      error: 'Gmail SMTP is not connected. Please configure your Gmail App Password in Settings.',
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: creds.host || 'smtp.gmail.com',
      port: creds.port || 465,
      secure: creds.secure !== false,
      auth: {
        user: creds.email,
        pass: creds.appPassword,
      },
      connectionTimeout: 15000,
      socketTimeout: 20000,
    });

    const fromAddress = userDisplayName
      ? `"${userDisplayName.replace(/["\r\n]/g, '')}" <${creds.email}>`
      : creds.email;

    const htmlContent = bodyHtml || (bodyText ? bodyText.replace(/\n/g, '<br/>') : undefined);

    const info = await transporter.sendMail({
      from: fromAddress,
      to: to.trim(),
      subject: subject.trim(),
      text: bodyText,
      html: htmlContent,
    });

    return {
      success: true,
      messageId: info.messageId || `smtp-${Date.now()}`,
    };
  } catch (err: any) {
    console.error('[SMTP Dispatch Error]:', err?.message || err);
    let msg = err?.message || 'Failed to dispatch email via Gmail SMTP';
    if (msg.includes('Username and Password not accepted') || msg.includes('535-5.7.8')) {
      msg = 'Gmail SMTP authorization expired or App Password revoked. Please reconnect in Settings.';
    }
    return {
      success: false,
      error: msg,
    };
  }
}

export {
  getUserSmtpStatus,
  deleteUserSmtpCredentials,
};
