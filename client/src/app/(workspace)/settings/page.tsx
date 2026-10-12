"use client";

// Your account: profile, timezone, password, notification preferences and appearance.
// These follow you into every workspace.
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { BellRing, CircleCheck, ImageUp, Info } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useUser } from "@/context/UserContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatTimezoneLabel, listTimezones } from "@/utils/timezones";
import PageHeader from "@/components/layout/PageHeader";
import SettingsNav from "@/components/settings/SettingsNav";
import SettingsSection from "@/components/settings/SettingsSection";
import ThemeToggle from "@/components/layout/ThemeToggle";
import InstallAppCard from "@/components/pwa/InstallAppCard";
import NewsletterToggle from "@/components/newsletter/NewsletterToggle";
import LiveNotificationSettings from "@/components/settings/LiveNotificationSettings";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";
import { buttonClasses } from "@/components/ui/Button";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PASSWORD_MIN_LENGTH = 6;
// Same limits as the server (utils/userValidation.ts).
const PASSWORD_MAX_LENGTH = 128;
const NAME_MAX_LENGTH = 80;

// Inline save feedback next to a form's button.
function SaveStatus({ state, error }: { state: "idle" | "saved" | "failed"; error: string | null }) {
  return (
    <span aria-live="polite" className="text-[14px]">
      {state === "saved" && (
        <span className="inline-flex items-center gap-1.5 font-medium text-done">
          <CircleCheck size={16} aria-hidden="true" />
          Saved
        </span>
      )}
      {state === "failed" && error && <span className="text-brick">{error}</span>}
    </span>
  );
}

export default function AccountSettingsPage() {
  const { user } = useAuth();
  const { updateProfile, updatePassword, updateAvatar } = useUser();
  const online = useOnlineStatus();

  // ─── Profile ─────────────────────
  const [profile, setProfile] = useState({ name: user?.name ?? "", age: user?.age ? String(user.age) : "", timezone: user?.timezone ?? "UTC" });
  const [nameError, setNameError] = useState<string | null>(null);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileState, setProfileState] = useState<"idle" | "saved" | "failed">("idle");
  const [profileError, setProfileError] = useState<string | null>(null);

  const savedProfile = { name: user?.name ?? "", age: user?.age ? String(user.age) : "", timezone: user?.timezone ?? "UTC" };
  const profileDirty = JSON.stringify(profile) !== JSON.stringify(savedProfile);

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = profile.name.trim();
    if (!trimmedName) return setNameError("Your name helps teammates recognise your work.");
    if (trimmedName.length > NAME_MAX_LENGTH) return setNameError(`Keep your name to ${NAME_MAX_LENGTH} characters or fewer.`);
    if (profile.age && (!/^\d+$/.test(profile.age) || Number(profile.age) < 1 || Number(profile.age) > 120)) return setAgeError("Enter your age as a whole number, or leave it empty.");
    setProfileSaving(true);
    const result = await updateProfile({
      name: trimmedName,
      age: profile.age ? Number(profile.age) : null,
      timezone: profile.timezone,
    });
    setProfileSaving(false);
    setProfileState(result.success ? "saved" : "failed");
    setProfileError(result.success ? null : result.message ?? null);
  };

  // ─── Avatar ─────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const handleAvatarSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return setAvatarError("Choose a PNG, JPG or GIF image.");
    if (file.size > MAX_IMAGE_BYTES) return setAvatarError("That image is over 5 MB. Choose a smaller one.");
    setAvatarError(null);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarUploading(true);
    const result = await updateAvatar(file);
    setAvatarUploading(false);
    if (!result.success) setAvatarError(result.message ?? "Couldn't upload that picture. Try again, or choose another image.");
    setAvatarPreview(null);
  };

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  // ─── Password ─────────────────────
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordErrors, setPasswordErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordState, setPasswordState] = useState<"idle" | "saved" | "failed">("idle");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const isGoogleAccount = user?.provider === "google";

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors: typeof passwordErrors = {};
    if (!passwords.currentPassword) errors.current = "Enter the password you use now.";
    if (passwords.newPassword.length < PASSWORD_MIN_LENGTH) errors.next = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    else if (passwords.newPassword.length > PASSWORD_MAX_LENGTH) errors.next = `Keep your password to ${PASSWORD_MAX_LENGTH} characters or fewer.`;
    if (passwords.confirmPassword !== passwords.newPassword) errors.confirm = "This doesn't match the new password.";
    setPasswordErrors(errors);
    if (Object.keys(errors).length) return;
    setPasswordSaving(true);
    const result = await updatePassword({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
    setPasswordSaving(false);
    if (result.success) {
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordState("saved");
      setPasswordError(null);
    } else {
      setPasswordState("failed");
      setPasswordError(result.message ?? null);
    }
  };

  return (
    <>
      <title>Settings · Afritask</title>
      <PageHeader title="Settings" description="Your account settings apply in every workspace you belong to." />
      <SettingsNav />

      <div>
        <SettingsSection title="Profile" description="How teammates see you on tasks and in activity.">
          <div className="mb-6 flex items-center gap-4">
            <span className="relative">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="" className="h-16 w-16 rounded-full object-cover opacity-70" />
              ) : (
                <Avatar user={user} size={64} />
              )}
            </span>
            <div>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif" onChange={handleAvatarSelect} className="sr-only" id="avatar-input" tabIndex={-1} />
              <Button variant="secondary" size="sm" loading={avatarUploading} disabled={!online} onClick={() => fileInputRef.current?.click()} icon={<ImageUp size={16} aria-hidden="true" />}>
                {user?.photo ? "Change picture" : "Upload a picture"}
              </Button>
              <p className="mt-1 text-[13px] text-muted">PNG, JPG or GIF, up to 5 MB.</p>
              {avatarError && (
                <p role="alert" className="mt-1 text-[13px] text-brick">
                  {avatarError}
                </p>
              )}
            </div>
          </div>

          <form onSubmit={handleProfileSubmit} noValidate className="flex max-w-lg flex-col gap-4">
            <TextField
              label="Full name"
              autoComplete="name"
              value={profile.name}
              onChange={(event) => {
                setProfile((current) => ({ ...current, name: event.target.value }));
                setNameError(null);
                setProfileState("idle");
              }}
              error={nameError}
            />
            <TextField label="Email" value={user?.email ?? ""} readOnly disabled hint="Changing your email isn't supported yet." />
            <TextField
              label="Age"
              optional
              inputMode="numeric"
              value={profile.age}
              onChange={(event) => {
                setProfile((current) => ({ ...current, age: event.target.value }));
                setAgeError(null);
                setProfileState("idle");
              }}
              error={ageError}
              wrapperClassName="max-w-[10rem]"
            />
            <SelectField
              label="Timezone"
              value={profile.timezone}
              onChange={(event) => {
                setProfile((current) => ({ ...current, timezone: event.target.value }));
                setProfileState("idle");
              }}
              hint="Used for 'due today', reminders and new date-only deadlines. Changing it never moves deadlines you've already set."
            >
              {listTimezones(profile.timezone).map((zone: string) => (
                <option key={zone} value={zone}>
                  {formatTimezoneLabel(zone)}
                </option>
              ))}
            </SelectField>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={profileSaving} disabled={!profileDirty || !online}>
                Save profile
              </Button>
              <SaveStatus state={profileState} error={profileError} />
            </div>
          </form>
        </SettingsSection>

        <SettingsSection title="Password" description="Changing it signs you out on your other devices.">
          {isGoogleAccount ? (
            <Notice icon={Info}>You sign in with Google, so there&apos;s no Afritask password to change. Manage your password in your Google account.</Notice>
          ) : (
            <form onSubmit={handlePasswordSubmit} noValidate className="flex max-w-lg flex-col gap-4">
              <TextField
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={passwords.currentPassword}
                onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))}
                error={passwordErrors.current}
              />
              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                value={passwords.newPassword}
                onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))}
                hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
                error={passwordErrors.next}
              />
              <TextField
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={passwords.confirmPassword}
                onChange={(event) => setPasswords((current) => ({ ...current, confirmPassword: event.target.value }))}
                error={passwordErrors.confirm}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" loading={passwordSaving} disabled={!online}>
                  Change password
                </Button>
                <SaveStatus state={passwordState} error={passwordError} />
              </div>
            </form>
          )}
        </SettingsSection>

        <SettingsSection title="Notifications" description="What Afritask sends you, and where.">
          <div className="flex max-w-lg flex-col gap-3">
            <LiveNotificationSettings />
            <div className="flex items-start gap-3 rounded-[12px] border border-line bg-surface p-4">
              <BellRing size={19} aria-hidden="true" className="mt-0.5 shrink-0 text-forest" />
              <div className="text-[14.5px]">
                <p className="font-semibold text-ink">Task reminders and overdue alerts</p>
                <p className="mt-0.5 text-muted">
                  Each task has its own reminder, set in the task itself. It&apos;s one day before the deadline unless someone picks another
                  time or turns it off. When it fires, and once if the task becomes overdue, the assignee (or the creator, if nobody is assigned) gets an email
                  and an in-app notification. Completed tasks and archived projects stay quiet.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-[12px] border border-line bg-surface p-4">
              <BellRing size={19} aria-hidden="true" className="mt-0.5 shrink-0 text-forest" />
              <div className="text-[14.5px]">
                <p className="font-semibold text-ink">In-app notifications</p>
                <p className="mt-0.5 text-muted">When someone assigns you a task, mentions you in a comment or invites you to a workspace. They appear under Notifications.</p>
              </div>
            </div>
            <Notice icon={Info}>You can&apos;t turn email types on or off yet. To silence a task, set its reminder to &ldquo;No reminder&rdquo;. Account emails (verification, password changes, invitations) are always sent.</Notice>
          </div>
        </SettingsSection>

        <SettingsSection id="newsletter" title="Newsletter" description="Optional product news by email. Separate from task and account emails.">
          <NewsletterToggle />
        </SettingsSection>

        <SettingsSection title="Appearance" description="Saved on this device only.">
          <ThemeToggle className={buttonClasses("secondary", "md")} />
        </SettingsSection>

        <SettingsSection title="This device" description="Use Afritask like an app on your phone or computer.">
          <InstallAppCard />
        </SettingsSection>
      </div>
    </>
  );
}
