/**
 * 补剂商城 · 上架清单体检（只读，不改任何数据）
 *
 * 用法：
 *   npm run audit:supplement-shop-catalog
 *   npm run audit:supplement-shop-catalog -- --json
 *
 * 用途：在任意环境（含生产只读）跑一遍，导出「哪些补剂可以直接上架、
 * 哪些缺价/缺形态/缺效期/单位口径不一致」，作为第 0 期的人工录入清单。
 */

import { PrismaClient } from '@prisma/client';
import {
  SupplementCatalogService,
  type SupplementCatalogItem,
} from '../src/application/supplement-shop/supplement-catalog.service';

const prisma = new PrismaClient();

const FORM_LABELS: Record<string, string> = {
  POWDER: '粉剂',
  TABLET: '片剂',
  CAPSULE: '胶囊',
  LIQUID: '液体',
};

function formLabel(code: string | null): string {
  if (!code) return '—';
  return FORM_LABELS[code] || code;
}

function formCell(item: SupplementCatalogItem): string {
  if (item.physicalForm) return formLabel(item.physicalForm);
  return `待填(建议${formLabel(item.suggestedPhysicalForm)})`;
}

async function main() {
  const asJson = process.argv.includes('--json');
  const service = new SupplementCatalogService(prisma as never);
  const { summary, items } = await service.listCatalog();

  if (asJson) {
    console.log(JSON.stringify({ summary, items }, null, 2));
    return;
  }

  const rows = items.map((item) => ({
    补剂: item.name,
    品牌: item.brand ?? '',
    形态: formCell(item),
    计量单位: item.displayUnit,
    瓶价: item.pricePerPurchaseUnit ? item.pricePerPurchaseUnit.toFixed(2) : '0.00',
    单位成本: item.unitCost ? item.unitCost.toFixed(4) : '—',
    上架: item.supplementRetailEnabled ? '是' : '否',
    引用食谱: item.recipeReferenceCount,
    保质期: item.shelfLifeMonths ? `${item.shelfLifeMonths}月` : '未填',
    体检: item.issues.length
      ? item.issues.map((issue) => issue.code).join(' | ')
      : 'OK',
  }));

  console.table(rows);

  console.log('\n[汇总]');
  console.log(`  补剂档案总数        : ${summary.total}`);
  console.log(`  已上架              : ${summary.retailEnabled}`);
  console.log(`  可直接售卖          : ${summary.readyToSell}`);
  console.log(`  有阻断性错误        : ${summary.blockedByError}`);
  console.log(`  未填物理形态        : ${summary.missingForm}`);
  console.log(`  未填原厂保质期      : ${summary.missingShelfLife}`);
  console.log(`  进货价为 0          : ${summary.noPrice}`);

  const blockers = items.filter((item) =>
    item.issues.some((issue) => issue.level === 'ERROR'),
  );
  if (blockers.length) {
    console.log('\n[阻断性错误明细]');
    for (const item of blockers) {
      const messages = item.issues
        .filter((issue) => issue.level === 'ERROR')
        .map((issue) => issue.message);
      console.log(`  - ${item.name}（${item.brand ?? '无品牌'}）: ${messages.join('；')}`);
    }
  }

  console.log(`\n[audit] 补剂上架清单体检完成，共 ${items.length} 条档案。`);
}

main()
  .catch((error) => {
    console.error('[audit] 补剂上架清单体检失败:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
