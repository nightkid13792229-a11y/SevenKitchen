/**
 * 补剂标签解析：把商品页上那张成分表读成结构化字段。
 *
 * 输入是抓取代理吐出来的 markdown 纯文本，不是 HTML。页面里的排版噪声
 * （星号、†、♢、紧贴数字的百分号、断行）都当真——它们就是原文。
 *
 * 这里只做两件事：**找出成分表区块**、**把每一行拆成"名字 + 数值 + 单位"**。
 * 名字翻成规范字段路径、单位换算，都不在这里做（前者查别名表，后者由前端按自己的
 * 单位表做），免得两处各修一份。
 */

export interface ParsedNutrient {
  /** 规范字段路径；认不出的不进这个数组 */
  fieldPath: string
  value: number
  /** 标签上的单位原样返回（mg / µg / g / IU / kcal…） */
  unit: string
  rawName: string
}

export interface ParsedLabel {
  nutrients: ParsedNutrient[]
  /** 有数值但名字认不出来的行，逐条列出，供人补 */
  unrecognized: string[]
}

/** 标签上的英文名（含常见别名与俗写）→ 规范字段路径。 */
const NUTRIENT_ALIASES: Record<string, string> = {
  // 脂肪酸
  epa: 'fattyAcids.epa',
  eicosapentaenoicacid: 'fattyAcids.epa',
  dha: 'fattyAcids.dha',
  docosahexaenoicacid: 'fattyAcids.dha',
  dpa: 'fattyAcids.dpa',
  docosapentaenoicacid: 'fattyAcids.dpa',
  ala: 'fattyAcids.alphaLinolenicAcid',
  alphalinolenicacid: 'fattyAcids.alphaLinolenicAcid',
  linoleicacid: 'fattyAcids.linoleicAcid',
  arachidonicacid: 'fattyAcids.arachidonicAcid',
  // 常量元素与微量元素
  calcium: 'minerals.calcium',
  phosphorus: 'minerals.phosphorus',
  potassium: 'minerals.potassium',
  sodium: 'minerals.sodium',
  magnesium: 'minerals.magnesium',
  chloride: 'minerals.chloride',
  iron: 'minerals.iron',
  zinc: 'minerals.zinc',
  copper: 'minerals.copper',
  manganese: 'minerals.manganese',
  selenium: 'minerals.selenium',
  iodine: 'minerals.iodine',
  // 维生素
  vitamina: 'vitamins.vitaminA',
  vitaminaretinol: 'vitamins.vitaminA',
  vitamind: 'vitamins.vitaminD',
  vitamind3: 'vitamins.vitaminD',
  vitamind2: 'vitamins.vitaminD',
  vitamine: 'vitamins.vitaminE',
  vitamink: 'vitamins.vitaminK',
  vitamink1: 'vitamins.vitaminK',
  vitamink2: 'vitamins.vitaminK',
  vitaminb1: 'vitamins.vitaminB1',
  thiamin: 'vitamins.vitaminB1',
  thiamine: 'vitamins.vitaminB1',
  vitaminb2: 'vitamins.vitaminB2',
  riboflavin: 'vitamins.vitaminB2',
  vitaminb3: 'vitamins.vitaminB3',
  niacin: 'vitamins.vitaminB3',
  niacinamide: 'vitamins.vitaminB3',
  vitaminb5: 'vitamins.vitaminB5',
  pantothenicacid: 'vitamins.vitaminB5',
  vitaminb6: 'vitamins.vitaminB6',
  pyridoxine: 'vitamins.vitaminB6',
  vitaminb7: 'vitamins.vitaminB7',
  biotin: 'vitamins.vitaminB7',
  vitaminb9: 'vitamins.vitaminB9',
  folate: 'vitamins.vitaminB9',
  folicacid: 'vitamins.vitaminB9',
  vitaminb12: 'vitamins.vitaminB12',
  cyanocobalamin: 'vitamins.vitaminB12',
  methylcobalamin: 'vitamins.vitaminB12',
  choline: 'vitamins.choline',
  vitaminc: 'vitamins.vitaminC',
  ascorbicacid: 'vitamins.vitaminC',
  // 氨基酸
  taurine: 'aminoAcids.taurine',
  arginine: 'aminoAcids.arginine',
  lysine: 'aminoAcids.lysine',
  methionine: 'aminoAcids.methionine',
  cystine: 'aminoAcids.cystine',
  cysteine: 'aminoAcids.cystine',
  tryptophan: 'aminoAcids.tryptophan',
  threonine: 'aminoAcids.threonine',
  leucine: 'aminoAcids.leucine',
  isoleucine: 'aminoAcids.isoleucine',
  valine: 'aminoAcids.valine',
  phenylalanine: 'aminoAcids.phenylalanine',
  tyrosine: 'aminoAcids.tyrosine',
  histidine: 'aminoAcids.histidine',
  glutamicacid: 'aminoAcids.glutamicAcid',
  glycine: 'aminoAcids.glycine',
  proline: 'aminoAcids.proline',
  // 大体成分
  calories: 'macros.energyKcal',
  energy: 'macros.energyKcal',
  protein: 'macros.crudeProtein',
  totalfat: 'macros.crudeFat',
  'fat': 'macros.crudeFat',
  carbohydrate: 'macros.carbohydrate',
  totalcarbohydrate: 'macros.carbohydrate',
  dietaryfiber: 'macros.fiber',
  fiber: 'macros.fiber',
  moisture: 'macros.moisture',
  ash: 'macros.ash'
}

/** 名字归一：去括号内容、去标点、小写、去空格。 */
function normalizeName(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase()
}

export function toCanonicalFieldPath(rawName: string): string | null {
  return NUTRIENT_ALIASES[normalizeName(rawName)] ?? null
}

/** 成分表从这一行开始；页面里通常写作 `**Supplement facts**`。 */
const FACTS_HEADER = /supplement\s*facts/i

/**
 * `Serving Size: 4 Soft Gels` → 4。读不出返回 null，不默认成 1。
 *
 * 只认"数 + 计数名词"（粒/片/胶囊/勺…）。遇到 `1/2 Teaspoon` 或 `5 g` 一律返回 null：
 * 前者是分数，后者是质量，都不是"每份几粒"——猜错会让整份档案按错的倍数记。
 */
const COUNT_NOUN = /capsule|soft\s*gel|tablet|chew|scoop|teaspoon|tablespoon|drop|gummy|粒|片|胶囊|勺/i;

export function extractServingUnits(text: string): number | null {
  const match = text.match(
    /serving\s*size\s*:?\s*\**\s*(\d+(?:\.\d+)?)\s*([A-Za-z\u4e00-\u9fa5\s]*)/i
  );
  if (!match) {
    return null;
  }
  const raw = match[1];
  if (raw.includes('.') || raw.includes('/')) {
    return null;
  }
  if (!COUNT_NOUN.test(match[2] ?? '')) {
    return null;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * 一行成分：名字 + 数值 + 可选单位。
 * 名字里允许括号和逗号（`EPA (Eicosapentaenoic Acid)`），
 * 数值后面可能紧跟百分号、†、♢，所以单位只在被空白分开时才认。
 */
/**
 * 带单位的一行。**单位是必填的**：`Vitamin D3 (as Cholecalciferol)125 mcg`
 * 去掉括号后是 `Vitamin D3 125 mcg`，若单位可选，`3` 会被当成数值读走。
 */
const ROW_WITH_UNIT =
  /^(.*?)\s*([\d,]+(?:\.\d+)?)\s*(mg|mcg|µg|μg|g|kg|IU|CFU|billion|kcal)(?=[\s%†♢‡*]|$)/i

/** 没有单位、且数字在行尾：只用来认 `Calories 10` 这种能量行。 */
const ROW_NO_UNIT = /^(.*?)\s+([\d,]+(?:\.\d+)?)\s*$/

/** 成分表到这些标题就结束了，别把「其他成分 / 建议用量」也当成营养素。 */
const BLOCK_END = /^(other\s*ingredients|ingredients|suggested\s*use|directions|warnings?)\b/i

function cleanName(raw: string): string {
  return raw
    .replace(/[♢†*‡§]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseSupplementLabel(text: string): ParsedLabel {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => FACTS_HEADER.test(line))
  if (start === -1) {
    return { nutrients: [], unrecognized: [] }
  }

  const nutrients: ParsedNutrient[] = []
  const unrecognized: string[] = []

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) {
      continue
    }
    // 先把 markdown 的加粗标记拿掉，否则表头 `**Amount Per Serving…` 会被当成脚注
    const plain = line.replace(/\*\*/g, '').trim()
    // 脚注：单个 * 开头，或 `**Percent Daily…` 这种加粗脚注，或 † ♢
    const leadingStars = line.match(/^\*+/)?.[0] ?? '';
    const isFootnote =
      leadingStars === '*' ||
      /^\*{1,2}\s*(percent daily|daily value)/i.test(line) ||
      /^[†♢‡]/.test(line);
    if (isFootnote) {
      break
    }
    if (/^#{1,6}\s/.test(plain)) {
      break
    }
    if (BLOCK_END.test(plain)) {
      break
    }
    if (/^servings\s*per\s*container/i.test(plain)) {
      continue
    }
    if (/^amount\s*per\s*serving/i.test(plain)) {
      continue
    }
    if (/^serving\s*size/i.test(plain)) {
      continue
    }

    // 括号里是形态说明（as Cholecalciferol），对拆"名字+数值"只有干扰
    const bare = plain.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()

    let name = ''
    let value = Number.NaN
    let unit = ''
    const withUnit = bare.match(ROW_WITH_UNIT)
    if (withUnit) {
      name = withUnit[1]
      value = Number(withUnit[2].replace(/,/g, ''))
      unit = withUnit[3].toLowerCase()
    } else {
      const noUnit = bare.match(ROW_NO_UNIT)
      const label = noUnit ? cleanName(noUnit[1]).toLowerCase() : ''
      // 只有能量行允许没单位；其它无单位行不猜
      if (noUnit && /^(calories|energy)/.test(label)) {
        name = noUnit[1]
        value = Number(noUnit[2].replace(/,/g, ''))
        unit = 'kcal'
      }
    }

    name = cleanName(name)
    if (!name || !Number.isFinite(value)) {
      continue
    }

    const fieldPath = toCanonicalFieldPath(name)
    if (!fieldPath) {
      unrecognized.push(name)
      continue
    }
    nutrients.push({ fieldPath, value, unit, rawName: name })
  }

  return { nutrients, unrecognized }
}
