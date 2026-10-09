"use client";

// Workspace settings: the active workspace's name and its current members.
import { useCallback, useEffect, useState } from "react";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { getWorkspace } from "@/lib/services/workspaceService";
import ProtectedRoute from "@/components/ProtectedRoute";
import Navbar from "@/components/Navbar";
import FormField from "@/components/FormField";
import Button from "@/components/Button";
import LoadingScreen from "@/components/LoadingScreen";
import { ROLE_LABELS } from "@/utils/roles";
import WorkspaceInvitations from "@/components/WorkspaceInvitations";
import WorkspaceMembers from "@/components/WorkspaceMembers";


const sectionStyle = { background: "var(--paper-raised)", border: "1px solid var(--line)" };

function WorkspaceSettings() {
  const { activeWorkspace, renameWorkspace } = useWorkspaces();
  const [workspaceDetails, setWorkspaceDetails] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);

  const workspaceId = activeWorkspace?.id;
  const isOwner = activeWorkspace?.role === "owner";

  const loadDetails = useCallback(async () => {
    if (!workspaceId) return;
    const res = await getWorkspace(workspaceId);
    // Ignore a late answer for a workspace we've since switched away from.
    if (res.data.data.workspace.id !== workspaceId) return;
    setWorkspaceDetails(res.data.data.workspace);
    setNameDraft(res.data.data.workspace.name);
  }, [workspaceId]);

  useEffect(() => {
    setWorkspaceDetails(null);
    loadDetails().catch(() => setWorkspaceDetails(null));
  }, [loadDetails]);

  const handleRename = async (e) => {
    e.preventDefault();
    setRenaming(true);
    const res = await renameWorkspace(workspaceId, nameDraft);
    setRenaming(false);
    if (res.success) loadDetails();
  };

  if (!activeWorkspace || !workspaceDetails) return <LoadingScreen />;

  return (
    <div className="flex-1 flex flex-col">
      <Navbar />
      <main className="max-w-3xl w-full mx-auto px-6 py-10 flex-1">
        <h1 className="font-display text-3xl mb-1" style={{ color: "var(--ink)" }}>
          {workspaceDetails.name}
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
          Your role here: {ROLE_LABELS[workspaceDetails.role]}
        </p>

        {isOwner && (
          <section className="p-5 rounded-xl mb-6" style={sectionStyle}>
            <h2 className="font-display text-lg mb-4" style={{ color: "var(--ink)" }}>
              Workspace name
            </h2>
            <form onSubmit={handleRename} className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <FormField
                  label="Name"
                  name="workspaceName"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" loading={renaming}>
                Save
              </Button>
            </form>
          </section>
        )}

        {(workspaceDetails.role === "owner" || workspaceDetails.role === "admin") && (
          <WorkspaceInvitations workspaceId={workspaceDetails.id} myRole={workspaceDetails.role} />
        )}

        <WorkspaceMembers workspace={workspaceDetails} onChanged={loadDetails} />
      </main>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <ProtectedRoute>
      <WorkspaceSettings />
    </ProtectedRoute>
  );
}
