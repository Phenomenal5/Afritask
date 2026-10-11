"use client";

// News: the Afritask newsletter, in the app. Newest first; each post opens in place.
// Subscribing by email is a separate choice (Settings → Profile).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Newspaper } from "lucide-react";
import { listNewsletterPosts } from "@/lib/services/newsletterService";
import { describeFailure, type Failure } from "@/lib/errors";
import PageHeader from "@/components/layout/PageHeader";
import PostBody, { formatPublishedDate } from "@/components/newsletter/PostBody";
import Button from "@/components/ui/Button";
import { EmptyState, FailurePanel, SkeletonRows } from "@/components/ui/States";
import { cx } from "@/lib/cx";
import type { NewsletterPost } from "@/types/models";

export default function NewsPage() {
  const [posts, setPosts] = useState<NewsletterPost[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);

  const loadPage = useCallback(async (pageNumber: number) => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await listNewsletterPosts(pageNumber);
      const { items, pagination } = response.data.data;
      setPosts((current) => (pageNumber === 1 ? items : [...current, ...items]));
      setPage(pagination.page);
      setTotalPages(pagination.totalPages);
      if (pageNumber === 1 && items[0]) setOpenPostId(items[0].id);
    } catch (error) {
      setFailure(describeFailure(error, "We couldn't load the news."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  return (
    <>
      <title>News · Afritask</title>
      <PageHeader
        eyebrow="Afritask"
        title="News"
        description={
          <>
            What&apos;s new in Afritask, and tips to get more from it. Want these by email?{" "}
            <Link href="/settings" className="font-medium text-forest underline underline-offset-4">
              Turn on the newsletter
            </Link>
            .
          </>
        }
      />

      {failure && posts.length === 0 ? (
        <FailurePanel failure={failure} onRetry={() => loadPage(1)} />
      ) : loading && posts.length === 0 ? (
        <SkeletonRows rows={3} label="Loading news" />
      ) : posts.length === 0 ? (
        <EmptyState icon={Newspaper} title="No news yet" body="When we publish something, it shows up here first." />
      ) : (
        <ol className="flex max-w-3xl flex-col gap-3">
          {posts.map((post) => {
            const open = openPostId === post.id;
            return (
              <li key={post.id} className="rounded-[14px] border border-line bg-surface">
                <button
                  type="button"
                  onClick={() => setOpenPostId(open ? null : post.id)}
                  aria-expanded={open}
                  className="flex w-full items-start gap-4 rounded-[14px] p-5 text-left hover:bg-surface-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-muted">{formatPublishedDate(post.publishedAt)}</span>
                    <span className="mt-1 block text-[18px] font-semibold leading-snug text-ink">{post.title}</span>
                    {post.summary && !open && <span className="mt-1.5 block text-[14.5px] leading-relaxed text-muted">{post.summary}</span>}
                  </span>
                  <ChevronDown size={20} aria-hidden="true" className={cx("mt-1 shrink-0 text-muted transition-transform", open && "rotate-180")} />
                </button>
                {open && (
                  <div className="border-t border-line px-5 pb-6 pt-5">
                    {post.summary && <p className="mb-4 text-[16px] font-medium leading-relaxed text-ink">{post.summary}</p>}
                    <PostBody body={post.body} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {page < totalPages && posts.length > 0 && (
        <div className="mt-5">
          <Button variant="secondary" loading={loading} onClick={() => loadPage(page + 1)}>
            Show older posts
          </Button>
        </div>
      )}
    </>
  );
}
