import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type NavigationGuardCopy = {
  title: string;
  description: string;
  stayLabel: string;
  discardLabel: string;
};

type NavigationGuardContextValue = {
  setGuard: (guard: NavigationGuardCopy | null) => void;
  requestNavigation: (proceed: () => void) => void;
};

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<NavigationGuardCopy | null>(null);
  const [dialog, setDialog] = useState<{ guard: NavigationGuardCopy; proceed: () => void } | null>(null);

  const setGuard = useCallback((guard: NavigationGuardCopy | null) => {
    guardRef.current = guard;
  }, []);

  const requestNavigation = useCallback((proceed: () => void) => {
    const guard = guardRef.current;
    if (!guard) {
      proceed();
      return;
    }
    setDialog({ guard, proceed });
  }, []);

  function closeDialog() {
    setDialog(null);
  }

  function confirmDiscard() {
    const pending = dialog?.proceed;
    setDialog(null);
    pending?.();
  }

  return (
    <NavigationGuardContext.Provider value={{ setGuard, requestNavigation }}>
      {children}
      <AlertDialog open={dialog !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <AlertDialogContent showCloseButton>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog?.guard.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialog?.guard.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" onClick={closeDialog}>{dialog?.guard.stayLabel}</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={confirmDiscard}>{dialog?.guard.discardLabel}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuardRegistration(guard: NavigationGuardCopy | null) {
  const ctx = useContext(NavigationGuardContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setGuard(guard);
    return () => ctx.setGuard(null);
  }, [ctx, guard]);
}

export function useNavigationGuard() {
  const ctx = useContext(NavigationGuardContext);
  if (!ctx) {
    throw new Error("useNavigationGuard must be used within NavigationGuardProvider");
  }
  return ctx;
}
