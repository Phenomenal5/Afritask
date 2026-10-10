"use client";

// ActivityFeed: read-only history (SRS SR09) — who did what, when, with before → after.
// `loadPage({ before })` fetches one page; the feed handles "Show older".
// `reloadKey` refetches from the top (e.g. after the parent view saved a change).
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, History, RefreshCw } from "lucide-react";
import { describeAction, describeChanges, timeAgo } from "@/utils/activity";
import { describeFailure, type Failure } from "@/lib/errors";
import { useNow } from "@/hooks/useNow";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import type { ActivityEntry, ActivityPage } from "@/types/models";
import type { AxiosResponse } from "axios";

type PageLoader = (page: { before?: string }) => Promise<AxiosResponse<{ data: ActivityPage }>>;

interface ActivityFeedProps {
  loadPage: PageLoader;
  reloadKey?: string | number;
  emptyTitle?: string;
  emptyMessage?: string;
  // Show at most this many and hide "Show older" (Overview's short feed).
  limit?: number;
}

export default function ActivityFeed({ loadPage, reloadKey, emptyTitle = "Nothing has happened yet", emptyMessage = "Changes to tasks, projects and members appear here as people work.", limit }: ActivityFeedProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<Failure | null>(null);
  const now = useNow();
  const requestRef = useRef(0);

  const loadFirstPage = useCallback(async () => {
    const requestNumber = ++requestRef.current;
    setLoading(true);
    try {
      const res = await loadPage({});
      if (requestNumber !== requestRef.current) return;
      setEntries(res.data.data.entries);
      setNextCursor(res.data.data.nextCursor);
      setFailure(null);
    } catch (error) {
      if (requestNumber === requestRef.current) setFailure(describeFailure(error, "Couldn't load the history."));
    } finally {
      if (requestNumber === requestRef.current) setLoading(false);
    }
  }, [loadPage]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage, reloadKey]);

  const loadOlder = async () => {
    if (!nextCursor) return;
    setLoading(true);
    try {
      const res = await loadPage({ before: nextCursor });
      setEntries((previous) => [...previous, ...res.data.data.entries]);
      setNextCursor(res.data.data.nextCursor);
    } catch (error) {
      setFailure(describeFailure(error, "Couldn't load older history."));
    } finally {
      setLoading(false);
    }
  };

  if (failure && entries.length === 0) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 py-2 text-[14px] text-muted">
        <p>{failure.message}</p>
        <Button size="sm" variant="secondary" icon={<RefreshCw size={15} aria-hidden="true" />} onClick={loadFirstPage}>
          Try again
        </Button>
      </div>
    );
  }

  if (loading && entries.length === 0) {
    return (
      <div role="status" aria-label="Loading activity" className="flex flex-col gap-4 py-1">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex gap-3">
            <span className="skeleton h-8 w-8 rounded-full" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="skeleton h-3.5 w-3/4" />
              <span className="skeleton h-3 w-1/3" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) return <EmptyState compact icon={History} title={emptyTitle} body={emptyMessage} />;

  const visibleEntries = limit ? entries.slice(0, limit) : entries;

  return (
    <div>
      <ol className="flex flex-col">
        {visibleEntries.map((entry) => (
          <li key={entry.id} className="flex gap-3 border-t border-line-soft py-3 first:border-t-0 first:pt-0">
            <Avatar user={entry.actor} size={32} />
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] leading-snug text-ink">
                <span className="font-semibold">{entry.actor.name}</span> {describeAction(entry)}
              </p>
              <p className="mt-0.5 text-[13px] text-muted">
                <time dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString()}>
                  {now ? timeAgo(entry.createdAt, now) : ""}
                </time>
              </p>
              {describeChanges(entry).length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {describeChanges(entry).map((change: { field: string; from: string | null; to: string }) => (
                    <li key={change.field} className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                      <span className="font-medium text-ink">{change.field}:</span>
                      {change.from !== null && (
                        <>
                          <span className="line-through decoration-muted/60">{change.from}</span>
                          <ArrowRight size={13} aria-label="changed to" />
                        </>
                      )}
                      <span className="text-ink">{change.to}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
      {!limit && nextCursor && (
        <div className="mt-3">
          <Button size="sm" variant="secondary" loading={loading} onClick={loadOlder}>
            Show older activity
          </Button>
        </div>
      )}
      {failure && entries.length > 0 && (
        <p role="alert" className="mt-2 text-[13px] text-brick">
          {failure.message}
        </p>
      )}
    </div>
  );
}
