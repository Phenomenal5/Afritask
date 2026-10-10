// Every signed-in workspace page shares the shell: sidebar, mobile nav, offline banner,
// task drawer and composer. The route group "(workspace)" doesn't appear in URLs.
import type { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
