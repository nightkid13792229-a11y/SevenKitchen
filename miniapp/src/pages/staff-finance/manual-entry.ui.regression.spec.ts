import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');

const page = read('./manual-entry.vue');
const financeConstants = read('../../constants/finance.ts');
const api = read('../../api/staff-finance.ts');
const pagesJson = read('../../pages.json');
const payloadType =
  api.match(/export interface CreateManualEntryPayload[\s\S]*?\n\}/)?.[0] || '';

describe('记一笔', () => {
  it('顶部切支出/收入，默认支出', () => {
    expect(page).toContain('支出');
    expect(page).toContain('收入');
    // 默认方向必须是 EXPENSE，打开就是记支出
    expect(page).toMatch(/direction\s*=\s*ref[^(]*\(\s*'EXPENSE'\s*\)/);
    expect(page).toContain("selectDirection('INCOME')");
    expect(page).toContain("selectDirection('EXPENSE')");
  });

  it('金额是 digit 键盘、大号、自动聚焦', () => {
    expect(page).toContain('type="digit"');
    expect(page).toContain('amountFocus');
    expect(page).toContain('amount-input');
    // 老板明确要求的提示语
    expect(page).toContain('点金额可以改，默认今天');
    // 保存前校验：空、非正数、超过两位小数都拦下
    expect(page).toContain('请输入金额');
    expect(page).toContain('金额必须大于 0');
    expect(page).toContain('金额最多两位小数');
  });

  it('日期默认今天，可改，范围起账日 ~ 今天', () => {
    // 起账日抽到公共常量，页面引用它，不在每个页面各写一遍日期
    expect(page).toContain('FINANCE_START_DATE');
    expect(financeConstants).toContain("FINANCE_START_DATE = '2026-11-01'");
    expect(page).toContain('mode="date"');
    expect(page).toContain(':start="minDate"');
    expect(page).toContain(':end="maxDate"');
    expect(page).toContain('occurredAt');
    expect(page).toContain('shanghaiTodayKey');
  });

  it('支出类别是中文短词，不是会计科目', () => {
    for (const label of ['设备工具', '税费', '社保', '其他']) {
      expect(page).toContain(label);
    }
    // 中文短词对应后端 FinanceExpenseCategory 枚举
    for (const code of [
      "'EQUIPMENT'",
      "'TAX'",
      "'SOCIAL_INSURANCE'",
      "'OTHER'",
    ]) {
      expect(page).toContain(code);
    }
  });

  it('收入只给「其他收入」，并说明其余由系统自动记录', () => {
    expect(page).toContain('其他收入');
    expect(page).toContain("'OTHER_INCOME'");
    expect(page).toContain('系统自动记录');
    // 线上/线下/补剂/定制食谱不能手工选
    expect(page).toContain('线上/线下/补剂/定制食谱');
  });

  it('付款方：我个人垫的 / 公司账户，默认个人', () => {
    expect(page).toContain('我个人垫的');
    expect(page).toContain('公司账户');
    expect(page).toMatch(
      /payerType\s*=\s*ref[^(]*\(\s*'PERSONAL'\s*\)/,
    );
  });

  it('说明必填、最多 200 字', () => {
    expect(page).toContain('title');
    expect(page).toContain('maxlength="200"');
    expect(page).toContain('请写一句说明');
    expect(page).toContain('200');
  });

  it('保存：校验通过才请求，成功「已记入」后返回，失败原样提示后端 message', () => {
    expect(page).toContain('async function submit');
    expect(page).toContain('validationMessage');
    expect(page).toContain('createManualEntry');
    expect(page).toContain('已记入');
    expect(page).toContain('navigateBack');
    // 失败不能吞：错误信息走 toast
    const submitBlock = page.match(/async function submit[\s\S]*?\n\}/)?.[0] || '';
    expect(submitBlock).toContain('catch');
    expect(submitBlock).toContain('uni.showToast');
    expect(submitBlock).toContain('errorMessage');
  });

  it('说明合并进 title，提交不传 note / proofKeys', () => {
    const payloadBlock =
      page.match(/function buildPayload[\s\S]*?\n\}/)?.[0] || '';
    expect(payloadBlock).toContain('title');
    expect(payloadBlock).not.toContain('note');
    expect(payloadBlock).not.toContain('proofKeys');
  });

  it('凭证上传按 v1 决策不提供，但提交类型保留 proofKeys', () => {
    // spec §5.3：v1 不做凭证照片（拍照上传留到 v1.1），页面不出现拍照/上传字样
    for (const word of ['拍照', '上传', 'chooseImage', 'chooseMedia']) {
      expect(page).not.toContain(word);
    }
    // 后端 proofKeys 字段保留：提交类型与 DTO 对齐，以后接上传不用改类型
    expect(payloadType).toContain('proofKeys?: string[]');
  });

  it('API 用 DTO 同名字段 POST /admin/finance/manual-entries', () => {
    expect(api).toContain('createManualEntry');
    expect(api).toContain("url: '/admin/finance/manual-entries'");
    expect(api).toContain("method: 'POST'");
    // 字段名必须与后端 CreateManualEntryDto 完全一致
    expect(payloadType).toBeTruthy();
    for (const field of [
      'direction',
      'amount',
      'occurredAt',
      'category',
      'incomeCategory',
      'payerType',
      'title',
      'note',
      'proofKeys',
    ]) {
      expect(payloadType).toContain(`${field}`);
    }
    // 保存页自己 toast 后端 message，API 层不能再弹一遍
    expect(api).toContain('suppressErrorToast: true');
  });

  it('分包注册 manual-entry，标题「记一笔」深绿', () => {
    expect(pagesJson).toContain('"root": "pages/staff-finance"');
    expect(pagesJson).toContain('"path": "manual-entry"');
    expect(pagesJson).toContain('"navigationBarTitleText": "记一笔"');

    const entryStyle =
      pagesJson.match(
        /"path": "manual-entry"[\s\S]*?"navigationBarBackgroundColor": "(#[0-9a-fA-F]{6})"/,
      )?.[1] || '';
    expect(entryStyle.toLowerCase()).toBe('#1e3a2f');
  });

  it('非 ADMIN 直接输地址先拦下，不发请求', () => {
    expect(page).toContain("getStoredUser()?.role !== 'ADMIN'");
    expect(page).toContain('权限不足');
  });
});
