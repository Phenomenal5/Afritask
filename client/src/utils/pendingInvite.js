// Remembers an invitation link across sign-up, email verification and sign-in.
// NOTE: the verification email opens in a NEW tab, so in-memory state or a ?next= param
// would be lost on the way (PRD J3: "invitation context must survive registration and
// verification"). localStorage survives it. It holds only the link token, which grants
// nothing by itself — the server still requires the invited, verified account to accept.
const PENDING_INVITE_KEY = "afritask_pending_invite";

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

// Where to land after any successful sign-in: back to a pending invitation if there is one.
export const postSignInPath = () => {
  const pendingToken = readPendingInvite();
  return pendingToken ? `/invite/${pendingToken}` : "/dashboard";
};
