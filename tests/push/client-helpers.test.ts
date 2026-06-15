import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array } from "@/lib/push";

describe("urlBase64ToUint8Array", () => {
  it("decodes url-safe base64 with missing padding", () => {
    const out = urlBase64ToUint8Array("BAQD");
    expect(Array.from(out)).toEqual([4, 4, 3]);
  });
  it("maps - and _ to + and /", () => {
    const a = urlBase64ToUint8Array("-_8");
    expect(Array.from(a)).toEqual([251, 255]);
  });
});
