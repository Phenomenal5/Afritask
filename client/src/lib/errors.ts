// Turns an axios failure into a sentence that says what happened and what to do next.
// The server's own message wins when it sent one — it already explains the rule
// ("You can only edit tasks you created or are assigned to").
import { isAxiosError } from "axios";

export type FailureKind = "offline" | "network" | "session" | "forbidden" | "missing" | "conflict" | "invalid" | "server";

export interface Failure {
  kind: FailureKind;
  status: number | null;
  message: string;
}

export function describeFailure(error: unknown, fallback = "Something went wrong. Please try again."): Failure {
  if (!isAxiosError(error)) return { kind: "server", status: null, message: fallback };

  const status = error.response?.status ?? null;
  const serverMessage: string | undefined = error.response?.data?.message;

  // No response at all: the request never reached Afritask.
  if (!error.response) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    return offline
      ? { kind: "offline", status, message: "You're offline. Reconnect and try again — nothing was saved." }
      : { kind: "network", status, message: "Couldn't reach Afritask. Check your connection and try again." };
  }
  // NOTE: the server's message wins on 401 too — a wrong password on sign-in is a 401
  // ("Incorrect email or password"), and must not read as "your session has ended".
  if (status === 401) return { kind: "session", status, message: serverMessage || "Your session has ended. Sign in again to continue." };
  if (status === 403) return { kind: "forbidden", status, message: serverMessage || "You don't have permission to do that here." };
  if (status === 404) return { kind: "missing", status, message: serverMessage || "That item no longer exists, or you can't open it." };
  if (status === 409) return { kind: "conflict", status, message: serverMessage || "This changed since you opened it. Refresh and try again." };
  if (status && status >= 400 && status < 500) return { kind: "invalid", status, message: serverMessage || fallback };
  return { kind: "server", status, message: "Afritask had a problem on its side. Wait a moment and try again." };
}

export const failureMessage = (error: unknown, fallback?: string) => describeFailure(error, fallback).message;
