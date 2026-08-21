/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AgentProvider } from './context/AgentContext';
import { GmailProvider } from './context/GmailContext';
import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './components/home/HomePage';
import { PrivacyPolicyPage } from './components/legal/PrivacyPolicyPage';
import { TermsOfServicePage } from './components/legal/TermsOfServicePage';

function AppContent() {
  const { currentUser, loading } = useAuth();
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '/';
  });

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  // Handle public standalone legal routes
  if (currentPath === '/privacy' || currentPath.startsWith('/privacy/')) {
    return <PrivacyPolicyPage />;
  }
  if (currentPath === '/terms' || currentPath.startsWith('/terms/')) {
    return <TermsOfServicePage />;
  }

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F7F6F2] text-[#1F1E1B]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2.5">
            <img
              src="https://res.cloudinary.com/dbqmhnahl/image/upload/v1787146942/ChatGPT_Image_Aug_19_2026_07_00_19_PM_jpzwzg.png"
              alt="SanMine Space Logo"
              className="w-8 h-8 object-contain rounded-md animate-pulse"
              referrerPolicy="no-referrer"
            />
            <span className="font-semibold text-lg tracking-tight text-[#1F1E1B]">
              SanMine Space
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#9C988F]">
            <svg
              className="animate-spin h-3.5 w-3.5 text-[#C66A3D]"
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
            <span>Verifying session...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <HomePage />;
  }

  return (
    <GmailProvider>
      <AgentProvider>
        <AppLayout />
      </AgentProvider>
    </GmailProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
