#!/usr/bin/env node
/**
 * 把《饲料添加剂品种目录》汇总版（docx 解析出来的 markdown）转成结构化 JSON。
 *
 * 用法：
 *   node backend/scripts/build-feed-additive-catalog.mjs <content.md> <输出.json>
 *
 * 为什么不把源文件放进仓库：知识源按项目约定不进代码库（体积与版权）。
 * 所以这里保留**生成脚本**，仓库里只放生成出来的 JSON——想复核时按
 * `docs/superpowers/specs/2026-11-07-supplement-ingredient-ai-flow-design.md`
 * 里记的源地址重新下一份、重跑一次即可。
 *
 * 表格长这样（表一 / 表四都是）：
 *   | 类别 | 通用名称（跨2列） |  | 适用范围 |
 *   | 维生素及类维生素 | 维生素A、维生素A乙酸酯、… |  | 养殖动物 |
 *   |  | 酒石酸氢胆碱（跨2列） |  | 犬d、猫d |
 * 类别是合并单元格，只有每组第一行有；通用名称是一串顿号分隔的品种。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('用法：node build-feed-additive-catalog.mjs <content.md> <输出.json>');
  process.exit(1);
}

const markdown = readFileSync(inputPath, 'utf8');
const lines = markdown.split(/\r?\n/);

/** 只看表一和表四：这两张才有「类别 / 通用名称 / 适用范围」。 */
const TABLE_STARTS = ['表一', '表四'];
const OTHER_TABLES = ['表二', '表三'];

function isTableRow(line) {
  return line.startsWith('|') && line.endsWith('|') && !/^\|\s*-+/.test(line);
}

function cells(line) {
  return line
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

const entries = [];
let currentTable = null;
let currentCategory = '';

for (const raw of lines) {
  const line = raw.trim();

  if (TABLE_STARTS.includes(line)) {
    currentTable = line;
    currentCategory = '';
    continue;
  }
  if (OTHER_TABLES.includes(line)) {
    currentTable = null;
    continue;
  }
  if (!currentTable || !isTableRow(line)) {
    continue;
  }

  const [categoryCell, nameCell, , scopeCell] = cells(line);
  if (!nameCell || nameCell === '通用名称（跨2列）') {
    continue;
  }

  const category = categoryCell || currentCategory;
  if (categoryCell) {
    currentCategory = categoryCell;
  }

  // 「蛋氨酸锌络（螯）合物（跨2列）」这类标注只是解析工具的合并单元格提示
  const cleanedScope = (scopeCell ?? '').replace(/\s+/g, '');
  const names = nameCell
    .replace(/（跨2列）/g, '')
    .split('、')
    .map((name) => name.trim())
    .filter(Boolean);

  for (const name of names) {
    entries.push({
      name,
      category,
      scope: cleanedScope,
      // 适用范围里出现"犬"或"狗"才算能用在狗身上
      dogAllowed: /犬|狗/.test(cleanedScope),
      table: currentTable === '表一' ? 'MAIN' : 'AMENDED'
    });
  }
}

// 去重：同一品种在表一和表四都出现时，以「允许用于犬」的那条为准
const byName = new Map();
for (const entry of entries) {
  const existing = byName.get(entry.name);
  if (!existing || (!existing.dogAllowed && entry.dogAllowed)) {
    byName.set(entry.name, entry);
  }
}

const result = {
  source: '饲料添加剂品种目录（根据农业部第2045号公告及后续修订公告汇总，截至2025年6月）',
  sourceUrl:
    'https://www.nahs.org.cn/xxcm/slpj/202109/P020250714562168149044.docx',
  generatedAt: new Date().toISOString().slice(0, 10),
  entries: [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-Hans-CN')
  )
};

writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(
  `✓ ${result.entries.length} 个品种，其中 ${result.entries.filter((e) => e.dogAllowed).length} 个允许用于犬 → ${outputPath}`
);
