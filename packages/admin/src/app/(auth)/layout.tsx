export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <svg
            className="w-12 h-12 text-primary-400 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 19L19 4M6.5 21.5L21.5 6.5M2.5 16.5L7.5 21.5M5.5 13.5L10.5 18.5M8.5 10.5L13.5 15.5M11.5 7.5L16.5 12.5M14.5 4.5L19.5 9.5"
            />
          </svg>
          <h1 className="text-lg font-semibold text-neutral-100">Prairie Connect</h1>
          <p className="text-neutral-400 text-sm">Admin tooling</p>
        </div>
        <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-8 shadow-xl">
          {children}
        </div>
      </div>
    </div>
  );
}
