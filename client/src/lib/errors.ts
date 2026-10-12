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

export function describeFailure(error: unknown, fallback = "That didn't work. Try again in a moment."): Failure {
  if (!isAxiosError(error)) return { kind: "server", status: null, message: fallback };

  const status = error.response?.status ?? null;
  const serverMessage: string | undefined = error.response?.data?.message;

  // No response at all: the request never reached Afritask.
  if (!error.response) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    return offline
      ? { kind: "offline", status, message: "You're offline. Reconnect and try again." }
      : { kind: "network", status, message: "Couldn't reach Afritask. Check your connection and try again." };
  }
  // NOTE: the server's message wins on 401 too — a wrong password on sign-in is a 401
  // ("Incorrect email or password"), and must not read as "your session has ended".
  if (status === 401) return { kind: "session", status, message: serverMessage || "You've been signed out. Sign in again to continue." };
  if (status === 403) return { kind: "forbidden", status, message: serverMessage || "You don't have access to do that. Ask a workspace Owner or Admin." };
  if (status === 404) return { kind: "missing", status, message: serverMessage || "We couldn't find that. It may have been deleted. Refresh to see the latest." };
  if (status === 409) return { kind: "conflict", status, message: serverMessage || "This changed since you opened it. Refresh and try again." };
  if (status && status >= 400 && status < 500) return { kind: "invalid", status, message: serverMessage || fallback };
  // NOTE: 502/503 carry the server's own sentence (e.g. "We couldn't send your verification
  // email"); it used to be hidden behind the generic text. A plain 500 never says anything
  // useful to a person, so it keeps the generic text.
  if ((status === 502 || status === 503) && serverMessage) return { kind: "server", status, message: serverMessage };
  return { kind: "server", status, message: "Afritask had a problem on its side. Wait a moment and try again." };
}

export const failureMessage = (error: unknown, fallback?: string) => describeFailure(error, fallback).message;
