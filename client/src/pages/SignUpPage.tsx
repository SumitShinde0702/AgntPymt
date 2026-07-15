import { SignUp } from "@clerk/clerk-react";
import { AuthShell, clerkAppearance } from "../components/auth/AuthShell";

export function SignUpPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Get started with agent wallets, policies, and x402 payments!"
    >
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"
        appearance={clerkAppearance}
      />
    </AuthShell>
  );
}
