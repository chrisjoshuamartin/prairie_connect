"use client";

import { useEffect } from "react";
import { configureAmplify } from "@/lib/auth/amplifyConfig";
// With `ssr: true`, Amplify disables its OAuth redirect listener; this
// side-effect import re-enables it so /auth/callback can exchange the
// ?code= for tokens.
import "aws-amplify/auth/enable-oauth-listener";

configureAmplify();

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    configureAmplify();
  }, []);

  return <>{children}</>;
}
