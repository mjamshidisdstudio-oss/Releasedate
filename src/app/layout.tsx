import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Release Calendar",
  description: "Release schedule, sprint transitions and company events.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
