import { buildOrderImportSystemPrompt } from '../order-import-prompt';
import { PURCHASE_UNIT_SEED } from '../purchase-unit-catalog';

const channels = [
  { code: '淘宝/天猫', label: '淘宝/天猫', aliases: ['淘宝', '天猫'] },
];

const prompt = buildOrderImportSystemPrompt({
  channels,
  units: PURCHASE_UNIT_SEED,
});

describe('订单识别提示词 · 单位与规格分层（2026-11-12）', () => {
  it('单位从平台字典来，不再写死一份清单', () => {
    expect(prompt).toContain('采购单位字典');
    expect(prompt).toContain('包装单位');
    expect(prompt).toContain('计量单位');
    expect(prompt).toContain('kg（公斤/千克');
    expect(prompt).toContain('袋');
    expect(prompt).not.toContain('盒/袋/份/瓶/斤/公斤/克/两或null');
  });

  it('包装净含量归 spec，数量看 ×N，不把 4 斤当成 4 件或 1 斤', () => {
    expect(prompt).toContain('spec，不是 unit');
    expect(prompt).toContain('4斤;原切羊里脊羊菲力');
    expect(prompt).toContain('qty=1');
    expect(prompt).toContain('不要写成 qty=4、unit="斤"');
    expect(prompt).toContain('unit="件"');
  });

  it('散称按重量买时，数量单位仍按字典 code', () => {
    expect(prompt).toContain('3斤 羊心');
    expect(prompt).toContain('unit="斤"');
  });
});
