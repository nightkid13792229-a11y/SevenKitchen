/**
 * 工作台采购角标的守门人（2026-11-11）
 *
 * 事故：当天的日采清单 20:04 已经做完，工作台「采购管理」还挂着 2。
 * 查生产库，两条都不是真清单，是「手填记一笔」点开又退出留下的空草稿
 * （is_draft = true、0 个明细、列表里看不见），角标却把它们算成待采购。
 *
 * 所以角标只能算对用户可见的采购单。
 */

import { StaffWorkbenchController } from '../staff-workbench.controller';

const PRISMA_MODELS = [
  'order',
  'purchaseList',
  'packagingUnit',
  'reimbursement',
  'inventoryStocktake',
  'supplementOrder',
] as const;

function buildPrisma() {
  const countCalls: Record<string, any[]> = {};
  const prisma: any = {};

  for (const model of PRISMA_MODELS) {
    prisma[model] = {
      count: async (args: any) => {
        (countCalls[model] ||= []).push(args);
        return 0;
      },
    };
  }
  prisma.aftersaleCase = { count: async () => 0 };

  return { prisma, countCalls };
}

describe('工作台采购角标', () => {
  it('只统计真实待采购单，把识别/手填草稿排除在外', async () => {
    const { prisma, countCalls } = buildPrisma();
    const controller = new StaffWorkbenchController(prisma);

    await controller.getSummary('user-1', 'STAFF');

    expect(countCalls.purchaseList).toHaveLength(1);
    expect(countCalls.purchaseList[0].where).toEqual({
      status: 'PENDING',
      isDraft: false,
    });
  });
});
