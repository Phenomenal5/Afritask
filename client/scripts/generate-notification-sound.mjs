// Renders public/sounds/notification.wav — the notification chime: two soft bell tones
// (E5 then B5), each a few harmonics with a quick attack and a natural ring-out.
// Run after changing the sound:
//   node scripts/generate-notification-sound.mjs
// The .wav is committed, so builds don't depend on this script. To use a different sound,
// replace that file (keep the name) — nothing else needs to change.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 22_050; // plenty for a chime, and half the file size of CD quality
const DURATION_SECONDS = 0.9;
const PEAK = 0.7; // headroom below full scale, so it never clips

// Each note: when it starts, its pitch, and how loud it is relative to the other.
const NOTES = [
  { startSeconds: 0, frequency: 659.25, level: 0.9 }, // E5
  { startSeconds: 0.13, frequency: 987.77, level: 1 }, // B5
];

// Bell-like timbre: the fundamental plus slightly inharmonic overtones that die away faster.
const PARTIALS = [
  { ratio: 1, level: 1, decayPerSecond: 5 },
  { ratio: 2.01, level: 0.35, decayPerSecond: 8 },
  { ratio: 3.02, level: 0.12, decayPerSecond: 12 },
  { ratio: 4.17, level: 0.05, decayPerSecond: 16 },
];
const ATTACK_SECONDS = 0.006; // a soft click-free start

const sampleCount = Math.round(SAMPLE_RATE * DURATION_SECONDS);
const samples = new Float32Array(sampleCount);

for (const note of NOTES) {
  const firstSample = Math.round(note.startSeconds * SAMPLE_RATE);
  for (let index = firstSample; index < sampleCount; index += 1) {
    const time = (index - firstSample) / SAMPLE_RATE;
    const attack = Math.min(1, time / ATTACK_SECONDS);
    let value = 0;
    for (const partial of PARTIALS) {
      value += partial.level * Math.exp(-partial.decayPerSecond * time) * Math.sin(2 * Math.PI * note.frequency * partial.ratio * time);
    }
    samples[index] += note.level * attack * value;
  }
}

// Fade the last 50 ms to silence so the file never ends on a click.
const fadeSamples = Math.round(0.05 * SAMPLE_RATE);
for (let offset = 0; offset < fadeSamples; offset += 1) {
  samples[sampleCount - 1 - offset] *= offset / fadeSamples;
}

// Normalise to PEAK.
const loudest = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
const gain = PEAK / loudest;

// ─── 16-bit mono PCM WAV ─────────────────────
const bytesPerSample = 2;
const dataBytes = sampleCount * bytesPerSample;
const wav = Buffer.alloc(44 + dataBytes);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + dataBytes, 4);
wav.write("WAVE", 8);
wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16); // fmt chunk size
wav.writeUInt16LE(1, 20); // PCM
wav.writeUInt16LE(1, 22); // mono
wav.writeUInt32LE(SAMPLE_RATE, 24);
wav.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28); // byte rate
wav.writeUInt16LE(bytesPerSample, 32); // block align
wav.writeUInt16LE(16, 34); // bits per sample
wav.write("data", 36);
wav.writeUInt32LE(dataBytes, 40);
samples.forEach((value, index) => {
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value * gain)) * 32767), 44 + index * bytesPerSample);
});

const soundsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "sounds");
await mkdir(soundsDir, { recursive: true });
await writeFile(path.join(soundsDir, "notification.wav"), wav);
console.log(`Wrote public/sounds/notification.wav (${(wav.length / 1024).toFixed(1)} KB)`);
