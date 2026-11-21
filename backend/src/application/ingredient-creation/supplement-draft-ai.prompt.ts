/**
 * 补剂起草的模型提示词（Task 7）。
 *
 * 只拼字符串，不发请求；调用方（Task 8 的编排服务）负责把图片/链接/目录
 * 查好再传进来。提示词必须说清三件事：
 * 1. 输入是什么（标签原文、正面文字、商品链接、目录、等价组候选、配置、当前草稿）；
 * 2. 允许值是什么（营养字段、标签词表、添加时机、不上架原因、DIY 平台）；
 * 3. 输出什么（固定 JSON 结构 + 每条决定的理由），以及硬规则：
 *    不编数据、不确定写 null / missing、目录只用于核对标签名称、
 *    不看 dogAllowed/适用范围、只输出 JSON。
 */

import {
  SUPPLEMENT_AI_DIY_PLATFORMS,
  SUPPLEMENT_AI_GROUP_SKIPPED,
  SUPPLEMENT_AI_KNOWN_FIELD_PATHS,
} from './supplement-draft-ai.schema';
import type { SupplementDraftPayload } from './supplement-draft.types';

/** 链接预览里“读出来的营养素”；只用于提示词，不要求完整。 */
export interface SupplementDraftPromptLinkPreviewNutrient {
  fieldPath: string;
  value: number;
  unit?: string | null;
}

/**
 * 商品链接预览（结构对齐 `SupplementLinkPreview`，字段都可缺省）。
 *
 * 这里不直接 import 那个服务类型：提示词不该依赖 Nest 服务，Task 8
 * 传真实对象也能按结构兼容。
 */
export interface SupplementDraftPromptLinkPreview {
  productUrl?: string | null;
  pagePriceCny?: number | null;
  productName?: string | null;
  brand?: string | null;
  productModel?: string | null;
  imageUrl?: string | null;
  servingUnitsPerDose?: number | null;
  nutrients?: SupplementDraftPromptLinkPreviewNutrient[];
  unrecognized?: string[];
  labelText?: string | null;
}

/** 等价组候选（结构兼容 `SupplementGroupRecommendation`，组 id 字段是 `groupId`）。 */
export interface SupplementDraftPromptGroupCandidate {
  groupId: string;
  name: string;
  nutrientLabel?: string | null;
  nutrientUnit?: string | null;
  memberCount?: number;
  reason?: string | null;
}

/** 商城/等价组总开关（结构兼容审核上下文的 `config`）。 */
export interface SupplementDraftPromptConfig {
  shopEnabled: boolean;
  equivalenceEnabled: boolean;
}

export interface SupplementDraftPromptInput {
  labelText: string;
  frontText: string;
  linkPreview: SupplementDraftPromptLinkPreview | null;
  catalogNames: string[];
  groupCandidates: SupplementDraftPromptGroupCandidate[];
  config: SupplementDraftPromptConfig;
  provisionalDraft: SupplementDraftPayload;
  /** 人已经改过的字段路径（`manualFields`）；提示词要求模型不要覆盖。 */
  manualFields: string[];
  allowedFields: string[];
  allowedTags: string[];
  allowedTimings: string[];
  allowedNoSaleReasons: string[];
}

const OUTPUT_SCHEMA = [
  '{',
  '  "fields": {',
  '    "basic.name": { "value": "鱼油", "source": "LABEL", "confidence": "HIGH", "reason": "标签正面写着" }',
  '  },',
  '  "decisions": {',
  '    "recommendCreate": { "value": true, "reason": "..." },',
  '    "retail": { "enabled": false, "reason": "..." },',
  '    "noSaleReason": null,',
  '    "diy": { "enabled": false, "linkUrl": "", "imageUrl": "", "reason": "..." },',
  '    "procurement": { "enabled": false, "reason": "..." },',
  '    "equivalence": { "groupId": null, "reason": "..." },',
  '    "labelNames": [],',
  '    "defaultTargetFields": [],',
  '    "tagNames": [],',
  '    "addTiming": null',
  '  },',
  '  "missing": [{ "fieldPath": "basic.brand", "reason": "...", "suggestion": "..." }],',
  '  "warnings": [{ "code": "...", "message": "...", "fieldPath": "..." }]',
  '}',
].join('\n');

function formatList(items: readonly string[]): string {
  return items.length > 0 ? items.join('、') : '（无）';
}

function formatLinkPreview(
  preview: SupplementDraftPromptLinkPreview | null,
): string {
  if (!preview) return '（没有提供商品链接）';

  const lines: string[] = [];
  const add = (
    label: string,
    value: string | number | null | undefined,
  ): void => {
    if (value !== null && value !== undefined && value !== '') {
      lines.push(`${label}：${value}`);
    }
  };

  add('商品链接', preview.productUrl);
  add('商品名', preview.productName);
  add('品牌', preview.brand);
  add('规格', preview.productModel);
  add('页面价格（人民币）', preview.pagePriceCny);
  add('主图', preview.imageUrl);
  add('每份量（基准单位）', preview.servingUnitsPerDose);

  const nutrients = preview.nutrients ?? [];
  if (nutrients.length > 0) {
    lines.push('链接读出的营养素：');
    for (const nutrient of nutrients) {
      lines.push(
        `- ${nutrient.fieldPath}：${nutrient.value}${nutrient.unit ? ` ${nutrient.unit}` : ''}`,
      );
    }
  }

  if (preview.labelText) {
    lines.push('链接里的标签原文：');
    lines.push(preview.labelText);
  }

  const unrecognized = preview.unrecognized ?? [];
  if (unrecognized.length > 0) {
    lines.push('链接里没认出的行（不要猜，必要时放进 missing）：');
    lines.push(unrecognized.join('\n'));
  }

  return lines.length > 0 ? lines.join('\n') : '（商品链接没有读出可用信息）';
}

function formatGroupCandidates(
  groups: readonly SupplementDraftPromptGroupCandidate[],
): string {
  if (groups.length === 0) return '（没有候选等价组；不确定就写 null）';

  return groups
    .map((group) => {
      const details: string[] = [];
      if (group.nutrientLabel) {
        details.push(
          `营养素 ${group.nutrientLabel}${group.nutrientUnit ? `（${group.nutrientUnit}）` : ''}`,
        );
      }
      if (typeof group.memberCount === 'number') {
        details.push(`已有 ${group.memberCount} 个成员`);
      }
      if (group.reason) details.push(`推荐理由：${group.reason}`);
      return `- ${group.groupId}「${group.name}」${details.length > 0 ? `：${details.join('；')}` : ''}`;
    })
    .join('\n');
}

/**
 * 拼一次完整的起草提示词。模型只回 JSON；调用方用
 * `parseSupplementAiDraft` 收结果。
 */
export function buildSupplementDraftPrompt(
  input: SupplementDraftPromptInput,
): string {
  const provisionalDraftJson =
    JSON.stringify(input.provisionalDraft, null, 2) ?? '{}';

  return [
    '你在帮宠物食品工厂做补剂建档的**起草和建议**。你只输出 JSON，不写库。',
    '',
    '【正面图文字】',
    input.frontText.trim() || '（没有正面图文字）',
    '',
    '【标签文字】',
    input.labelText.trim() || '（没有标签文字）',
    '',
    '【商品链接信息】',
    formatLinkPreview(input.linkPreview),
    '',
    '【两本目录的规范名（只用于核对标签名称）】',
    formatList(input.catalogNames),
    '',
    '【允许的营养字段（fieldPath）】',
    input.allowedFields.length > 0
      ? input.allowedFields.map((field) => `- ${field}`).join('\n')
      : '（无）',
    '',
    '【允许的标签词表（tagNames）】',
    formatList(input.allowedTags),
    '',
    '【允许的添加时机（addTiming）】',
    formatList(input.allowedTimings),
    '',
    '【允许的不上架原因（noSaleReason）】',
    formatList(input.allowedNoSaleReasons),
    '',
    '【DIY 购买平台（diy.platform）】',
    formatList(SUPPLEMENT_AI_DIY_PLATFORMS),
    '',
    '【允许的枚举值】',
    '- basic.baseUnit：PCS、G、ML',
    '- basic.physicalForm：POWDER、TABLET、CAPSULE、LIQUID',
    '- label.labelCategory：FEED_MATERIAL、FEED_ADDITIVE',
    '',
    '【等价组候选】',
    formatGroupCandidates(input.groupCandidates),
    '',
    '【商城配置】',
    `商城总开关：${input.config.shopEnabled ? '开' : '关'}`,
    `等价组总开关：${input.config.equivalenceEnabled ? '开' : '关'}`,
    '',
    '【当前草稿（人已经填的/系统算出的值；只作参考，不要静默覆盖人改过的字段）】',
    provisionalDraftJson,
    '',
    '【人已经改过的字段（不要覆盖）】',
    input.manualFields.length > 0
      ? input.manualFields.map((path) => `- ${path}`).join('\n')
      : '（无）',
    '',
    '【可以填的字段路径（只允许这些）】',
    SUPPLEMENT_AI_KNOWN_FIELD_PATHS.map((path) => `- ${path}`).join('\n'),
    '说明：`nutrition.servingNutrients.<field>` 里的 `<field>` 必须出现在【允许的营养字段】里。',
    '',
    '规则（必须全部遵守）：',
    '1. 不编数据：标签、正面图、商品链接里都没有的，不确定就写 null，并放进 missing；不要猜。',
    '2. 先原文后推断：标签/正面原文优先，商品链接次之，目录/业务规则再次，最后才是推断。推断出来的值 source 写 "INFERENCE"、confidence 写 "LOW"。',
    '3. 每个决定都要写理由：recommendCreate / retail / diy / procurement / equivalence 的 reason 都要有一句人看得懂的中文理由，不能留空。',
    '4. recommendCreate 表示“是否建议建档”；即使 value 是 false，也只说明理由，不会自动丢弃草稿。',
    '5. 目录只用来核对标签名称（labelNames）：只写目录里完全同名的规范名，不要自己造名字，也不要用目录判断适用性。',
    '6. 不看 dogAllowed / 适用范围：不要判断能不能给狗吃，不生成任何适用性门禁或提醒。',
    '7. 只输出一个 JSON 对象：只输出 JSON，不要加 markdown 代码块、不要解释、不要前后缀。',
    '8. 人已经改过的字段以人的值为准，不要覆盖；如果你认为不同，把新值放 fields 并在 reason 里说明，或写进 warnings/missing，让人决定。',
    '',
    '字段条目格式：',
    '- source 只能是：LABEL、FRONT、LINK、CATALOG、RULE、INFERENCE；',
    '- confidence 只能是：HIGH、MEDIUM、LOW；',
    '- reason 写一句人能看懂的理由（从哪读到的/为什么这么推断）。',
    '',
    '决定项要求：',
    '- labelNames：只能写【两本目录的规范名】里完全同名的条目；',
    '- defaultTargetFields：只能从【允许的营养字段】里选，且必须是有值的营养素；',
    '- tagNames：只能从【允许的标签词表】里选；',
    '- addTiming：只能从【允许的添加时机】里选，或 null；',
    '- noSaleReason：只能从【允许的不上架原因】里选，或 null；',
    `- equivalence.groupId：只能填【等价组候选】里的 id、'${SUPPLEMENT_AI_GROUP_SKIPPED}'（暂不归组）或 null，不要编造组 id。`,
    '',
    '输出 JSON 结构（只输出这个对象，不要额外字段）：',
    OUTPUT_SCHEMA,
  ].join('\n');
}
