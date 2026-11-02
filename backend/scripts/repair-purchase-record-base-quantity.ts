/**
 * 修复历史采购记录的「实际入库数量」。
 *
 * 背景（2026-11-02）：
 * 部分老采购记录的 actual_base_quantity 明显是把「数量 × 数量 / 数量 × 包装规格」
 * 重复换算了一遍，导致折算单价低到不合理。采购金额（actual_cost）本身是对的，
 * 报销金额按 actual_cost 结算，所以修数量不动金额、不动报销。
 *
 * 安全约束：
 * - 默认 dry-run，只读不写；必须显式 --apply 才落库。
 * - 有库存流水（inventory_ledger_entry）的记录默认拒绝，避免库存账对不上。
 * - 已报销的记录允许修，但会在 notes 写明「修正前 → 修正后」和原因。
 * - 不修改 actual_cost、不改报销单、不改采购清单状态。
 *
 * 用法：
 *   npx ts-node -r tsconfig-paths/register scripts/repair-purchase-record-base-quantity.ts \
 *     --file=./repairs.json
 *   ... --apply
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

interface RepairItem {
  purchaseRecordId: string;
  newBaseQuantity: number;
  newBaseUnit?: string;
  reason: string;
}

interface RepairFile {
  items: RepairItem[];
  operator?: string;
}

const prisma = new PrismaClient();

function readArgs() {
  const args = process.argv.slice(2);
  const fileArg = args.find((arg) => arg.startsWith('--file='));
  return {
    file: fileArg ? fileArg.slice('--file='.length) : '',
    apply: args.includes('--apply'),
  };
}

async function main() {
  const { file, apply } = readArgs();
  if (!file) {
    throw new Error('缺少 --file=repairs.json');
  }

  const payload = JSON.parse(readFileSync(file, 'utf-8')) as RepairFile;
  const items = payload.items || [];
  if (items.length === 0) {
    console.log('没有需要修复的记录');
    return;
  }

  const results: Array<Record<string, any>> = [];
  const pendingUpdates: Array<{
    id: string;
    data: { actualBaseQuantity: number; actualBaseUnit: string; notes: string };
  }> = [];

  for (const item of items) {
    const record = await prisma.purchaseRecord.findUnique({
      where: { id: item.purchaseRecordId },
      include: {
        purchaseList: {
          select: {
            id: true,
            status: true,
            reimbursementId: true,
            reimbursement: { select: { claimNumber: true, status: true } },
          },
        },
      },
    });

    if (!record) {
      results.push({ id: item.purchaseRecordId, verdict: '跳过：记录不存在' });
      continue;
    }

    const ledgerCount = await prisma.inventoryLedgerEntry.count({
      where: {
        sourceType: 'PURCHASE_RECORD' as any,
        sourceId: record.id,
      },
    });
    const ingredient = await prisma.ingredient.findUnique({
      where: { id: record.ingredientId },
      select: { name: true },
    });

    const oldBase = Number(record.actualBaseQuantity ?? 0);
    const newBase = Number(item.newBaseQuantity);
    const cost = Number(record.actualCost ?? 0);
    const oldUnit = oldBase > 0 ? cost / oldBase : null;
    const newUnit = newBase > 0 ? cost / newBase : null;

    const blockers: string[] = [];
    if (record.purchaseList?.status !== 'COMPLETED') {
      blockers.push('采购清单未完成');
    }
    if (ledgerCount > 0) {
      blockers.push(`已有 ${ledgerCount} 条库存流水，需要走库存调整`);
    }
    if (!Number.isFinite(newBase) || newBase <= 0) {
      blockers.push('新数量不合法');
    }

    results.push({
      id: record.id,
      ingredient: ingredient?.name ?? record.ingredientName,
      purchasedAt: record.purchasedAt.toISOString().slice(0, 10),
      claimNumber: record.purchaseList?.reimbursement?.claimNumber ?? '-',
      reimbursementStatus: record.purchaseList?.reimbursement?.status ?? '-',
      oldBase,
      newBase,
      oldUnitPerKg: oldUnit ? Math.round(oldUnit * 1000 * 100) / 100 : null,
      newUnitPerKg: newUnit ? Math.round(newUnit * 1000 * 100) / 100 : null,
      blockers,
      verdict: blockers.length === 0 ? (apply ? '已修复' : '可修复') : '拒绝',
    });

    if (blockers.length === 0) {
      const note = `[数据修正 ${new Date().toISOString().slice(0, 10)}] 实际入库数量 ${oldBase} → ${newBase}（${payload.operator || 'system'}）：${item.reason}。采购金额未变。`;
      pendingUpdates.push({
        id: record.id,
        data: {
          actualBaseQuantity: newBase,
          actualBaseUnit: item.newBaseUnit ?? record.actualBaseUnit ?? 'G',
          notes: record.notes ? `${record.notes}\n${note}` : note,
        },
      });
    }
  }

  console.table(results);

  if (apply && pendingUpdates.length > 0) {
    await prisma.$transaction(
      pendingUpdates.map((update) =>
        prisma.purchaseRecord.update({
          where: { id: update.id },
          data: update.data,
        }),
      ),
    );
    console.log(`\n已在同一个事务里更新 ${pendingUpdates.length} 条记录。`);
  }

  const refused = results.filter((row) => row.verdict === '拒绝').length;
  const ready = results.filter(
    (row) => row.verdict === '可修复' || row.verdict === '已修复',
  ).length;
  console.log(
    `\n合计 ${results.length} 条：可修复/已修复 ${ready} 条，拒绝 ${refused} 条。`,
  );
  if (!apply) {
    console.log('当前是 dry-run，没有写库。确认无误后加 --apply 再跑一次。');
  }
}

main()
  .catch((error) => {
    console.error('修复失败：', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
