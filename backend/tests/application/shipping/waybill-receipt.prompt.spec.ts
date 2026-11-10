import {
  parseWaybillReceipt,
  WAYBILL_RECEIPT_SYSTEM_PROMPT,
} from 'src/application/shipping/waybill-receipt.prompt';

/**
 * 存根识别结果的收口（2026-11-10）。
 *
 * 模型给的是一坨自由 JSON，这里是它进业务之前的最后一道闸：
 * 读不到的一律 null，**绝不拿"看起来对"的值补坑**。
 * 运单号补一位 = 一个根本不存在的号；运费猜一个数 = 成本统计直接错。
 */
describe('存根识别 · parseWaybillReceipt', () => {
  it('★ 正常存根：读出三项 + 收件人', () => {
    const parsed = parseWaybillReceipt({
      documentType: 'waybill_receipt',
      carrierName: '顺丰速运',
      trackingNumber: 'SF0204691009893',
      shippingFee: 56,
      recipient: {
        name: '张赛珺',
        phoneMasked: '186****2107',
        address: '上海市上海市普陀区礼泉路700弄55号703',
      },
    });

    expect(parsed).toEqual({
      documentType: 'waybill_receipt',
      carrierCode: 'SF',
      carrierName: '顺丰速运',
      trackingNumber: 'SF0204691009893',
      shippingFee: 56,
      recipientName: '张赛珺',
      recipientPhoneMasked: '186****2107',
      recipientAddress: '上海市上海市普陀区礼泉路700弄55号703',
    });
  });

  it('★ 不是存根 → documentType other，其余一律 null', () => {
    const parsed = parseWaybillReceipt({
      documentType: 'other',
      trackingNumber: 'SF0204691009893',
      shippingFee: 56,
      recipient: { name: '张赛珺' },
    });

    expect(parsed).toEqual({
      documentType: 'other',
      carrierCode: null,
      carrierName: null,
      trackingNumber: null,
      shippingFee: null,
      recipientName: null,
      recipientPhoneMasked: null,
      recipientAddress: null,
    });
  });

  it('模型没给 documentType 时按存根处理（不能因为漏字段就整张作废）', () => {
    expect(
      parseWaybillReceipt({ trackingNumber: 'SF0204691009893' }).documentType,
    ).toBe('waybill_receipt');
  });

  it('★ 月结存根没有运费 → null', () => {
    expect(
      parseWaybillReceipt({
        documentType: 'waybill_receipt',
        trackingNumber: 'SF0204691009893',
        shippingFee: null,
      }).shippingFee,
    ).toBeNull();
  });

  it('运费是字符串也认，负数与无法解析的都归 null', () => {
    expect(
      parseWaybillReceipt({ shippingFee: '56.00' }).shippingFee,
    ).toBe(56);
    expect(parseWaybillReceipt({ shippingFee: -1 }).shippingFee).toBeNull();
    expect(parseWaybillReceipt({ shippingFee: 'abc' }).shippingFee).toBeNull();
    expect(parseWaybillReceipt({ shippingFee: '' }).shippingFee).toBeNull();
  });

  it('运费保留两位小数', () => {
    expect(parseWaybillReceipt({ shippingFee: 56.999 }).shippingFee).toBe(57);
  });

  it('★ 承运商认不出来就是 null', () => {
    expect(
      parseWaybillReceipt({
        documentType: 'waybill_receipt',
        carrierName: '某某快运',
      }).carrierCode,
    ).toBeNull();
  });

  it('★ 运单号太短（少于 5 位）→ null，不许当单号用', () => {
    expect(
      parseWaybillReceipt({ documentType: 'waybill_receipt', trackingNumber: '1234' })
        .trackingNumber,
    ).toBeNull();
  });

  it('运单号里混了中文 → null', () => {
    expect(
      parseWaybillReceipt({
        documentType: 'waybill_receipt',
        trackingNumber: '运单号 SF0204691009893',
      }).trackingNumber,
    ).toBeNull();
  });

  it('运单号前后空格会被去掉', () => {
    expect(
      parseWaybillReceipt({
        documentType: 'waybill_receipt',
        trackingNumber: '  SF0204691009893  ',
      }).trackingNumber,
    ).toBe('SF0204691009893');
  });

  it('收件人字段空串一律归 null', () => {
    const parsed = parseWaybillReceipt({
      documentType: 'waybill_receipt',
      recipient: { name: '  ', phoneMasked: '', address: null },
    });

    expect(parsed.recipientName).toBeNull();
    expect(parsed.recipientPhoneMasked).toBeNull();
    expect(parsed.recipientAddress).toBeNull();
  });

  it('★ 快递公司名要原样带出来（页面绿条要显示"顺丰速运"）', () => {
    expect(
      parseWaybillReceipt({
        documentType: 'waybill_receipt',
        carrierName: ' 顺丰速运 ',
        trackingNumber: 'SF0204691009893',
      }).carrierName,
    ).toBe('顺丰速运');
  });

  it('★ 认不出快递公司时，公司名也给 null（页面会说"没认出快递公司"）', () => {
    expect(
      parseWaybillReceipt({
        documentType: 'waybill_receipt',
        carrierName: '某某快运',
        trackingNumber: 'SF0204691009893',
      }).carrierName,
    ).toBeNull();
  });

  it('模型返回 null / 字符串这种废数据不炸', () => {
    expect(parseWaybillReceipt(null).documentType).toBe('waybill_receipt');
    expect(parseWaybillReceipt('nonsense').trackingNumber).toBeNull();
  });
});

describe('存根识别 · 提示词', () => {
  it('★ 写死了"不许补位"', () => {
    expect(WAYBILL_RECEIPT_SYSTEM_PROMPT).toContain('不许');
  });

  it('写死了"看不到运费给 null"', () => {
    expect(WAYBILL_RECEIPT_SYSTEM_PROMPT).toContain('null');
  });

  it('写死了"不是存根就返回 other"', () => {
    expect(WAYBILL_RECEIPT_SYSTEM_PROMPT).toContain('other');
  });
});
