import React, { useState } from 'react';
import { Mail, Send, CheckCircle2, AlertCircle, Loader2, X, ExternalLink, ShieldCheck, KeyRound } from 'lucide-react';
import { useGmail } from '../../context/GmailContext';

interface SendProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRecipient?: string;
  defaultSubject?: string;
  defaultBody?: string;
  businessName?: string;
}

export const SendProposalModal: React.FC<SendProposalModalProps> = ({
  isOpen,
  onClose,
  defaultRecipient = '',
  defaultSubject = 'Proposal: Modernizing your digital presence and local discoverability',
  defaultBody = '',
  businessName = '',
}) => {
  const {
    status,
    isConnecting,
    connectGmail,
    smtpStatus,
    sendProposalEmail,
    hasAnyConnection,
  } = useGmail();

  const isOAuthConnected = Boolean(status?.connected);
  const isSmtpConnected = Boolean(smtpStatus?.connected);

  const [selectedProvider, setSelectedProvider] = useState<'oauth' | 'smtp'>(
    isOAuthConnected ? 'oauth' : isSmtpConnected ? 'smtp' : 'oauth'
  );
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  if (!isOpen) return null;

  const effectiveProvider = selectedProvider === 'oauth' && !isOAuthConnected && isSmtpConnected
    ? 'smtp'
    : selectedProvider === 'smtp' && !isSmtpConnected && isOAuthConnected
    ? 'oauth'
    : selectedProvider;

  const isCurrentProviderConnected = effectiveProvider === 'oauth' ? isOAuthConnected : isSmtpConnected;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !recipient.includes('@')) {
      setSendError('Please enter a valid recipient email address.');
      return;
    }
    if (!subject.trim()) {
      setSendError('Subject line cannot be empty.');
      return;
    }
    if (!body.trim()) {
      setSendError('Proposal content cannot be empty.');
      return;
    }

    setIsSending(true);
    setSendError(null);
    setSendSuccess(null);

    try {
      const res = await sendProposalEmail({
        recipientEmail: recipient.trim(),
        subject: subject.trim(),
        body: body.trim(),
        businessName,
        provider: effectiveProvider,
      });

      if (res.success) {
        setSendSuccess(
          res.message ||
            `Proposal sent successfully via ${effectiveProvider === 'smtp' ? 'Gmail SMTP' : 'Gmail API'} (Message ID: ${res.messageId || 'Dispatched'})`
        );
      } else {
        setSendError(res.error || 'Failed to send proposal');
      }
    } catch (err: any) {
      setSendError(err.message || 'Unexpected error occurred while sending');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      id="modal-send-proposal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent animate-in fade-in-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl w-full max-w-xl shadow-[0_16px_50px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E5E2DC] flex items-center justify-between bg-[#FAF9F5]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FAF6F2] border border-[#C66A3D]/20 flex items-center justify-center text-[#C66A3D]">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#1F1E1B]">
                Send Business Proposal
              </h3>
              <p className="text-[11px] text-[#6B6862]">
                Dispatch outbound proposals directly from your connected Gmail
              </p>
            </div>
          </div>

          <button
            id="btn-close-proposal-modal"
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#9C988F] hover:text-[#1F1E1B] hover:bg-[#E5E2DC]/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Provider Selection when both are connected */}
          {isOAuthConnected && isSmtpConnected && (
            <div className="p-3 bg-[#FAF9F5] border border-[#E5E2DC] rounded-xl space-y-2">
              <div className="text-[11px] font-semibold text-[#1F1E1B] flex items-center justify-between">
                <span>Select Dispatch Method</span>
                <span className="text-[#3F7A5A] text-[10px] uppercase font-bold">Both Connected</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedProvider('oauth')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    effectiveProvider === 'oauth'
                      ? 'bg-[#FFFFFF] text-[#C66A3D] border border-[#C66A3D] shadow-2xs'
                      : 'bg-[#FAF9F5] text-[#6B6862] border border-[#E5E2DC] hover:text-[#1F1E1B]'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Gmail API (OAuth)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedProvider('smtp')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    effectiveProvider === 'smtp'
                      ? 'bg-[#FFFFFF] text-[#C66A3D] border border-[#C66A3D] shadow-2xs'
                      : 'bg-[#FAF9F5] text-[#6B6862] border border-[#E5E2DC] hover:text-[#1F1E1B]'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Gmail SMTP (Password)</span>
                </button>
              </div>
            </div>
          )}

          {/* Connection Status Badge or Warning */}
          {!hasAnyConnection ? (
            <div className="p-4 rounded-xl bg-[#FFF8F0] border border-[#F0D5BE] space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#C66A3D] shrink-0 mt-0.5" />
                <div className="text-xs text-[#1F1E1B] space-y-1">
                  <span className="font-semibold block">Gmail Account Not Connected</span>
                  <span className="text-[#6B6862] block">
                    You can connect via Google OAuth (<code className="text-[#C66A3D] font-mono text-[11px]">gmail.send</code>) or via Gmail SMTP with an App Password in Settings.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="btn-modal-connect-gmail"
                  type="button"
                  onClick={connectGmail}
                  disabled={isConnecting}
                  className="flex-1 py-2 px-3 rounded-lg bg-[#C66A3D] hover:bg-[#B55B2E] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Connect Gmail OAuth</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="px-3.5 py-2.5 rounded-lg bg-[#EBF3ED] border border-[#D5E5DA] flex items-center justify-between text-xs text-[#245738]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#3F7A5A]"></span>
                <span className="font-medium">
                  {effectiveProvider === 'smtp' ? 'Gmail SMTP Active:' : 'Gmail OAuth Active:'}
                </span>
                <span className="font-mono text-[11px] text-[#3F7A5A]">
                  {effectiveProvider === 'smtp'
                    ? smtpStatus?.email || 'SMTP Configured'
                    : status?.email || 'Authenticated User'}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#3F7A5A]">
                {effectiveProvider === 'smtp' ? 'smtp.gmail.com:465' : 'gmail.send'}
              </span>
            </div>
          )}

          {sendSuccess && (
            <div className="p-3.5 rounded-xl bg-[#EBF3ED] border border-[#D5E5DA] flex items-start gap-2.5 text-xs text-[#245738]">
              <CheckCircle2 className="w-4 h-4 text-[#3F7A5A] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold">Email Dispatched Successfully</div>
                <div>{sendSuccess}</div>
              </div>
            </div>
          )}

          {sendError && (
            <div className="p-3.5 rounded-xl bg-[#FDF3F2] border border-[#F5D5D0] flex items-start gap-2.5 text-xs text-[#D9381E]">
              <AlertCircle className="w-4 h-4 text-[#D9381E] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold">Send Error</div>
                <div>{sendError}</div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSend} className="space-y-3.5">
            <div>
              <label htmlFor="input-proposal-recipient" className="block text-xs font-semibold text-[#1F1E1B] mb-1">
                Recipient Email
              </label>
              <input
                id="input-proposal-recipient"
                type="email"
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="client@company.com"
                className="w-full px-3 py-2 rounded-lg border border-[#E5E2DC] bg-[#FAF9F5] text-xs text-[#1F1E1B] focus:outline-none focus:border-[#C66A3D] focus:ring-1 focus:ring-[#C66A3D]"
              />
            </div>

            <div>
              <label htmlFor="input-proposal-subject" className="block text-xs font-semibold text-[#1F1E1B] mb-1">
                Subject Line
              </label>
              <input
                id="input-proposal-subject"
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#E5E2DC] bg-[#FAF9F5] text-xs text-[#1F1E1B] focus:outline-none focus:border-[#C66A3D] focus:ring-1 focus:ring-[#C66A3D]"
              />
            </div>

            <div>
              <label htmlFor="textarea-proposal-body" className="block text-xs font-semibold text-[#1F1E1B] mb-1">
                Proposal Content
              </label>
              <textarea
                id="textarea-proposal-body"
                required
                rows={8}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#E5E2DC] bg-[#FAF9F5] text-xs font-mono text-[#1F1E1B] focus:outline-none focus:border-[#C66A3D] focus:ring-1 focus:ring-[#C66A3D] resize-y"
              />
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-[#E5E2DC] flex items-center justify-end gap-2.5">
              <button
                id="btn-cancel-proposal"
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#6B6862] hover:text-[#1F1E1B] hover:bg-[#F2F1ED] transition-colors"
              >
                Close
              </button>

              <button
                id="btn-submit-proposal"
                type="submit"
                disabled={isSending || !isCurrentProviderConnected}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#C66A3D] hover:bg-[#B55B2E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer shadow-2xs"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending via {effectiveProvider === 'smtp' ? 'SMTP' : 'Gmail'}...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Proposal Now</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
