import Link from "next/link";

export default function DeniedPage() {
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-neutral-100 mb-2">
          Admin access required
        </h1>
        <p className="text-neutral-400 text-sm mb-6">
          Your account is signed in but doesn&apos;t have the admin role. Ask a
          platform administrator to grant it, then sign in again.
        </p>
        <Link
          href="/login"
          className="inline-block px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-medium text-neutral-200 transition-colors"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
