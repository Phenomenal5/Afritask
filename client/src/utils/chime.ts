// The notification sound: public/sounds/notification.wav (made by
// scripts/generate-notification-sound.mjs — replace the file to change the sound).
// NOTE: browsers only allow audio after the person has interacted with the page; before
// that, play() is refused and the sound is skipped (the badge still updates).

const SOUND_URL = "/sounds/notification.wav";
// How long a tab holds the "I'm playing this one" lock, so other tabs skip it.
const LOCK_HOLD_MS = 1_500;

let preloaded: HTMLAudioElement | null = null;

// Load the file once, early, so the first notification plays without a delay.
export const preloadChime = () => {
  if (typeof window === "undefined" || preloaded) return;
  preloaded = new Audio(SOUND_URL);
  preloaded.preload = "auto";
  preloaded.load();
};

const playNow = () => {
  try {
    preloadChime();
    // A fresh copy each time, so two notifications close together both sound.
    const sound = (preloaded!.cloneNode() as HTMLAudioElement);
    sound.volume = 0.6;
    void sound.play().catch(() => {
      // Autoplay blocked (no interaction yet) or audio unavailable — stay silent.
    });
  } catch {
    // Audio unsupported — notifications still show visually.
  }
};

// Every notification makes a sound — once, even with several Afritask tabs open: the tab
// that takes the lock for this notification plays it, the others skip.
export const playChime = (notificationId?: string) => {
  if (!notificationId || typeof navigator === "undefined" || !("locks" in navigator)) return playNow();
  void navigator.locks
    .request(`afritask-chime-${notificationId}`, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      playNow();
      // Keep holding it long enough that slower tabs find it taken.
      await new Promise((resolve) => setTimeout(resolve, LOCK_HOLD_MS));
    })
    .catch(playNow);
};
