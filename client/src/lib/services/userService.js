/**
 * User service wrappers for profile and account settings routes.
 * These calls are shared by the profile screen and user context.
 */
import api from "@/lib/api";

// Save profile fields such as name or age.
export const updateProfile = (data) => {
  // PUT /users/profile expects editable profile fields and returns the updated user.
  return api.put("/users/profile", data);
};

// Change the current user's password.
export const updatePassword = (data) => {
  // PUT /users/password expects the current and new passwords and returns the update status.
  return api.put("/users/password", data);
};

// Upload a new avatar image as multipart form data.
// NOTE: there is no /users/avatar route — the server takes the image on PUT /users/profile
// as a multipart `photo` field (multer upload.single("photo")). The old path always 404'd.
export const updateAvatar = (formData) => {
  return api.put("/users/profile", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
