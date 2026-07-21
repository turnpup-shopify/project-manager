"use client";

import dynamic from "next/dynamic";

// The whole app is client-side (localStorage-backed, single user). Loading it
// with SSR disabled avoids hydration mismatches around persisted state.
const AppShell = dynamic(() => import("@/components/AppShell").then((m) => m.AppShell), {
  ssr: false,
  loading: () => <div className="flex h-screen items-center justify-center text-sm text-ink-muted">Loading…</div>,
});

export default function Page() {
  return <AppShell />;
}
