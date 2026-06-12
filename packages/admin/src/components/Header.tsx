"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, fetchAuthSession } from "aws-amplify/auth";

const navItems = [
  { label: "Corridors", href: "/dashboard/corridors" },
  { label: "Rail lines", href: "/dashboard/raillines" },
  { label: "Schema", href: "/dashboard/schema" },
  { label: "Users", href: "/dashboard/users" },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetchAuthSession()
      .then((session) => {
        const payload = session.tokens?.idToken?.payload;
        setUserEmail(
          (payload?.email as string) ??
            (payload?.["cognito:username"] as string) ??
            null,
        );
      })
      .catch(() => setUserEmail(null));
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/login");
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  }, [router]);

  const linkClass = (href: string) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      pathname.startsWith(href)
        ? "bg-primary-600/20 text-primary-300"
        : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
    }`;

  return (
    <header className="sticky top-0 z-40 w-full bg-neutral-900 border-b border-neutral-800">
      <div className="flex items-center h-14 px-6 gap-6">
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <svg
            className="w-6 h-6 text-primary-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.75}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 19L19 4M6.5 21.5L21.5 6.5M2.5 16.5L7.5 21.5M5.5 13.5L10.5 18.5M8.5 10.5L13.5 15.5M11.5 7.5L16.5 12.5M14.5 4.5L19.5 9.5"
            />
          </svg>
          <span className="font-semibold text-neutral-100">
            Prairie Connect
            <span className="ml-2 text-xs font-medium uppercase tracking-wider text-primary-400/80">
              Admin
            </span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass(item.href)}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3 shrink-0">
          {userEmail && (
            <span className="text-xs text-neutral-500 truncate max-w-[180px]">
              {userEmail}
            </span>
          )}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>

        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="md:hidden ml-auto p-2 -mr-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-neutral-800 bg-neutral-900">
          <nav className="px-4 py-3 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block ${linkClass(item.href)}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="px-4 py-3 border-t border-neutral-800 space-y-2">
            {userEmail && (
              <p className="px-3 text-xs text-neutral-500 truncate">{userEmail}</p>
            )}
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
