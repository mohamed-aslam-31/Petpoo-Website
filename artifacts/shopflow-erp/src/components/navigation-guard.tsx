import { createContext, ReactNode, useCallback, useContext, useEffect, useRef } from "react";

type NavigationGuard = (path: string, navigate: Navigate) => void;
type Navigate = () => void;

type NavigationGuardContextValue = {
  registerNavigationGuard: (guard: NavigationGuard, currentPath?: string) => () => void;
  requestNavigation: (path: string, navigate: Navigate) => void;
  navigateWithoutGuard: (navigate: Navigate) => void;
};

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<NavigationGuard | null>(null);
  const bypassGuardRef = useRef(false);

  const registerNavigationGuard = useCallback((guard: NavigationGuard, currentPath?: string) => {
    guardRef.current = guard;

    const restorePath = currentPath ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const handlePopState = () => {
      const targetPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (targetPath === restorePath) return;

      // Wouter has already observed the popstate. Restore the form route first,
      // then let the guard decide whether the requested history move is allowed.
      window.history.pushState(window.history.state, "", restorePath);
      guardRef.current?.(targetPath, () => {
        window.history.pushState(window.history.state, "", targetPath);
      });
    };
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (guardRef.current === guard) {
        guardRef.current = null;
      }
    };
  }, []);

  const requestNavigation = useCallback((path: string, navigate: Navigate) => {
    if (bypassGuardRef.current) {
      bypassGuardRef.current = false;
      navigate();
      return;
    }
    if (guardRef.current) {
      guardRef.current(path, navigate);
      return;
    }
    navigate();
  }, []);

  const navigateWithoutGuard = useCallback((navigate: Navigate) => {
    bypassGuardRef.current = true;
    navigate();
  }, []);

  return (
    <NavigationGuardContext.Provider value={{ registerNavigationGuard, requestNavigation, navigateWithoutGuard }}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard() {
  const context = useContext(NavigationGuardContext);
  if (!context) {
    throw new Error("useNavigationGuard must be used within NavigationGuardProvider");
  }
  return context;
}

export function useBeforeUnload(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [enabled]);
}