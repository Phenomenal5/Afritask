// Join conditional class names. A tiny stand-in for clsx so we don't add a dependency
// for one line: falsy values are dropped, everything else is joined with a space.
export function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}
