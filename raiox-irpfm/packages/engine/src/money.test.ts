import { describe, expect, it } from "vitest";
import { D, money, roundMoney, toMoneyString } from "./money.ts";

describe("money", () => {
  it("parses strings without float drift", () => {
    expect(money("0.1").plus(money("0.2")).equals(money("0.3"))).toBe(true);
  });

  it("rounds half up to cents in a single place", () => {
    expect(toMoneyString(roundMoney(D("10.005")))).toBe("10.01");
    expect(toMoneyString(roundMoney(D("10.004999")))).toBe("10.00");
    expect(toMoneyString(roundMoney(D("-10.005")))).toBe("-10.01");
  });

  it("rejects JavaScript numbers to avoid float leakage", () => {
    // @ts-expect-error numbers are not accepted on purpose
    expect(() => money(0.1)).toThrow();
  });

  it("rejects malformed input", () => {
    expect(() => money("1,5")).toThrow();
    expect(() => money("abc")).toThrow();
    expect(() => money("")).toThrow();
  });
});
