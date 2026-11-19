import { createContext, startTransition, useCallback, useContext, useEffect, useState } from "react";
import shareImage from '@/config/share-image.json';
import routeMeta from '@/config/route-meta.json';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider, Helmet } from "react-helmet-async";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "@/design/theme/ThemeProvider";
import { AuthContext, type AuthContextType as AuthValue } from "@/features/auth/authContextValue";

// ---------- Deferred Auth Provider ----------
// aws-amplify (125KB) is NOT imported here. Instead we dynamically load the
// real AuthProvider after the first render, so the homepage paints instantly.
// While loading, a lightweight stub context is used (user=null, isLoading=true).

const noop = () => Promise.resolve() as any;

interface AuthContextType {
  user: null | { userId: string; email: string; username: string };
  isLoading: boolean;
  signInWithEmail: (...a: any[]) => Promise<void>;
  signUpWithEmail: (...a: any[]) => Promise<any>;
  confirmEmail: (...a: any[]) => Promise<void>;
  resendCode: (...a: any[]) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  requestPasswordReset: (...a: any[]) => Promise<void>;
  confirmNewPassword: (...a: any[]) => Promise<void>;
}

// Exported so components can import useAuth from here instead of AuthContext directly
// (this module is always in the initial bundle; AuthContext is deferred)
export const DeferredAuthContext = createContext<AuthContextType>({
  user: null, isLoading: true,
  signInWithEmail: noop, signUpWithEmail: noop, confirmEmail: noop,
  resendCode: noop, signInWithGoogle: noop, signOutUser: noop,
  requestPasswordReset: noop, confirmNewPassword: noop,
});

function DeferredAuthProvider({ children }: { children: React.ReactNode }) {
  const [RealProvider, setRealProvider] = useState<React.ComponentType<{ onValue: (v: AuthValue) => void }> | null>(null);
  /* The real provider's value, handed up once it has loaded (null until then: useAuth reads the stub). */
  const [authValue, setAuthValue] = useState<AuthValue | null>(null);
  // The real provider's value, handed up as a transition for the same reason (its first value comes at load).
  const handUp = useCallback((v: AuthValue) => startTransition(() => setAuthValue(v)), []);

  useEffect(() => {
    // Defer auth loading until browser is idle — don't compete with critical resources.
    // On slow 4G, loading the 125KB aws-amplify chunk during initial render tanks FCP.
    const load = () => {
      import("@/features/auth/AuthContext").then(m => {
        // A transition (prerender plan A16): on a slow phone the idle callback can come while React is still taking
        // over a built page, and an urgent update then made it draw a part again (React error 421, seen on staging).
        startTransition(() => setRealProvider(() => m.AuthProvider));
      });
    };

    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(load, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(load, 3000);
      return () => clearTimeout(id);
    }
  }, []);

  /*
    THE APP NEVER MOVES (2026-11-15). It sits under one Provider from the first render; the real
    provider, once loaded, renders BESIDE it and hands its value up. Rendering the real provider AROUND
    the app instead (`<RealProvider>{children}</RealProvider>` in place of `<>{children}</>`) put a
    different component at the app's position, and React re-created the whole tree: every page lost its
    state and refetched. In Safari, with no requestIdleCallback, that came 3s after load
    (authContextValue.ts). Until the value arrives useAuth answers the loading stub, as before.
  */
  return (
    <>
      {RealProvider && <RealProvider onValue={handUp} />}
      <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
    </>
  );
}

// ---------- Main Providers ----------

const queryClient = new QueryClient();

interface ProvidersProps {
  children: React.ReactNode;
  /** Prerender plan A3: the build gives each page its own; the browser uses the module's one. */
  queryClient?: QueryClient;
  /** Prerender plan A3: the build's Helmet context, discarded (the head is generate-route-html.cjs's). */
  helmetContext?: object;
  /** Prerender plan A4: the page's path at build, for the theme's page rules. */
  initialPath?: string;
}

/**
 * Site-wide SEO/social defaults.
 *
 * The same tags are in index.html marked `data-rh="true"`, which makes Helmet
 * replace them on mount instead of appending beside them. That swap is what
 * fixes the duplicate-description bug, but it also means Helmet owns these tags
 * from mount onward — so a page that sets no meta of its own would be left with
 * none at all. This puts the defaults back at the root, where any page-level
 * <Helmet> overrides them by virtue of being deeper in the tree.
 *
 * The text is the homepage's entry in route-meta.json (SEO audit, 2026-11-15): this used to be
 * a hand-kept copy that still said "Master Your Game" / "Elevate your chess strategy..." months
 * after the homepage moved on, and every page without meta of its own rendered it. No default
 * og:url: a default URL is the homepage's, which is false on any page that falls back to it.
 */
const HOME_META = (routeMeta as Record<string, { description: string; ogTitle: string; ogDescription: string }>)[''];

function SeoDefaults() {
  return (
    <Helmet>
      <meta name="description" content={HOME_META.description} />
      <meta property="og:title" content={HOME_META.ogTitle} />
      <meta property="og:description" content={HOME_META.ogDescription} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={shareImage.url} />
      <meta property="og:image:width" content={String(shareImage.width)} />
      <meta property="og:image:height" content={String(shareImage.height)} />
      <meta property="og:image:type" content={shareImage.type} />
      <meta property="og:image:alt" content={shareImage.alt} />
      <meta property="og:site_name" content="Chess Playbook" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={shareImage.url} />
      <meta name="twitter:image:alt" content={shareImage.alt} />
    </Helmet>
  );
}

export function Providers({ children, queryClient: client, helmetContext, initialPath }: ProvidersProps) {
  return (
    <HelmetProvider context={helmetContext}>
      <ThemeProvider initialPath={initialPath}>
      <QueryClientProvider client={client ?? queryClient}>
        <DeferredAuthProvider>
          <TooltipProvider>
            <SeoDefaults />
            <Toaster />
            <Sonner />
            {children}
          </TooltipProvider>
        </DeferredAuthProvider>
      </QueryClientProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
}
