"use client";

// The page behind a newsletter email link (confirm / unsubscribe). It asks for one click
// instead of acting on load: mail scanners open links before people do, and a scanner
// mustn't be able to confirm or unsubscribe anyone.
import { useEffect, useState } from "react";
import Link from "next/link";
import AuthLayout from "@/components/auth/AuthLayout";
import FormAlert from "@/components/auth/FormAlert";
import Button from "@/components/ui/Button";
import { failureMessage } from "@/lib/errors";

interface NewsletterLinkActionProps {
  title: string;
  description: string;
  actionLabel: string;
  // Query parameters the link must carry; the page shows an error without them.
  requiredParams: string[];
  perform: (params: Record<string, string>) => Promise<{ data: { message: string } }>;
}

export default function NewsletterLinkAction({ title, description, actionLabel, requiredParams, perform }: NewsletterLinkActionProps) {
  const [params, setParams] = useState<Record<string, string> | null>(null);
  const [linkBroken, setLinkBroken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const found = Object.fromEntries(requiredParams.map((name) => [name, search.get(name) ?? ""]));
    // NOTE: depends on the URL only — set once after mount, so the server render and the
    // first client render agree.
    if (requiredParams.some((name) => !found[name])) setLinkBroken(true);
    else setParams(found);
  }, [requiredParams]);

  const handleClick = async () => {
    if (!params) return;
    setSubmitting(true);
    try {
      const response = await perform(params);
      setResult({ tone: "success", text: response.data.message });
    } catch (error) {
      setResult({ tone: "error", text: failureMessage(error, "That didn't work. Try the link again.") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout eyebrow="Afritask newsletter" title={title} description={result?.tone === "success" ? undefined : description}>
      <title>{`${title} · Afritask`}</title>
      <div className="flex flex-col gap-4">
        {linkBroken && <FormAlert>This link is incomplete. Open it again from the email, or manage the newsletter in Settings → Profile.</FormAlert>}
        {result && <FormAlert tone={result.tone}>{result.text}</FormAlert>}
        {result?.tone !== "success" && !linkBroken && (
          <Button size="lg" full loading={submitting} disabled={!params} onClick={handleClick}>
            {actionLabel}
          </Button>
        )}
        <Link href="/" className="self-center text-[14px] font-medium text-forest underline-offset-4 hover:underline">
          Go to Afritask
        </Link>
      </div>
    </AuthLayout>
  );
}
