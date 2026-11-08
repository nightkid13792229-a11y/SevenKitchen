import { describe, expect, it } from "vitest";
import {
  earliestCustomerProductionDate,
  resolveProductionDatePickerState,
} from "./date";

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

describe("resolveProductionDatePickerState", () => {
  const orderToday = new Date(2026, 10, 9, 12, 0).toISOString();
  const orderTomorrow = new Date(2026, 10, 10, 12, 0).toISOString();

  it("顾客 6 点后打开今天制作的订单：只能往后改，选择器从明天开始", () => {
    const state = resolveProductionDatePickerState({
      orderDate: orderToday,
      isAdmin: false,
      now: new Date(2026, 10, 9, 8, 0),
    });

    expect(state).toEqual({
      minDate: "2026-11-10",
      selectedDate: "2026-11-10",
      postponingOnly: true,
    });
  });

  it("顾客 6 点前打开今天制作的订单：今天仍可选", () => {
    const state = resolveProductionDatePickerState({
      orderDate: orderToday,
      isAdmin: false,
      now: new Date(2026, 10, 9, 5, 0),
    });

    expect(state).toEqual({
      minDate: "2026-11-09",
      selectedDate: "2026-11-09",
      postponingOnly: false,
    });
  });

  it("管理员 6 点后打开今天制作的订单：今天仍可选", () => {
    const state = resolveProductionDatePickerState({
      orderDate: orderToday,
      isAdmin: true,
      now: new Date(2026, 10, 9, 8, 0),
    });

    expect(state).toEqual({
      minDate: "2026-11-09",
      selectedDate: "2026-11-09",
      postponingOnly: false,
    });
  });

  it("订单日期是明天时，初始值保持明天", () => {
    const state = resolveProductionDatePickerState({
      orderDate: orderTomorrow,
      isAdmin: false,
      now: new Date(2026, 10, 9, 8, 0),
    });

    expect(state).toEqual({
      minDate: "2026-11-10",
      selectedDate: "2026-11-10",
      postponingOnly: false,
    });
  });

  it("管理员可以把已经过去的历史日期改到今天", () => {
    const state = resolveProductionDatePickerState({
      orderDate: new Date(2026, 10, 8, 12, 0).toISOString(),
      isAdmin: true,
      now: new Date(2026, 10, 9, 8, 0),
    });

    expect(state).toEqual({
      minDate: "2026-11-09",
      selectedDate: "2026-11-09",
      postponingOnly: true,
    });
  });

  it("顾客可以把历史日期往后改到最早可选日", () => {
    const state = resolveProductionDatePickerState({
      orderDate: new Date(2026, 10, 8, 12, 0).toISOString(),
      isAdmin: false,
      now: new Date(2026, 10, 9, 8, 0),
    });

    expect(state).toEqual({
      minDate: "2026-11-10",
      selectedDate: "2026-11-10",
      postponingOnly: true,
    });
  });
});
