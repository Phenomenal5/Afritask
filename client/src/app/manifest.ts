// Web app manifest (SRS SR15): identity, icons, launch URL and standalone display, so
// Afritask can be installed on compatible browsers. Installation is optional.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Afritask",
    short_name: "Afritask",
    description: "A clear place for your next step: workspaces, projects and tasks with the people you work with.",
    // Signed-in people land on their overview; signed-out ones are sent to sign in from there.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F7F7EF",
    theme_color: "#163C2F",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
