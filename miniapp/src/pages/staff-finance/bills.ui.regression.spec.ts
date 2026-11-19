import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FinanceExpenseInterval } from '../../api/staff-finance';
import {
  buildTemplateFormPayload,
  dueTemplatesForMonth,
  serviceMonthsForInterval,
} from './bills-logic';

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');

const page = read('./bills.vue');
const logic = read('./bills-logic.ts');
const api = read('../../api/staff-finance.ts');
const pagesJson = read('../../pages.json');

type DueTemplateRow = {
  id: string;
  isActive: boolean;
  interval: FinanceExpenseInterval;
  monthOfYear: number | null;
};

/** 从页面里截出某个函数的实现，避免整页 toContain 误判 */
const fnBlock = (name: string) =>
  page.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))?.[0] || '';

describe('固定费用', () => {
  it('顶部可按月切换，默认本月，可看最近三个月', () => {
    expect(page).toContain('monthChips');
    expect(page).toContain('activeMonth');
    // 默认本月：当前年月来自上海时区
    expect(page).toMatch(/activeMonth\s*=\s*ref\(currentMonth\.value\)/);
    // 最近三个月：offset 0/1/2 往前推
    expect(page).toContain('offset < 3');
    expect(page).toContain("'2026-11'");
  });

  it('本月待付：名称、金额、几号、状态齐全', () => {
    expect(page).toContain('待付');
    expect(page).toContain('本月待付');
    expect(page).toContain('bill.title');
    expect(page).toContain('formatMoney(bill.amount)');
    expect(page).toContain('dayLabel(bill.dueAt)');
    for (const status of ['待付', '已付', '部分付']) {
      expect(page).toContain(status);
    }
  });

  it('标记已付弹层可改实付金额、可选付款方，默认剩余应付', () => {
    expect(page).toContain('标记已付');
    expect(page).toContain('剩余应付');
    // 默认填剩余应付
    expect(page).toContain('remainingOf(bill).toFixed(2)');
    // 付款方只有这两种说法
    expect(page).toContain('我个人垫的');
    expect(page).toContain('公司账户');
    // 确认后调 payBill 并刷新账单
    expect(page).toContain('payBill');
    expect(page).toContain("toast('已标记已付'");
    expect(page).toContain('loadBills()');
  });

  it('补生成本月：0 笔提示本月都已生成，N 笔提示已生成 N 笔', () => {
    expect(page).toContain('补生成');
    expect(page).toContain('补生成本月');
    expect(page).toContain('generateBills');
    expect(page).toContain('已生成 ${created} 笔');
    expect(page).toContain('本月都已生成');
    expect(page).toContain('该月都已生成');
  });

  it('我设的固定项目：周期/几号/付款方/启用状态都露出来', () => {
    expect(page).toContain('我设的固定项目');
    expect(page).toContain('intervalLabel(template.interval)');
    expect(page).toContain('dayLabel(template.dayOfMonth)');
    expect(page).toContain('payerLabel(template.payerType)');
    expect(page).toContain("template.isActive ? '启用' : '已停用'");
    // 三种周期文案
    for (const label of ['每月', '每季', '每年']) {
      expect(page).toContain(label);
    }
  });

  it('点项目可编辑名称/类别/金额/周期/日/付款方', () => {
    expect(page).toContain('openEdit');
    expect(page).toContain('编辑固定费用');
    expect(page).toContain('保存');
    for (const field of [
      'formName',
      'formCategory',
      'formAmountText',
      'formInterval',
      'formDayIndex',
      'formPayerType',
    ]) {
      expect(page).toContain(field);
    }
    // 编辑时用 PATCH，新建用 POST，都不做物理清除
    expect(page).toContain('updateTemplate');
    expect(page).toContain('createTemplate');
    expect(page).not.toContain('删除');
  });

  it('停用要二次确认，文案说明只影响以后', () => {
    expect(page).toContain('停用');
    expect(page).toContain('deactivateTemplate');
    expect(page).toContain('uni.showModal');
    const modal = page.match(/uni\.showModal\(\{[\s\S]*?\n  \}\)/)?.[0] || '';
    expect(modal).toContain('停用只影响以后');
    expect(modal).toContain('不再生成新账单');
    expect(modal).toContain('历史记录都不变');
    // 停用只改 isActive，页面不提供硬删
    expect(page).not.toContain('删除');
  });

  it('新建固定费用表单：类别用后端枚举中文标签，服务期默认 1、年付填 12', () => {
    expect(page).toContain('新建固定费用');
    expect(page).toContain('服务期月数');
    expect(page).toContain("formServiceMonthsText = ref('1')");
    // 年付默认 12 的规则在纯逻辑模块里（可执行断言，见下面用例）
    expect(page).toContain('serviceMonthsForInterval');
    expect(logic).toContain("return currentText.trim() === '1' ? '12' : currentText");
    // 类别值必须是后端 FinanceExpenseCategory 的枚举 code，中文照抄后端标签
    const labels: Array<[string, string]> = [
      ['RENT', '房租'],
      ['UTILITIES', '水电燃气'],
      ['NETWORK_COMMUNICATION', '宽带通信'],
      ['PAYROLL', '工资'],
      ['SOCIAL_INSURANCE', '社保'],
      ['TAX', '税费'],
      ['TECHNICAL_SERVICES', '服务器/域名/证书/备案'],
    ];
    for (const [code, label] of labels) {
      expect(page).toContain(`${code}: '${label}'`);
    }
  });

  it('空态：没模板给新建入口，没账单提示先设固定项目并给补生成入口', () => {
    expect(page).toContain('本月还没有固定费用，先设几个固定项目');
    expect(page).toContain('还没有固定费用');
    expect(page).toContain('onBillsEmptyAction');
    // 没模板时引导新建，有模板时引导补生成
    expect(page).toContain('templates.value.length === 0');
  });

  it('年付切回月付：服务期复位为 1，保存提交的 servicePeriodMonths 也是 1', () => {
    // 选「每年」→ 服务期默认 12
    let monthsText = serviceMonthsForInterval('YEARLY', '1');
    expect(monthsText).toBe('12');
    // 再切回「每月」→ 必须复位 1（否则 5000 房租会被按 12 个月摊成 416）
    monthsText = serviceMonthsForInterval('MONTHLY', monthsText);
    expect(monthsText).toBe('1');
    expect(serviceMonthsForInterval('QUARTERLY', '12')).toBe('1');

    const payload = buildTemplateFormPayload({
      name: '房租',
      category: 'RENT',
      amount: 5000,
      interval: 'MONTHLY',
      dayOfMonth: 1,
      servicePeriodMonths: Number(monthsText),
      payerType: 'PERSONAL',
      editing: null,
    });
    expect(payload.servicePeriodMonths).toBe(1);
    // 就算调用方手误传 12，月付/季付也会被强制回 1
    expect(
      buildTemplateFormPayload({
        name: '房租',
        category: 'RENT',
        amount: 5000,
        interval: 'MONTHLY',
        dayOfMonth: 1,
        servicePeriodMonths: 12,
        payerType: 'PERSONAL',
        editing: null,
      }).servicePeriodMonths,
    ).toBe(1);
  });

  it('年付有 1-12 月选择器，提交的 monthOfYear 跟着选择走', () => {
    expect(page).toContain('MONTH_LABELS');
    expect(page).toContain('formMonthOfYear');
    expect(page).toContain('onPickMonthOfYear');
    expect(page).toContain('几月（年付）');
    expect(page).toContain('@change="onPickMonthOfYear"');

    const yearly = buildTemplateFormPayload({
      name: '宽带',
      category: 'NETWORK_COMMUNICATION',
      amount: 1200,
      interval: 'YEARLY',
      dayOfMonth: 15,
      servicePeriodMonths: 12,
      payerType: 'COMPANY',
      monthOfYear: 3,
      editing: null,
    });
    expect(yearly.monthOfYear).toBe(3);
    expect(yearly.servicePeriodMonths).toBe(12);

    // 月付/季付不带 monthOfYear，后端按每月/每季规则生成
    const monthly = buildTemplateFormPayload({
      name: '房租',
      category: 'RENT',
      amount: 5000,
      interval: 'MONTHLY',
      dayOfMonth: 1,
      servicePeriodMonths: 1,
      payerType: 'PERSONAL',
      monthOfYear: 3,
      editing: null,
    });
    expect(monthly.monthOfYear).toBeUndefined();
  });

  it('补生成 0 笔时区分「都已生成」和「本月没有需要生成的」', () => {
    const templates: DueTemplateRow[] = [
      { id: 'rent', isActive: true, interval: 'MONTHLY', monthOfYear: null },
      { id: 'tax', isActive: true, interval: 'QUARTERLY', monthOfYear: null },
      { id: 'broadband', isActive: true, interval: 'YEARLY', monthOfYear: 3 },
      { id: 'off', isActive: false, interval: 'MONTHLY', monthOfYear: null },
    ];
    // 11 月：只有月付房租该生成
    expect(dueTemplatesForMonth(templates, '2026-11').map((row) => row.id)).toEqual([
      'rent',
    ]);
    // 12 月：季付税费不在 1/4/7/10，仍只有房租
    expect(dueTemplatesForMonth(templates, '2026-12').map((row) => row.id)).toEqual([
      'rent',
    ]);
    // 3 月：房租 + 年付宽带
    expect(dueTemplatesForMonth(templates, '2027-03').map((row) => row.id)).toEqual([
      'rent',
      'broadband',
    ]);
    // 没有启用的模板 → 空；页面据此提示「没有需要生成」而不是骗人说都已生成
    expect(
      dueTemplatesForMonth(
        [{ id: 'off', isActive: false, interval: 'MONTHLY', monthOfYear: null }],
        '2026-11',
      ),
    ).toEqual([]);
    expect(page).toContain('dueTemplatesForMonth(templates.value, activeMonth.value)');
    expect(page).toContain('本月没有需要生成的固定费用');
    expect(page).toContain('该月没有需要生成的固定费用');
  });

  it('行内按钮 88rpx 触控，「已付清」用 ink-2 不用 ink-3', () => {
    const rowBtn = page.match(/\.row-btn\s*\{[^}]*\}/)?.[0] || '';
    expect(rowBtn).toContain('min-height: 88rpx');
    const rowDone = page.match(/\.row-done\s*\{[^}]*\}/)?.[0] || '';
    expect(rowDone).toContain('$staff-ink-2');
    expect(rowDone).not.toContain('$staff-ink-3');
  });

  it('API 层补齐七个固定费用方法，路径与后端一致', () => {
    for (const method of [
      'listTemplates',
      'createTemplate',
      'updateTemplate',
      'deactivateTemplate',
      'listBills',
      'payBill',
      'generateBills',
    ]) {
      expect(api).toContain(method);
    }
    expect(api).toContain("url: '/admin/finance/templates'");
    expect(api).toContain('url: `/admin/finance/templates/${id}`');
    expect(api).toContain('url: `/admin/finance/templates/${id}/deactivate`');
    expect(api).toContain("url: '/admin/finance/bills'");
    expect(api).toContain('url: `/admin/finance/bills/${id}/pay`');
    expect(api).toContain("url: '/admin/finance/bills/generate'");
    // 字段名与后端 DTO 对齐
    const payloadType =
      api.match(/export interface CreateExpenseTemplatePayload[\s\S]*?\n\}/)?.[0] ||
      '';
    for (const field of [
      'name',
      'titleTemplate',
      'category',
      'payeeName',
      'defaultAmount',
      'interval',
      'dayOfMonth',
      'monthOfYear',
      'servicePeriodMonths',
      'payerType',
    ]) {
      expect(payloadType).toContain(field);
    }
    // 页面自己 toast 后端 message，API 层不再弹一遍
    expect(api).toContain('suppressErrorToast: true');
  });

  it('分包注册 bills，标题「固定费用」深绿导航', () => {
    expect(pagesJson).toContain('"root": "pages/staff-finance"');
    expect(pagesJson).toContain('"path": "bills"');
    expect(pagesJson).toContain('"navigationBarTitleText": "固定费用"');

    const billsStyle =
      pagesJson.match(
        /"path": "bills"[\s\S]*?"navigationBarBackgroundColor": "(#[0-9a-fA-F]{6})"/,
      )?.[1] || '';
    expect(billsStyle.toLowerCase()).toBe('#1e3a2f');
  });

  it('非 ADMIN 直接输地址先拦下，不发请求', () => {
    expect(page).toContain("getStoredUser()?.role !== 'ADMIN'");
    expect(page).toContain('权限不足');
    expect(page).toContain('/pages/staff-workbench/index');
    const onShowBlock = page.match(/onShow\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || '';
    expect(onShowBlock).toContain('getStoredUser()');
    expect(onShowBlock).toContain('loadBills()');
    expect(onShowBlock).toContain('loadTemplates()');
  });

  it('页面不出现「删除」：固定费用只能停用', () => {
    expect(page).not.toContain('删除');
    // 也不存物理清除的接口调用
    expect(page).not.toContain('method: \'DELETE\'');
    expect(fnBlock('closeForm')).not.toContain('删除');
  });
});
