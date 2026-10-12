"use client";

// TaskComments: the discussion on one task (SRS SR08). Comments are people talking; the
// Activity section below is the system's record of changes — they're kept apart on purpose.
// - Mentions: type "@" to pick a current member. They're sent as membership ids, and only
//   the ones whose "@Name" is still in the text when posting.
// - A failed post keeps the draft (per task, this tab) and says why; nothing is shown as
//   posted until the server confirms it.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { COMMENT_CHANGED_EVENT, COMMENT_COUNT_EVENT } from "@/context/LiveUpdatesContext";
import { AtSign, MessageSquare, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { createComment, deleteComment, editComment, getTaskComments } from "@/lib/services/commentService";
import { describeFailure, failureMessage, type Failure } from "@/lib/errors";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useNow } from "@/hooks/useNow";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { clearDraft, readDraft, writeDraft } from "@/utils/draftStorage";
import { timeAgo } from "@/utils/activity";
import { cx } from "@/lib/cx";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { FailurePanel, Notice } from "@/components/ui/States";
import type { Comment, CommentMention, Member } from "@/types/models";

const BODY_MAX_LENGTH = 5000;

interface CommentDraft {
  body: string;
  pickedMembershipIds: string[];
}

// Members picked from the "@" menu whose mention is still in the text.
const mentionsStillInText = (body: string, pickedIds: string[], members: Member[]) =>
  members.filter((member) => pickedIds.includes(member.id) && body.includes(`@${member.user.name}`)).map((member) => member.id);

// The "@query" right before the caret, if the person is typing a mention.
const activeMentionQuery = (text: string, caret: number): { start: number; query: string } | null => {
  const match = /(^|\s)@([^\s@]{0,30})$/.exec(text.slice(0, caret));
  return match ? { start: caret - match[2].length - 1, query: match[2] } : null;
};

// ─── Text with highlighted mentions ─────────────────────
function CommentText({ body, mentions }: { body: string; mentions: CommentMention[] }) {
  const names = [...new Set(mentions.map((mention) => mention.name))].sort((firstName, secondName) => secondName.length - firstName.length);
  if (names.length === 0) return <>{body}</>;
  const escaped = names.map((name) => `@${name}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = body.split(new RegExp(`(${escaped.join("|")})`, "g"));
  return (
    <>
      {parts.map((part, index) =>
        names.some((name) => part === `@${name}`) ? (
          <span key={index} className="rounded bg-lime/70 px-1 font-medium text-forest-deep">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}

// ─── Textarea with an accessible "@" member picker ─────────────────────
interface MentionInputProps {
  label: string;
  value: string;
  onChange: (body: string) => void;
  // Picking a member sends the new text and who was picked together. NOTE: one update, not
  // onChange then onPick: two updates built from the same draft overwrote the inserted name.
  onPick: (membershipId: string, nextBody: string) => void;
  members: Member[];
  disabled?: boolean;
  autoFocus?: boolean;
  onSubmitShortcut?: () => void;
  placeholder?: string;
}

function MentionInput({ label, value, onChange, onPick, members, disabled, autoFocus, onSubmitShortcut, placeholder }: MentionInputProps) {
  const inputId = useId();
  const listId = useId();
  const hintId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    return members.filter((member) => member.user.name.toLowerCase().includes(query)).slice(0, 6);
  }, [mention, members]);
  const isOpen = suggestions.length > 0;

  const refreshMention = (text: string, caret: number) => {
    setMention(activeMentionQuery(text, caret));
    setHighlighted(0);
  };

  const pick = (member: Member) => {
    if (!mention) return;
    const caret = mention.start + 1 + mention.query.length;
    const inserted = `@${member.user.name} `;
    const nextBody = value.slice(0, mention.start) + inserted + value.slice(caret);
    onPick(member.id, nextBody);
    setMention(null);
    const nextCaret = mention.start + inserted.length;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setHighlighted((index) => (index + step + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(suggestions[highlighted]);
        return;
      }
      if (event.key === "Escape") {
        // Close the picker without closing the surrounding dialog.
        event.preventDefault();
        event.stopPropagation();
        setMention(null);
        return;
      }
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onSubmitShortcut?.();
    }
  };

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <textarea
        ref={textareaRef}
        id={inputId}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen ? `${listId}-${highlighted}` : undefined}
        aria-describedby={hintId}
        className="field-control min-h-[88px] resize-y leading-relaxed"
        rows={3}
        maxLength={BODY_MAX_LENGTH}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          refreshMention(event.target.value, event.target.selectionStart);
        }}
        onKeyDown={handleKeyDown}
        onClick={(event) => refreshMention(event.currentTarget.value, event.currentTarget.selectionStart)}
        onBlur={() => window.setTimeout(() => setMention(null), 120)}
      />
      <p id={hintId} className="sr-only">
        Type @ to mention someone in this workspace. Press Control and Enter to post.
      </p>
      {isOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label="People you can mention"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-[12px] border border-line bg-surface py-1 shadow-md sm:right-auto sm:w-72"
        >
          {suggestions.map((member, index) => (
            <li
              key={member.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === highlighted}
              // mousedown so the textarea doesn't blur (and close the list) first.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(member);
              }}
              className={cx(
                "flex min-h-11 cursor-pointer items-center gap-2.5 px-3 text-[14px] text-ink",
                index === highlighted && "bg-lime/60"
              )}
            >
              <Avatar user={member.user} size={26} />
              <span className="truncate">{member.user.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── One comment ─────────────────────
interface CommentItemProps {
  comment: Comment;
  now: Date | null;
  members: Member[];
  readOnly: boolean;
  onChanged: (comment: Comment) => void;
}

function CommentItem({ comment, now, members, readOnly, onChanged }: CommentItemProps) {
  const confirm = useConfirm();
  const online = useOnlineStatus();
  const [editing, setEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(comment.body);
  const [pickedIds, setPickedIds] = useState<string[]>(comment.mentions.map((mention) => mention.membershipId));
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setDraftBody(comment.body);
    setPickedIds(comment.mentions.map((mention) => mention.membershipId));
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!draftBody.trim()) {
      setError("A comment can't be empty. Delete it instead if it's no longer needed.");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const response = await editComment(comment.id, { body: draftBody, mentionMembershipIds: mentionsStillInText(draftBody, pickedIds, members) });
      onChanged(response.data.data.comment);
      setEditing(false);
      toast.success("Comment updated");
    } catch (failure) {
      // Keep the edit open with the text intact so it can be retried.
      setError(failureMessage(failure, "We couldn't save that change."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const isOwn = comment.canEdit;
    const confirmed = await confirm({
      title: "Delete this comment?",
      body: isOwn
        ? "Its text is removed for everyone. The thread will show that you deleted a comment."
        : `This removes ${comment.author.name}'s comment for everyone. The thread will show that you deleted it.`,
      confirmLabel: "Delete comment",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy("delete");
    try {
      const response = await deleteComment(comment.id);
      onChanged(response.data.data.comment);
      toast.success("Comment deleted");
    } catch (failure) {
      toast.error(failureMessage(failure, "We couldn't delete that comment."));
    } finally {
      setBusy(null);
    }
  };

  const timestamp = (
    <time dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString()} className="text-[13px] text-muted">
      {now ? timeAgo(comment.createdAt, now) : new Date(comment.createdAt).toLocaleDateString()}
    </time>
  );

  if (comment.deletedAt) {
    return (
      <li className="flex items-center gap-3 py-3 text-[14px] italic text-muted">
        <Trash2 size={16} aria-hidden="true" className="shrink-0" />
        <span>
          Comment by {comment.author.name} deleted{comment.deletedBy && comment.deletedBy.id !== comment.author.id ? ` by ${comment.deletedBy.name}` : ""}.
        </span>
      </li>
    );
  }

  return (
    <li className="flex gap-3 py-3">
      <Avatar user={comment.author} size={32} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[14px] font-semibold text-ink">{comment.author.name}</span>
          {timestamp}
          {comment.editedAt && (
            <span className="text-[13px] text-muted" title={`Edited ${new Date(comment.editedAt).toLocaleString()}`}>
              (edited)
            </span>
          )}
        </p>

        {editing ? (
          <div className="mt-2 flex flex-col gap-2">
            <MentionInput
              label="Edit comment"
              value={draftBody}
              onChange={setDraftBody}
              onPick={(membershipId, nextBody) => {
                setDraftBody(nextBody);
                setPickedIds((ids) => [...new Set([...ids, membershipId])]);
              }}
              members={members}
              autoFocus
              onSubmitShortcut={save}
            />
            {error && (
              <p role="alert" className="text-[13px] text-brick">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" loading={busy === "save"} disabled={!online} onClick={save}>
                Save
              </Button>
              <Button size="sm" variant="ghost" disabled={busy === "save"} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">
            <CommentText body={comment.body} mentions={comment.mentions} />
          </p>
        )}

        {!editing && !readOnly && (comment.canEdit || comment.canDelete) && (
          <div className="mt-1 flex gap-1">
            {comment.canEdit && (
              <Button size="sm" variant="ghost" icon={<Pencil size={14} aria-hidden="true" />} onClick={startEditing} disabled={!online}>
                Edit
              </Button>
            )}
            {comment.canDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="text-brick"
                icon={<Trash2 size={14} aria-hidden="true" />}
                loading={busy === "delete"}
                disabled={!online}
                onClick={remove}
              >
                Delete
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// ─── The thread + composer ─────────────────────
interface TaskCommentsProps {
  taskId: string;
  // Archived projects are read-only for discussion too (the server refuses with 409).
  readOnlyReason?: string | null;
  heading?: ReactNode;
}

export default function TaskComments({ taskId, readOnlyReason, heading }: TaskCommentsProps) {
  const { members } = useWorkspaceResources();
  const now = useNow();
  const online = useOnlineStatus();
  const draftKey = `afritask:comment-draft:${taskId}`;

  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loadFailure, setLoadFailure] = useState<Failure | null>(null);
  const [draft, setDraft] = useState<CommentDraft>({ body: "", pickedMembershipIds: [] });
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    try {
      const response = await getTaskComments(taskId);
      setComments(response.data.data.comments);
      setLoadFailure(null);
    } catch (failure) {
      setLoadFailure(describeFailure(failure, "Couldn't load the comments."));
    }
  }, [taskId]);

  useEffect(() => {
    setComments(null);
    loadComments();
    setDraft(readDraft<CommentDraft>(draftKey) ?? { body: "", pickedMembershipIds: [] });
  }, [loadComments, draftKey]);

  // Live: someone else commented, edited or deleted on this task (SSE via LiveUpdatesContext).
  // The thread refetches, so what shows is still what the API allows; the draft is untouched.
  useEffect(() => {
    const handleCommentChanged = (event: Event) => {
      if ((event as CustomEvent<{ taskId?: string }>).detail?.taskId === taskId) loadComments();
    };
    window.addEventListener(COMMENT_CHANGED_EVENT, handleCommentChanged);
    return () => window.removeEventListener(COMMENT_CHANGED_EVENT, handleCommentChanged);
  }, [taskId, loadComments]);

  const updateDraft = (nextDraft: CommentDraft) => {
    setDraft(nextDraft);
    setPostError(null);
    if (nextDraft.body) writeDraft(draftKey, nextDraft);
    else clearDraft(draftKey);
  };

  const post = async () => {
    if (posting) return;
    if (!draft.body.trim()) {
      setPostError("Write something before posting.");
      return;
    }
    setPosting(true);
    setPostError(null);
    try {
      const response = await createComment(taskId, {
        body: draft.body,
        mentionMembershipIds: mentionsStillInText(draft.body, draft.pickedMembershipIds, members),
      });
      setComments((current) => [...(current ?? []), response.data.data.comment]);
      updateDraft({ body: "", pickedMembershipIds: [] });
    } catch (failure) {
      // The draft stays exactly as typed (and in this tab's storage) so it can be retried.
      setPostError(`${failureMessage(failure, "We couldn't post your comment.")} Your comment is still here.`);
    } finally {
      setPosting(false);
    }
  };

  const replaceComment = (changed: Comment) =>
    setComments((current) => (current ?? []).map((comment) => (comment.id === changed.id ? changed : comment)));

  const visibleCount = comments?.filter((comment) => !comment.deletedAt).length ?? 0;

  useEffect(() => {
    if (comments) window.dispatchEvent(new CustomEvent(COMMENT_COUNT_EVENT, { detail: { taskId, count: visibleCount } }));
  }, [comments, taskId, visibleCount]);

  return (
    <section aria-labelledby={`comments-heading-${taskId}`}>
      <h3 id={`comments-heading-${taskId}`} className="mb-2 flex items-center gap-2 text-[16px] font-semibold text-ink">
        <MessageSquare size={18} aria-hidden="true" />
        {heading ?? "Comments"}
        {visibleCount > 0 && <span className="text-[14px] font-normal text-muted">({visibleCount})</span>}
      </h3>

      {loadFailure ? (
        <FailurePanel compact failure={loadFailure} onRetry={loadComments} />
      ) : comments === null ? (
        <div role="status" aria-label="Loading comments" className="flex flex-col gap-2 py-2">
          <span className="skeleton h-4 w-2/3" />
          <span className="skeleton h-4 w-1/2" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-2 text-[14px] text-muted">
          No comments yet. Ask a question, share an update or flag a blocker. Mention someone with @ to bring them in.
        </p>
      ) : (
        <ol className="divide-y divide-line-soft">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} now={now} members={members} readOnly={!!readOnlyReason} onChanged={replaceComment} />
          ))}
        </ol>
      )}

      {readOnlyReason ? (
        <Notice className="mt-3">{readOnlyReason}</Notice>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <MentionInput
            label="Write a comment"
            value={draft.body}
            onChange={(body) => updateDraft({ ...draft, body })}
            onPick={(membershipId, nextBody) => updateDraft({ body: nextBody, pickedMembershipIds: [...new Set([...draft.pickedMembershipIds, membershipId])] })}
            members={members}
            disabled={posting}
            onSubmitShortcut={post}
            placeholder="Write a comment. Type @ to mention someone."
          />
          {postError && (
            <p role="alert" className="text-[13px] text-brick">
              {postError}
            </p>
          )}
          {!online && <p className="text-[13px] text-muted">You&apos;re offline. Your comment is kept here and can be posted once you reconnect.</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[13px] text-muted">
              <AtSign size={14} aria-hidden="true" />
              Mentioned people must be members of this workspace.
            </span>
            <Button size="sm" loading={posting} disabled={!online || !draft.body.trim()} onClick={post}>
              Post comment
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
