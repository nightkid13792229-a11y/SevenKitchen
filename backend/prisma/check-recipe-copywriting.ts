/**
 * AI 文案生成 · 手动端到端验证工具
 *
 * 用途：用**真实模型**跑通「读配方 → 生成卖点与说明 → 合规校验」全链路，
 * 用于上线前冒烟测试（见 docs/plans/2026-09-17-ai-copywriting-rollout-checklist.md）。
 *
 * 用法：
 *   npx ts-node -r tsconfig-paths/register prisma/check-recipe-copywriting.ts            # 自动挑一个公开食谱
 *   npx ts-node -r tsconfig-paths/register prisma/check-recipe-copywriting.ts <recipeId> # 指定食谱
 *
 * 说明：会产生一次真实的模型调用（消耗少量 token）。
 */
import { PrismaClient } from '@prisma/client';

import { AgentProviderConfigService } from '../src/application/nutrition-governance/agent-provider-config.service';
import { RecipeCopywritingService } from '../src/application/recipe-designer/recipe-copywriting.service';
import { RecipeService } from '../src/application/recipe/recipe.service';
import { scanForbiddenClaims } from '../src/application/recipe-designer/recipe-copywriting-compliance';

const prisma = new PrismaClient();

async function main() {
  const recipeIdArg = process.argv[2];

  const agentConfig = new AgentProviderConfigService(prisma as any);
  const copywritingService = new RecipeCopywritingService(agentConfig);
  const recipeService = new RecipeService(prisma as any, copywritingService);

  const available = await recipeService.isRecipeCopywritingAvailable();
  console.log(`AI 文案生成可用：${available ? '是' : '否'}`);
  if (!available) {
    console.log('未配置模型，请先在后台配置「食谱文案生成」用途。');
    return;
  }

  const vocabularyCount = await prisma.recipeHealthTag.count({
    where: { parentId: { not: null } },
  });
  console.log(`合规词表子标签数：${vocabularyCount}`);
  if (vocabularyCount === 0) {
    console.log('词表未初始化，请先执行 seed-health-tag-vocabulary.ts');
    return;
  }

  const recipe = recipeIdArg
    ? await prisma.recipe.findUnique({
        where: { id: recipeIdArg },
        select: { id: true, name: true, status: true },
      })
    : await prisma.recipe.findFirst({
        where: { status: 'PUBLIC' },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true, status: true },
      });

  if (!recipe) {
    console.log('未找到可用食谱');
    return;
  }

  console.log(`\n目标食谱：${recipe.name}（${recipe.id} / ${recipe.status}）`);
  console.log('调用模型中……\n');

  const result = await recipeService.generateRecipeCopywriting(recipe.id);

  console.log('===== 生成结果 =====');
  console.log(`一句话卖点（${result.sellingPoint.length} 字）：${result.sellingPoint}`);
  console.log(`\n详细说明（${result.description.length} 字）：\n${result.description}`);
  console.log(`\n推荐标签：${result.suggestedTags.join('、') || '（无）'}`);
  console.log(`生成依据：${result.basis || '（无）'}`);
  console.log(`提供方：${result.provider}`);

  // 独立复检一遍（服务内部已校验，这里再核一次作为双重确认）
  const hits = scanForbiddenClaims(result.sellingPoint, result.description);
  console.log('\n===== 合规复检 =====');
  console.log(hits.length === 0 ? '✓ 未命中禁用表述' : `✗ 命中：${hits.join('、')}`);

  const allowed = new Set(
    (
      await prisma.recipeHealthTag.findMany({
        where: { parentId: { not: null } },
        select: { name: true },
      })
    ).map((tag) => tag.name),
  );
  const offList = result.suggestedTags.filter((tag) => !allowed.has(tag));
  console.log(
    offList.length === 0
      ? '✓ 推荐标签全部来自合规词表'
      : `✗ 越界标签：${offList.join('、')}`,
  );

  console.log(
    `\n===== 结论：${
      hits.length === 0 && offList.length === 0 ? '通过' : '未通过'
    } =====`,
  );
}

main()
  .catch((error) => {
    console.error('\n执行失败：', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
