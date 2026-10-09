import AppError from "./AppError.js";

// PRD §9 proposed limits: workspace and project names are 1–100 characters after trimming.
const NAME_MAX_LENGTH = 100;

export const normalizeWorkspaceName = (name: unknown, label = "Workspace name"): string => {
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) throw new AppError(`${label} is required`, 400);
    if (trimmedName.length > NAME_MAX_LENGTH) {
        throw new AppError(`${label} must be ${NAME_MAX_LENGTH} characters or fewer`, 400);
    }
    return trimmedName;
};
