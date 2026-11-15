/**
 * The auth context and its types, with nothing else: no aws-amplify, so the always-loaded providers
 * module can hold this context's Provider around the whole app from the first render (2026-11-15).
 *
 * WHY. The real AuthProvider is loaded after the first paint (it pulls aws-amplify). It used to be
 * swapped in AROUND the app (`<RealProvider>{children}</RealProvider>` in place of `<>{children}</>`),
 * and a different component at that position makes React throw the whole tree away and build it again:
 * every page lost its state and fetched its data twice. Safari has no requestIdleCallback, so there it
 * happened on a 3s timer, after the visitor could act (measured on production: WebKit re-created the
 * tree ~3.3s after load on /premium and /puzzles; a chosen Premium plan went back to Yearly). Now the
 * Provider here never moves, and the real AuthProvider renders beside the app and hands its value up.
 */
import { createContext } from 'react';

export interface AuthUser {
  userId: string;
  email: string;
  username: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<{ nextStep: string }>;
  confirmEmail: (email: string, code: string) => Promise<{ signedIn: boolean }>;
  resendCode: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  confirmNewPassword: (email: string, code: string, newPassword: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);
