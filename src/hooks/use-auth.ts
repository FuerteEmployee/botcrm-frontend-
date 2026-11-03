import { useEffect, useState } from "react";
import { getSession, type Session } from "@/lib/auth";

export function useAuth() {
  // Read the stored session on the FIRST render. Starting from null meant every
  // page rendered once as if nobody were signed in, and usePermission's
  // "not a sub-admin -> allowed" rule then showed a sub-admin every admin-only
  // button for that render.
  const [session, setSessionState] = useState<Session | null>(() => getSession());

  useEffect(() => {
    const sync = () => setSessionState(getSession());
    sync();
    window.addEventListener("bot-auth-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("bot-auth-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { session, isAuthenticated: !!session };
}
