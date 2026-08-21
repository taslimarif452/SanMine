import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  AuthError,
} from 'firebase/auth';
import { auth, googleProvider, getFirebaseIdToken } from '../lib/firebase';

export interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<User | null>;
  signOut: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Monitor auth state changes on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setCurrentUser(user);
        setLoading(false);
      },
      (error) => {
        console.error('[Firebase Auth State Error]:', error);
        setAuthError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const clearAuthError = () => {
    setAuthError(null);
  };

  const signInWithGoogle = async (): Promise<User | null> => {
    if (isAuthenticating) {
      return null;
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      setCurrentUser(result.user);
      return result.user;
    } catch (err: any) {
      const error = err as AuthError;
      console.warn('[Firebase Auth Google Sign-in Notice]:', error.code, error.message);

      // Handle specific Firebase error codes gracefully
      let userFriendlyMessage = 'Failed to sign in with Google. Please try again.';

      if (
        error.code === 'auth/popup-closed-by-user' ||
        error.code === 'auth/cancelled-popup-request'
      ) {
        // User voluntarily closed the popup - don't show an aggressive failure banner
        userFriendlyMessage = 'Sign-in cancelled. Click below to continue with Google.';
      } else if (error.code === 'auth/popup-blocked') {
        userFriendlyMessage =
          'Pop-up window was blocked by your browser. Please allow popups for this site and try again.';
      } else if (error.code === 'auth/unauthorized-domain') {
        userFriendlyMessage =
          'This domain is not authorized in Firebase. Please add this domain to Firebase Console > Authentication > Settings > Authorized Domains.';
      } else if (error.code === 'auth/network-request-failed') {
        userFriendlyMessage =
          'Network connection error. Please check your internet connection and try again.';
      } else if (error.message) {
        userFriendlyMessage = error.message;
      }

      setAuthError(userFriendlyMessage);
      return null;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await firebaseSignOut(auth);
      setCurrentUser(null);
      setAuthError(null);
    } catch (err: any) {
      console.error('[Firebase Auth Sign-out Error]:', err);
      setAuthError(err.message || 'Failed to sign out');
    }
  };

  const getIdToken = async (forceRefresh = false): Promise<string | null> => {
    if (!currentUser) return null;
    return getFirebaseIdToken(forceRefresh);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        loading,
        isAuthenticating,
        authError,
        signInWithGoogle,
        signOut,
        getIdToken,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
