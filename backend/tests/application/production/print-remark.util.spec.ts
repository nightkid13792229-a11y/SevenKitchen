import {
  splitOrderRemarks,
  stripOperationLogLines,
} from '../../../src/application/production/print-remark.util';

describe('制作单备注：系统日志不进纸面', () => {
  const priceAudit =
    '[客服改价] 2026-11-05T17:13:10.946Z 操作人:51e87107-deca-47f9-94af-a14692162a04 金额:318.36 -> 0.00 原因:手机工作台改价';
  const assistedAudit =
    '[代客下单] 2026-11-01T02:03:04.000Z 操作人:staff-1 客户:c1 狗狗:d1 实际收款:99.00 备注:顾客要求少油';

  it('整行剔除客服改价日志', () => {
    expect(stripOperationLogLines(priceAudit)).toBe('');
  });

  it('保留日志前后人写的备注', () => {
    const text = `Seven 最近软便，鸡肝减半\n${priceAudit}\n分装按 184g 一袋`;

    expect(stripOperationLogLines(text)).toBe(
      'Seven 最近软便，鸡肝减半\n分装按 184g 一袋',
    );
    expect(stripOperationLogLines(text)).not.toContain('51e87107');
    expect(stripOperationLogLines(text)).not.toContain('2026-11-05T');
  });

  it('代客下单的审计行也不上纸', () => {
    expect(stripOperationLogLines(assistedAudit)).toBe('');
  });

  it('不误删管理员手写的方括号备注', () => {
    const human = '[注意] 少放油\n[加急] 明早出';

    expect(stripOperationLogLines(human)).toBe(human);
  });

  it('空值安全', () => {
    expect(stripOperationLogLines(null)).toBe('');
    expect(stripOperationLogLines(undefined)).toBe('');
    expect(stripOperationLogLines('   ')).toBe('');
  });

  it('顾客备注原样保留，一个字都不删', () => {
    const customerNote = '肠胃敏感，鸡肝减半；对鸡肉轻微过敏，请务必彻底煮熟。';

    expect(splitOrderRemarks(priceAudit, customerNote)).toEqual({
      adminRemark: '',
      customerNote,
    });
    expect(
      splitOrderRemarks(`人话\n${priceAudit}`, `[客服改价] 是顾客随手写的`),
    ).toEqual({
      adminRemark: '人话',
      customerNote: '[客服改价] 是顾客随手写的',
    });
  });
});
