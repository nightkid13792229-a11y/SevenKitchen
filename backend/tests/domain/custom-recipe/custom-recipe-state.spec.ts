import { CustomRecipeStatus, CustomRecipeSubStage } from '@prisma/client';
import {
  ALLOWED_STATUS_TRANSITIONS,
  STATUS_LABELS,
  SUB_STAGE_LABELS,
  allowedNextStatuses,
  assertTransition,
  canTransition,
  describeSubStageConflict,
  isOpenStatus,
  suggestSubStage,
  timestampFieldFor,
} from '../../../src/domain/custom-recipe/custom-recipe.state';

/**
 * 定制单状态机 · 测试（2026-10-16，批次 1.2）
 *
 * ## 这里的重点不是"测几个用例"，是**穷举**
 *
 * 状态机的错都是"漏了一条组合"，靠人想例子必然漏。
 * 所以下面把 **6×6 = 36 种状态对全部跑一遍**，逐一对照预期表。
 * 以后加一个状态，这个测试会立刻告诉你漏了哪些组合。
 *
 * 纯函数，不需要数据库与 mock —— 这也是把它从服务里搬出来的原因之一。
 */

const ALL_STATUSES = Object.values(CustomRecipeStatus);

/**
 * 预期流转表（人工维护的"第二份"）。
 *
 * ⚠️ 刻意与实现分开写：如果两边都从 `ALLOWED_STATUS_TRANSITIONS` 取，
 * 这个测试就等于在测"我等于我自己"。
 */
const EXPECTED: Record<CustomRecipeStatus, CustomRecipeStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['IN_PROGRESS', 'DELIVERED', 'CANCELLED'],
  IN_PROGRESS: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED', 'DELIVERED'],
  COMPLETED: ['DELIVERED'],
  CANCELLED: [],
} as Record<CustomRecipeStatus, CustomRecipeStatus[]>;

describe('定制单状态机', () => {
  describe('★ 穷举全部 36 种状态对', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const shouldAllow = EXPECTED[from].includes(to);

        it(`${from} → ${to} ${shouldAllow ? '应允许' : '应拒绝'}`, () => {
          expect(canTransition(from, to)).toBe(shouldAllow);
        });
      }
    }

    it('穷举数量对得上（防止将来加状态时忘了扩表）', () => {
      expect(ALL_STATUSES).toHaveLength(6);
      expect(ALL_STATUSES).toHaveLength(
        Object.keys(ALLOWED_STATUS_TRANSITIONS).length,
      );
    });
  });

  describe('相对旧表的四处变化（都有理由，不能悄悄改回去）', () => {
    it('DELIVERED 不再是死胡同 —— 可以到 COMPLETED', () => {
      // 旧表里 DELIVERED 的可流转列表是**空数组**，交货之后系统再也不会有动作
      expect(allowedNextStatuses(CustomRecipeStatus.DELIVERED)).toContain(
        CustomRecipeStatus.COMPLETED,
      );
    });

    it('DELIVERED → DELIVERED 自环代表「重新交付」', () => {
      expect(canTransition('DELIVERED', 'DELIVERED')).toBe(true);
    });

    it('COMPLETED → DELIVERED 回退代表「售后改稿后重新交付」', () => {
      expect(canTransition('COMPLETED', 'DELIVERED')).toBe(true);
    });

    it('CANCELLED 仍是终态', () => {
      expect(allowedNextStatuses(CustomRecipeStatus.CANCELLED)).toEqual([]);
    });
  });

  describe('assertTransition 的报错要能照着做', () => {
    it('合法时静默通过', () => {
      expect(() =>
        assertTransition('PAID', CustomRecipeStatus.IN_PROGRESS),
      ).not.toThrow();
    });

    it('报错里写明「从哪到哪」+「允许去哪」，并带中文', () => {
      expect(() =>
        assertTransition('DELIVERED', CustomRecipeStatus.PENDING_PAYMENT),
      ).toThrow(
        /不能从 DELIVERED（已交付）改为 PENDING_PAYMENT（待付款）；允许的去向：COMPLETED（已完成）、DELIVERED（已交付）/,
      );
    });

    it('终态被拒时说明"这是终态"，而不是给一个空的允许列表', () => {
      expect(() =>
        assertTransition('CANCELLED', CustomRecipeStatus.PAID),
      ).toThrow(/无（这是终态）/);
    });
  });

  describe('时间戳字段（防止"某个时间戳从来没被写过"重演）', () => {
    it('每个状态对应正确的字段', () => {
      expect(timestampFieldFor(CustomRecipeStatus.PAID)).toBe(
        'paymentConfirmedAt',
      );
      expect(timestampFieldFor(CustomRecipeStatus.IN_PROGRESS)).toBe(
        'inProgressAt',
      );
      expect(timestampFieldFor(CustomRecipeStatus.DELIVERED)).toBe(
        'deliveredAt',
      );
      expect(timestampFieldFor(CustomRecipeStatus.COMPLETED)).toBe(
        'completedAt',
      );
    });

    it('待付款与已取消不需要时间戳（取消另有 cancelledAt）', () => {
      expect(timestampFieldFor(CustomRecipeStatus.PENDING_PAYMENT)).toBeNull();
      expect(timestampFieldFor(CustomRecipeStatus.CANCELLED)).toBeNull();
    });

    it('★ 每个非初始状态都必须有归它的时间戳（漏了就是历史 bug 重演）', () => {
      const needsTimestamp: CustomRecipeStatus[] = [
        CustomRecipeStatus.PAID,
        CustomRecipeStatus.IN_PROGRESS,
        CustomRecipeStatus.DELIVERED,
        CustomRecipeStatus.COMPLETED,
      ];
      const missing = needsTimestamp.filter(
        (status) => timestampFieldFor(status) === null,
      );
      expect(missing).toEqual([]);
    });
  });

  describe('子阶段', () => {
    it('每个子阶段都有中文（后台工作台要显示）', () => {
      for (const stage of Object.values(CustomRecipeSubStage)) {
        expect(SUB_STAGE_LABELS[stage]).toBeTruthy();
      }
    });

    it('每个主状态都有中文', () => {
      for (const status of ALL_STATUSES) {
        expect(STATUS_LABELS[status]).toBeTruthy();
      }
    });

    it('拦截明显自相矛盾的组合', () => {
      expect(
        describeSubStageConflict(
          CustomRecipeStatus.CANCELLED,
          CustomRecipeSubStage.DESIGNING,
        ),
      ).toContain('已取消');
      expect(
        describeSubStageConflict(
          CustomRecipeStatus.PENDING_PAYMENT,
          CustomRecipeSubStage.DESIGNING,
        ),
      ).toContain('还没付款');
      expect(
        describeSubStageConflict(
          CustomRecipeStatus.COMPLETED,
          CustomRecipeSubStage.DESIGNING,
        ),
      ).toContain('已完成');
    });

    it('合理的组合一律放行（子阶段是内部标记，不该被卡死）', () => {
      expect(
        describeSubStageConflict(
          CustomRecipeStatus.IN_PROGRESS,
          CustomRecipeSubStage.DESIGNING,
        ),
      ).toBeNull();
      expect(
        describeSubStageConflict(
          CustomRecipeStatus.COMPLETED,
          CustomRecipeSubStage.READY_TO_DELIVER,
        ),
      ).toBeNull();
      // 没填子阶段也不算冲突（历史订单就是这样）
      expect(
        describeSubStageConflict(CustomRecipeStatus.PAID, null),
      ).toBeNull();
    });

    it('按主状态给出合理默认值；不确定时返回 null 而不是硬猜', () => {
      expect(suggestSubStage(CustomRecipeStatus.PAID)).toBe(
        CustomRecipeSubStage.PENDING_ACCEPT,
      );
      expect(suggestSubStage(CustomRecipeStatus.IN_PROGRESS)).toBe(
        CustomRecipeSubStage.DESIGNING,
      );
      expect(suggestSubStage(CustomRecipeStatus.DELIVERED)).toBe(
        CustomRecipeSubStage.READY_TO_DELIVER,
      );
      // 待付款与已取消没有"正在进行"的阶段 —— 不给默认值
      expect(suggestSubStage(CustomRecipeStatus.PENDING_PAYMENT)).toBeNull();
      expect(suggestSubStage(CustomRecipeStatus.CANCELLED)).toBeNull();
    });
  });

  describe('isOpenStatus', () => {
    it('已取消不算进行中，其余都算', () => {
      expect(isOpenStatus(CustomRecipeStatus.CANCELLED)).toBe(false);
      for (const status of ALL_STATUSES) {
        if (status === CustomRecipeStatus.CANCELLED) continue;
        expect(isOpenStatus(status)).toBe(true);
      }
    });
  });
});
