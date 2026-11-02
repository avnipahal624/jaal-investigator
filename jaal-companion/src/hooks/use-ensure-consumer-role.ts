import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../services/api";
import { useAuth } from "./use-auth";

/** One attempt per app session — the mutation itself is idempotent. */
let attempted = false;

/**
 * The mobile app is the consumer experience, so every signed-in account needs
 * `users.role = "consumer"`. The backend never writes that role itself (the
 * investigator web app sets its own roles), so we ask for it once on
 * authenticated entry. `ensureConsumerRole` only ever fills an *unset* role —
 * it never overwrites an existing investigator/admin role.
 */
export function useEnsureConsumerRole() {
  const ensure = useMutation(api.consumer.ensureConsumerRole);
  const { isAuthenticated, isLoading } = useAuth();
  const fired = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || attempted || fired.current) return;
    fired.current = true;
    attempted = true;
    ensure({}).catch(() => {
      // Allow a retry on the next mount — never block the UI on this.
      attempted = false;
      fired.current = false;
    });
  }, [isLoading, isAuthenticated, ensure]);
}
