import mongoose, { type Types } from "mongoose";

export const TASK_STATUSES = ["pending", "in progress", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface ITask {
  user: Types.ObjectId;
  title: string;
  description: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  deadline?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new mongoose.Schema<ITask>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
    },
    description: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: TASK_STATUSES,
      default: "pending",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    deadline: {
      type: Date,
    },
  },
  { timestamps: true },
);

export default mongoose.model<ITask>("Task", taskSchema);
