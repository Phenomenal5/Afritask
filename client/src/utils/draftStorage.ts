// Unsaved form input kept per browser tab, so closing a form by accident, a failed save
// or a session expiry doesn't throw away what someone typed. sessionStorage: it never
// outlives the tab and is never shared with another account on the same device for long.
export function readDraft<Draft>(key: string): Draft | null {
  try {
    const stored = sessionStorage.getItem(key);
    return stored ? (JSON.parse(stored) as Draft) : null;
  } catch {
    return null;
  }
}

export function writeDraft<Draft>(key: string, draft: Draft): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage full or blocked — the form still works, just without the safety net.
  }
}

export function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // nothing to clear
  }
}
