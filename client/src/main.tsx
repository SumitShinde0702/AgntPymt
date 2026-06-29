import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { Web3Provider } from "./providers/Web3Provider";
import { ApiAuthProvider } from "./providers/ApiAuthProvider";
import App from "./App";
import "./index.css";

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const root = createRoot(document.getElementById("root")!);

const app = (
  <Web3Provider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Web3Provider>
);

root.render(
  <StrictMode>
    {clerkKey ? (
      <ClerkProvider publishableKey={clerkKey}>
        <ApiAuthProvider>{app}</ApiAuthProvider>
      </ClerkProvider>
    ) : (
      app
    )}
  </StrictMode>
);
