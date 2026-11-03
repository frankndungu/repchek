import { describe, expect, it } from "vitest";
import { stripSensitiveParams } from "../src/privacy";

describe("stripSensitiveParams", () => {
  it("removes the customer session token and keeps the rest", () => {
    expect(
      stripSensitiveParams(
        "https://app.repchek.fit/?checkout=success&customer_session_token=polar_cst_abc#x",
      ),
    ).toBe("https://app.repchek.fit/?checkout=success#x");
  });

  it("leaves an address without it alone", () => {
    expect(stripSensitiveParams("https://app.repchek.fit/?a=1")).toBe(
      "https://app.repchek.fit/?a=1",
    );
  });

  it("returns something that is not an address unchanged", () => {
    expect(stripSensitiveParams("not a url")).toBe("not a url");
  });
});
