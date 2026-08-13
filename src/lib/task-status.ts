export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";
const transitions: Record<TaskStatus, TaskStatus[]> = { pending: ["in_progress", "blocked"], in_progress: ["completed", "blocked", "pending"], completed: ["in_progress"], blocked: ["pending", "in_progress"] };
export function canTransitionTask(from: TaskStatus, to: TaskStatus) { return transitions[from].includes(to); }
