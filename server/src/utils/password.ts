import bcrypt from "bcrypt";

// Replaces the old Mongoose pre("save") hook — callers hash explicitly before writing.
// Cost 10 matches the hashes already stored, so imported Mongo users can still log in.
export const hashPassword = (plainPassword: string) => bcrypt.hash(plainPassword, 10);

// NOTE: password is omitted from queries by default — fetch it with
// `omit: { password: false }` first, otherwise there's no hash and this returns false.
export const comparePassword = async (plainPassword: string, passwordHash?: string | null) => {
    if (!passwordHash) return false;
    return bcrypt.compare(plainPassword, passwordHash);
};
