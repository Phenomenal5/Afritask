import AppError from "./AppError.js";

// PRD §9 proposed limits: workspace and project names are 1–100 characters after trimming.
const NAME_MAX_LENGTH = 100;

// `thing` is what is being named, for the message: "workspace" or "project".
export const normalizeWorkspaceName = (name: unknown, thing: "workspace" | "project" = "workspace"): string => {
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) throw new AppError(`Give the ${thing} a name.`, 400);
    if (trimmedName.length > NAME_MAX_LENGTH) {
        throw new AppError(`Keep the name to ${NAME_MAX_LENGTH} characters or fewer.`, 400);
    }
    return trimmedName;
};
