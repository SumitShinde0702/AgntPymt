import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { setApiTokenGetter } from "../lib/api";
import { Logo } from "../components/brand/Logo";

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
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
        <div className="animate-pulse">
          <Logo markClassName="h-10 w-10" showWordmark={false} />
        </div>
        <p className="text-sm text-slate-400">Loading AgntPymt…</p>
      </div>
    );
  }

  return <>{children}</>;
}
