import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/clerk-react";

const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

export function AuthControls({ variant = "dark" }: { variant?: "dark" | "light" }) {
  if (!clerkEnabled) return null;

  const signInBtn =
    variant === "dark"
      ? "rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:border-white/30"
      : "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

  const signUpBtn =
    variant === "dark"
      ? "btn-primary"
      : "btn-primary";

  return (
    <div className="flex items-center gap-3">
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className={signInBtn}>
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button" className={signUpBtn}>
            Sign up
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </div>
  );
}
