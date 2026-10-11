// A short two-note chime for new notifications, made with Web Audio — no sound file to
// download or cache. Browsers only allow audio after the person has interacted with the
// page; before that, the chime is silently skipped (the badge still updates).

let audioContext: AudioContext | null = null;

export const playChime = () => {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ??= new AudioContextClass();
    if (audioContext.state === "suspended") void audioContext.resume();

    const startAt = audioContext.currentTime;
    // Two soft sine notes (E5 then A5), each fading out — noticeable, not alarming.
    [659.25, 880].forEach((frequency, index) => {
      const oscillator = audioContext!.createOscillator();
      const gain = audioContext!.createGain();
      const noteStart = startAt + index * 0.14;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.18, noteStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.35);
      oscillator.connect(gain).connect(audioContext!.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.4);
    });
  } catch {
    // Audio unavailable or blocked — notifications still show visually.
  }
};
