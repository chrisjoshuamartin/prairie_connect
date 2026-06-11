import type { Metadata } from "next";
import { AmplifyProvider } from "@/components/AmplifyProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prairie Connect Admin",
  description: "Internal tooling for the Prairie Connect platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AmplifyProvider>{children}</AmplifyProvider>
      </body>
    </html>
  );
}
