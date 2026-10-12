"use client";

// Progressive workspace setup (PRD J1, FR02):
//   1. Name the workspace          (required)
//   2. Invite teammates            (optional — skip)
//   3. Add a first task            (optional — skip into the workspace)
//
// NOTE: creating a workspace must never overwrite or duplicate one. The created
// workspace's id is kept in sessionStorage, so going Back, refreshing, or a double submit
// on step 1 RENAMES that workspace instead of creating another. Existing workspaces are
// never touched.
import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Check, CircleAlert, MailCheck, MailX, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useUser } from "@/context/UserContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useTaskActions } from "@/context/TaskContext";
import { getMyInvitations, inviteToWorkspace } from "@/lib/services/invitationService";
import { getWorkspace } from "@/lib/services/workspaceService";
import { failureMessage } from "@/lib/errors";
import { clearDraft, readDraft, writeDraft } from "@/utils/draftStorage";
import { detectTimezone, formatTimezoneLabel, listTimezones } from "@/utils/timezones";
import { cx } from "@/lib/cx";
import Button from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import FormAlert from "@/components/auth/FormAlert";
import InvitationResponses from "@/components/people/InvitationResponses";
import type { Invitation, WorkspaceRole } from "@/types/models";

type Step = 1 | 2 | 3;
interface Progress {
  workspaceId: string | null;
  step: Step;
}

interface InviteRow {
  email: string;
  role: WorkspaceRole;
  error?: string;
  result?: "sent" | "failed";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STEP_TITLES = ["Name it", "Invite people", "First task"];

export default function OnboardingFlow({ mode }: { mode: "first" | "additional" }) {
  const router = useRouter();
  const { user } = useAuth();
  const { updateProfile } = useUser();
  const { workspaces, workspacesLoading, createWorkspace, renameWorkspace, switchWorkspace } = useWorkspaces();
  const { createTask } = useTaskActions();
  const progressKey = `afritask_onboarding:${mode}`;

  const [progress, setProgress] = useState<Progress>({ workspaceId: null, step: 1 });
  const [progressLoaded, setProgressLoaded] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Resume where this tab left off (refresh-safe), but only for a workspace we still have.
  useEffect(() => {
    if (workspacesLoading) return;
    const saved = readDraft<Progress>(progressKey);
    if (saved?.workspaceId && workspaces.some((workspace) => workspace.id === saved.workspaceId)) setProgress(saved);
    setProgressLoaded(true);
  }, [workspacesLoading, workspaces, progressKey]);

  // First-time onboarding is for people with no workspace — anyone else goes to theirs.
  useEffect(() => {
    if (!progressLoaded || mode !== "first") return;
    if (workspaces.length > 0 && !progress.workspaceId) router.replace("/dashboard");
  }, [progressLoaded, mode, workspaces.length, progress.workspaceId, router]);

  const goTo = useCallback(
    (next: Progress) => {
      setProgress(next);
      writeDraft(progressKey, next);
      // Move focus to the new step's heading so screen readers hear the change.
      window.requestAnimationFrame(() => headingRef.current?.focus());
    },
    [progressKey]
  );

  const finish = () => {
    clearDraft(progressKey);
    if (progress.workspaceId) switchWorkspace(progress.workspaceId);
    router.replace("/dashboard");
  };

  const createdWorkspace = workspaces.find((workspace) => workspace.id === progress.workspaceId) ?? null;

  if (!progressLoaded) return <span className="skeleton block h-48" role="status" aria-label="Loading" />;

  return (
    <div className="flex flex-col gap-7">
      <ol className="grid grid-cols-3 gap-2" aria-label="Setup steps">
        {STEP_TITLES.map((stepTitle, index) => {
          const stepNumber = (index + 1) as Step;
          const done = stepNumber < progress.step;
          const current = stepNumber === progress.step;
          return (
            <li key={stepTitle} aria-current={current ? "step" : undefined} className="flex flex-col gap-2">
              <span className={cx("h-1.5 rounded-full", done || current ? "bg-forest" : "bg-line")} />
              <span className={cx("flex items-center gap-1.5 text-[13px]", current ? "font-semibold text-ink" : "text-muted")}>
                {done && <Check size={14} aria-hidden="true" className="text-done" />}
                {stepNumber}. {stepTitle}
                {stepNumber > 1 && <span className="sr-only"> (optional)</span>}
                {done && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {progress.step === 1 && (
        <NameStep
          headingRef={headingRef}
          mode={mode}
          initialName={createdWorkspace?.name ?? (mode === "first" ? `${user?.name?.split(" ")[0] ?? "My"}'s workspace` : "")}
          initialTimezone={user?.timezone && user.timezone !== "UTC" ? user.timezone : detectTimezone()}
          showTimezone={mode === "first"}
          onSubmit={async (name, timezone) => {
            if (mode === "first" && timezone !== user?.timezone) await updateProfile({ timezone });
            if (createdWorkspace) {
              // Already created in this setup — rename it rather than make a second one.
              if (name !== createdWorkspace.name) {
                const result = await renameWorkspace(createdWorkspace.id, name);
                if (!result.success) return result.message ?? "Couldn't rename the workspace. Try again.";
              }
              goTo({ workspaceId: createdWorkspace.id, step: 2 });
              return null;
            }
            const result = await createWorkspace(name);
            if (!result.success || !result.data) return result.message ?? "Couldn't create the workspace. Try again.";
            goTo({ workspaceId: result.data.id, step: 2 });
            return null;
          }}
        />
      )}

      {progress.step === 2 && progress.workspaceId && (
        <InviteStep
          headingRef={headingRef}
          workspaceId={progress.workspaceId}
          workspaceName={createdWorkspace?.name ?? "your workspace"}
          onBack={() => goTo({ ...progress, step: 1 })}
          onNext={() => goTo({ ...progress, step: 3 })}
        />
      )}

      {progress.step === 3 && progress.workspaceId && (
        <FirstTaskStep
          headingRef={headingRef}
          workspaceId={progress.workspaceId}
          profileTimezone={user?.timezone || detectTimezone()}
          onBack={() => goTo({ ...progress, step: 2 })}
          onCreate={async (input) => createTask(progress.workspaceId as string, input)}
          onFinish={finish}
        />
      )}
    </div>
  );
}

// ─── Step 1: name ─────────────────────

function NameStep({
  headingRef,
  mode,
  initialName,
  initialTimezone,
  showTimezone,
  onSubmit,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  mode: "first" | "additional";
  initialName: string;
  initialTimezone: string;
  showTimezone: boolean;
  onSubmit: (name: string, timezone: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const router = useRouter();

  // Invited by a team? Joining can replace creating your own (PRD J2).
  useEffect(() => {
    if (mode !== "first") return;
    getMyInvitations()
      .then((response) => setInvitations(response.data.data.invitations))
      .catch(() => setInvitations([]));
  }, [mode]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return setNameError("Give it a name. You can change it later.");
    if (trimmedName.length > 100) return setNameError("Keep the name to 100 characters or fewer.");
    setSaving(true);
    const error = await onSubmit(trimmedName, timezone);
    setSaving(false);
    if (error) setFormError(`${error} Your workspace name is still here.`);
  };

  return (
    <section aria-labelledby="step-heading" className="flex flex-col gap-5">
      {invitations.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-[15px] font-semibold text-ink">Joining a team? You have an invitation waiting.</p>
          <InvitationResponses
            invitations={invitations}
            onResolved={(invitation, accepted) => {
              setInvitations((current) => current.filter((item) => item.id !== invitation.id));
              if (accepted) router.replace("/dashboard");
            }}
          />
          <p className="text-[14px] text-muted">Or set up a workspace of your own below.</p>
        </div>
      )}

      <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-[19px] font-semibold text-ink outline-none">
        What should we call this workspace?
      </h2>
      <p className="-mt-3 text-[15px] text-muted">
        A workspace holds your projects, tasks and the people you work with. {mode === "first" ? "Working alone is fine. Everything works the same way." : "Your other workspaces stay as they are."}
      </p>
      {formError && <FormAlert>{formError}</FormAlert>}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Workspace name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(null);
            setFormError(null);
          }}
          placeholder="e.g. Studio projects, Client work, Final year"
          error={nameError}
        />
        {showTimezone && (
          <SelectField label="Your timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} hint="Detected from this device. Used for due dates and 'due today'. You can change it in Settings.">
            {listTimezones(timezone).map((zone: string) => (
              <option key={zone} value={zone}>
                {formatTimezoneLabel(zone)}
              </option>
            ))}
          </SelectField>
        )}
        <Button type="submit" size="lg" full loading={saving}>
          Continue
        </Button>
      </form>
    </section>
  );
}

// ─── Step 2: invite (optional) ─────────────────────

function InviteStep({
  headingRef,
  workspaceId,
  workspaceName,
  onBack,
  onNext,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  workspaceId: string;
  workspaceName: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const [rows, setRows] = useState<InviteRow[]>([{ email: "", role: "member" }]);
  const [sending, setSending] = useState(false);
  const anySent = rows.some((row) => row.result);

  const updateRow = (index: number, changes: Partial<InviteRow>) =>
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...changes, error: undefined } : row)));

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    const pending = rows.map((row, index) => ({ row, index })).filter(({ row }) => !row.result && row.email.trim());
    if (pending.length === 0) {
      setRows((current) => current.map((row, index) => (index === 0 && !row.result ? { ...row, error: "Enter an email, or skip this step." } : row)));
      return;
    }
    let hasInvalid = false;
    setRows((current) =>
      current.map((row) => {
        if (row.result || !row.email.trim() || EMAIL_PATTERN.test(row.email.trim())) return row;
        hasInvalid = true;
        return { ...row, error: "Enter a full email address, like name@example.com." };
      })
    );
    if (hasInvalid) return;

    setSending(true);
    for (const { row, index } of pending) {
      try {
        const response = await inviteToWorkspace(workspaceId, { email: row.email.trim().toLowerCase(), role: row.role });
        const delivered = response.data.data.invitation.deliveryStatus !== "failed";
        setRows((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, result: delivered ? "sent" : "failed" } : item)));
      } catch (error) {
        setRows((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, error: failureMessage(error, "Couldn't invite this person. Try again, or skip for now.") } : item)));
      }
    }
    setSending(false);
  };

  return (
    <section aria-labelledby="step-heading" className="flex flex-col gap-5">
      <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-[19px] font-semibold text-ink outline-none">
        Bring people into {workspaceName}
      </h2>
      <p className="-mt-3 text-[15px] text-muted">
        Optional. Each person gets an email and joins only when they accept. You can always invite people later from People.
      </p>

      <form onSubmit={handleSend} noValidate className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-[12px] border border-line bg-surface p-3 sm:flex-row sm:items-start">
            {row.result ? (
              <p className={cx("flex min-h-11 flex-1 items-center gap-2 text-[15px]", row.result === "sent" ? "text-ink" : "text-brick")} role="status">
                {row.result === "sent" ? <MailCheck size={18} aria-hidden="true" className="text-done" /> : <MailX size={18} aria-hidden="true" />}
                {row.result === "sent"
                  ? `Invitation sent to ${row.email.trim()}`
                  : `Saved, but the email to ${row.email.trim()} couldn't be delivered. You can resend it from People.`}
              </p>
            ) : (
              <>
                <TextField
                  wrapperClassName="flex-1"
                  label={`Email ${index + 1}`}
                  type="email"
                  autoComplete="off"
                  value={row.email}
                  onChange={(event) => updateRow(index, { email: event.target.value })}
                  placeholder="teammate@example.com"
                  error={row.error}
                />
                <SelectField label="Role" wrapperClassName="sm:w-36" value={row.role} onChange={(event) => updateRow(index, { role: event.target.value as WorkspaceRole })}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </SelectField>
                {rows.length > 1 && (
                  <Button
                    variant="ghost"
                    className="sm:mt-[27px]"
                    aria-label={`Remove email ${index + 1}`}
                    onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                    icon={<Trash2 size={16} aria-hidden="true" />}
                  />
                )}
              </>
            )}
          </div>
        ))}
        {rows.length < 5 && (
          <button
            type="button"
            onClick={() => setRows((current) => [...current, { email: "", role: "member" }])}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-[8px] text-[15px] font-medium text-forest hover:underline"
          >
            <Plus size={17} aria-hidden="true" />
            Add another person
          </button>
        )}
        <p className="flex items-start gap-2 text-[13.5px] text-muted">
          <CircleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          Admins can manage projects, labels and Members. Most people should be Members.
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row-reverse sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            {rows.some((row) => !row.result && row.email.trim()) && (
              <Button type="submit" size="lg" loading={sending}>
                Send invitations
              </Button>
            )}
            <Button variant={anySent ? "primary" : "secondary"} size="lg" onClick={onNext} disabled={sending}>
              {anySent ? "Continue" : "Skip for now"}
            </Button>
          </div>
          <Button variant="ghost" size="lg" onClick={onBack} disabled={sending} icon={<ArrowLeft size={17} aria-hidden="true" />}>
            Back
          </Button>
        </div>
      </form>
    </section>
  );
}

// ─── Step 3: first task (optional) ─────────────────────

function FirstTaskStep({
  headingRef,
  workspaceId,
  profileTimezone,
  onBack,
  onCreate,
  onFinish,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  workspaceId: string;
  profileTimezone: string;
  onBack: () => void;
  onCreate: (input: { title: string; dueDate?: string; dueTimezone?: string; assigneeMembershipId?: string | null; clientRequestId: string }) => Promise<{ success: boolean }>;
  onFinish: () => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [soloMembershipId, setSoloMembershipId] = useState<string | null>(null);
  // One key for this form: a double-click creates the task once (SRS SR06).
  const [requestId] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`));

  // PRD J1 default: alone in the workspace → the task is assigned to you.
  useEffect(() => {
    getWorkspace(workspaceId)
      .then((response) => {
        const members = response.data.data.workspace.members;
        setSoloMembershipId(members.length === 1 ? members[0].id : null);
      })
      .catch(() => setSoloMembershipId(null));
  }, [workspaceId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return setTitleError("Write the task, or skip and go to your workspace.");
    if (trimmedTitle.length > 200) return setTitleError("Keep it to 200 characters or fewer.");
    setSaving(true);
    const result = await onCreate({
      title: trimmedTitle,
      clientRequestId: requestId,
      assigneeMembershipId: soloMembershipId,
      ...(dueDate ? { dueDate, dueTimezone: profileTimezone } : {}),
    });
    setSaving(false);
    if (result.success) {
      toast.success("Your workspace is ready");
      onFinish();
    }
  };

  return (
    <section aria-labelledby="step-heading" className="flex flex-col gap-5">
      <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-[19px] font-semibold text-ink outline-none">
        What&apos;s one small next step?
      </h2>
      <p className="-mt-3 text-[15px] text-muted">
        Optional. Just a title is enough{soloMembershipId ? ", and it'll be assigned to you" : ""}. You can add details, projects and people later.
      </p>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Task"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleError(null);
          }}
          placeholder="e.g. Draft the project brief"
          error={titleError}
        />
        <TextField
          label="Due date"
          optional
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          hint={dueDate ? `Due by the end of that day (${formatTimezoneLabel(profileTimezone)}).` : undefined}
          wrapperClassName="max-w-[14rem]"
        />
        <div className="mt-2 flex flex-col gap-3 sm:flex-row-reverse sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button type="submit" size="lg" loading={saving}>
              Add task and finish
            </Button>
            <Button variant="secondary" size="lg" onClick={onFinish} disabled={saving}>
              Skip and go to my workspace
            </Button>
          </div>
          <Button variant="ghost" size="lg" onClick={onBack} disabled={saving} icon={<ArrowLeft size={17} aria-hidden="true" />}>
            Back
          </Button>
        </div>
      </form>
    </section>
  );
}
