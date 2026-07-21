import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Timeline Planner",
  description: "Capacity-aware project completion forecasting for a single planner.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
