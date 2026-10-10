// Avatar: the person's photo, or their initials on a consistent tint chosen from their name.
import Image from "next/image";
import { getPhotoUrl } from "@/utils/imageURL";

const ACCENTS = [
  { background: "var(--lime)", color: "var(--forest-deep)" },
  { background: "var(--harvest-tint)", color: "var(--gold)" },
  { background: "var(--clay-tint)", color: "var(--clay)" },
  { background: "var(--sky-tint)", color: "var(--sky)" },
];

const initialsOf = (name?: string | null) => {
  const nameParts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (nameParts.length === 0) return "?";
  if (nameParts.length === 1) return nameParts[0][0].toUpperCase();
  return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
};

const accentOf = (name?: string | null) => {
  const characterSum = (name || "").split("").reduce((total, character) => total + character.charCodeAt(0), 0);
  return ACCENTS[characterSum % ACCENTS.length];
};

interface AvatarProps {
  user: { name?: string | null; photo?: string | null } | null | undefined;
  size?: number;
  // Decorative when the name is already printed next to it.
  decorative?: boolean;
}

export default function Avatar({ user, size = 32, decorative = true }: AvatarProps) {
  const photoUrl = getPhotoUrl(user?.photo);
  const altText = decorative ? "" : user?.name || "Unknown person";

  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={altText}
        width={size}
        height={size}
        unoptimized
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : altText}
      aria-hidden={decorative || undefined}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), ...accentOf(user?.name) }}
    >
      {initialsOf(user?.name)}
    </span>
  );
}
