"use client";

// ActivityFeed: read-only history (SRS SR09) — who did what, when, with before → after.
// `loadPage({ before })` fetches one page; the feed handles "Show older".
// `reloadKey` refetches from the top (e.g. after the parent view saved a change).
import { useCallback, useEffect, useState } from "react";
import { describeAction, describeChanges, timeAgo } from "@/utils/activity";
import Avatar from "./Avatar";
import Button from "./Button";

export default function ActivityFeed({ loadPage, reloadKey, emptyMessage = "No activity yet." }) {
  const [entries, setEntries] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loadPage({});
      setEntries(res.data.data.entries);
      setNextCursor(res.data.data.nextCursor);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage, reloadKey]);

  const loadOlder = async () => {
    setLoading(true);
    try {
      const res = await loadPage({ before: nextCursor });
      setEntries((previous) => [...previous, ...res.data.data.entries]);
      setNextCursor(res.data.data.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (failed && entries.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        Couldn&apos;t load the history.
      </p>
    );
  }
  if (!loading && entries.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <ol className="flex flex-col">
        {entries.map((entry) => (
          <li key={entry.id} className="flex gap-3 py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <Avatar user={entry.actor} size={28} />
            <div className="flex-1 min-w-0">
              <p className="text-sm" style={{ color: "var(--ink)" }}>
                <span className="font-medium">{entry.actor.name}</span> {describeAction(entry)}
                <span className="text-xs ml-2" style={{ color: "var(--ink-soft)" }} title={new Date(entry.createdAt).toLocaleString()}>
                  {timeAgo(entry.createdAt)}
                </span>
              </p>
              {describeChanges(entry).map((change) => (
                <p key={change.field} className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                  {change.field}:{" "}
                  {change.from !== null && (
                    <>
                      <span style={{ textDecoration: "line-through" }}>{change.from}</span> →{" "}
                    </>
                  )}
                  <span style={{ color: "var(--ink)" }}>{change.to}</span>
                </p>
              ))}
            </div>
          </li>
        ))}
      </ol>

      {loading && <div className="h-8 rounded-lg animate-pulse mt-2" style={{ background: "var(--line-soft)" }} />}
      {!loading && nextCursor && (
        <div className="mt-2">
          <Button size="sm" variant="secondary" onClick={loadOlder}>
            Show older
          </Button>
        </div>
      )}
    </div>
  );
}
