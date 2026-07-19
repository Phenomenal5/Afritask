// Shared axios client that attaches the Afritask JWT to every backend request.
import axios from "axios";

// Base URL comes from an env var so it's easy to point at a different
// backend later without touching code. Falls back to localhost:5000
// to match the documented default PORT.
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach the JWT to every request automatically, if we have one stored.
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("afritask_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export default api;
