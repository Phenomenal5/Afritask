import { Bell, FolderKanban, LayoutDashboard, ListChecks, Settings, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  // Extra path prefixes that count as "here" (e.g. /projects/123 lights up Projects).
  matches?: string[];
}

export const WORKSPACE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/tasks", label: "My Tasks", icon: ListChecks },
  { href: "/projects", label: "Projects", icon: FolderKanban, matches: ["/projects/"] },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/people", label: "People", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings, matches: ["/settings/"] },
];

export const isNavItemActive = (item: NavItem, pathname: string) =>
  pathname === item.href || (item.matches ?? []).some((prefix) => pathname.startsWith(prefix));

// Short, contextual guidance shown in the sidebar for the page you're on.
export const PAGE_HELP: Record<string, { title: string; body: string }> = {
  "/dashboard": {
    title: "Start here",
    body: "Overview shows what's assigned to you, what's late, and how projects are moving. Every number links to the tasks behind it.",
  },
  "/tasks": {
    title: "Moving work along",
    body: "Change a task's status from its Status menu — on the board you can also drag cards. Both save the same way.",
  },
  "/projects": {
    title: "Projects group work",
    body: "Tasks don't need a project. Owners and Admins create projects; everyone in the workspace can see them.",
  },
  "/notifications": {
    title: "What needs you",
    body: "Invitations and your overdue or due-today work collect here. Each item links straight to it.",
  },
  "/people": {
    title: "Who can do what",
    body: "Owners and Admins invite people. Membership starts only when the person accepts.",
  },
  "/settings": {
    title: "Yours vs. the workspace's",
    body: "Profile, timezone and password are yours everywhere. Workspace name and labels belong to this workspace.",
  },
};
