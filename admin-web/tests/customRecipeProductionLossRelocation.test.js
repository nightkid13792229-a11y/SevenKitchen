import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 内部生产损耗系数 · 后台入口迁移守卫（2026-10-21）
 *
 * 要求：
 *   · 「全局配置 → 生产配置」能编辑它；
 *   · 「食谱定制设置」不再出现这个输入框，表单也不默认/回填它；
 *   · API 类型保留（后端仍返回旧列，兼容旧数据），但标记 deprecated。
 */
const readSource = (relativePath) =>
  readFileSync(new URL(`../src/${relativePath}`, import.meta.url), 'utf8');

test('全局配置页在生产配置下提供“内部生产损耗系数”', () => {
  const source = readSource('views/GlobalConfig.vue');

  assert.match(source, /label="内部生产损耗系数"/);
  assert.match(source, /v-model="form\.productionLossRate"/);
  assert.match(source, /1\.07 = 7% 损耗；用于投料\/成本\/补剂计算/);
  // 1–2 的系数：前端规则与后端 DTO 一致
  assert.match(
    source,
    /productionLossRate:\s*\[[\s\S]*?max:\s*2/,
  );
  assert.match(source, /productionLossRate:\s*1\.07/);
});

test('食谱定制设置页不再有生产损耗输入，也不再默认/回填它', () => {
  const source = readSource('views/CustomRecipes/Config.vue');

  assert.doesNotMatch(source, /<el-form-item label="生产损耗率"/);
  assert.doesNotMatch(source, /v-model="form\.productionLossRate"/);
  assert.doesNotMatch(source, /productionLossRate:\s*1\.07/);
  assert.doesNotMatch(source, /form\.productionLossRate\s*=/);
});

test('后台 API 类型：全局配置新增字段，旧定制配置字段标记废弃', () => {
  const globalConfig = readSource('api/globalConfig.ts');
  const customRecipe = readSource('api/customRecipe.ts');

  assert.match(globalConfig, /productionLossRate:\s*number/);
  assert.match(customRecipe, /@deprecated/);
  assert.match(customRecipe, /productionLossRate:\s*number/);
});
