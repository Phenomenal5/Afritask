"use client";

// useConfirm(): an accessible replacement for window.confirm. Destructive confirmations
// spell out the consequence ("Its 3 subtasks are deleted too") and default focus to the
// SAFE choice, so a stray Enter never deletes anything.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import Dialog from "./Dialog";
import Button from "./Button";

export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<Confirm>(
    (nextOptions) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setOptions(nextOptions);
      }),
    []
  );

  const settle = (confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOptions(null);
  };

  const isDanger = options?.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!options}
        onClose={() => settle(false)}
        role="alertdialog"
        size="sm"
        initialFocusRef={cancelRef}
        title={
          <span className="flex items-center gap-2.5">
            {isDanger && <TriangleAlert size={20} aria-hidden="true" className="shrink-0 text-brick" />}
            {options?.title}
          </span>
        }
        footer={
          <>
            <Button ref={cancelRef} variant="secondary" onClick={() => settle(false)}>
              {options?.cancelLabel ?? "Cancel"}
            </Button>
            <Button variant={isDanger ? "danger-solid" : "primary"} onClick={() => settle(true)}>
              {options?.confirmLabel}
            </Button>
          </>
        }
      >
        <div className="text-[15px] leading-relaxed text-ink">{options?.body}</div>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used within a ConfirmProvider");
  return context;
}
