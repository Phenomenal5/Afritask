// Avatar renders either a profile photo or a deterministic initials fallback.
import { getPhotoUrl } from "@/utils/imageURL.js";
import Image from "next/image";

// Turn a full name into initials for the fallback avatar state.
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic accent pick from the moss/clay/gold/stone palette so each
// user gets a consistent, pleasant fallback color based on their name.
function getAccent(name) {
  const palette = [
    { bg: "var(--moss-light)", fg: "var(--moss-dark)" },
    { bg: "var(--clay-tint)", fg: "var(--clay)" },
    { bg: "var(--gold-tint)", fg: "var(--gold)" },
    { bg: "var(--stone-tint)", fg: "var(--ink-soft)" },
  ];
  if (!name) return palette[0];
  const sum = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

// Show the user's uploaded photo when available, otherwise a branded initials badge.
export default function Avatar({ user, size = 36 }) {
  const accent = getAccent(user?.name);

  if (user?.photo) {
    return (
      <Image
        src={getPhotoUrl(user.photo)}
        alt={user.name}
        width={size}
        height={size}
        unoptimized
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center font-medium flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: accent.bg,
        color: accent.fg,
        fontSize: size * 0.38,
      }}
    >
      {getInitials(user?.name)}
    </div>
  );
}
