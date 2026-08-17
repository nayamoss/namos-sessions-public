import { describe, expect, it } from "vitest";
import { contrastForeground, hexToHslTriplet } from "@/lib/color";

describe("CFP branding colors", () => {
  it("converts a valid hex color to an HSL triplet", () => {
    expect(hexToHslTriplet("#0066FF")).toBe("216 100% 50%");
  });
  it("rejects malformed hex colors", () => {
    expect(hexToHslTriplet("blue")).toBeNull();
    expect(hexToHslTriplet("#FFF")).toBeNull();
  });
  it("chooses a contrasting foreground for light and dark accents", () => {
    expect(contrastForeground("#FFFFFF")).toBe("0 0% 0%");
    expect(contrastForeground("#000033")).toBe("0 0% 100%");
  });
});
