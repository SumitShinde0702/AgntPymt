import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { setApiTokenGetter } from "../lib/api";

export function ApiAuthProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();

  useEffect(() => {
    setApiTokenGetter(async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
    return () => setApiTokenGetter(null);
  }, [getToken]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>
    );
  }

  return <>{children}</>;
}
