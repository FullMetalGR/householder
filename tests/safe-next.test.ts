import { describe, it, expect } from "vitest";
import { safeNext, confirmNext } from "@/lib/safe-next";

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

describe("confirmNext", () => {
  it("reduces the RedirectTo URL to a safe app path", () => {
    expect(confirmNext("http://localhost:3000/")).toBe("/");
    expect(confirmNext("http://localhost:3000/invite/ABC")).toBe("/invite/ABC");
  });
  it("unwraps a callback-shaped RedirectTo to its inner next", () => {
    expect(
      confirmNext("http://localhost:3000/auth/callback?next=%2Finvite%2FABC")
    ).toBe("/invite/ABC");
    expect(confirmNext("http://localhost:3000/auth/callback")).toBe("/");
  });
  it("keeps relative paths and rejects garbage", () => {
    expect(confirmNext("/lists")).toBe("/lists");
    expect(confirmNext("")).toBe("/");
    expect(confirmNext("https://evil.com")).toBe("/");
  });
});
