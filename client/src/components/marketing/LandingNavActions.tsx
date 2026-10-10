"use client";

// The landing header's actions depend on the session: signed-in visitors get a way back
// to their workspace instead of "Sign in". Shows the signed-out version until known.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ButtonLink } from "@/components/ui/Button";

export default function LandingNavActions() {
  const { isAuthenticated, authLoading } = useAuth();

  if (!authLoading && isAuthenticated) {
    return (
      <ButtonLink href="/dashboard" size="md" icon={<ArrowRight size={17} aria-hidden="true" />}>
        Open your workspace
      </ButtonLink>
    );
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Link href="/login" className="inline-flex h-11 items-center rounded-[10px] px-3 text-[15px] font-medium text-ink hover:bg-surface-muted">
        Sign in
      </Link>
      <ButtonLink href="/signup" size="md">
        Get started
      </ButtonLink>
    </div>
  );
}
