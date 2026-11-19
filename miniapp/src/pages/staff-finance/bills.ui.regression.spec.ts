import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildTemplateFormPayload,
  serviceMonthsForEdit,
  serviceMonthsForInterval,
} from './bills-logic';

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');

const page = read('./bills.vue');
const financeConstants = read('../../constants/finance.ts');
const logic = read('./bills-logic.ts');
const api = read('../../api/staff-finance.ts');
const pagesJson = read('../../pages.json');


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
    // 起账月从公共常量来，不在页面里各写一遍
    expect(page).toContain('FINANCE_START_MONTH');
    expect(financeConstants).toContain("FINANCE_START_DATE = '2026-11-01'");
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

  it('标记已付弹层可改实付金额、可选账户，默认剩余应付与账单账户', () => {
    expect(page).toContain('标记已付');
    expect(page).toContain('剩余应付');
    // 默认填剩余应付
    expect(page).toContain('remainingOf(bill).toFixed(2)');
    // 2026-11-19：付款方换成「从哪个账户出」，默认账单上的账户
    expect(page).toContain('从哪个账户出');
    expect(page).toContain('payPayerAccount');
    const openPayBlock = page.match(/function openPay[\s\S]*?\n\}/)?.[0] || '';
    expect(openPayBlock).toContain('bill.payerAccount');
    expect(openPayBlock).toContain('getLastAccount()');
    // 确认后调 payBill 并刷新账单
    expect(page).toContain('payBill');
    expect(page).toContain('payerAccount: payPayerAccount.value');
    // 付款只改状态：toast 要说清支出不变，别让老板以为没反应
    expect(page).toContain('已标记为已付（支出不变，按月份已计入）');
    expect(page).toContain('loadBills()');
    expect(page).not.toContain('我个人垫的');
  });

  it('待付区说明固定费用按所属月份整月计入，付款不影响当月支出', () => {
    expect(page).toContain('按所属月份整月计入');
    expect(page).toContain('哪天付款都不影响当月支出');
    // 小字：24rpx（$staff-font-caption）+ ink-2
    const hint = page.match(/\.card-hint\s*\{[^}]*\}/)?.[0] || '';
    expect(hint).toContain('font-size: $staff-font-caption');
    expect(hint).toContain('color: $staff-ink-2');
  });

  it('补生成本月：0 笔提示本月都已生成，N 笔提示已生成 N 笔', () => {
    expect(page).toContain('补生成');
    expect(page).toContain('补生成本月');
    expect(page).toContain('generateBills');
    expect(page).toContain('已生成 ${created} 笔');
    expect(page).toContain('本月都已生成');
    expect(page).toContain('该月都已生成');
  });

  it('我设的固定项目：周期/几号/账户/启用状态都露出来', () => {
    expect(page).toContain('我设的固定项目');
    expect(page).toContain('intervalLabel(template.interval)');
    expect(page).toContain('dayLabel(template.dayOfMonth)');
    // 每行显示账户（房租/社保这类走卡）
    expect(page).toContain('accountLabel(template.payerAccount)');
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
      'formCategoryId',
      'formAmountText',
      'formInterval',
      'formDayIndex',
      'formPayerAccount',
    ]) {
      expect(page).toContain(field);
    }
    // 类别和账户都走选择器组件，不再是一排写死的 chips
    expect(page).toContain('CategoryPicker');
    expect(page).toContain('AccountPicker');
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

  it('新建固定费用表单：类别走字典、账户默认银行卡，服务期默认 1、年付 12、季付 3', () => {
    expect(page).toContain('新建固定费用');
    expect(page).toContain('服务期月数');
    expect(page).toContain("formServiceMonthsText = ref('1')");
    // 默认值与区间夹取在纯逻辑模块里（可执行断言，见下面用例）
    expect(page).toContain('serviceMonthsForInterval');
    expect(page).toContain('serviceMonthsForEdit');
    expect(logic).toContain("if (!valid || parsed === 1) return '12'");
    expect(logic).toContain("return interval === 'QUARTERLY' ? '3' : '12'");
    // 类别不再写死枚举：表单用类别字典选择器，提交 categoryId
    expect(page).toContain('formCategoryId');
    expect(page).toContain('categoryId: formCategoryId.value');
    expect(page).toContain('请选择类别');
    expect(page).not.toContain('CATEGORY_OPTIONS');
    // 出账账户：默认「我的银行卡」（没有上次记录时）
    expect(page).toContain("getLastAccount('PERSONAL_BANK')");
    expect(page).toContain('payerAccount: formPayerAccount.value');
  });

  it('固定费用页右上角能进「费用类别」管理页', () => {
    expect(page).toContain('费用类别');
    expect(page).toContain('/pages/staff-finance/categories');
    expect(page).toContain('goCategories');
  });

  it('历史账单的类别名也查得到：拉类别带 includeInactive', () => {
    // 账单可能引用已停用/已合并的类别，只拉启用类别会让历史行显示成空白或旧枚举名
    const loadBlock =
      page.match(/async function loadCategories\([\s\S]*?\n\}/)?.[0] || '';
    expect(loadBlock).toContain('listCategories(true)');
    expect(loadBlock).not.toContain('listCategories()');
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
    // 季付不跟着变成 1：默认 3 个月
    expect(serviceMonthsForInterval('QUARTERLY', '12')).toBe('3');
    expect(serviceMonthsForInterval('QUARTERLY', '1')).toBe('3');

    const payload = buildTemplateFormPayload({
      name: '房租',
      categoryId: 'cat-rent',
      amount: 5000,
      interval: 'MONTHLY',
      dayOfMonth: 1,
      servicePeriodMonths: Number(monthsText),
      payerAccount: 'PERSONAL_BANK',
      editing: null,
    });
    expect(payload.servicePeriodMonths).toBe(1);
    // 就算调用方手误传 12，月付也会被强制回 1
    expect(
      buildTemplateFormPayload({
        name: '房租',
        categoryId: 'cat-rent',
        amount: 5000,
        interval: 'MONTHLY',
        dayOfMonth: 1,
        servicePeriodMonths: 12,
        payerAccount: 'PERSONAL_BANK',
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
      categoryId: 'cat-network',
      amount: 1200,
      interval: 'YEARLY',
      dayOfMonth: 15,
      servicePeriodMonths: 12,
      payerAccount: 'PERSONAL_WECHAT',
      monthOfYear: 3,
      editing: null,
    });
    expect(yearly.monthOfYear).toBe(3);
    expect(yearly.servicePeriodMonths).toBe(12);

    // 月付/季付不带 monthOfYear，后端按每月/每季规则生成
    const monthly = buildTemplateFormPayload({
      name: '房租',
      categoryId: 'cat-rent',
      amount: 5000,
      interval: 'MONTHLY',
      dayOfMonth: 1,
      servicePeriodMonths: 1,
      payerAccount: 'PERSONAL_BANK',
      monthOfYear: 3,
      editing: null,
    });
    expect(monthly.monthOfYear).toBeUndefined();
  });

  it('季付默认 3、允许 1-3；编辑 QUARTERLY+3 往返保存仍是 3', () => {
    // 切到季付：默认 3；填过 2 的保留；超出 3 的收敛到 3
    expect(serviceMonthsForInterval('QUARTERLY', '1')).toBe('3');
    expect(serviceMonthsForInterval('QUARTERLY', '2')).toBe('2');
    expect(serviceMonthsForInterval('QUARTERLY', '5')).toBe('3');

    // 打开编辑：沿用库里原值，不要把 3 强改成 1
    const opened = serviceMonthsForEdit('QUARTERLY', 3);
    expect(opened).toBe('3');
    // 不改字段直接保存：提交值仍是 3
    const payload = buildTemplateFormPayload({
      name: '季税费',
      categoryId: 'cat-tax',
      amount: 900,
      interval: 'QUARTERLY',
      dayOfMonth: 10,
      servicePeriodMonths: Number(opened),
      payerAccount: 'PERSONAL_BANK',
      editing: null,
    });
    expect(payload.servicePeriodMonths).toBe(3);

    // 月付才归 1；季付/年付老数据原样带出，不静默改写
    expect(serviceMonthsForEdit('MONTHLY', 12)).toBe('1');
    expect(serviceMonthsForEdit('QUARTERLY', 12)).toBe('12');
    expect(serviceMonthsForEdit('YEARLY', 12)).toBe('12');
  });

  it('补生成用后端 dueCount 区分「都已生成」和「没有需要生成的」', () => {
    // 周期规则只在后端算一份：页面按 dueCount 判断，不再复刻
    expect(api).toContain('dueCount: number');
    expect(page).toContain('result?.dueCount');
    expect(page).toContain('dueCount > 0');
    expect(page).toContain('本月没有需要生成的固定费用');
    expect(page).toContain('该月没有需要生成的固定费用');
    expect(page).not.toContain('dueTemplatesForMonth');
    expect(logic).not.toContain('dueTemplatesForMonth');
    expect(logic).not.toContain('(monthNumber - 1) % 3');
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
      'categoryId',
      'payeeName',
      'defaultAmount',
      'interval',
      'dayOfMonth',
      'monthOfYear',
      'servicePeriodMonths',
      'payerAccount',
    ]) {
      expect(payloadType).toContain(field);
    }
    // 旧枚举/付款方字段不再上送（后端保留一版，页面不该再用）
    expect(payloadType).not.toContain('payerType');
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
