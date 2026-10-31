import { describe, it, expect } from "vitest";
import { normalizeWord, matchScore } from "../src/domain";
describe("exact word rules", () => {
  it("trims Unicode boundary whitespace only", () => {
    expect(normalizeWord("　 海 浪 \n")).toBe("海 浪");
  });
  it("scores largest group, not pair count", () => {
    expect(matchScore(["海", "海", "山"])).toBe(67);
    expect(matchScore(["夏天", "夏天"])).toBe(100);
    expect(matchScore([])).toBe(0);
  });
  it("does not normalize synonyms or internal spaces", () => {
    expect(matchScore(["大海", "海洋"])).toBe(50);
    expect(matchScore(["海 浪", "海浪"])).toBe(50);
  });
});
