"use client";

// AppShell: the signed-in workspace frame. It waits for the session and the workspace
// list, sends people without a workspace to onboarding, and provides everything the
// workspace pages share (resources, "my work", task panels).
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { WorkspaceResourcesProvider } from "@/context/WorkspaceResourcesContext";
import { MyWorkProvider } from "@/context/MyWorkContext";
import { TaskPanelProvider } from "@/context/TaskPanelContext";
import { saveReturnPath } from "@/utils/pendingInvite";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import OfflineBanner from "./OfflineBanner";
import LoadingScreen from "./LoadingScreen";

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, authLoading } = useAuth();
  const { workspaces, activeWorkspace, workspacesLoading } = useWorkspaces();

  // Signed out: to sign in. A deep link opened while signed out is remembered so sign-in
  // returns to it. NOTE: not after signing out from here — the next person to sign in on
  // this browser shouldn't land on the previous person's page. (Session expiry saves its
  // own return path in AuthContext.)
  const wasSignedInRef = useRef(false);
  if (isAuthenticated) wasSignedInRef.current = true;
  useEffect(() => {
    if (authLoading || isAuthenticated) return;
    if (!wasSignedInRef.current) saveReturnPath(window.location.pathname + window.location.search);
    router.replace("/login");
  }, [authLoading, isAuthenticated, router]);

  // A verified account with no workspace yet starts at onboarding (PRD J1).
  useEffect(() => {
    if (isAuthenticated && !workspacesLoading && workspaces.length === 0) router.replace("/onboarding");
  }, [isAuthenticated, workspacesLoading, workspaces.length, router]);

  if (authLoading || !isAuthenticated) return <LoadingScreen label="Checking your session" />;
  if (workspacesLoading || !activeWorkspace) return <LoadingScreen label="Opening your workspace" />;

  return (
    <WorkspaceResourcesProvider>
      <MyWorkProvider>
        {/* useSearchParams (the ?task= drawer) needs a Suspense boundary in Next. */}
        <Suspense fallback={<LoadingScreen />}>
          <TaskPanelProvider>
            <a href="#main-content" className="skip-link">
              Skip to content
            </a>
            <Sidebar />
            <div className="flex min-h-dvh min-w-0 flex-col lg:pl-[272px]">
              <MobileNav />
              <OfflineBanner />
              <main id="main-content" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1200px] flex-1 px-4 py-6 outline-none sm:px-8 sm:py-10">
                {children}
              </main>
            </div>
          </TaskPanelProvider>
        </Suspense>
      </MyWorkProvider>
    </WorkspaceResourcesProvider>
  );
}
