// A newsletter post's plain-text body: blank lines start a new paragraph, single line
// breaks are kept. Rendered as text (never HTML), so nothing in a post can inject markup.
import { cx } from "@/lib/cx";

export const paragraphsOf = (body: string) =>
  body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

export const formatPublishedDate = (isoDate: string) =>
  new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(new Date(isoDate));

export default function PostBody({ body, className }: { body: string; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-4 text-[15.5px] leading-7 text-ink", className)}>
      {paragraphsOf(body).map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
