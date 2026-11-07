import { describe, expect, it } from 'vitest';
import {
  computeItemOutcome,
  computeRecordOutcome,
  computeRecordProgress,
} from './record-math';

describe('采购记录弹窗计算', () => {
  it('没有历史记录时，还需 = 目标缺口', () => {
    const progress = computeRecordProgress({
      targetShortage: 931,
      existingBought: 0,
    });
    expect(progress.remaining).toBe(931);
    expect(progress.total).toBe(931);
    expect(progress.progressPercent).toBe(0);
    expect(progress.progressOver).toBe(false);
    expect(progress.needForThisRecord).toBe(931);
  });

  it('已有一条 500g 记录、再记一条时，还需 431g', () => {
    const progress = computeRecordProgress({
      targetShortage: 931,
      existingBought: 500,
    });
    expect(progress.remaining).toBe(431);
    expect(progress.progressPercent).toBe(54);
    expect(progress.needForThisRecord).toBe(431);
    expect(computeRecordOutcome(560, progress.needForThisRecord)).toEqual({
      kind: 'over',
      value: 129,
    });
  });

  it('编辑那条 500g 记录时，这条记录要覆盖 931g，不会重复扣减', () => {
    const progress = computeRecordProgress({
      targetShortage: 931,
      existingBought: 500,
      editingBought: 500,
    });
    expect(progress.remaining).toBe(431);
    expect(progress.needForThisRecord).toBe(931);
    expect(computeRecordOutcome(500, progress.needForThisRecord)).toEqual({
      kind: 'short',
      value: 431,
    });
    expect(computeRecordOutcome(931, progress.needForThisRecord)).toEqual({
      kind: 'ok',
      value: 0,
    });
    expect(computeRecordOutcome(1000, progress.needForThisRecord)).toEqual({
      kind: 'over',
      value: 69,
    });
  });

  it('两条 560g 记录已经超过 931g，进度封顶 100%，整项显示多', () => {
    const progress = computeRecordProgress({
      targetShortage: 931,
      existingBought: 1120,
    });
    expect(progress.remaining).toBe(0);
    expect(progress.progressPercent).toBe(100);
    expect(progress.progressOver).toBe(true);
    expect(
      computeItemOutcome({ targetShortage: 931, bought: 1120, grossNeed: 931 }),
    ).toEqual({ kind: 'over', value: 189 });
  });

  it('库存抵扣后目标缺口 331g：买够 331g 是买齐，不是还差', () => {
    const progress = computeRecordProgress({
      targetShortage: 331,
      existingBought: 0,
    });
    expect(progress.remaining).toBe(331);
    expect(progress.total).toBe(331);
    expect(
      computeItemOutcome({ targetShortage: 331, bought: 331, grossNeed: 931 }),
    ).toEqual({ kind: 'ok', value: 0 });
  });

  it('目标缺口 0、但记录超过订单总需求时，整项显示多', () => {
    expect(
      computeItemOutcome({ targetShortage: 0, bought: 1120, grossNeed: 931 }),
    ).toEqual({ kind: 'over', value: 189 });
  });

  it('没买够时整项显示还差', () => {
    expect(
      computeItemOutcome({ targetShortage: 931, bought: 500, grossNeed: 931 }),
    ).toEqual({ kind: 'short', value: 431 });
  });
});
