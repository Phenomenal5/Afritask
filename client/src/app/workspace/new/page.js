"use client";

// Create an additional workspace (e.g. a team space alongside a personal one).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaces } from "@/context/WorkspaceContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Navbar from "@/components/Navbar";
import FormField from "@/components/FormField";
import Button from "@/components/Button";

function NewWorkspaceForm() {
  const router = useRouter();
  const { createWorkspace } = useWorkspaces();
  const [workspaceName, setWorkspaceName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const res = await createWorkspace(workspaceName);
    setSaving(false);
    // createWorkspace also makes it the active workspace.
    if (res.success) router.push("/dashboard");
  };

  return (
    <div className="flex-1 flex flex-col">
      <Navbar />
      <main className="max-w-md w-full mx-auto px-6 py-10 flex-1">
        <h1 className="font-display text-3xl mb-1" style={{ color: "var(--ink)" }}>
          New workspace
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
          You&apos;ll be its Owner. Its projects and tasks stay separate from your other workspaces.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField
            label="Workspace name"
            name="workspaceName"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="e.g. Client websites"
            required
          />
          <Button type="submit" loading={saving}>
            Create workspace
          </Button>
        </form>
      </main>
    </div>
  );
}

export default function NewWorkspacePage() {
  return (
    <ProtectedRoute>
      <NewWorkspaceForm />
    </ProtectedRoute>
  );
}
