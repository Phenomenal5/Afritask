"use client";

// Navbar gives the app shell its brand, section links, theme toggle, and account menu.
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Avatar from "./Avatar";
import ThemeToggle from "./ThemeToggle";

// Render top-level navigation and account controls for authenticated users.
export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the account menu when the user clicks anywhere outside it.
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const navLink = (href, label) => (
    <Link
      href={href}
      className="text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
      style={{
        color: pathname === href ? "var(--ink)" : "var(--ink-soft)",
        background: pathname === href ? "var(--moss-light)" : "transparent",
      }}
    >
      {label}
    </Link>
  );

  return (
    <header
      className="sticky top-0 z-20 backdrop-blur-sm"
      style={{
        background: "color-mix(in srgb, var(--paper) 86%, transparent)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="font-display text-xl italic" style={{ color: "var(--ink)" }}>
            Afritask
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {navLink("/dashboard", "Tasks")}
            {navLink("/profile", "Profile")}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 cursor-pointer rounded-full"
            >
              <Avatar user={user} size={36} />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 mt-2 w-52 rounded-xl overflow-hidden py-1 shadow-lg"
                style={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}
              >
                <div className="px-3.5 py-2.5" style={{ borderBottom: "1px solid var(--line-soft)" }}>
                  <p className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                    {user?.name}
                  </p>
                  <p className="text-xs truncate" style={{ color: "var(--ink-soft)" }}>
                    {user?.email}
                  </p>
                </div>
                <Link
                  href="/profile"
                  className="block px-3.5 py-2 text-sm hover:bg-[var(--line-soft)] sm:hidden"
                  style={{ color: "var(--ink)" }}
                  onClick={() => setMenuOpen(false)}
                >
                  Profile
                </Link>
                <button
                  onClick={logout}
                  className="block w-full text-left px-3.5 py-2 text-sm hover:bg-[var(--line-soft)] cursor-pointer"
                  style={{ color: "var(--error)" }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
