/**
 * 制备方法「称重口径」一致性巡检（只读，不改数据）。
 *
 * 规则与 backend/src/domain/recipe-designer/preparation-basis.ts 完全一致：
 * 熟档案→「熟重」、生档案→「生重」、干制品→「干重」、油/粉/补剂不写口径词。
 * 任何一处代码改了规则，这里自动跟着变，避免两套逻辑。
 *
 * 用法（默认只读；不传 --env-file 时用环境变量 DATABASE_URL）：
 *   # 本地通过只读账号巡检生产
 *   npx ts-node -r tsconfig-paths/register scripts/audit-preparation-basis.ts \
 *     --env-file=.env.production.readonly --out=../docs/reports
 *
 *   # 需要作为检查项（发现问题返回非 0 退出码）时：
 *   npx ts-node -r tsconfig-paths/register scripts/audit-preparation-basis.ts --fail-on-issues
 */
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  alignPreparationMethodBasis,
  isPreparationBasisConsistent,
} from '../src/domain/recipe-designer/preparation-basis';

export type PrepBasisAuditItem = {
  source: '正式食谱' | '设计器草稿';
  recipe: string;
  status?: string | null;
  ingredient: string;
  preparationState?: string | null;
  preparationStateLabel?: string | null;
  preparationMethod?: string | null;
};

export type PrepBasisAuditIssue = {
  source: '正式食谱' | '设计器草稿';
  recipe: string;
  status: string;
  ingredient: string;
  kind: '口径不一致' | '文案为空' | '机器码残留' | '半角逗号' | '句尾标点';
  detail: string;
  suggestion: string;
};

const UUID_SEGMENT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 加热类加工动词：提示改口径时不要顺手把必需的加热步骤删掉 */
const COOKING_VERB_RE = /煮|焯|蒸|炖|焖|烤|煎|炒/;

/** 纯函数：给定原料项，算出所有问题（便于单测） */
export const auditPreparationBasisItems = (
  items: PrepBasisAuditItem[],
): PrepBasisAuditIssue[] => {
  const issues: PrepBasisAuditIssue[] = [];

  for (const item of items) {
    const text = item.preparationMethod?.trim() ?? '';
    const base = {
      source: item.source,
      recipe: item.recipe,
      status: item.status ?? '',
      ingredient: item.ingredient,
    };

    if (!text) {
      issues.push({
        ...base,
        kind: '文案为空',
        detail: '没有任何制备/称重说明',
        suggestion: '按原料与营养档案补全标准文案',
      });
      continue;
    }

    if (!isPreparationBasisConsistent(text, item.preparationState)) {
      const suggested = alignPreparationMethodBasis(
        text,
        item.preparationState,
      );
      let suggestion = suggested
        ? `建议改为「${suggested}」`
        : '建议按档案状态重写口径';
      if (
        suggested &&
        COOKING_VERB_RE.test(text) &&
        !COOKING_VERB_RE.test(suggested)
      ) {
        suggestion +=
          '（⚠ 原步骤含加热处理，按建议改会丢掉加热步骤；若该原料必须加热，请先确认营养档案是否选错）';
      }
      issues.push({
        ...base,
        kind: '口径不一致',
        detail: `营养状态「${item.preparationStateLabel ?? item.preparationState}」，文案写的是「${text}」`,
        suggestion,
      });
    }

    const segments = text.split(/[、,，]/).map((segment) => segment.trim());
    if (segments.some((segment) => UUID_SEGMENT_RE.test(segment))) {
      issues.push({
        ...base,
        kind: '机器码残留',
        detail: '文案里是系统字典 ID',
        suggestion: '按制备方法字典还原为中文词',
      });
    }

    if (/[,，]/.test(text)) {
      issues.push({
        ...base,
        kind: '半角逗号',
        detail: '分隔符不统一',
        suggestion: '统一使用顿号「、」',
      });
    }

    if (/[。.]$/.test(text)) {
      issues.push({
        ...base,
        kind: '句尾标点',
        detail: '句尾带句号',
        suggestion: '去掉句尾标点',
      });
    }
  }

  return issues;
};

type Args = {
  envFile: string | null;
  outDir: string | null;
  failOnIssues: boolean;
};

export const parseArgs = (argv: string[]): Args => {
  const args: Args = {
    envFile: null,
    outDir: null,
    failOnIssues: false,
  };

  for (const raw of argv) {
    if (raw.startsWith('--env-file=')) args.envFile = raw.slice(11);
    else if (raw.startsWith('--out=')) args.outDir = raw.slice(6);
    else if (raw === '--fail-on-issues') args.failOnIssues = true;
  }

  return args;
};

const resolveDatabaseUrl = (args: Args): string | undefined => {
  if (args.envFile) {
    const envPath = resolve(process.cwd(), args.envFile);
    if (!existsSync(envPath)) {
      throw new Error(`指定的 env 文件不存在：${envPath}`);
    }
    return (
      loadEnv({ path: envPath }).parsed?.DATABASE_URL ??
      process.env.DATABASE_URL
    );
  }

  return process.env.DATABASE_URL;
};

const csvCell = (value: string | number | null | undefined): string => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveDatabaseUrl(args);
  const prisma = new PrismaClient(
    databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
  );

  try {
    const published = await prisma.$queryRawUnsafe<
      Array<{
        recipe: string;
        status: string;
        ingredient: string;
        preparation_state: string | null;
        preparation_state_label: string | null;
        preparation_method: string | null;
      }>
    >(`
      WITH latest AS (
        SELECT DISTINCT ON (recipe_id) id, recipe_id, version
        FROM recipe ORDER BY recipe_id, version DESC
      )
      SELECT r.name AS recipe, r.status::text AS status, i.name AS ingredient,
             nf.preparation_state AS preparation_state,
             nf.preparation_state_label AS preparation_state_label,
             ri.preparation_method AS preparation_method
      FROM recipe_item ri
      JOIN latest l ON l.recipe_id = ri.recipe_id AND l.version = ri.recipe_version
      JOIN recipe r ON r.id = l.id
      JOIN ingredient i ON i.id = ri.ingredient_id
      LEFT JOIN nutrition_food nf ON nf.id = ri.nutrition_food_id`);

    const drafts = await prisma.$queryRawUnsafe<
      Array<{
        recipe: string;
        status: string;
        ingredient: string;
        preparation_state: string | null;
        preparation_state_label: string | null;
        preparation_method: string | null;
      }>
    >(`
      SELECT d.name AS recipe, d.status::text AS status, i.name AS ingredient,
             nf.preparation_state AS preparation_state,
             nf.preparation_state_label AS preparation_state_label,
             di.preparation_method AS preparation_method
      FROM design_recipe_item di
      JOIN design_recipe d ON d.id = di.design_recipe_id
      JOIN ingredient i ON i.id = di.ingredient_id
      LEFT JOIN nutrition_food nf ON nf.id = di.nutrition_food_id`);

    const items: PrepBasisAuditItem[] = [
      ...published.map((row) => ({
        source: '正式食谱' as const,
        recipe: row.recipe,
        status: row.status,
        ingredient: row.ingredient,
        preparationState: row.preparation_state,
        preparationStateLabel: row.preparation_state_label,
        preparationMethod: row.preparation_method,
      })),
      ...drafts.map((row) => ({
        source: '设计器草稿' as const,
        recipe: row.recipe,
        status: row.status,
        ingredient: row.ingredient,
        preparationState: row.preparation_state,
        preparationStateLabel: row.preparation_state_label,
        preparationMethod: row.preparation_method,
      })),
    ];

    const issues = auditPreparationBasisItems(items);
    const byKind = new Map<string, number>();
    for (const issue of issues) {
      byKind.set(issue.kind, (byKind.get(issue.kind) ?? 0) + 1);
    }

    const inconsistency = issues.filter((issue) => issue.kind === '口径不一致');

    console.log('=== 制备方法称重口径巡检（只读） ===');
    console.log(
      `扫描：正式食谱(最新版) ${published.length} 项 / 设计器草稿 ${drafts.length} 项`,
    );
    console.log(`发现问题 ${issues.length} 项次：`);
    for (const [kind, count] of [...byKind.entries()].sort(
      (left, right) => right[1] - left[1],
    )) {
      console.log(`  ${String(count).padStart(5)}  ${kind}`);
    }

    if (inconsistency.length > 0) {
      console.log('\n口径不一致明细（最多 30 条）：');
      for (const issue of inconsistency.slice(0, 30)) {
        console.log(
          `  [${issue.source}] ${issue.recipe}｜${issue.ingredient}：${issue.detail}；${issue.suggestion}`,
        );
      }
    } else {
      console.log(
        '\n口径一致性：✅ 无问题（所有原料的称重口径都与营养档案一致）',
      );
    }

    if (args.outDir) {
      const outDir = resolve(process.cwd(), args.outDir);
      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
      }
      const csvPath = resolve(outDir, 'preparation-basis-audit.csv');
      const header = [
        '来源',
        '食谱',
        '状态',
        '原料',
        '问题类型',
        '说明',
        '建议',
      ];
      const lines = issues.map((issue) =>
        [
          issue.source,
          issue.recipe,
          issue.status,
          issue.ingredient,
          issue.kind,
          issue.detail,
          issue.suggestion,
        ]
          .map(csvCell)
          .join(','),
      );
      writeFileSync(csvPath, [header.join(','), ...lines].join('\n'), 'utf8');
      console.log(`\n明细已写入：${csvPath}`);
    }

    if (args.failOnIssues && inconsistency.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[audit-preparation-basis] failed:', error);
    process.exitCode = 1;
  });
}
