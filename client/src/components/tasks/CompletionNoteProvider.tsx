"use client";

// useCompletionNote(): asks "What was done?" before a task is marked completed. The server
// requires the note for top-level tasks (subtasks stay one-click). The open-subtasks warning
// lives in the same dialog, so completing never takes two dialogs.
import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";

const NOTE_MAX_LENGTH = 2000;

interface CompletionRequest {
  taskTitle: string;
  openSubtasks: number;
  totalSubtasks: number;
}

// Resolves to the note, or null if they cancelled.
type AskCompletionNote = (request: CompletionRequest) => Promise<string | null>;

const CompletionNoteContext = createContext<AskCompletionNote | null>(null);

export function CompletionNoteProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<CompletionRequest | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolverRef = useRef<((note: string | null) => void) | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const ask = useCallback<AskCompletionNote>(
    (nextRequest) =>
      new Promise<string | null>((resolve) => {
        resolverRef.current?.(null);
        resolverRef.current = resolve;
        setNote("");
        setError(null);
        setRequest(nextRequest);
      }),
    []
  );

  const settle = (result: string | null) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setRequest(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) {
      setError("Write a line or two about what was done.");
      noteRef.current?.focus();
      return;
    }
    settle(trimmed);
  };

  return (
    <CompletionNoteContext.Provider value={ask}>
      {children}
      <Dialog
        open={!!request}
        onClose={() => settle(null)}
        size="sm"
        initialFocusRef={noteRef}
        title={
          <span className="flex items-center gap-2.5">
            <CircleCheck size={20} aria-hidden="true" className="shrink-0 text-done" />
            Complete “{request?.taskTitle}”
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(null)}>
              Not yet
            </Button>
            <Button type="submit" form="completion-note-form">
              Mark completed
            </Button>
          </>
        }
      >
        <form id="completion-note-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
          <TextAreaField
            ref={noteRef}
            label="What was done?"
            hint="A short record for the team and your monthly summary — e.g. “Sent the signed contract to Ada.”"
            rows={4}
            maxLength={NOTE_MAX_LENGTH}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              // Ctrl/⌘+Enter submits, like the comment box.
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) handleSubmit(event);
            }}
            error={error}
          />
          {request && request.openSubtasks > 0 && (
            <Notice tone="warning">
              {request.openSubtasks} of its {request.totalSubtasks} subtasks {request.openSubtasks === 1 ? "is" : "are"} not completed. Completing the parent leaves{" "}
              {request.openSubtasks === 1 ? "it" : "them"} open and assigned as they are.
            </Notice>
          )}
        </form>
      </Dialog>
    </CompletionNoteContext.Provider>
  );
}

export function useCompletionNote(): AskCompletionNote {
  const context = useContext(CompletionNoteContext);
  if (!context) throw new Error("useCompletionNote must be used within a CompletionNoteProvider");
  return context;
}
