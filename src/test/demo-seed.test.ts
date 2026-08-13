import { describe, expect, it } from "vitest";
import { findAgendaConflicts } from "@/lib/agenda-conflicts";
import { demoAgendaSeed } from "@/lib/demo-seed";
describe("demo seed", () => it("contains room, speaker, and track conflicts", () => { const types = findAgendaConflicts(demoAgendaSeed()).map(conflict => conflict.type); expect(types).toContain("room"); expect(types).toContain("speaker"); expect(types).toContain("track"); }));
