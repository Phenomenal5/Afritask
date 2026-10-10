// The backend's origin. Server-side only (no NEXT_PUBLIC_ prefix): the browser never
// calls it directly any more. NEXT_PUBLIC_API_URL is the old name, kept as a fallback
// so existing deployments keep working without an env change.
const API_ORIGIN =
  process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: the browser talks to the API through these same-origin rewrites. That makes
  // the httpOnly session cookie first-party (SameSite=Lax, no third-party-cookie
  // blocking) and removes CORS from the picture. Don't point the client at API_ORIGIN
  // directly — the cookie would land on the wrong site and sign-in would silently fail.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      // Uploaded avatars are served by Express from /uploads.
      { source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` },
    ];
  },
  // Old screen addresses from before the redesign, so bookmarks keep working.
  async redirects() {
    return [
      { source: "/profile", destination: "/settings", permanent: false },
      { source: "/workspace", destination: "/settings/workspace", permanent: false },
    ];
  },
};

export default nextConfig;
