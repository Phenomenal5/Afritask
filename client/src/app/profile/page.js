"use client";

// Profile page handles account details, password changes, and avatar uploads.
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { useUser } from "@/context/UserContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Navbar from "@/components/Navbar";
import Avatar from "@/components/Avatar";
import FormField from "@/components/FormField";
import Button from "@/components/Button";
import toast from "react-hot-toast";
import { getPhotoUrl } from "@/utils/imageURL.js";

// Every IANA zone the browser knows, for the timezone picker. Falls back to the user's
// current zone if the browser lacks Intl.supportedValuesOf (older Safari).
const listTimezones = (currentTimezone) => {
  try {
    const zones = Intl.supportedValuesOf("timeZone");
    // "UTC" isn't always in the list, but it's the server default for new accounts.
    return zones.includes(currentTimezone) ? zones : [currentTimezone, ...zones];
  } catch {
    return [currentTimezone];
  }
};

// Render the settings page and bridge profile actions into the UI.
function ProfileContent() {
  const { user } = useAuth();
  const { updateProfile, updatePassword, updateAvatar } = useUser();
  const fileInputRef = useRef(null);

  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    age: user?.age || "",
    timezone: user?.timezone || "UTC",
  });
  const [profileLoading, setProfileLoading] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(user?.photo);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    await updateProfile({
      name: profileForm.name,
      ...(profileForm.age ? { age: Number(profileForm.age) } : {}),
      timezone: profileForm.timezone,
    });
    setProfileLoading(false);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    setPasswordLoading(true);
    const res = await updatePassword(passwordForm);
    setPasswordLoading(false);
    if (res.success) setPasswordForm({ currentPassword: "", newPassword: "" });
  };

  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB");
      return;
    }

    setAvatarPreview(URL.createObjectURL(file));
    setAvatarUploading(true);
    await updateAvatar(file);
    setAvatarUploading(false);
  };

  // Revoke any blob preview URLs when the selected image changes or unmounts.
  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  return (
    <div className="flex-1 flex flex-col">
      <Navbar />

      <main className="max-w-2xl w-full mx-auto px-6 py-10 flex-1">
        <h1 className="font-display text-3xl mb-1" style={{ color: "var(--ink)" }}>
          Profile
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
          Manage your Afritask details and preferences.
        </p>

        {/* Avatar section */}
        <div
          className="flex items-center gap-5 p-5 rounded-xl mb-8"
          style={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}
        >
          <div className="relative">
            {avatarPreview ? (
              <Image
                src={getPhotoUrl(avatarPreview)}
                alt="Preview"
                width={64}
                height={64}
                unoptimized
                className="rounded-full object-cover"
                style={{ width: 64, height: 64, opacity: avatarUploading ? 0.6 : 1 }}
              />
            ) : (
              <Avatar user={user} size={64} />
            )}
            {avatarUploading && (
              <span
                className="absolute inset-0 flex items-center justify-center rounded-full"
              >
                <span
                  className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{ borderColor: "var(--line)", borderTopColor: "var(--moss)" }}
                />
              </span>
            )}
          </div>

          <div className="flex-1">
            <p className="text-sm font-medium mb-1" style={{ color: "var(--ink)" }}>
              Profile picture
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              loading={avatarUploading}
            >
              Upload new picture
            </Button>
          </div>
        </div>

        {/* Profile info */}
        <section
          className="p-5 rounded-xl mb-6"
          style={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}
        >
          <h2 className="font-display text-lg mb-4" style={{ color: "var(--ink)" }}>
            Account details
          </h2>
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
            <FormField
              label="Full name"
              name="name"
              value={profileForm.name}
              onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
            <FormField label="Email" name="email" value={user?.email || ""} onChange={() => {}} />
            <FormField
              label="Age"
              name="age"
              type="number"
              value={profileForm.age}
              onChange={(e) => setProfileForm((p) => ({ ...p, age: e.target.value }))}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="timezone" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                Timezone
              </label>
              <select
                id="timezone"
                name="timezone"
                value={profileForm.timezone}
                onChange={(e) => setProfileForm((p) => ({ ...p, timezone: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm transition-colors outline-none"
                style={{
                  background: "var(--paper-raised)",
                  border: "1px solid var(--line)",
                  color: "var(--ink)",
                }}
              >
                {listTimezones(profileForm.timezone).map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                Due dates and reminders use this timezone. Changing it doesn&apos;t move deadlines you&apos;ve already set.
              </p>
            </div>
            <div>
              <Button type="submit" loading={profileLoading}>
                Save changes
              </Button>
            </div>
          </form>
        </section>

        {/* Password */}
        <section
          className="p-5 rounded-xl"
          style={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}
        >
          <h2 className="font-display text-lg mb-4" style={{ color: "var(--ink)" }}>
            Change password
          </h2>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <FormField
              label="Current password"
              name="currentPassword"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) =>
                setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))
              }
              autoComplete="current-password"
              required
            />
            <FormField
              label="New password"
              name="newPassword"
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))
              }
              autoComplete="new-password"
              required
            />
            <div>
              <Button type="submit" loading={passwordLoading}>
                Update password
              </Button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileContent />
    </ProtectedRoute>
  );
}
