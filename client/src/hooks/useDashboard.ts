"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getWorkspaceDashboard } from "@/lib/services/dashboardService";
import { describeFailure, type Failure } from "@/lib/errors";
import { useTaskActions } from "@/context/TaskContext";
import type { DashboardCounts } from "@/types/models";

// The Overview's figures from the server. Refreshes quietly after any task change made in
// this tab and when the tab regains focus; answers for a workspace you've since switched
// away from are discarded.
export function useDashboard(workspaceId: string | null | undefined) {
  const { subscribe } = useTaskActions();
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const latestRequestRef = useRef(0);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    const requestNumber = ++latestRequestRef.current;
    try {
      const response = await getWorkspaceDashboard(workspaceId);
      if (requestNumber !== latestRequestRef.current) return;
      setCounts(response.data.data);
      setFailure(null);
    } catch (error) {
      if (requestNumber !== latestRequestRef.current) return;
      setFailure(describeFailure(error, "Couldn't load your overview. Try again."));
    }
  }, [workspaceId]);

  useEffect(() => {
    setCounts(null);
    load();
  }, [load]);

  useEffect(() => subscribe(() => load()), [subscribe, load]);

  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => document.removeEventListener("visibilitychange", refreshOnReturn);
  }, [load]);

  return { counts, failure, reload: load };
}
