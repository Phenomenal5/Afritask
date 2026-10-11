
class AppError extends Error{
    statusCode: number;
    status: "fail" | "error";
    isOperational: boolean;
    // Optional machine-readable reason the client can act on (e.g. "completion_note_required"),
    // so it never has to match on the human message.
    code?: string;

    constructor(message: string, statusCode: number, code?: string) {
        super(message);

        this.statusCode = statusCode;
        if (code) this.code = code;
        this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
        this.isOperational = true


        Error.captureStackTrace(this, this.constructor);
    }
}


export default AppError
