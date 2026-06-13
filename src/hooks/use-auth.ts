import { useEffect, useState } from "react";
import { getSession, type Session } from "@/lib/auth";

export function useAuth() {
  const [session, setSessionState] = useState<Session | null>(null);

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
