"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hub } from "aws-amplify/utils";
import { fetchAuthSession } from "aws-amplify/auth";

/**
 * OAuth landing page. Amplify exchanges the ?code= for tokens automatically
 * when the page loads with the oauth config present; we just wait for the
 * resulting Hub event (or an already-established session) and move on.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect") {
        router.replace("/dashboard");
        router.refresh();
      }
      if (payload.event === "signInWithRedirect_failure") {
        setError("Sign in with Google failed. Please try again.");
      }
    });

    // The token exchange may have finished before the listener attached.
    fetchAuthSession()
      .then((session) => {
        if (session.tokens?.idToken) {
          router.replace("/dashboard");
          router.refresh();
        }
      })
      .catch(() => {});

    return unsubscribe;
  }, [router]);

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-red-300 text-sm mb-4">{error}</p>
            <Link
              href="/login"
              className="inline-block px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-medium text-neutral-200 transition-colors"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <svg className="animate-spin h-6 w-6 mx-auto mb-3 text-primary-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-neutral-400 text-sm">Completing sign in…</p>
          </>
        )}
      </div>
    </div>
  );
}
