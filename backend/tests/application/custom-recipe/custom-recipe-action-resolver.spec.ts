import { CustomRecipeStatus } from '@prisma/client';
import {
  CUSTOM_RECIPE_ACTIONS,
  buildCustomerHint,
  buildProgress,
  buildRenderableStatus,
  resolveCustomerActions,
  resolveStaffActions,
  type CustomRecipeActionContext,
  type CustomRecipeViewer,
} from '../../../src/application/custom-recipe/custom-recipe-action-resolver';
import type { RenderableAction } from '../../../src/interfaces/dto/common/renderable.dto';

/**
 * 动作解析器 · 测试（2026-10-16，批次 1.5）
 *
 * ## 为什么这组测试重要
 *
 * 这个文件是"前端只渲染"的落点：前端不再判断"能不能点、为什么不能点"。
 * 所以它一旦算错，**三个端一起错**，而且前端没有能力兜底。
 *
 * ## 测试策略：先立不变式，再测组合
 *
 * 最有力的不是"逐条写用例"，而是断言一条**对所有组合都成立**的性质：
 * **任何禁用的动作都必须给出原因**。
 * 一个点不动又不说话的按钮，顾客只会以为系统坏了 ——
 * 所以这条不变式在下面**穷举了 6 状态 × 3 角色**全部验证。
 */

const ALL_STATUSES = Object.values(CustomRecipeStatus);
const ALL_VIEWERS: CustomRecipeViewer[] = ['CUSTOMER', 'STAFF', 'ADMIN'];

function ctx(
  overrides: Partial<CustomRecipeActionContext> = {},
): CustomRecipeActionContext {
  return {
    status: CustomRecipeStatus.PAID,
    viewer: 'CUSTOMER',
    now: new Date('2026-10-16T10:00:00+08:00'),
    ...overrides,
  };
}

function find(
  actions: RenderableAction[],
  code: string,
): RenderableAction | undefined {
  return actions.find((action) => action.code === code);
}

describe('动作解析器', () => {
  describe('★ 不变式：禁用的动作必须说明原因（穷举 6 状态 × 3 角色）', () => {
    for (const status of ALL_STATUSES) {
      for (const viewer of ALL_VIEWERS) {
        it(`${status} / ${viewer}：每个 disabled 动作都带 disabledReason`, () => {
          const context = ctx({
            status,
            viewer,
            // 把所有可选条件都打开，尽量让更多动作出现
            hasAnyDelivery: true,
            hasUnconfirmedDelivery: true,
            hasOpenAftersale: false,
            aftersaleWindowClosesAt: new Date('2026-11-15T00:00:00+08:00'),
          });

          const actions = [
            ...resolveCustomerActions(context),
            ...resolveStaffActions(context),
          ];

          const silent = actions
            .filter((action) => !action.enabled)
            .filter(
              (action) =>
                !action.disabledReason || !action.disabledReason.trim(),
            )
            .map((action) => action.code);

          expect(silent).toEqual([]);
        });
      }
    }

    /**
     * ★ 后台能做的每一件事，契约里都要有（批次 5.6）
     *
     * ## 为什么专门守这条
     *
     * 后台列表页原来自已写死判断渲染三个按钮：
     * 「确认付款」「开始制作」「查看食谱」。
     * 我在把列表改成**契约驱动**时才发现 —— 契约里**根本没有「确认付款」**。
     *
     * 也就是说：如果直接换，老板会**凭空少一个操作**，
     * 而且这种缺失**不会报错**：页面上只是少了个按钮，
     * 谁也不会发现，直到哪天微信回调失败、钱到了账却确认不了。
     *
     * 所以这里逐个点名：**这几个后台操作，契约里必须查得到。**
     */
    it('★ 后台原有的每个操作，契约里都能查到', () => {
      const EXPECTED_ADMIN_ACTIONS: Array<{
        code: string;
        status: string;
        why: string;
      }> = [
        {
          code: 'CONFIRM_PAYMENT',
          status: 'PENDING_PAYMENT',
          why: '微信回调会失败，钱到账了得能手动确认',
        },
        {
          code: 'ACCEPT_ORDER',
          status: 'PAID',
          why: '收了钱要能开工（页面上的「开始制作」）',
        },
        {
          code: 'DESIGN',
          status: 'PAID',
          why: '要去设计食谱',
        },
        {
          code: 'DESIGN',
          status: 'IN_PROGRESS',
          why: '制作中也还要能回去改',
        },
        {
          code: 'DELIVER',
          status: 'IN_PROGRESS',
          why: '做完要能交付',
        },
        {
          code: 'DELIVER',
          status: 'COMPLETED',
          why: '售后改稿后要能**重新交付** —— 已完成是最需要它的时候',
        },
        {
          code: 'CONTACT_SERVICE',
          status: 'IN_PROGRESS',
          why: '联系客户',
        },
      ];

      for (const expected of EXPECTED_ADMIN_ACTIONS) {
        const actions = resolveStaffActions(
          ctx({
            status: expected.status as never,
            viewer: 'ADMIN',
            hasAnyDelivery: true,
          }),
        );
        const found = actions.find((a) => a.code === expected.code);
        expect({
          code: expected.code,
          status: expected.status,
          found: Boolean(found),
        }).toEqual({
          code: expected.code,
          status: expected.status,
          found: true,
          // 缺了就是缺了：这条失败说明后台会少一个 "why" 里说的操作
        });
      }
    });

    it('每个动作都有文案与 code（前端要照着渲染）', () => {
      for (const status of ALL_STATUSES) {
        for (const viewer of ALL_VIEWERS) {
          const context = ctx({ status, viewer, hasAnyDelivery: true });
          for (const action of [
            ...resolveCustomerActions(context),
            ...resolveStaffActions(context),
          ]) {
            expect(action.code).toBeTruthy();
            expect(action.label).toBeTruthy();
            expect(typeof action.enabled).toBe('boolean');
          }
        }
      }
    });
  });

  describe('顾客侧', () => {
    it('待付款：可支付、可取消、可联系客服', () => {
      const actions = resolveCustomerActions(
        ctx({ status: CustomRecipeStatus.PENDING_PAYMENT }),
      );

      expect(find(actions, CUSTOM_RECIPE_ACTIONS.PAY)?.enabled).toBe(true);
      expect(find(actions, CUSTOM_RECIPE_ACTIONS.CANCEL_SELF)?.enabled).toBe(
        true,
      );
      expect(find(actions, CUSTOM_RECIPE_ACTIONS.CONTACT_SERVICE)?.enabled).toBe(
        true,
      );
    });

    it('超过支付时限：支付按钮禁用并说明', () => {
      const actions = resolveCustomerActions(
        ctx({
          status: CustomRecipeStatus.PENDING_PAYMENT,
          paymentDeadlineAt: new Date('2026-10-16T09:00:00+08:00'), // 已过
        }),
      );

      const pay = find(actions, CUSTOM_RECIPE_ACTIONS.PAY);
      expect(pay?.enabled).toBe(false);
      expect(pay?.disabledReason).toContain('超过支付时限');
    });

    it('已付款：不出现「去支付」，但仍可自助取消', () => {
      const actions = resolveCustomerActions(
        ctx({ status: CustomRecipeStatus.PAID }),
      );

      expect(find(actions, CUSTOM_RECIPE_ACTIONS.PAY)).toBeUndefined();
      expect(find(actions, CUSTOM_RECIPE_ACTIONS.CANCEL_SELF)?.enabled).toBe(
        true,
      );
    });

    it('制作中：取消按钮禁用，并说明"已开始设计、可找客服"', () => {
      const actions = resolveCustomerActions(
        ctx({ status: CustomRecipeStatus.IN_PROGRESS }),
      );

      const cancel = find(actions, CUSTOM_RECIPE_ACTIONS.CANCEL_SELF);
      expect(cancel?.enabled).toBe(false);
      expect(cancel?.disabledReason).toContain('已经开始设计');
    });

    it('★ 按钮文案本身就说清会不会退款（措辞是业务口径，不该由前端判断）', () => {
      const unpaid = find(
        resolveCustomerActions(ctx({ status: CustomRecipeStatus.PENDING_PAYMENT })),
        CUSTOM_RECIPE_ACTIONS.CANCEL_SELF,
      );
      const paid = find(
        resolveCustomerActions(ctx({ status: CustomRecipeStatus.PAID })),
        CUSTOM_RECIPE_ACTIONS.CANCEL_SELF,
      );

      expect(unpaid?.label).toBe('取消订单');
      expect(paid?.label).toBe('取消并退款');
    });

    it('未付款时取消不算退款，已付款时取消要讲清全额退款（二次确认文案不同）', () => {
      const unpaid = find(
        resolveCustomerActions(ctx({ status: CustomRecipeStatus.PENDING_PAYMENT })),
        CUSTOM_RECIPE_ACTIONS.CANCEL_SELF,
      );
      const paid = find(
        resolveCustomerActions(ctx({ status: CustomRecipeStatus.PAID })),
        CUSTOM_RECIPE_ACTIONS.CANCEL_SELF,
      );

      expect(unpaid?.confirmText).toContain('重新下单');
      expect(unpaid?.confirmText).not.toContain('退款');
      expect(paid?.confirmText).toContain('全额原路退回');
    });

    it('有交付：出现「查看定制食谱」；未确认时出现「确认收到」', () => {
      const actions = resolveCustomerActions(
        ctx({
          status: CustomRecipeStatus.DELIVERED,
          hasAnyDelivery: true,
          hasUnconfirmedDelivery: true,
          aftersaleWindowClosesAt: new Date('2026-11-15T00:00:00+08:00'),
        }),
      );

      expect(find(actions, CUSTOM_RECIPE_ACTIONS.VIEW_DELIVERY)?.enabled).toBe(
        true,
      );
      expect(find(actions, CUSTOM_RECIPE_ACTIONS.CONFIRM_RECEIPT)?.enabled).toBe(
        true,
      );
    });

    it('已确认过之后不再下发「确认收到」', () => {
      const actions = resolveCustomerActions(
        ctx({
          status: CustomRecipeStatus.COMPLETED,
          hasAnyDelivery: true,
          hasUnconfirmedDelivery: false,
        }),
      );

      expect(
        find(actions, CUSTOM_RECIPE_ACTIONS.CONFIRM_RECEIPT),
      ).toBeUndefined();
    });

    it('超出售后窗口：「有问题」禁用并说明', () => {
      const actions = resolveCustomerActions(
        ctx({
          status: CustomRecipeStatus.COMPLETED,
          hasAnyDelivery: true,
          aftersaleWindowClosesAt: new Date('2026-10-01T00:00:00+08:00'), // 已过
        }),
      );

      const aftersale = find(actions, CUSTOM_RECIPE_ACTIONS.APPLY_AFTERSALE);
      expect(aftersale?.enabled).toBe(false);
      expect(aftersale?.disabledReason).toContain('超过售后受理期');
    });

    it('已有未处理售后：不能重复提交，并说明"正在处理中"', () => {
      const actions = resolveCustomerActions(
        ctx({
          status: CustomRecipeStatus.COMPLETED,
          hasAnyDelivery: true,
          hasOpenAftersale: true,
          aftersaleWindowClosesAt: new Date('2026-11-15T00:00:00+08:00'),
        }),
      );

      const aftersale = find(actions, CUSTOM_RECIPE_ACTIONS.APPLY_AFTERSALE);
      expect(aftersale?.enabled).toBe(false);
      expect(aftersale?.disabledReason).toContain('正在处理中');
    });

    it('已交付/已完成：出现「用这份食谱订购成品」', () => {
      for (const status of [
        CustomRecipeStatus.DELIVERED,
        CustomRecipeStatus.COMPLETED,
      ]) {
        const actions = resolveCustomerActions(ctx({ status }));
        expect(
          find(actions, CUSTOM_RECIPE_ACTIONS.ORDER_FINISHED_FOOD)?.enabled,
        ).toBe(true);
      }
    });

    it('已取消：不给任何后台动作，也不给支付', () => {
      const actions = resolveCustomerActions(
        ctx({ status: CustomRecipeStatus.CANCELLED }),
      );
      const codes = actions.map((action) => action.code);

      expect(codes).not.toContain(CUSTOM_RECIPE_ACTIONS.PAY);
      expect(codes).not.toContain(CUSTOM_RECIPE_ACTIONS.CONFIRM_RECEIPT);
      expect(codes).toContain(CUSTOM_RECIPE_ACTIONS.CONTACT_SERVICE);
    });

    it('「联系客服」永远可用，且永远排在最后', () => {
      for (const status of ALL_STATUSES) {
        const actions = resolveCustomerActions(ctx({ status }));
        const last = actions[actions.length - 1];
        expect(last.code).toBe(CUSTOM_RECIPE_ACTIONS.CONTACT_SERVICE);
        expect(last.enabled).toBe(true);
      }
    });
  });

  describe('后台侧 · 权限', () => {
    it('★ 顾客视角拿不到任何后台动作（不是禁用，是根本不下发）', () => {
      for (const status of ALL_STATUSES) {
        expect(resolveStaffActions(ctx({ status, viewer: 'CUSTOMER' }))).toEqual(
          [],
        );
      }
    });

    it('客服看得到「交付食谱」但点不了，并写明需要管理员', () => {
      const actions = resolveStaffActions(
        ctx({ status: CustomRecipeStatus.IN_PROGRESS, viewer: 'STAFF' }),
      );

      const deliver = find(actions, CUSTOM_RECIPE_ACTIONS.DELIVER);
      expect(deliver).toBeDefined();
      expect(deliver?.enabled).toBe(false);
      expect(deliver?.disabledReason).toContain('管理员');
    });

    it('管理员可以交付', () => {
      const actions = resolveStaffActions(
        ctx({ status: CustomRecipeStatus.IN_PROGRESS, viewer: 'ADMIN' }),
      );
      expect(find(actions, CUSTOM_RECIPE_ACTIONS.DELIVER)?.enabled).toBe(true);
    });

    it('客服看得到「取消订单」但点不了；管理员可以', () => {
      const staff = find(
        resolveStaffActions(ctx({ status: CustomRecipeStatus.PAID, viewer: 'STAFF' })),
        CUSTOM_RECIPE_ACTIONS.CANCEL_ADMIN,
      );
      const admin = find(
        resolveStaffActions(ctx({ status: CustomRecipeStatus.PAID, viewer: 'ADMIN' })),
        CUSTOM_RECIPE_ACTIONS.CANCEL_ADMIN,
      );

      expect(staff?.enabled).toBe(false);
      expect(staff?.disabledReason).toContain('管理员');
      expect(admin?.enabled).toBe(true);
    });

    it('取消已付款的单，二次确认要写明会立即全额退款', () => {
      const actions = resolveStaffActions(
        ctx({ status: CustomRecipeStatus.PAID, viewer: 'ADMIN' }),
      );
      const cancel = find(actions, CUSTOM_RECIPE_ACTIONS.CANCEL_ADMIN);

      expect(cancel?.confirmText).toContain('原路全额退款');
      expect(cancel?.danger).toBe(true);
    });

    it('待付款的单取消时不提退款（本来就没收到钱）', () => {
      const actions = resolveStaffActions(
        ctx({
          status: CustomRecipeStatus.PENDING_PAYMENT,
          viewer: 'ADMIN',
        }),
      );
      const cancel = find(actions, CUSTOM_RECIPE_ACTIONS.CANCEL_ADMIN);

      expect(cancel?.confirmText).not.toContain('退款');
    });
  });

  describe('后台侧 · 交付相关', () => {
    it('已付款就能交付（小额单或只要食谱的场景）', () => {
      const actions = resolveStaffActions(
        ctx({ status: CustomRecipeStatus.PAID, viewer: 'ADMIN' }),
      );
      expect(find(actions, CUSTOM_RECIPE_ACTIONS.DELIVER)?.enabled).toBe(true);
    });

    it('已交付时按钮变成「重新交付」，且二次确认写明会替换并再次通知', () => {
      const actions = resolveStaffActions(
        ctx({ status: CustomRecipeStatus.DELIVERED, viewer: 'ADMIN' }),
      );
      const deliver = find(actions, CUSTOM_RECIPE_ACTIONS.DELIVER);

      expect(deliver?.label).toBe('重新交付');
      expect(deliver?.confirmText).toContain('再次通知顾客');
    });

    it('已完成（售后改稿后）也能重新交付', () => {
      const actions = resolveStaffActions(
        ctx({ status: CustomRecipeStatus.COMPLETED, viewer: 'ADMIN' }),
      );
      expect(find(actions, CUSTOM_RECIPE_ACTIONS.DELIVER)?.enabled).toBe(true);
    });

    it('已取消的单不给交付按钮也不给取消按钮', () => {
      const actions = resolveStaffActions(
        ctx({ status: CustomRecipeStatus.CANCELLED, viewer: 'ADMIN' }),
      );
      const codes = actions.map((action) => action.code);

      expect(codes).not.toContain(CUSTOM_RECIPE_ACTIONS.DELIVER);
      expect(codes).not.toContain(CUSTOM_RECIPE_ACTIONS.CANCEL_ADMIN);
    });
  });

  describe('状态三件套与进度', () => {
    it('buildRenderableStatus 原样带上中文与档位，并且没传说明时给 null 而不是 undefined', () => {
      const status = buildRenderableStatus({
        code: CustomRecipeStatus.PAID,
        label: '已付款',
        tone: 'info',
      });

      expect(status).toEqual({
        code: 'PAID',
        label: '已付款',
        tone: 'info',
        customerHint: null,
      });
    });

    describe('buildCustomerHint：只给可执行的状态提示', () => {
      it('★ 只保留待付款/已取消；已付款/制作中/已交付/已完成不再下发（2026-10-24）', () => {
        // 日期在订单信息、阶段在进度里；"已交付……请确认"还和确认按钮一起下线
        for (const status of [
          CustomRecipeStatus.PAID,
          CustomRecipeStatus.IN_PROGRESS,
          CustomRecipeStatus.DELIVERED,
          CustomRecipeStatus.COMPLETED,
        ]) {
          expect(buildCustomerHint({ status })).toBeNull();
        }
        expect(
          buildCustomerHint({ status: CustomRecipeStatus.PENDING_PAYMENT }),
        ).toBeTruthy();
        expect(
          buildCustomerHint({ status: CustomRecipeStatus.CANCELLED }),
        ).toBeTruthy();
      });

      it('待付款带上支付截止日', () => {
        const hint = buildCustomerHint({
          status: CustomRecipeStatus.PENDING_PAYMENT,
          paymentDeadlineAt: new Date('2026-10-16T18:30:00+08:00'),
        });
        expect(hint).toContain('10 月 16 日');
        expect(hint).toContain('自动取消');
      });

      it('已取消带上退款进展', () => {
        const hint = buildCustomerHint({
          status: CustomRecipeStatus.CANCELLED,
          cancellationReason: '超时未付款，订单已自动取消。',
          refundStatus: 'SUCCESS',
          refundAmount: 300,
        });
        expect(hint).toContain('超时未付款');
        expect(hint).toContain('已退款 ¥300');
      });

      it('取消但退款还在处理中时，说的是"处理中"而不是"已退款"', () => {
        const hint = buildCustomerHint({
          status: CustomRecipeStatus.CANCELLED,
          refundStatus: 'PROCESSING',
        });
        expect(hint).toContain('退款处理中');
        expect(hint).not.toContain('已退款');
      });
    });

    describe('buildProgress', () => {
      it('已付款时前两步完成，当前停在"已付款"', () => {
        const progress = buildProgress({
          status: CustomRecipeStatus.PAID,
          createdAt: new Date('2026-10-16T10:00:00+08:00'),
          paymentConfirmedAt: new Date('2026-10-16T10:05:00+08:00'),
        });

        expect(progress.current).toBe('PAID');
        expect(progress.timeline.map((step) => step.done)).toEqual([
          true,
          true,
          false,
          false,
          false,
        ]);
      });

      it('已完成时全部节点打勾', () => {
        const progress = buildProgress({
          status: CustomRecipeStatus.COMPLETED,
          createdAt: new Date('2026-10-16T10:00:00+08:00'),
          paymentConfirmedAt: new Date('2026-10-16T10:05:00+08:00'),
          deliveredAt: new Date('2026-10-19T16:40:00+08:00'),
          completedAt: new Date('2026-10-20T09:00:00+08:00'),
        });

        expect(progress.current).toBe('COMPLETED');
        expect(progress.timeline.every((step) => step.done)).toBe(true);
      });

      it('已取消走另一条支线（两个节点），不混进正常时间轴', () => {
        const progress = buildProgress({
          status: CustomRecipeStatus.CANCELLED,
          createdAt: new Date('2026-10-16T10:00:00+08:00'),
        });

        expect(progress.current).toBe('CANCELLED');
        expect(progress.timeline).toHaveLength(2);
        expect(progress.timeline.map((step) => step.code)).toEqual([
          'CREATED',
          'CANCELLED',
        ]);
      });

      it('恰有一个节点被标为 active', () => {
        for (const status of ALL_STATUSES) {
          const progress = buildProgress({ status });
          const activeCount = progress.timeline.filter(
            (step) => step.active,
          ).length;
          expect(activeCount).toBe(1);
        }
      });
    });
  });
});
