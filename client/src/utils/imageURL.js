// Normalize avatar/photo paths so Next Image can render backend uploads reliably.
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// Convert a backend photo path or blob URL into something the UI can consume directly.
export const getPhotoUrl = (photo) => {
  if (!photo) return null;
  if (
    photo.startsWith("blob:") ||
    photo.startsWith("data:") ||
    photo.startsWith("http://") ||
    photo.startsWith("https://")
  ) {
    return photo;
  }

  const cleanPhoto = photo.replaceAll("\\", "/").replace(/^public\//, "");
  return `${apiBaseUrl}${cleanPhoto.startsWith("/") ? cleanPhoto : `/${cleanPhoto}`}`;
};
