/**
 * 试吃装定价 · 真实数据冒烟脚本（临时，不入库）
 * 用线上真实食谱 + 真实原料价，跑一遍「5 道菜合并定价」全链路。
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma.service';
import { TastingPackPricingService } from '../src/application/tasting-pack/tasting-pack-pricing.service';
import { TastingPackConfigService } from '../src/application/tasting-pack/tasting-pack-config.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const prisma = app.get(PrismaService);
  const pricing = app.get(TastingPackPricingService);
  const config = app.get(TastingPackConfigService);

  console.log('=== 当前试吃装设置 ===');
  console.log(JSON.stringify(await config.getConfig(), null, 2));

  // 取 5 道公开食谱（覆盖 5 种不同主料）
  const recipes = await prisma.recipe.findMany({
    where: { status: 'PUBLIC' },
    select: { id: true, recipeId: true, version: true, name: true },
    orderBy: { viewCount: 'desc' },
    take: 5,
  });

  if (recipes.length < 5) {
    console.error(`公开食谱不足 5 道，实际 ${recipes.length} 道`);
    await app.close();
    process.exit(1);
  }

  console.log('\n=== 选中的 5 道菜 ===');
  recipes.forEach((r: any, i: number) => console.log(`${i + 1}. ${r.name} (v${r.version})`));

  const specs = recipes.map((r: any) => ({
    recipeId: r.recipeId,
    packageCount: 2,
    packageSpecG: 80,
  }));

  const quote = await pricing.quote({ specs, sets: 1 });
  console.log('\n=== 一套试吃装报价 ===');
  console.log(JSON.stringify(quote, null, 2));

  const stock = await pricing.buildStockRequirement({ specs, sets: 20 });
  console.log('\n=== 备货 20 套的用料（前 10 项）===');
  console.log(
    JSON.stringify(
      {
        sets: stock.sets,
        totalNetFoodWeightG: stock.totalNetFoodWeightG,
        totalPacks: stock.totalPacks,
        perRecipe: stock.perRecipe,
        ingredientCount: stock.ingredientDetails.length,
        topIngredients: stock.ingredientDetails.slice(0, 10).map((d: any) => ({
          name: d.name,
          type: d.type,
          amount: d.amount,
          unit: d.unit,
          cost: Number(d.cost.toFixed(2)),
        })),
      },
      null,
      2,
    ),
  );

  await app.close();
}

main().catch((error) => {
  console.error('冒烟失败:', error);
  process.exit(1);
});
