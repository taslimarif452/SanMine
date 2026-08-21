import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { GmailStatus, SmtpStatus, SendProposalParams, SendEmailResponse } from '../types';
import { useAuth } from './AuthContext';

interface GmailContextType {
  // Gmail OAuth State & Methods
  status: GmailStatus | null;
  loading: boolean;
  isConnecting: boolean;
  error: string | null;
  refreshStatus: () => Promise<void>;
  connectGmail: () => Promise<void>;
  disconnectGmail: () => Promise<boolean>;
  sendTestEmail: (recipientEmail: string, provider?: 'oauth' | 'smtp') => Promise<SendEmailResponse>;
  sendProposalEmail: (params: SendProposalParams) => Promise<SendEmailResponse>;

  // Gmail SMTP State & Methods
  smtpStatus: SmtpStatus | null;
  smtpLoading: boolean;
  smtpConnecting: boolean;
  smtpError: string | null;
  refreshSmtpStatus: () => Promise<void>;
  connectSmtp: (email: string, appPassword: string) => Promise<{ success: boolean; error?: string }>;
  disconnectSmtp: () => Promise<boolean>;
  sendSmtpTestEmail: (recipientEmail: string) => Promise<SendEmailResponse>;

  // Combined convenience
  hasAnyConnection: boolean;
}

const GmailContext = createContext<GmailContextType | undefined>(undefined);

/**
 * Safely parses fetch responses to guarantee JSON handling and prevent HTML/plain-text parse crashes.
 */
async function safeParseResponse<T = any>(
  res: Response,
  fallbackMsg: string
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const status = res.status;
  const contentType = res.headers.get('content-type') || '';

  let rawText = '';
  try {
    rawText = await res.text();
  } catch (err: any) {
    return {
      ok: false,
      status,
      error: `Network stream error (${status}): ${err.message || 'Unable to read response body'}`,
    };
  }

  const trimmed = rawText.trim();

  // If payload is JSON or structured
  if (contentType.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (res.ok && parsed.ok !== false && parsed.success !== false) {
        return { ok: true, status, data: parsed };
      }
      const extractedError =
        parsed.error ||
        parsed.message ||
        parsed.code ||
        `${fallbackMsg} (HTTP ${status})`;
      return { ok: false, status, data: parsed, error: extractedError };
    } catch {
      // Proceed to text handling
    }
  }

  // Non-JSON response handling (e.g. 500 HTML or plain-text Vercel error)
  if (!res.ok) {
    let cleanMessage = trimmed;
    if (trimmed.includes('FUNCTION_INVOCATION_FAILED')) {
      cleanMessage = 'Gmail serverless service temporarily unavailable (Function invocation failed)';
    } else if (trimmed.includes('<!DOCTYPE') || trimmed.includes('<html')) {
      cleanMessage = trimmed.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    }
    return {
      ok: false,
      status,
      error: cleanMessage ? `Server error (${status}): ${cleanMessage}` : `${fallbackMsg} (HTTP ${status})`,
    };
  }

  return {
    ok: false,
    status,
    error: `Unexpected server response format (${status})`,
  };
}

export const GmailProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, getIdToken } = useAuth();

  // OAuth State
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // SMTP State
  const [smtpStatus, setSmtpStatus] = useState<SmtpStatus | null>(null);
  const [smtpLoading, setSmtpLoading] = useState<boolean>(true);
  const [smtpConnecting, setSmtpConnecting] = useState<boolean>(false);
  const [smtpError, setSmtpError] = useState<string | null>(null);

  const userId = currentUser?.uid || 'default-user';

  const getAuthHeaders = useCallback(async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    try {
      const token = await getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch {
      // Proceed without token if unavailable
    }
    return headers;
  }, [getIdToken]);

  const refreshStatus = useCallback(async () => {
    if (!currentUser) {
      setStatus(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/gmail/status?userId=${encodeURIComponent(userId)}`, {
        headers,
      });

      const parsed = await safeParseResponse<GmailStatus>(res, 'Failed to check Gmail connection status');
      if (parsed.ok && parsed.data) {
        setStatus(parsed.data);
        setError(null);
      } else {
        setError(parsed.error || 'Failed to check Gmail connection status');
      }
    } catch (err: any) {
      setError(err.message || 'Network error checking Gmail status');
    } finally {
      setLoading(false);
    }
  }, [currentUser, userId, getAuthHeaders]);

  const refreshSmtpStatus = useCallback(async () => {
    if (!currentUser) {
      setSmtpStatus(null);
      setSmtpLoading(false);
      return;
    }

    try {
      setSmtpLoading(true);
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/gmail/smtp/status?userId=${encodeURIComponent(userId)}`, {
        headers,
      });

      const parsed = await safeParseResponse<SmtpStatus>(res, 'Failed to check Gmail SMTP status');
      if (parsed.ok && parsed.data) {
        setSmtpStatus(parsed.data);
        setSmtpError(null);
      } else {
        setSmtpError(parsed.error || 'Failed to check Gmail SMTP status');
      }
    } catch (err: any) {
      setSmtpError(err.message || 'Network error checking Gmail SMTP status');
    } finally {
      setSmtpLoading(false);
    }
  }, [currentUser, userId, getAuthHeaders]);

  useEffect(() => {
    refreshStatus();
    refreshSmtpStatus();
  }, [refreshStatus, refreshSmtpStatus]);

  // Listen for popup window postMessage for OAuth flow
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GMAIL_OAUTH_SUCCESS') {
        setIsConnecting(false);
        setError(null);
        refreshStatus();
      } else if (event.data?.type === 'GMAIL_OAUTH_ERROR') {
        setIsConnecting(false);
        setError(event.data?.error || 'Gmail authorization was not completed');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [refreshStatus]);

  const connectGmail = async () => {
    setError(null);
    setIsConnecting(true);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/gmail/auth?userId=${encodeURIComponent(userId)}`, {
        headers,
      });

      const parsed = await safeParseResponse<{ ok: boolean; url?: string; message?: string; error?: string }>(
        res,
        'Failed to initialize Gmail OAuth connection'
      );

      if (!parsed.ok || !parsed.data?.url) {
        const msg = parsed.error || parsed.data?.message || 'Gmail OAuth is not configured on the server.';
        setError(msg);
        setIsConnecting(false);
        throw new Error(msg);
      }

      // Open Google OAuth consent popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        parsed.data.url,
        'gmail_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        setIsConnecting(false);
        throw new Error('Popup blocked by browser. Please allow popups for SanMine Space to connect Gmail.');
      }
    } catch (err: any) {
      setIsConnecting(false);
      setError(err.message || 'Failed to start Gmail connection flow');
      throw err;
    }
  };

  const disconnectGmail = async (): Promise<boolean> => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const res = await fetch('/api/gmail/disconnect', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId }),
      });

      const parsed = await safeParseResponse<{ ok: boolean; success?: boolean }>(
        res,
        'Failed to disconnect Gmail'
      );

      if (!parsed.ok) {
        throw new Error(parsed.error || 'Failed to disconnect Gmail');
      }

      await refreshStatus();
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect Gmail');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const connectSmtp = async (
    email: string,
    appPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    setSmtpError(null);
    setSmtpConnecting(true);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/gmail/smtp/connect', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId,
          email,
          appPassword,
        }),
      });

      const parsed = await safeParseResponse<{ ok: boolean; success?: boolean; error?: string; message?: string }>(
        res,
        'Failed to connect Gmail SMTP'
      );

      if (!parsed.ok) {
        const errorMsg = parsed.error || 'Failed to connect Gmail SMTP';
        setSmtpError(errorMsg);
        return { success: false, error: errorMsg };
      }

      await refreshSmtpStatus();
      return { success: true };
    } catch (err: any) {
      const msg = err.message || 'Network error connecting Gmail SMTP';
      setSmtpError(msg);
      return { success: false, error: msg };
    } finally {
      setSmtpConnecting(false);
    }
  };

  const disconnectSmtp = async (): Promise<boolean> => {
    try {
      setSmtpLoading(true);
      const headers = await getAuthHeaders();
      const res = await fetch('/api/gmail/smtp/disconnect', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId }),
      });

      const parsed = await safeParseResponse<{ ok: boolean; success?: boolean }>(
        res,
        'Failed to disconnect Gmail SMTP'
      );

      if (!parsed.ok) {
        throw new Error(parsed.error || 'Failed to disconnect Gmail SMTP');
      }

      await refreshSmtpStatus();
      return true;
    } catch (err: any) {
      setSmtpError(err.message || 'Failed to disconnect Gmail SMTP');
      return false;
    } finally {
      setSmtpLoading(false);
    }
  };

  const sendSmtpTestEmail = async (recipientEmail: string): Promise<SendEmailResponse> => {
    setSmtpError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/gmail/smtp/test', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId,
          to: recipientEmail,
          userDisplayName: currentUser?.displayName || 'SanMine Space User',
        }),
      });

      const parsed = await safeParseResponse<{ ok: boolean; success?: boolean; messageId?: string; message?: string }>(
        res,
        'Failed to send SMTP test email'
      );

      if (!parsed.ok) {
        throw new Error(parsed.error || 'Failed to send SMTP test email');
      }

      return {
        success: true,
        messageId: parsed.data?.messageId,
        provider: 'gmail_smtp',
        message: parsed.data?.message || 'SMTP test email sent successfully',
      };
    } catch (err: any) {
      setSmtpError(err.message || 'Failed to send SMTP test email');
      return {
        success: false,
        error: err.message || 'Failed to send SMTP test email',
      };
    }
  };

  const sendTestEmail = async (recipientEmail: string, provider?: 'oauth' | 'smtp'): Promise<SendEmailResponse> => {
    if (provider === 'smtp') {
      return sendSmtpTestEmail(recipientEmail);
    }

    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/gmail/send-test', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId,
          to: recipientEmail,
          userDisplayName: currentUser?.displayName || 'SanMine Space User',
          provider,
        }),
      });

      const parsed = await safeParseResponse<{ ok: boolean; success?: boolean; messageId?: string; provider?: any }>(
        res,
        'Failed to send test email'
      );

      if (!parsed.ok) {
        throw new Error(parsed.error || 'Failed to send test email');
      }

      return {
        success: true,
        messageId: parsed.data?.messageId,
        provider: parsed.data?.provider,
      };
    } catch (err: any) {
      setError(err.message || 'Failed to send test email');
      return {
        success: false,
        error: err.message || 'Failed to send test email',
      };
    }
  };

  const sendProposalEmail = async (params: SendProposalParams): Promise<SendEmailResponse> => {
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/gmail/send-proposal', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId,
          to: params.recipientEmail,
          subject: params.subject,
          bodyText: params.body,
          businessName: params.businessName,
          provider: params.provider,
          userDisplayName: currentUser?.displayName || 'SanMine Space User',
        }),
      });

      const parsed = await safeParseResponse<{ ok: boolean; success?: boolean; messageId?: string; provider?: any }>(
        res,
        'Failed to dispatch proposal email'
      );

      if (!parsed.ok) {
        throw new Error(parsed.error || 'Failed to dispatch proposal email');
      }

      return {
        success: true,
        messageId: parsed.data?.messageId,
        provider: parsed.data?.provider,
      };
    } catch (err: any) {
      setError(err.message || 'Failed to send proposal email');
      return {
        success: false,
        error: err.message || 'Failed to send proposal email',
      };
    }
  };

  const hasAnyConnection = Boolean(status?.connected || smtpStatus?.connected);

  return (
    <GmailContext.Provider
      value={{
        status,
        loading,
        isConnecting,
        error,
        refreshStatus,
        connectGmail,
        disconnectGmail,
        sendTestEmail,
        sendProposalEmail,

        smtpStatus,
        smtpLoading,
        smtpConnecting,
        smtpError,
        refreshSmtpStatus,
        connectSmtp,
        disconnectSmtp,
        sendSmtpTestEmail,

        hasAnyConnection,
      }}
    >
      {children}
    </GmailContext.Provider>
  );
};

export const useGmail = () => {
  const context = useContext(GmailContext);
  if (!context) {
    throw new Error('useGmail must be used within a GmailProvider');
  }
  return context;
};
