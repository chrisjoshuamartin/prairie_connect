"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signIn,
  confirmSignIn,
  signInWithRedirect,
  type SignInOutput,
} from "aws-amplify/auth";
import { googleLoginEnabled } from "@/lib/auth/amplifyConfig";

function isSafeRedirect(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes(":");
}

type Step = "credentials" | "new-password";

const inputClass =
  "w-full px-3.5 py-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors";

const primaryButtonClass =
  "w-full py-2.5 px-4 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:bg-primary-900 disabled:text-primary-700 text-neutral-950 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-neutral-900";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFrom = searchParams.get("from") ?? "/dashboard";
  const from = isSafeRedirect(rawFrom) ? rawFrom : "/dashboard";

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleDone() {
    router.push(from);
    router.refresh();
  }

  function handleSignInResult({ nextStep }: SignInOutput) {
    switch (nextStep.signInStep) {
      case "DONE":
        handleDone();
        break;
      case "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED":
        setStep("new-password");
        break;
      default:
        setError(
          "Additional verification required. Please contact an administrator.",
        );
    }
  }

  async function handleCredentialsSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn({ username: email, password });
      handleSignInResult(result);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Sign in failed. Please try again.";
      setError(
        message.includes("Incorrect username or password")
          ? "Incorrect email or password."
          : message,
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);
    try {
      await signInWithRedirect({ provider: "Google" });
      // The browser navigates away to the Cognito hosted UI here.
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not start Google sign in.");
      setLoading(false);
    }
  }

  async function handleNewPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await confirmSignIn({ challengeResponse: newPassword });
      handleSignInResult(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not set password.");
    } finally {
      setLoading(false);
    }
  }

  const errorBanner = error && (
    <div className="mb-4 p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
      {error}
    </div>
  );

  if (step === "new-password") {
    return (
      <>
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-neutral-100">Set a new password</h2>
          <p className="text-neutral-400 text-sm mt-1">
            Your account requires a new password before signing in.
          </p>
        </div>
        {errorBanner}
        <form onSubmit={handleNewPasswordSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-neutral-300 mb-1.5">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••••"
            />
          </div>
          <button type="submit" disabled={loading} className={primaryButtonClass}>
            {loading ? "Saving…" : "Set password & sign in"}
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <h2 className="text-xl font-semibold text-neutral-100 mb-6">Sign in</h2>
      {errorBanner}
      {googleLoginEnabled && (
        <>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-neutral-100 hover:bg-white disabled:opacity-50 text-neutral-900 font-medium transition-colors flex items-center justify-center gap-2.5"
          >
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.1A6.6 6.6 0 015.49 12c0-.73.13-1.43.35-2.1V7.06H2.18A11 11 0 001 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0012 1 11 11 0 002.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
              />
            </svg>
            Continue with Google
          </button>
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-neutral-800" />
            <span className="text-xs text-neutral-500">or sign in with email</span>
            <div className="flex-1 h-px bg-neutral-800" />
          </div>
        </>
      )}
      <form onSubmit={handleCredentialsSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-300 mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-neutral-300 mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="••••••••••"
          />
        </div>
        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
