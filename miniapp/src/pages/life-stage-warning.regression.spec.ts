import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('life-stage warning page integration', () => {
  const diySource = readFileSync(resolve(__dirname, './recipe-diy/index.vue'), 'utf8');
  const orderSource = readFileSync(resolve(__dirname, './recipe-order/index.vue'), 'utf8');

  it('uses the same reminder copy in DIY and order pages', () => {
    expect(diySource).toContain('生命阶段提醒');
    expect(orderSource).toContain('生命阶段提醒');
    expect(diySource).toContain('{{ lifeStageReminderText }}');
    expect(orderSource).toContain('{{ lifeStageReminderText }}');
    expect(diySource).toContain('我已知晓');
    expect(orderSource).toContain('我已知晓');
  });

  it('does not only display the first applicable life stage', () => {
    expect(diySource).not.toContain('applicableLifeStages[0]');
    expect(orderSource).not.toContain('applicableLifeStages[0]');
  });

  /**
   * 2026-09-19 重构：判定改由后端给出。
   * 这里反向锁死"页面不得再自己算生命阶段"——前端重算认不出混血犬的体型，
   * 且算不出时会被当成"匹配"静默放行。
   */
  it('gets the life-stage verdict from the backend instead of computing it locally', () => {
    for (const source of [diySource, orderSource]) {
      expect(source).toContain('../../utils/life-stage-match');
      // 走向后端要结论
      expect(source).toContain('fetchLifeStageMatch');
      expect(source).toContain('isLifeStageMismatch');
      expect(source).toContain('lifeStageVerdict');
      // 不得再出现前端重算
      expect(source).not.toContain('resolveDogRecipeLifeStage(');
      expect(source).not.toContain('resolveDogLifeStage(');
      expect(source).not.toContain('isRecipeLifeStageMatch(');
      // 拿不到后端结论时不得静默放行，要给出中性提示
      expect(source).toContain('lifeStageCheckFailed');
      expect(source).toContain('life-stage-unknown-note');
      // 不匹配时**每次下单都要确认一次**（不再因为点过"我已知晓"就跳过），并留痕
      expect(source).toContain('confirmLifeStageMismatch');
    }
  });

  it('re-confirms on every order instead of only once', () => {
    for (const source of [diySource, orderSource]) {
      // 不能再出现"确认过就置 false、从而跳过后续提醒"的写法
      expect(source).not.toContain('showWarning.value = false\n          void continueBuyNow()');
      expect(source).not.toContain('showWarning.value = false\n          void generateAndNavigateToSheet()');
    }
  });

  it('confirms mismatched life stage before entering checkout, and records it', () => {
    // 提示文案统一由共享工具给出（含"已告知"措辞），页面不再各写一份
    expect(orderSource).toContain('confirmLifeStageMismatch');
    expect(orderSource).toContain("source: 'order'");

    const helperSource = readFileSync(
      resolve(__dirname, '../utils/life-stage-match.ts'),
      'utf-8',
    );
    expect(helperSource).toContain('继续表示您已知晓并自行决定');
    // 确认之后必须留痕
    expect(helperSource).toContain('recordLifeStageAcknowledgement');
    expect(helperSource).toContain('/life-stage-acknowledgement');
  });
});
