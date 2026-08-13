import { describe, expect, it } from "vitest";
import { canTransitionTask } from "@/lib/task-status";
describe("task status", () => it("permits useful work transitions but not a direct pending completion", () => { expect(canTransitionTask("pending", "in_progress")).toBe(true); expect(canTransitionTask("pending", "completed")).toBe(false); }));
