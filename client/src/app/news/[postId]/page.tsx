"use client";

// One newsletter post, readable by anyone — the "Read on Afritask" button in newsletter
// emails lands here, and subscribers without an account can't open the in-app News page.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getNewsletterPost } from "@/lib/services/newsletterService";
import { describeFailure, type Failure } from "@/lib/errors";
import ThemeToggle from "@/components/layout/ThemeToggle";
import PostBody, { formatPublishedDate } from "@/components/newsletter/PostBody";
import Logo from "@/components/ui/Logo";
import { FailurePanel, SkeletonRows } from "@/components/ui/States";
import type { NewsletterPost } from "@/types/models";

export default function NewsletterPostPage() {
  const { postId } = useParams<{ postId: string }>();
  const [post, setPost] = useState<NewsletterPost | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    getNewsletterPost(postId)
      .then((res) => setPost(res.data.data.post))
      .catch((error) => setFailure(describeFailure(error, "We couldn't load this post.")));
  }, [postId]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="rounded-[8px]" aria-label="Afritask home">
            <Logo />
          </Link>
          <ThemeToggle className="h-11 rounded-[10px] px-3 text-[14px] text-muted hover:bg-surface-muted hover:text-ink" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <title>{post ? `${post.title} · Afritask` : "News · Afritask"}</title>
        {failure ? (
          <FailurePanel failure={failure} />
        ) : !post ? (
          <SkeletonRows rows={4} label="Loading post" />
        ) : (
          <article>
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-forest">Afritask newsletter</p>
            <h1 className="mt-2 font-display text-[34px] font-semibold leading-tight text-ink">{post.title}</h1>
            <p className="mt-2 text-[14px] text-muted">{formatPublishedDate(post.publishedAt)}</p>
            {post.summary && <p className="mt-6 text-[17px] font-medium leading-relaxed text-ink">{post.summary}</p>}
            <PostBody body={post.body} className="mt-6" />
          </article>
        )}
      </main>
    </div>
  );
}
