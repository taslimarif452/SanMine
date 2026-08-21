import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, AlertCircle, X } from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const { signInWithGoogle, isAuthenticating, authError, clearAuthError } = useAuth();

  const handleGoogleSignIn = async () => {
    if (isAuthenticating) return;
    await signInWithGoogle();
  };

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#F7F6F2] text-[#1F1E1B] px-4 py-8 select-none relative overflow-hidden font-sans">
      {/* Background subtle geometric accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[360px] bg-gradient-to-b from-[#EAE6DF]/60 to-transparent blur-3xl pointer-events-none -z-10" />
      <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-[#E8DCCF]/40 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-[#D25234]/5 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E2DC] rounded-3xl p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)] space-y-6 relative">
        
        {/* Header Branding */}
        <div className="text-center space-y-3 flex flex-col items-center">
          <div className="w-12 h-12 rounded-xl bg-[#1F1E1B] border border-[#383632] flex items-center justify-center shadow-xs">
            <img
              src="https://res.cloudinary.com/dbqmhnahl/image/upload/v1787146942/ChatGPT_Image_Aug_19_2026_07_00_19_PM_jpzwzg.png"
              alt="SanMine Space Logo"
              className="w-7 h-7 object-contain rounded-md"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1F1E1B]">
            Welcome to SanMine Space
          </h1>
        </div>

        {/* Error Alert Banner */}
        {authError && (
          <div className="p-3.5 rounded-xl bg-[#FFFBFB] border border-[#F8D7DA] text-xs text-[#991B1B] flex items-start gap-2.5 animate-in fade-in-50">
            <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{authError}</div>
            <button
              type="button"
              onClick={clearAuthError}
              className="text-[#991B1B] hover:text-[#7F1D1D] p-0.5 rounded cursor-pointer transition-colors shrink-0"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Google Authentication Button */}
        <div className="space-y-3 pt-1">
          <button
            id="btn-google-sign-in"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isAuthenticating}
            className={`w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl text-sm font-medium border border-[#E5E2DC] bg-[#FFFFFF] hover:bg-[#FAF9F5] active:bg-[#F2F1ED] text-[#1F1E1B] transition-all duration-150 shadow-2xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
              isAuthenticating ? 'ring-2 ring-[#D25234]/30' : 'hover:border-[#D5D2CC]'
            }`}
          >
            {isAuthenticating ? (
              <div className="flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4 text-[#D25234]"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="text-[#6B6862]">Connecting to Google...</span>
              </div>
            ) : (
              <>
                {/* Official Google Brand Mark SVG */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span className="font-semibold text-sm">Continue with Google</span>
              </>
            )}
          </button>

          {/* Privacy & Trust note */}
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#9C988F] pt-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[#3F7A5A]" />
            <span>Secure authentication via Firebase & Google OAuth</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center text-[11px] text-[#9C988F] space-y-1">
        <p>© {new Date().getFullYear()} SanMine Space Autonomous AI. All rights reserved.</p>
      </footer>
    </div>
  );
};
