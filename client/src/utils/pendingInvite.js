// Remembers an invitation link across sign-up, email verification and sign-in.
// NOTE: the verification email opens in a NEW tab, so in-memory state or a ?next= param
// would be lost on the way (PRD J3: "invitation context must survive registration and
// verification"). localStorage survives it. It holds only the link token, which grants
// nothing by itself — the server still requires the invited, verified account to accept.
const PENDING_INVITE_KEY = "afritask_pending_invite";

// Where a session-expired user was, so signing back in returns them there. Same-tab only,
// so sessionStorage is enough.
const RETURN_PATH_KEY = "afritask_return_path";

export const savePendingInvite = (token) => {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, token);
  } catch {
    // Storage blocked: the user can still reopen the emailed link after signing in.
  }
};

export const readPendingInvite = () => {
  try {
    return localStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
};

export const clearPendingInvite = () => {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // nothing to clear
  }
};

// Only same-site paths: "/tasks?view=board" yes; "//evil.example" or "https://…" no.
const isSafeReturnPath = (path) => typeof path === "string" && path.startsWith("/") && !path.startsWith("//");

export const saveReturnPath = (path) => {
  if (!isSafeReturnPath(path)) return;
  try {
    sessionStorage.setItem(RETURN_PATH_KEY, path);
  } catch {
    // Storage blocked: the user lands on the overview instead.
  }
};

const takeReturnPath = () => {
  try {
    const path = sessionStorage.getItem(RETURN_PATH_KEY);
    sessionStorage.removeItem(RETURN_PATH_KEY);
    return isSafeReturnPath(path) ? path : null;
  } catch {
    return null;
  }
};

// Where to land after any successful sign-in: a pending invitation first, then the page
// the session expired on, then the overview.
export const postSignInPath = () => {
  const pendingToken = readPendingInvite();
  if (pendingToken) return `/invite/${pendingToken}`;
  return takeReturnPath() || "/dashboard";
};
