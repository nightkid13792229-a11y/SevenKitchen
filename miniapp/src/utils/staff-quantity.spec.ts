import { describe, expect, it } from 'vitest';
import {
  formatStaffDecimal,
  formatStaffQuantity,
  isLatinMeasurementUnit,
} from './staff-quantity';

describe('员工端数量格式化', () => {
  it('拉丁单位与数字之间留空格', () => {
    expect(formatStaffQuantity(148, 'g')).toBe('148 g');
    expect(formatStaffQuantity(7.5, 'ml')).toBe('7.5 ml');
    expect(formatStaffQuantity(1.2, 'kg')).toBe('1.2 kg');
    expect(formatStaffQuantity(500, 'G')).toBe('500 G');
  });

  it('中文单位紧跟数字', () => {
    expect(formatStaffQuantity(2, '瓶')).toBe('2瓶');
    expect(formatStaffQuantity(1.5, '份')).toBe('1.5份');
    expect(formatStaffQuantity(0.64, '片')).toBe('0.64片');
  });

  it('按单位决定默认小数位并去掉末尾 0', () => {
    expect(formatStaffQuantity(148.4, 'g')).toBe('148 g');
    expect(formatStaffQuantity(7.56, 'ml')).toBe('7.6 ml');
    expect(formatStaffQuantity(13.7, 'g', { maxDecimals: 2 })).toBe('13.7 g');
    expect(formatStaffQuantity(100, '份')).toBe('100份');
    expect(formatStaffQuantity(1.924, '份')).toBe('1.92份');
  });

  it('0 值也带单位，不返回空字符串', () => {
    expect(formatStaffQuantity(0, 'g')).toBe('0 g');
    expect(formatStaffQuantity(0, '瓶')).toBe('0瓶');
  });

  it('非法值兜底为 0', () => {
    expect(formatStaffQuantity(Number.NaN, 'g')).toBe('0 g');
    expect(formatStaffDecimal(Number.NaN)).toBe('0');
  });

  it('识别拉丁单位', () => {
    expect(isLatinMeasurementUnit('g')).toBe(true);
    expect(isLatinMeasurementUnit(' ML ')).toBe(true);
    expect(isLatinMeasurementUnit('瓶')).toBe(false);
    expect(isLatinMeasurementUnit(undefined)).toBe(false);
  });
});
