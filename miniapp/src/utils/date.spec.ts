import { describe, expect, it } from "vitest";
import {
  addDaysToDateText,
  earliestCustomerProductionDate,
  formatShanghaiDateOnly,
  resolveProductionDatePickerState,
  shanghaiTodayText,
} from "./date";

/**
 * 这些用例全部用 UTC 时刻表示上海时间，断言也是上海日历日，
 * 所以无论测试机在哪个时区，结果都应一致。
 */
describe("earliestCustomerProductionDate", () => {
  it("上海 0:00-5:59 下单，可以预约当天制作", () => {
    expect(
      earliestCustomerProductionDate(new Date("2026-11-08T16:00:00.000Z")),
    ).toBe("2026-11-09");
    expect(
      earliestCustomerProductionDate(new Date("2026-11-08T21:59:59.999Z")),
    ).toBe("2026-11-09");
  });

  it("上海 6:00 起下单，最早只能预约次日制作", () => {
    expect(
      earliestCustomerProductionDate(new Date("2026-11-08T22:00:00.000Z")),
    ).toBe("2026-11-10");
    expect(
      earliestCustomerProductionDate(new Date("2026-11-09T15:59:59.999Z")),
    ).toBe("2026-11-10");
  });

  it("跨月、跨年时日期计算正确", () => {
    expect(
      earliestCustomerProductionDate(new Date("2026-11-30T00:00:00.000Z")),
    ).toBe("2026-12-01");
    expect(
      earliestCustomerProductionDate(new Date("2026-12-31T00:00:00.000Z")),
    ).toBe("2027-01-01");
  });
});

describe("addDaysToDateText", () => {
  it("纯日历加减，不受手机时区影响", () => {
    expect(addDaysToDateText("2026-11-09", 1)).toBe("2026-11-10");
    expect(addDaysToDateText("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysToDateText("2026-12-31", 2)).toBe("2027-01-02");
  });
});

describe("上海日历日展示", () => {
  it("UTC 零点存的是上海当天，不会被手机时区显示成前一天", () => {
    expect(formatShanghaiDateOnly("2026-11-09T00:00:00.000Z")).toBe(
      "2026-11-09",
    );
    expect(formatShanghaiDateOnly(null)).toBe("-");
  });

  it("上海今天按 UTC+8 算，不看手机时区", () => {
    // 2026-11-08T16:30Z = 上海 2026-11-09 00:30
    expect(shanghaiTodayText(new Date("2026-11-08T16:30:00.000Z"))).toBe(
      "2026-11-09",
    );
  });
});

describe("resolveProductionDatePickerState", () => {
  const orderToday = "2026-11-09T00:00:00.000Z";
  const orderTomorrow = "2026-11-10T00:00:00.000Z";
  const orderYesterday = "2026-11-08T00:00:00.000Z";
  // 上海 2026-11-09 08:30
  const afterSix = new Date("2026-11-09T00:30:00.000Z");
  // 上海 2026-11-09 05:00
  const beforeSix = new Date("2026-11-08T21:00:00.000Z");

  it("顾客 6 点后打开今天制作的订单：只能往后改，选择器从明天开始", () => {
    const state = resolveProductionDatePickerState({
      orderDate: orderToday,
      isAdmin: false,
      now: afterSix,
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
      now: beforeSix,
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
      now: afterSix,
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
      now: afterSix,
    });

    expect(state).toEqual({
      minDate: "2026-11-10",
      selectedDate: "2026-11-10",
      postponingOnly: false,
    });
  });

  it("管理员可以把已经过去的历史日期改到今天", () => {
    const state = resolveProductionDatePickerState({
      orderDate: orderYesterday,
      isAdmin: true,
      now: afterSix,
    });

    expect(state).toEqual({
      minDate: "2026-11-09",
      selectedDate: "2026-11-09",
      postponingOnly: true,
    });
  });

  it("顾客可以把历史日期往后改到最早可选日", () => {
    const state = resolveProductionDatePickerState({
      orderDate: orderYesterday,
      isAdmin: false,
      now: afterSix,
    });

    expect(state).toEqual({
      minDate: "2026-11-10",
      selectedDate: "2026-11-10",
      postponingOnly: true,
    });
  });
});
