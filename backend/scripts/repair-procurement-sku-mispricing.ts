/**
 * 修正采购商品（SKU）档案的错误标价 / 停用不可信商品。
 *
 * 背景（2026-11-02）：
 * 少数采购商品把「一件」的价格录成了「一份」的价格（例如鸭肝 12kg/件录成 10.2 元），
 * 导致后续采购记录和算价全部失真。历史采购记录不动，只修商品档案，
 * 让员工下次采购时选到正确的商品。
 *
 * 默认 dry-run；--apply 才写库，且所有更新在一个事务里。
 *
 * 用法：
 *   npx ts-node -r tsconfig-paths/register scripts/repair-procurement-sku-mispricing.ts \
 *     --file=./sku-repairs.json
 *   ... --apply
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

interface SkuRepairItem {
  procurementSkuId: string;
  isActive: boolean;
  reason: string;
}

interface SkuRepairFile {
  items: SkuRepairItem[];
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
    throw new Error('缺少 --file=sku-repairs.json');
  }

  const payload = JSON.parse(readFileSync(file, 'utf-8')) as SkuRepairFile;
  const items = payload.items || [];
  const results: Array<Record<string, any>> = [];
  const pendingUpdates: Array<{ id: string; data: any }> = [];

  for (const item of items) {
    const sku = await prisma.procurementSku.findUnique({
      where: { id: item.procurementSkuId },
      include: { ingredient: { select: { name: true } } },
    });

    if (!sku) {
      results.push({ id: item.procurementSkuId, verdict: '跳过：商品不存在' });
      continue;
    }

    const usedTimes = await prisma.purchaseRecord.count({
      where: { procurementSkuId: sku.id },
    });

    const ratio = Number(sku.purchaseToBaseRatio ?? 0);
    const price = Number(sku.currentPurchasePrice ?? 0);
    const unitPrice =
      ratio > 0 && price > 0 ? Math.round((price / ratio) * 1000 * 100) / 100 : null;

    const note = `[档案修正 ${new Date().toISOString().slice(0, 10)}] ${
      item.isActive ? '启用' : '停用'
    }（${payload.operator || 'system'}）：${item.reason}`;

    results.push({
      id: sku.id,
      ingredient: sku.ingredient?.name,
      name: sku.name,
      spec: sku.productModel,
      unit: sku.purchaseUnit,
      price,
      pricePerKg: unitPrice,
      usedTimes,
      isActive: sku.isActive,
      targetActive: item.isActive,
      verdict: apply ? '已更新' : '可更新',
    });

    pendingUpdates.push({
      id: sku.id,
      data: {
        isActive: item.isActive,
        notes: sku.notes ? `${sku.notes}\n${note}` : note,
      },
    });
  }

  console.table(results);

  if (apply && pendingUpdates.length > 0) {
    await prisma.$transaction(
      pendingUpdates.map((update) =>
        prisma.procurementSku.update({
          where: { id: update.id },
          data: update.data,
        }),
      ),
    );
    console.log(`\n已在同一个事务里更新 ${pendingUpdates.length} 个采购商品。`);
  } else if (!apply) {
    console.log('\n当前是 dry-run，没有写库。确认无误后加 --apply 再跑一次。');
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
