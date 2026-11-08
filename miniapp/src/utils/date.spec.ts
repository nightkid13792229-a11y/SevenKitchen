import { describe, expect, it } from "vitest";
import { earliestCustomerProductionDate } from "./date";

describe("earliestCustomerProductionDate", () => {
  it("凌晨 0:00-5:59 下单，可以预约当天制作", () => {
    expect(earliestCustomerProductionDate(new Date(2026, 10, 9, 0, 0))).toBe(
      "2026-11-09",
    );
    expect(earliestCustomerProductionDate(new Date(2026, 10, 9, 5, 59))).toBe(
      "2026-11-09",
    );
  });

  it("早上 6:00 起下单，最早只能预约次日制作", () => {
    expect(earliestCustomerProductionDate(new Date(2026, 10, 9, 6, 0))).toBe(
      "2026-11-10",
    );
    expect(earliestCustomerProductionDate(new Date(2026, 10, 9, 23, 59))).toBe(
      "2026-11-10",
    );
  });

  it("跨月、跨年时日期计算正确", () => {
    expect(earliestCustomerProductionDate(new Date(2026, 10, 30, 8, 0))).toBe(
      "2026-12-01",
    );
    expect(earliestCustomerProductionDate(new Date(2026, 11, 31, 8, 0))).toBe(
      "2027-01-01",
    );
  });
});
