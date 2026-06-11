import { Header } from "@/components/Header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <main className="px-6 py-8 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
