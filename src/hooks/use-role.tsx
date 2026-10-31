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

const RoleIntentContext = createContext<RoleIntentContextValue | null>(null);

export function RoleIntentProvider({ children }: { children: ReactNode }) {
  const [intent, setIntent] = useState<RoleIntent | null>(null);
  const set = useCallback(
    (value: RoleIntent | null) => {
      setIntent(value);
    },
    [],
  );
  return (
    <RoleIntentContext.Provider value={{ intent, setIntent: set }}>
      {children}
    </RoleIntentContext.Provider>
  );
}

/** The role intent chosen on the current sign-in page. Null until the user chooses. */
export function useRoleIntent(): RoleIntentContextValue {
  const ctx = useContext(RoleIntentContext);
  if (!ctx) {
    throw new Error(
      "useRoleIntent must be used within a RoleIntentProvider (Auth flow).",
    );
  }
  return ctx;
}
