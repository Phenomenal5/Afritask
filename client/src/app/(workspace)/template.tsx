// A template (unlike a layout) mounts fresh on every navigation, so each workspace page
// settles in with a short fade. The shell around it (sidebar, header) stays still.
import type { ReactNode } from "react";

export default function WorkspaceTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
