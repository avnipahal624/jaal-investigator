import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

/** The role intent a user selected on the sign-in page. */
export type RoleIntent = "consumer" | "investigator";

interface RoleIntentContextValue {
  intent: RoleIntent | null;
  setIntent: (value: RoleIntent | null) => void;
}

const STORAGE_KEY = "jaal-role-intent";

function readStored(): RoleIntent | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return value === "consumer" || value === "investigator" ? value : null;
  } catch {
    return null;
  }
}

function writeStored(value: RoleIntent | null) {
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, value);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

const noop = () => {};

const RoleIntentContext = createContext<RoleIntentContextValue | null>(null);

export function RoleIntentProvider({ children }: { children: ReactNode }) {
  const [intent, setIntentState] = useState<RoleIntent | null>(readStored);
  const setIntent = useCallback((value: RoleIntent | null) => {
    setIntentState(value);
    writeStored(value);
  }, []);
  return (
    <RoleIntentContext.Provider value={{ intent, setIntent }}>
      {children}
    </RoleIntentContext.Provider>
  );
}

/**
 * The role intent chosen on the sign-in page.
 *
 * Safe to call anywhere: if there is no provider in the tree (e.g. the profile
 * page under the consumer layout), it falls back to the value persisted in
 * sessionStorage during sign-in instead of throwing.
 */
export function useRoleIntent(): RoleIntentContextValue {
  const ctx = useContext(RoleIntentContext);
  const [fallbackIntent] = useState<RoleIntent | null>(readStored);
  if (ctx) return ctx;
  return { intent: fallbackIntent, setIntent: noop };
}
