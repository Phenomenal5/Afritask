"use client";

import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { detectTimezone } from "@/utils/timezones";
import type { Viewer } from "@/utils/permissions";

// Who is looking, in the terms the permission helpers need, plus their timezone.
export function useViewer(): Viewer & { timezone: string } {
  const { user } = useAuth();
  const { role, myMembership } = useWorkspaceResources();
  return useMemo(
    () => ({
      userId: user?.id ?? null,
      role,
      membership: myMembership,
      timezone: user?.timezone || detectTimezone(),
    }),
    [user?.id, user?.timezone, role, myMembership]
  );
}
