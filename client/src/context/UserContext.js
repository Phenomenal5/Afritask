/**
 * User profile actions live here.
 * This keeps account settings updates separate from auth session state and task state.
 */
"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import toast from "react-hot-toast";
import {
  updateAvatar as updateAvatarRequest,
  updatePassword as updatePasswordRequest,
  updateProfile as updateProfileRequest,
} from "@/lib/services/userService";

const UserContext = createContext(null);

// Provide profile update actions and a bridge back to the auth-owned user object.
export function UserProvider({ children, setUser }) {
  const updateProfile = useCallback(
    async (data) => {
      try {
        const res = await updateProfileRequest(data);
        setUser((prev) => ({ ...prev, ...res.data.user }));
        toast.success("Profile updated");
        return { success: true };
      } catch (err) {
        const message = err.response?.data?.message || "Could not update profile";
        toast.error(message);
        return { success: false, message };
      }
    },
    [setUser]
  );

  const updatePassword = useCallback(async (data) => {
    try {
      const res = await updatePasswordRequest(data);
      toast.success(res.data.message || "Password updated");
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || "Could not update password";
      toast.error(message);
      return { success: false, message };
    }
  }, []);

  const updateAvatar = useCallback(async (file) => {
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await updateAvatarRequest(formData);
      setUser((prev) => ({ ...prev, ...res.data.user }));
      toast.success("Profile picture updated");
      return { success: true };
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error("Profile pictures aren't supported by the server yet.");
      } else {
        toast.error(err.response?.data?.message || "Could not update picture");
      }
      return { success: false };
    }
  }, [setUser]);

  const value = useMemo(
    () => ({
      updateProfile,
      updatePassword,
      updateAvatar,
    }),
    [updateProfile, updatePassword, updateAvatar]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

// Read the profile action helpers from the user provider.
export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
}
