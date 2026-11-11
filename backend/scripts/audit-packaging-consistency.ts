/**
 * 采购商品包装层级一致性巡检（2026-11-11）。
 *
 *   npm run audit:packaging            # 只报告，不改任何数据
 *   npm run audit:packaging -- --apply # 给缺层级的商品补上（其余一律不动）
 *
 * 报什么：倍数与层级不符 / 采购单位不在字典 / 没有层级 / 规格原文与层级矛盾。
 * 为什么不做自动修：倍数和规格原文哪一个对，只有人知道；自动改会把错账"修正"成另一个错账。
 */

import { PrismaClient } from '@prisma/client';
import {
  auditSkuRows,
  type AuditFinding,
  type AuditSkuRow,
} from '../src/domain/purchasing/packaging-audit';
import { packagingFromLegacy } from '../src/domain/purchasing/packaging';
import {
  loadPurchaseUnitOptions,
  unitsForBaseUnit,
} from '../src/application/purchasing/purchase-unit-catalog';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  const unitOptions = await loadPurchaseUnitOptions(prisma as any);

  const skus = await prisma.procurementSku.findMany({
    select: {
      id: true,
      name: true,
      purchaseUnit: true,
      purchaseToBaseRatio: true,
      packaging: true,
      productModel: true,
      ingredient: { select: { name: true, baseUnit: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const rows: AuditSkuRow[] = skus.map((sku) => {
    const baseUnit = String(sku.ingredient?.baseUnit ?? 'G').toUpperCase();
    return {
      id: sku.id,
      name: sku.name,
      ingredientName: sku.ingredient?.name ?? null,
      purchaseUnit: sku.purchaseUnit,
      purchaseToBaseRatio: sku.purchaseToBaseRatio,
      packaging: sku.packaging,
      productModel: sku.productModel,
      baseUnit,
      allowedUnits: unitsForBaseUnit(unitOptions, baseUnit).map((item) => item.code),
    };
  });

  const findings = auditSkuRows(rows);
  printFindings(findings, rows.length);

  if (APPLY) {
    await backfillMissing(rows);
  }

  const critical = findings.filter(
    (item) => item.kind === 'RATIO_MISMATCH' || item.kind === 'TEXT_CONFLICT',
  );
  console.log(
    `\n汇总：${rows.length} 个采购商品，${findings.length} 条问题` +
      `（其中需要人工看的 ${critical.length} 条）`,
  );
  if (critical.length > 0) {
    console.log('有需要人工核对的问题，退出码 1（CI/巡检可据此报警）');
    process.exitCode = 1;
  }
}

function printFindings(findings: AuditFinding[], total: number) {
  if (findings.length === 0) {
    console.log(`检查了 ${total} 个采购商品：全部一致。`);
    return;
  }
  const byKind = new Map<string, AuditFinding[]>();
  for (const item of findings) {
    const list = byKind.get(item.kind) ?? [];
    list.push(item);
    byKind.set(item.kind, list);
  }
  for (const [kind, list] of byKind) {
    console.log(`\n== ${kind}（${list.length}）==`);
    for (const item of list.slice(0, 30)) {
      console.log(`- ${item.ingredientName ?? '?'} / ${item.name}：${item.detail}`);
    }
    if (list.length > 30) {
      console.log(`  …还有 ${list.length - 30} 条`);
    }
  }
}

async function backfillMissing(rows: AuditSkuRow[]) {
  const missing = rows.filter((row) => row.packaging === null || row.packaging === undefined);
  if (missing.length === 0) {
    console.log('\n--apply：没有需要补层级的商品。');
    return;
  }
  for (const row of missing) {
    const ratio = Number(row.purchaseToBaseRatio ?? 0);
    if (!(ratio > 0)) continue;
    const spec = packagingFromLegacy({
      ratio,
      baseUnit: row.baseUnit ?? 'G',
      printedText: row.productModel ?? null,
    });
    await prisma.procurementSku.update({
      where: { id: row.id },
      data: { packaging: spec as any },
    });
  }
  console.log(`\n--apply：已为 ${missing.length} 个商品补上"只有末层"的层级（倍数不变）。`);
}

main()
  .catch((error) => {
    console.error('巡检失败：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
