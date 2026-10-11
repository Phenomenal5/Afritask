"use client";

// This workspace's administration: its name, labels and full history. Personal settings
// live on /settings; members and invitations on /people.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowRight, Lock, Plus } from "lucide-react";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { getWorkspaceActivity } from "@/lib/services/activityService";
import { ROLE_LABELS } from "@/utils/roles";
import PageHeader from "@/components/layout/PageHeader";
import SettingsNav from "@/components/settings/SettingsNav";
import SettingsSection from "@/components/settings/SettingsSection";
import LabelsManager from "@/components/settings/LabelsManager";
import BillingComingSoon from "@/components/settings/BillingComingSoon";
import DeleteWorkspacePanel from "@/components/settings/DeleteWorkspacePanel";
import ActivityFeed from "@/components/activity/ActivityFeed";
import Button, { ButtonLink } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";

const NAME_MAX_LENGTH = 100;

export default function WorkspaceSettingsPage() {
  const { activeWorkspace, renameWorkspace } = useWorkspaces();
  const { workspace, isManager, reloadWorkspace } = useWorkspaceResources();
  const workspaceId: string | undefined = activeWorkspace?.id;
  const isOwner = activeWorkspace?.role === "owner";

  const [nameDraft, setNameDraft] = useState(activeWorkspace?.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    setNameDraft(activeWorkspace?.name ?? "");
    setNameError(null);
  }, [activeWorkspace?.id, activeWorkspace?.name]);

  const loadActivity = useCallback((page: { before?: string }) => getWorkspaceActivity(workspaceId, page), [workspaceId]);

  const handleRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId) return;
    const trimmedName = nameDraft.trim();
    if (!trimmedName) return setNameError("A workspace needs a name.");
    if (trimmedName.length > NAME_MAX_LENGTH) return setNameError(`Keep it under ${NAME_MAX_LENGTH} characters.`);
    setRenaming(true);
    const result = await renameWorkspace(workspaceId, trimmedName);
    setRenaming(false);
    if (result.success) {
      toast.success("Workspace renamed");
      reloadWorkspace();
    } else {
      setNameError(result.message ?? "Couldn't rename the workspace.");
    }
  };

  return (
    <>
      <title>{`Workspace settings · ${activeWorkspace?.name ?? "Afritask"}`}</title>
      <PageHeader title="Settings" description={`Settings for ${activeWorkspace?.name}. Changes here affect everyone in it. You're ${activeWorkspace?.role === "admin" ? "an" : activeWorkspace?.role === "owner" ? "the" : "a"} ${activeWorkspace ? ROLE_LABELS[activeWorkspace.role] : ""}.`} />
      <SettingsNav />

      <div>
        <SettingsSection title="Workspace name" description="Shown in the workspace switcher, invitations and emails.">
          {isOwner ? (
            <form onSubmit={handleRename} noValidate className="flex max-w-lg flex-col gap-3 sm:flex-row sm:items-start">
              <TextField
                wrapperClassName="flex-1"
                label="Name"
                value={nameDraft}
                onChange={(event) => {
                  setNameDraft(event.target.value);
                  setNameError(null);
                }}
                error={nameError}
              />
              <Button type="submit" loading={renaming} disabled={nameDraft.trim() === activeWorkspace?.name} className="sm:mt-[27px]">
                Rename
              </Button>
            </form>
          ) : (
            <div className="flex max-w-lg flex-col gap-3">
              <p className="text-[16px] font-semibold text-ink">{activeWorkspace?.name}</p>
              <Notice icon={Lock}>Only the Owner can rename the workspace.</Notice>
            </div>
          )}
        </SettingsSection>

        <SettingsSection title="People" description="Members, invitations and roles have their own page.">
          <ButtonLink href="/people" variant="secondary" icon={<ArrowRight size={16} aria-hidden="true" />}>
            Manage people ({workspace?.members.length ?? "..."})
          </ButtonLink>
        </SettingsSection>

        <SettingsSection title="Labels" description="Labels group tasks across projects. Members can apply them to tasks they can edit.">
          {workspaceId && <LabelsManager workspaceId={workspaceId} canManage={isManager} />}
        </SettingsSection>

        <SettingsSection id="activity" title="Activity history" description="Every change to tasks, projects and membership in this workspace, newest first. It can't be edited.">
          <div className="rounded-[14px] border border-line bg-surface p-5">
            <ActivityFeed loadPage={loadActivity} reloadKey={workspaceId} />
          </div>
        </SettingsSection>

        <SettingsSection id="billing" title="Billing" description="Plans and payment for this workspace.">
          <BillingComingSoon />
        </SettingsSection>

        <SettingsSection title="More workspaces" description="Keep separate work apart. Each workspace has its own people, projects and tasks.">
          <div className="flex max-w-lg flex-col gap-3">
            <ButtonLink href="/workspace/new" variant="secondary" icon={<Plus size={16} aria-hidden="true" />}>
              Create another workspace
            </ButtonLink>
            <p className="text-[14px] text-muted">Your current workspaces aren&apos;t changed.</p>
          </div>
        </SettingsSection>

        {isOwner && workspaceId && activeWorkspace && (
          <SettingsSection id="delete" title="Delete workspace" description="Owner only. Permanent if only your own work is here; otherwise it's closed for everyone and their work is kept.">
            <DeleteWorkspacePanel key={workspaceId} workspaceId={workspaceId} workspaceName={activeWorkspace.name} />
          </SettingsSection>
        )}
      </div>
    </>
  );
}
