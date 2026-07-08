import { SignIn } from "@clerk/clerk-react";
import { AuthShell, clerkAppearance } from "../components/auth/AuthShell";

export function SignInPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage agents, wallets, and settlement approvals."
    >
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"
        appearance={clerkAppearance}
      />
    </AuthShell>
  );
}
