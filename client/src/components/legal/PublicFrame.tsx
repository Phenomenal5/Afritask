// Header and footer for the public pages people read before (or without) signing in:
// Terms, Privacy, Cookies and Contact. One place, so the pages always link to each other.
import Link from "next/link";
import ThemeToggle from "@/components/layout/ThemeToggle";
import Logo from "@/components/ui/Logo";

export const PUBLIC_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/contact", label: "Contact" },
] as const;

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/" className="rounded-[8px]" aria-label="Afritask home">
          <Logo />
        </Link>
        <ThemeToggle className="h-11 rounded-[10px] px-3 text-[14px] text-muted hover:bg-surface-muted hover:text-ink" />
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="relative border-t border-line">
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-[13px] text-muted">
        <span>&copy; {new Date().getFullYear()} Afritask</span>
        <nav aria-label="About Afritask" className="flex flex-wrap gap-x-5 gap-y-2">
          {PUBLIC_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-ink hover:underline underline-offset-4">
              {link.label}
            </Link>
          ))}
          <Link href="/" className="font-medium text-forest hover:underline underline-offset-4">
            Back to Afritask
          </Link>
        </nav>
      </div>
    </footer>
  );
}
