/**
 * 营养库登记表：**唯一**的「允许用哪些营养库」来源。
 *
 * 数据库枚举（`NutritionGovernanceSourceType`）、导入策略（`source-policy`）、
 * 候选检索（`ingredient-creation-candidate`）、线上白名单
 * （`trusted-nutrition-web-search`）都从这里取口径，禁止再各自维护名单。
 *
 * 角色：
 * - `L1`：本地主库，候选检索只查这些；
 * - `L2`：线上长尾，本地没有数据或只作补充；
 * - `CANDIDATE`：候选库，权威性或许可还没定，不能进本地主库。
 */

export type NutritionLibraryRole = 'L1' | 'L2' | 'CANDIDATE';

/**
 * 库的原始语种。检索时按语种生成候选词；`pt` 是巴西 TACO 用的。
 */
export type NutritionLibraryLanguage =
  | 'en'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'fr'
  | 'nl'
  | 'fi'
  | 'da'
  | 'pt';

export interface NutritionLibrary {
  /** 稳定 id，例如 `usda`。 */
  key: string;
  /** 数据库枚举值；纯线上库没有本地记录，为 null。 */
  sourceType: string | null;
  /** 注册口径（`getNutritionSourceDefinition` 的 code）；L1 必须能解析。 */
  sourceCode: string;
  nameZh: string;
  authority: 'A' | 'B';
  /** 内部商用许可的短描述，不是法律意见。 */
  license: string;
  /** 是否有本地库可检索。 */
  local: boolean;
  /** 线上可信域名（裸域名，不带协议/路径）。 */
  onlineHosts: string[];
  role: NutritionLibraryRole;
  language: NutritionLibraryLanguage;
}

export const NUTRITION_LIBRARIES: readonly NutritionLibrary[] = [
  // -------------------------------------------------------------------------
  // L1 本地主库（7 个）
  // -------------------------------------------------------------------------
  {
    key: 'usda',
    sourceType: 'USDA',
    sourceCode: 'USDA_FDC',
    nameZh: '美国农业部食品数据中心（USDA FDC）',
    authority: 'A',
    license: 'Public Domain',
    local: true,
    onlineHosts: ['fdc.nal.usda.gov', 'nal.usda.gov'],
    role: 'L1',
    language: 'en',
  },
  {
    key: 'cnf',
    sourceType: 'CNF',
    sourceCode: 'CNF',
    nameZh: '加拿大营养文件（CNF）',
    authority: 'A',
    license: 'OGL-C',
    local: true,
    onlineHosts: ['canada.ca', 'inspection.canada.ca', 'cnf-fce.ca'],
    role: 'L1',
    language: 'en',
  },
  {
    key: 'nzfcd',
    sourceType: 'NZFCD',
    sourceCode: 'NZFCD_FOODFILES',
    nameZh: '新西兰食品成分数据库（NZFCD）',
    authority: 'A',
    license: '免费商用（不得修改/转让）',
    local: true,
    onlineHosts: ['foodcomposition.co.nz', 'foodstandards.govt.nz'],
    role: 'L1',
    language: 'en',
  },
  {
    key: 'mext',
    sourceType: 'MEXT',
    sourceCode: 'JP_FOOD_TABLE',
    nameZh: '日本食品标准成分表（MEXT）',
    authority: 'A',
    license: '注明出处可商用（≈CC BY）',
    local: true,
    onlineHosts: [],
    role: 'L1',
    language: 'ja',
  },
  {
    key: 'tfda',
    sourceType: 'TFDA',
    sourceCode: 'TFDA_FOOD_NUTRITION_DATABASE',
    nameZh: '台湾食品营养成分资料库（TFDA）',
    authority: 'A',
    license: 'OGDL 1.0',
    local: true,
    onlineHosts: [],
    role: 'L1',
    language: 'zh',
  },
  {
    key: 'ko_rda',
    sourceType: 'KO_RDA',
    sourceCode: 'KO_RDA_FOOD_COMPOSITION_TABLE',
    nameZh: '韩国农村振兴厅食品成分表（KO_RDA）',
    authority: 'A',
    license: 'KOGL Type 1',
    local: true,
    onlineHosts: [],
    role: 'L1',
    language: 'ko',
  },
  {
    key: 'cfct',
    sourceType: 'CFCT',
    sourceCode: 'CFCT',
    nameZh: '中国食物成分表（CFCT）',
    authority: 'A',
    license: '无开放许可（纸质书）',
    local: true,
    onlineHosts: [],
    role: 'L1',
    language: 'zh',
  },

  // -------------------------------------------------------------------------
  // L2 线上长尾：认可，但本地没有导入（或只保留线上）
  // -------------------------------------------------------------------------
  {
    key: 'nevo',
    sourceType: 'NEVO',
    sourceCode: 'NEVO',
    nameZh: '荷兰食物成分数据库（NEVO）',
    authority: 'A',
    license: '待核验',
    local: false,
    onlineHosts: ['rivm.nl'],
    role: 'L2',
    language: 'nl',
  },
  {
    key: 'cofid',
    sourceType: 'COFID',
    sourceCode: 'COFID',
    nameZh: '英国食物成分数据集（CoFID）',
    authority: 'A',
    license: 'OGL v3',
    local: false,
    onlineHosts: ['gov.uk'],
    role: 'L2',
    language: 'en',
  },
  {
    key: 'ciqual',
    sourceType: 'CIQUAL',
    sourceCode: 'CIQUAL',
    nameZh: '法国食物成分表（Ciqual）',
    authority: 'A',
    license: 'Licence Ouverte',
    local: false,
    onlineHosts: ['anses.fr'],
    role: 'L2',
    language: 'fr',
  },
  {
    key: 'fineli',
    sourceType: null,
    sourceCode: 'FINELI',
    nameZh: '芬兰食物成分数据库（Fineli）',
    authority: 'A',
    license: '待核验',
    local: false,
    onlineHosts: ['fineli.fi'],
    role: 'L2',
    language: 'fi',
  },
  {
    key: 'frida',
    sourceType: null,
    sourceCode: 'FRIDA',
    nameZh: '丹麦食物数据（Frida）',
    authority: 'A',
    license: '待核验',
    local: false,
    onlineHosts: ['frida.fooddata.dk'],
    role: 'L2',
    language: 'da',
  },

  // -------------------------------------------------------------------------
  // CANDIDATE 候选库：本地没有，权威性/许可未定，不能进 L1
  // -------------------------------------------------------------------------
  {
    key: 'afcd',
    sourceType: null,
    sourceCode: 'AFCD',
    nameZh: '澳大利亚食物成分数据库（AFCD）',
    authority: 'B',
    license: 'CC BY 3.0 AU/DULA',
    local: false,
    onlineHosts: ['foodstandards.gov.au'],
    role: 'CANDIDATE',
    language: 'en',
  },
  {
    key: 'ausnut',
    sourceType: null,
    sourceCode: 'AUSNUT',
    nameZh: '澳大利亚营养调查数据库（AUSNUT）',
    authority: 'B',
    license: 'CC BY 3.0 AU/DULA',
    local: false,
    onlineHosts: ['foodstandards.gov.au'],
    role: 'CANDIDATE',
    language: 'en',
  },
  {
    key: 'taco',
    sourceType: null,
    sourceCode: 'TACO',
    nameZh: '巴西食物成分表（TACO）',
    authority: 'B',
    license: '无开放许可（学术引用）',
    local: false,
    onlineHosts: ['unicamp.br'],
    role: 'CANDIDATE',
    language: 'pt',
  },
];

/**
 * 候选检索允许查的本地库：登记表里 role=L1 且 local=true 的 sourceType。
 *
 * 顺序沿用登记表顺序；`Set` 保证唯一，避免同一 sourceType 出现两次。
 */
export const LOCAL_LIBRARY_SOURCE_TYPES: readonly string[] = [
  ...new Set(
    NUTRITION_LIBRARIES.flatMap((library) =>
      library.role === 'L1' && library.local && library.sourceType
        ? [library.sourceType]
        : [],
    ),
  ),
];

/** 抓取代理只作通道，不是来源库；即使登记表误加也要剔除。 */
function isProxyHost(host: string): boolean {
  return host === 'r.jina.ai' || host.endsWith('.r.jina.ai');
}

/**
 * 线上可信域名的并集（登记表 `onlineHosts` 去重，不含抓取代理）。
 *
 * 抓取通道（`r.jina.ai`）由调用方单独追加，避免它被当成来源库。
 */
export const ONLINE_TRUSTED_HOSTS: readonly string[] = [
  ...new Set(
    NUTRITION_LIBRARIES.flatMap((library) => library.onlineHosts).filter(
      (host) => host.length > 0 && !isProxyHost(host),
    ),
  ),
];

/**
 * 按数据库枚举值找登记项。
 *
 * 纯线上库（Fineli/Frida/AFCD/AUSNUT/TACO）没有 `sourceType`，
 * 只能按 `key` / `sourceCode` 在 `NUTRITION_LIBRARIES` 里查，不从这里返回。
 */
export function getNutritionLibrary(
  sourceType: string | null | undefined,
): NutritionLibrary | undefined {
  if (!sourceType) {
    return undefined;
  }

  return NUTRITION_LIBRARIES.find(
    (library) => library.sourceType === sourceType,
  );
}
