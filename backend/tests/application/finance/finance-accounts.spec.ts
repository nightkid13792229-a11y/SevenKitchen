import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_FINANCE_ACCOUNT,
  FINANCE_ACCOUNTS,
  FINANCE_ACCOUNT_CODES,
  FINANCE_INCOME_ACCOUNT,
  isFinanceAccount,
  normalizeFinanceAccount,
} from 'src/application/finance/finance-accounts';

/**
 * 财务账户口径（2026-11-19 账户化改造，设计文档 §1）。
 *
 * 本期固定五个账户，不做自建；账户只回答「钱从哪个账户进出」，
 * 不再有「公司/个人垫付」这层概念。
 */
describe('FINANCE_ACCOUNTS', () => {
  it('固定五个账户，文案与设计文档一致', () => {
    expect(FINANCE_ACCOUNTS).toEqual({
      MERCHANT: '微信商户号',
      PERSONAL_WECHAT: '我的微信',
      PERSONAL_ALIPAY: '我的支付宝',
      PERSONAL_BANK: '我的银行卡',
      CASH: '现金',
    });
    expect(FINANCE_ACCOUNT_CODES).toHaveLength(5);
  });

  it('线上收入固定落商户号', () => {
    expect(FINANCE_INCOME_ACCOUNT).toBe('MERCHANT');
  });

  it('默认账户是「我的微信」', () => {
    expect(DEFAULT_FINANCE_ACCOUNT).toBe('PERSONAL_WECHAT');
  });
});

describe('isFinanceAccount', () => {
  it('只认五个账户码，大小写/空白/空值都不算', () => {
    expect(isFinanceAccount('MERCHANT')).toBe(true);
    expect(isFinanceAccount('PERSONAL_WECHAT')).toBe(true);
    expect(isFinanceAccount('PERSONAL_ALIPAY')).toBe(true);
    expect(isFinanceAccount('PERSONAL_BANK')).toBe(true);
    expect(isFinanceAccount('CASH')).toBe(true);

    expect(isFinanceAccount('merchant')).toBe(false);
    expect(isFinanceAccount(' PERSONAL_WECHAT ')).toBe(false);
    expect(isFinanceAccount('BANK')).toBe(false);
    expect(isFinanceAccount('')).toBe(false);
    expect(isFinanceAccount(null)).toBe(false);
    expect(isFinanceAccount(undefined)).toBe(false);
  });
});

describe('normalizeFinanceAccount', () => {
  it('空值缺省为「我的微信」', () => {
    expect(normalizeFinanceAccount(undefined)).toBe('PERSONAL_WECHAT');
    expect(normalizeFinanceAccount(null)).toBe('PERSONAL_WECHAT');
    expect(normalizeFinanceAccount('')).toBe('PERSONAL_WECHAT');
    expect(normalizeFinanceAccount('   ')).toBe('PERSONAL_WECHAT');
  });

  it('合法账户原样返回（去掉首尾空格）', () => {
    expect(normalizeFinanceAccount('CASH')).toBe('CASH');
    expect(normalizeFinanceAccount(' PERSONAL_BANK ')).toBe('PERSONAL_BANK');
  });

  it('非法账户报 400，不能静默落默认值', () => {
    expect(() => normalizeFinanceAccount('BANK')).toThrow(BadRequestException);
    expect(() => normalizeFinanceAccount('MERCHANT_2')).toThrow(
      BadRequestException,
    );
  });
});
