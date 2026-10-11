"use client";

// DeleteWorkspacePanel (Owner only): explains exactly what deleting will do BEFORE asking
// for the typed confirmation — the server decides, and the preview says which:
// - permanent: only your own work is in it, so it's removed with everything inside;
// - soft: other people have work here, so it's closed to everyone but their work is kept.
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { TriangleAlert } from "lucide-react";
import { deleteWorkspace, getWorkspaceDeletionPreview } from "@/lib/services/workspaceService";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { describeFailure, failureMessage, type Failure } from "@/lib/errors";
import Button from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { FailurePanel } from "@/components/ui/States";

interface DeletionPlan {
  mode: "permanent" | "soft";
  otherContributors: number;
  counts: { tasks: number; projects: number; members: number };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export default function DeleteWorkspacePanel({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const router = useRouter();
  const { refreshWorkspaces } = useWorkspaces();
  const [plan, setPlan] = useState<DeletionPlan | null>(null);
  const [planFailure, setPlanFailure] = useState<Failure | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The preview is fetched when the panel opens, so it reflects the workspace right now.
  useEffect(() => {
    if (!open) return;
    setPlan(null);
    getWorkspaceDeletionPreview(workspaceId)
      .then((response) => setPlan(response.data.data))
      .catch((failure) => setPlanFailure(describeFailure(failure, "Couldn't check what deleting would do.")));
  }, [open, workspaceId]);

  const handleDelete = async (event: FormEvent) => {
    event.preventDefault();
    if (confirmName.trim() !== workspaceName) {
      setError(`Type “${workspaceName}” exactly to confirm.`);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const response = await deleteWorkspace(workspaceId, confirmName.trim());
      toast.success(response.data.data.mode === "soft" ? `${workspaceName} was closed. Its members' work is kept.` : `${workspaceName} was deleted.`);
      // Moves the active workspace to another one you belong to, or none (→ onboarding).
      const result = await refreshWorkspaces();
      router.replace(result.success && result.data && result.data.length > 0 ? "/dashboard" : "/onboarding");
    } catch (failure) {
      setError(failureMessage(failure, "We couldn't delete the workspace."));
      setDeleting(false);
    }
  };

  if (!open) {
    return (
      <div className="flex max-w-lg flex-col gap-3">
        <p className="text-[14px] text-muted">
          Removes this workspace for everyone in it. You&apos;ll see exactly what happens before anything is deleted.
        </p>
        <div>
          <Button variant="danger" onClick={() => setOpen(true)}>
            Delete workspace…
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-4 rounded-[14px] border border-brick/40 bg-brick-tint/40 p-5">
      {planFailure ? (
        <FailurePanel compact failure={planFailure} />
      ) : !plan ? (
        <div role="status" aria-label="Checking what deleting would do" className="flex flex-col gap-2">
          <span className="skeleton h-4 w-3/4" />
          <span className="skeleton h-4 w-1/2" />
        </div>
      ) : (
        <div className="flex items-start gap-3 text-[14.5px] text-ink">
          <TriangleAlert size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-brick" />
          {plan.mode === "permanent" ? (
            <div>
              <p className="font-semibold">This permanently deletes {workspaceName}.</p>
              <p className="mt-1 text-muted">
                Only your own work is in it, so everything goes: {plural(plan.counts.tasks, "task")}, {plural(plan.counts.projects, "project")}, their
                comments and history{plan.counts.members > 1 ? `, and the ${plural(plan.counts.members - 1, "other member")}' access` : ""}. This can&apos;t be
                undone.
              </p>
            </div>
          ) : (
            <div>
              <p className="font-semibold">This closes {workspaceName} for everyone, and keeps its work.</p>
              <p className="mt-1 text-muted">
                {plural(plan.otherContributors, "other person")} {plan.otherContributors === 1 ? "has" : "have"} work here, so it isn&apos;t destroyed.
                All {plural(plan.counts.members, "member")} lose access straight away, it disappears from everyone&apos;s list, pending invitations are
                withdrawn and reminders stop. Reopening it isn&apos;t available in the app.
              </p>
            </div>
          )}
        </div>
      )}

      {plan && (
        <form onSubmit={handleDelete} className="flex flex-col gap-3">
          <TextField
            label={`Type “${workspaceName}” to confirm`}
            value={confirmName}
            onChange={(event) => {
              setConfirmName(event.target.value);
              setError(null);
            }}
            error={error}
            autoComplete="off"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger-solid" loading={deleting} disabled={confirmName.trim() !== workspaceName}>
              {plan.mode === "permanent" ? "Delete permanently" : "Close workspace"}
            </Button>
            <Button
              variant="ghost"
              disabled={deleting}
              onClick={() => {
                setOpen(false);
                setConfirmName("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
