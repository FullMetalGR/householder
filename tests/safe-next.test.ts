import { describe, it, expect } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("passes clean path-relative targets through", () => {
    expect(safeNext("/lists")).toBe("/lists");
    expect(safeNext("/join/ABCD2345")).toBe("/join/ABCD2345");
    expect(safeNext("/lists?tab=active#top")).toBe("/lists?tab=active#top");
  });
  it("defaults to / for empty input", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });
  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https:/evil.com")).toBe("/");
    expect(safeNext("http://evil.com/lists")).toBe("/");
  });
  it("rejects the backslash authority bypass", () => {
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("/\\\\evil.com")).toBe("/");
  });
  it("rejects values that do not start with a slash", () => {
    expect(safeNext("lists")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });
});
