/**
 * User profile actions live here — separate from auth session state and task state.
 * Failures are returned for the form to show beside its fields.
 */
"use client";

import { createContext, useCallback, useContext, useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  updateAvatar as updateAvatarRequest,
  updatePassword as updatePasswordRequest,
  updateProfile as updateProfileRequest,
} from "@/lib/services/userService";
import { isAxiosError } from "axios";
import { failureMessage } from "@/lib/errors";
import type { ActionResult, CurrentUser } from "@/types/models";

interface ProfileChanges {
  name?: string;
  age?: number | null;
  timezone?: string;
}

interface UserActions {
  updateProfile: (changes: ProfileChanges) => Promise<ActionResult>;
  updatePassword: (input: { currentPassword: string; newPassword: string }) => Promise<ActionResult>;
  updateAvatar: (file: File) => Promise<ActionResult>;
}

const UserContext = createContext<UserActions | null>(null);

export function UserProvider({ children, setUser }: { children: ReactNode; setUser: Dispatch<SetStateAction<CurrentUser | null>> }) {
  const updateProfile = useCallback(
    async (changes: ProfileChanges): Promise<ActionResult> => {
      try {
        const response = await updateProfileRequest(changes);
        setUser((previous) => (previous ? { ...previous, ...response.data.user } : previous));
        return { success: true };
      } catch (error) {
        return { success: false, message: failureMessage(error, "Couldn't save your profile.") };
      }
    },
    [setUser]
  );

  const updatePassword = useCallback(async (input: { currentPassword: string; newPassword: string }): Promise<ActionResult> => {
    try {
      const response = await updatePasswordRequest(input);
      return { success: true, message: response.data.message };
    } catch (error) {
      // NOTE: the server answers a wrong current password with 401 — that's not an expired session.
      if (isAxiosError(error) && error.response?.status === 401) {
        return { success: false, message: error.response.data?.message || "Your current password is incorrect." };
      }
      return { success: false, message: failureMessage(error, "Couldn't change your password.") };
    }
  }, []);

  const updateAvatar = useCallback(
    async (file: File): Promise<ActionResult> => {
      try {
        const formData = new FormData();
        formData.append("photo", file);
        const response = await updateAvatarRequest(formData);
        setUser((previous) => (previous ? { ...previous, ...response.data.user } : previous));
        return { success: true };
      } catch (error) {
        return { success: false, message: failureMessage(error, "Couldn't upload that picture.") };
      }
    },
    [setUser]
  );

  const value = useMemo(() => ({ updateProfile, updatePassword, updateAvatar }), [updateProfile, updatePassword, updateAvatar]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserActions {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within a UserProvider");
  return context;
}
