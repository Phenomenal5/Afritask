"use client";

// People: who's in this workspace, who's been invited, and what each role means.
// Pending invitations are kept visibly separate from active members — an invitee has no
// access until they accept.
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import PageHeader from "@/components/layout/PageHeader";
import { FailurePanel, Notice, SkeletonRows } from "@/components/ui/States";
import RoleGuide from "@/components/people/RoleGuide";
import MembersPanel from "@/components/people/MembersPanel";
import InvitationsPanel from "@/components/people/InvitationsPanel";

export default function PeoplePage() {
  const searchParams = useSearchParams();
  const { activeWorkspace } = useWorkspaces();
  const { workspace, isManager, role, status, reloadWorkspace } = useWorkspaceResources();

  return (
    <>
      <title>{`People · ${activeWorkspace?.name ?? "Afritask"}`}</title>
      <PageHeader
        eyebrow={activeWorkspace?.name}
        title="People"
        description="Everyone who can see this workspace, the invitations still waiting, and what each role is allowed to do."
      />

      <div className="flex flex-col gap-8">
        {status === "error" ? (
          <FailurePanel failure={{ kind: "network", status: null, message: "Couldn't load the people in this workspace." }} onRetry={reloadWorkspace} />
        ) : !workspace ? (
          <SkeletonRows rows={3} label="Loading members" />
        ) : (
          <>
            {isManager ? (
              <InvitationsPanel workspaceId={workspace.id} myRole={workspace.role} autoFocus={searchParams.get("invite") === "1"} />
            ) : (
              <Notice icon={Lock} tone="neutral">
                Only the Owner and Admins can invite people. If someone should join, ask one of them.
              </Notice>
            )}
            <MembersPanel workspace={workspace} />
          </>
        )}
        <RoleGuide myRole={role} />
      </div>
    </>
  );
}
