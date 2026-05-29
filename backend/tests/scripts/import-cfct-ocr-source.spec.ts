import {
  buildCfctRowsFromOcrPages,
  parseCfctOcrLine,
  validateStructuredCfctRow,
  type CfctOcrPage,
} from '../../scripts/import-cfct-ocr-source';

const basePage: CfctOcrPage = {
  sourcePdf: '/private/cfct-volume-1.pdf',
  volume: '第六版 第一册',
  page: 42,
  imageWidth: 2280,
  imageHeight: 3280,
  observations: [],
  fullText: '',
};

describe('CFCT OCR source structuring', () => {
  it('parses a CFCT-like OCR table line without a food code only for review', () => {
    const row = parseCfctOcrLine({
      line: '鸡胸肉 133 73.2 24.6 1.9 1.1 0.0 3 196 256 45 28',
      page: basePage,
      lineIndex: 7,
      confidence: 0.94,
    });

    expect(row).toMatchObject({
      volume: '第六版 第一册',
      page: 42,
      row: 8,
      foodName: '鸡胸肉',
      nutrients: {
        energyKcal: 133,
        moisture: 73.2,
        crudeProtein: 24.6,
        crudeFat: 1.9,
        ash: 1.1,
        carbohydrate: 0,
        calcium: 3,
        phosphorus: 196,
        potassium: 256,
        sodium: 45,
        magnesium: 28,
      },
      reviewStatus: 'NEEDS_REVIEW',
    });
    expect(row.qualityFlags).toEqual(['MISSING_FOOD_CODE']);
  });

  it('parses real CFCT code-first macro table rows', () => {
    const row = parseCfctOcrLine({
      line:
        '061101x 苹果（代表值） 85 86.1 53 227 0.4 0.2 13.7 1.7 0 0.2 4 50 0 0.02 0.02',
      page: {
        ...basePage,
        fullText:
          '食物编码 食物名称 食部 水分 能量 蛋白质 脂肪 碳水化合物 不溶性膳食纤维',
      },
      lineIndex: 12,
      confidence: 0.93,
    });

    expect(row).toMatchObject({
      foodName: '苹果（代表值）',
      foodCode: '061101x',
      ediblePortionPercent: 85,
      nutrients: {
        moisture: 86.1,
        energyKcal: 53,
        crudeProtein: 0.4,
        crudeFat: 0.2,
        ash: 0.2,
        carbohydrate: 13.7,
        insolubleFiber: 1.7,
      },
      reviewStatus: 'AUTO_STRUCTURED',
    });
  });

  it('keeps ash and right-aligned B vitamins when macro table OCR omits empty vitamin cells', () => {
    const row = parseCfctOcrLine({
      line:
        '011204 小麦胚粉 100 4.3 403 1687 36.4 10.1 44.5 5.6 0 4.7 0 3.50 0.79',
      page: {
        ...basePage,
        fullText:
          '食物编码 食物名称 食部 水分 能量 蛋白质 脂肪 碳水化合物 不溶性膳食纤维 总维生素 A 胡萝卜素 视黄醇 硫胺素 核黄素',
      },
      lineIndex: 11,
      confidence: 0.93,
    });

    expect(row).toMatchObject({
      foodName: '小麦胚粉',
      foodCode: '011204',
      nutrients: {
        ash: 4.7,
        vitaminB1: 3.5,
        vitaminB2: 0.79,
      },
    });
  });

  it('keeps complete CFCT macro-table vitamin A forms as reviewable source fields', () => {
    const row = parseCfctOcrLine({
      line:
        '011201x 小麦粉（代表值） 100 11.2 359 1512 12.4 1.7 74.1 0.8 0 0.7 0 0 0 0.20 0.06',
      page: {
        ...basePage,
        page: 52,
        fullText:
          '食物编码 食物名称 食部 水分 能量 蛋白质 脂肪 碳水化合物 不溶性膳食纤维 胆固醇 灰分 总维生素 A 胡萝卜素 视黄醇 硫胺素 核黄素',
      },
      lineIndex: 8,
      confidence: 0.93,
    });

    expect(row).toMatchObject({
      foodName: '小麦粉（代表值）',
      foodCode: '011201x',
      nutrients: {
        ash: 0.7,
        vitaminB1: 0.2,
        vitaminB2: 0.06,
      },
      unmappedNutrients: {
        cfctCholesterolMg: 0,
        cfctVitaminATotalUg: 0,
        cfctCaroteneUg: 0,
        cfctRetinolUg: 0,
      },
    });
    expect(row?.sourceSegments?.[0]?.nutrientKeys).toEqual(
      expect.arrayContaining([
        'cfctVitaminATotalUg',
        'cfctCaroteneUg',
        'cfctRetinolUg',
      ]),
    );
  });

  it('marks low-confidence or suspicious OCR rows for human review', () => {
    const row = parseCfctOcrLine({
      line: '奇怪食品 900 10 90 90 10 20 9999',
      page: basePage,
      lineIndex: 0,
      confidence: 0.51,
    });

    expect(row?.reviewStatus).toBe('NEEDS_REVIEW');
    expect(row?.qualityFlags).toEqual(
      expect.arrayContaining([
        'LOW_OCR_CONFIDENCE',
        'MACRO_SUM_OUT_OF_RANGE',
        'ENERGY_MACRO_MISMATCH',
      ]),
    );
  });

  it('rejects lines without enough numeric nutrient cells', () => {
    expect(
      parseCfctOcrLine({
        line: '蛋白质 脂肪 碳水化合物',
        page: basePage,
        lineIndex: 0,
        confidence: 0.97,
      }),
    ).toBeNull();
  });

  it('rejects OCR measurement and nutrient-header lines', () => {
    expect(
      parseCfctOcrLine({
        line:
          '（以每100g 可食部计） 0.10 0.19 0.06 0.06 0.11 0.79 0.30 0.05',
        page: basePage,
        lineIndex: 0,
        confidence: 0.92,
      }),
    ).toBeNull();

    expect(
      parseCfctOcrLine({
        line: '锰 Mn mg 0.04 0.08 0.06 0.07 0.03 0.07 0.29',
        page: basePage,
        lineIndex: 1,
        confidence: 0.92,
      }),
    ).toBeNull();
  });

  it('does not treat header-like continuation rows as food rows', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        page: 52,
        fullText:
          '食物编码 食物名称 烟酸 维生素C 维生素E 钙 磷 钾 钠 镁 铁 锌 硒 铜 锰\n（以每100g 可食部计） 0.10 0.19 0.06 0.06 0.11 0.79 0.30 0.05 0.03 0.04 0.04',
      },
    ]);

    expect(rows).toHaveLength(0);
  });

  it('does not treat nutrient unit rows as auto-structured rows', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        page: 91,
        fullText:
          '食物编码 食物名称 烟酸 维生素C 维生素E 钙 磷 钾 钠 镁 铁 锌 硒 铜 锰\n锰 Mn mg 0.04 0.08 0.06 0.07 0.03 0.07 0.29 0.63',
      },
    ]);

    expect(rows).toHaveLength(0);
  });

  it('rejects continuation rows where a category precedes the food code', () => {
    expect(
      parseCfctOcrLine({
        line:
          '水果类及制品 061113 青香蕉苹果 0.20 3.0 0.37 0.23 0.13 0.01 9 7 83 1.3',
        page: basePage,
        lineIndex: 18,
        confidence: 0.83,
      }),
    ).toBeNull();
  });

  it('builds reviewed CFCT rows from OCR pages and keeps page traceability', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        fullText:
          '食物名称 能量 水分 蛋白质 脂肪 灰分 碳水化合物 钙 磷 钾 钠 镁\n鸡胸肉 133 73.2 24.6 1.9 1.1 0.0 3 196 256 45 28',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      foodName: '鸡胸肉',
      sourcePdf: '/private/cfct-volume-1.pdf',
      ocrPage: 42,
      ocrLine: 2,
      reviewStatus: 'NEEDS_REVIEW',
    });
    expect(rows[0].qualityFlags).toEqual(['MISSING_FOOD_CODE']);
  });

  it('merges CFCT continuation table nutrients into the matching code-first row', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        page: 120,
        fullText:
          '食物编码 食物名称 食部 水分 能量 蛋白质 脂肪 碳水化合物 不溶性膳食纤维\n061101x 苹果（代表值） 85 86.1 53 227 0.4 0.2 13.7 1.7 0 0.2 4 50 0 0.02 0.02',
      },
      {
        ...basePage,
        page: 121,
        fullText:
          '食物编码 食物名称 烟酸 维生素C 维生素E 钙 磷 钾 钠 镁 铁 锌 硒 铜 锰\n061101x 苹果（代表值） 0.20 3.0 0.43 0.23 0.13 0.01 4 7 83 1.3 4 0.3 0.04 0.10 0.07 0.03',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      foodCode: '061101x',
      foodName: '苹果（代表值）',
      ediblePortionPercent: 85,
      nutrients: {
        moisture: 86.1,
        energyKcal: 53,
        crudeProtein: 0.4,
        crudeFat: 0.2,
        carbohydrate: 13.7,
        insolubleFiber: 1.7,
        vitaminB1: 0.02,
        vitaminB2: 0.02,
        vitaminB3: 0.2,
        vitaminC: 3,
        calcium: 4,
        phosphorus: 7,
        potassium: 83,
        sodium: 1.3,
        magnesium: 4,
        iron: 0.3,
        zinc: 0.04,
        selenium: 0.1,
        copper: 0.07,
        manganese: 0.03,
      },
      reviewStatus: 'AUTO_STRUCTURED',
    });
    expect((rows[0] as { sourceSegments?: unknown[] }).sourceSegments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'PRIMARY', page: 120, row: 2 }),
        expect.objectContaining({ kind: 'CONTINUATION', page: 121, row: 2 }),
      ]),
    );
  });

  it('keeps mineral/vitamin continuation rows when OCR drops most continuation headers', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        page: 60,
        fullText:
          '食物编码 食物名称 食部 水分 能量 蛋白质 脂肪 碳水化合物 不溶性膳食纤维\n019008 薏米［薏仁米,苡米］ 100 11.2 361 1512 12.8 3.3 71.1 2.0 0 1.6 0 0.22 0.15',
      },
      {
        ...basePage,
        page: 61,
        fullText:
          '食物编码 食物名称 铜 锰 备注 Food code Food name Cu Mn Remark\n019010 019008 薏米［薏仁米,苡米］ 200 0 2.08 1.48 0.60 Tr 42 217 238 3.6 88 3.6 1.68 3.07 0.29 1.37',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      foodCode: '019008',
      foodName: '薏米［薏仁米,苡米］',
      nutrients: {
        calcium: 42,
        phosphorus: 217,
        potassium: 238,
        sodium: 3.6,
        magnesium: 88,
        iron: 3.6,
        zinc: 1.68,
        selenium: 3.07,
        copper: 0.29,
        manganese: 1.37,
      },
      qualityFlags: ['INFERRED_CONTINUATION_HEADER'],
      reviewStatus: 'NEEDS_REVIEW',
    });
  });

  it('merges CFCT amino acid table nutrients into the matching food code', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        page: 52,
        fullText:
          '食物编码 食物名称 食部 水分 能量 蛋白质 脂肪 碳水化合物 不溶性膳食纤维\n011201x 小麦粉（代表值） 100 11.2 359 1512 12.4 1.7 74.1 0.8 0 0.7 0 0.20 0.06',
      },
      {
        ...basePage,
        page: 156,
        fullText:
          '食物氨基酸含量 Amino acid content of foods\n食物编码 食物名称 水分 蛋白质 异亮氨酸 亮氨酸 赖氨酸 含硫氨基酸 蛋氨酸 胱氨酸 芳香族氨基酸 苯丙氨酸 酪氨酸 苏氨酸\n011201x 小麦粉（代表值） 11.2 12.4 402 837 271 460 174 286 946 611 335 337',
      },
      {
        ...basePage,
        page: 157,
        fullText:
          '食物氨基酸含量 Amino acid content of foods\n食物编码 食物名称 色氨酸 缬氨酸 精氨酸 组氨酸 丙氨酸 天冬氨酸 谷氨酸 甘氨酸 脯氨酸 丝氨酸 备注\n011201x 小麦粉（代表值） 123 510 451 234 391 529 4074 460 1369 573',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      foodCode: '011201x',
      nutrients: {
        isoleucine: 0.402,
        leucine: 0.837,
        lysine: 0.271,
        methionine: 0.174,
        cystine: 0.286,
        phenylalanine: 0.611,
        tyrosine: 0.335,
        threonine: 0.337,
        tryptophan: 0.123,
        valine: 0.51,
        arginine: 0.451,
        histidine: 0.234,
        glutamicAcid: 4.074,
        glycine: 0.46,
        proline: 1.369,
      },
    });
    expect(rows[0].sourceSegments?.map((segment) => segment.kind)).toEqual([
      'PRIMARY',
      'CONTINUATION',
      'CONTINUATION',
    ]);
  });

  it('parses CFCT fatty acid table totals as mapped fatty acid nutrients', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        page: 194,
        fullText:
          '食物脂肪酸含量 Fatty acid content of foods\n食物编码 食物名称 脂肪 脂肪酸 Fatty acid 饱和 单不饱和 多不饱和 未知\n011201x 小麦粉（代表值） 1.7 1.1 0.5 0.3 0.4 — 38.0 0.5 0.3 33.8 0.1 2.7',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      foodCode: '011201x',
      nutrients: {
        saturatedFattyAcids: 0.5,
        monounsaturatedFattyAcids: 0.3,
        polyunsaturatedFattyAcids: 0.4,
      },
      unmappedNutrients: {
        cfctFatG: 1.7,
        cfctFattyAcidTotalG: 1.1,
      },
    });
  });

  it('keeps CFCT fatty acid total columns aligned when OCR adds a trailing bar', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        page: 198,
        fullText:
          '食物脂肪酸含量 Fatty acid content of foods\nFood code Food name Fat 饱和 单不饱和 多不饱和 来知 SFA MUFA PUFA Un_k Total\n031304 豆腐（内酯） 1.9 1.8| 0.3 0.4 1.1 0.0 16.5',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      foodCode: '031304',
      nutrients: {
        saturatedFattyAcids: 0.3,
        monounsaturatedFattyAcids: 0.4,
        polyunsaturatedFattyAcids: 1.1,
      },
      unmappedNutrients: {
        cfctFatG: 1.9,
        cfctFattyAcidTotalG: 1.8,
        cfctUnknownFattyAcidsG: 0,
      },
    });
  });

  it('keeps CFCT fatty acid detail pages as review-only evidence without overwriting total grams', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        page: 72,
        fullText:
          '食物编码 食物名称 食部 水分 能量 蛋白质 脂肪 碳水化合物 不溶性膳食纤维\n031306 豆腐（北豆腐） 100 82.8 116 486 9.2 8.1 0 0 0 1.1 0 0.06 0.03',
      },
      {
        ...basePage,
        page: 198,
        fullText:
          '食物脂肪酸含量 Fatty acid content of foods\n食物编码 食物名称 脂肪 Fat 脂肪酸 Total 饱和 SFA 单不饱和 MUFA 多不饱和 PUFA 未知 Un_k\n031306 豆腐（北豆腐） 8.1 7.5 3.8 2.9 0.6 0.0 50.6',
      },
      {
        ...basePage,
        page: 199,
        fullText:
          '单不饱和脂肪酸 /总脂肪酸（%） 多不饱和脂肪酸/总脂肪酸 Fatty acid content of foods\nFood code Food name 14:1 15:1 16:1 17:1 18:1 20:1 22:1 24:1 Total 16:2 18:2 18:3 18:4 20:2 20:3 20:4 20:5 22:3 22:4\n031306 豆腐（北豆腐） 38.5 Tr Tr 0.8 Tr 35.4 Tr 2.3 Tr 7.4 Tr 7.3 0.1 T T Tr Tr Tr Tr Tr Tr 0.3 北京',
      },
    ]);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({
      foodCode: '031306',
      nutrients: {
        crudeFat: 8.1,
        saturatedFattyAcids: 3.8,
        monounsaturatedFattyAcids: 2.9,
        polyunsaturatedFattyAcids: 0.6,
      },
      unmappedNutrients: {
        cfctFatG: 8.1,
        cfctFattyAcidTotalG: 7.5,
        cfctUnknownFattyAcidsG: 0,
      },
    });
    expect(row.unmappedNutrients).not.toHaveProperty(
      'cfctMonounsaturatedFattyAcidsPercentOfTotal',
    );
    expect(row.unmappedNutrients).not.toHaveProperty(
      'cfctLinoleicAcidPercentOfTotalFattyAcids',
    );
    expect(row.sourceSegments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          page: 199,
          rawOcrText: expect.stringContaining('031306 豆腐（北豆腐）'),
          nutrientKeys: [],
        }),
      ]),
    );
  });

  it('parses CFCT code-column vitamin table rows by aligning codes names and nutrient columns', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        page: 250,
        fullText:
          '011207 011206 Food code 食物编码\n小麦面粉（富强粉、特一粉） 小麦面粉（标准粉） 谷类及制品 Food name 食物名称 Content of Selected Foods 部分食物胆碱、生物素、泛酸含量 表5-2\n46.9 41.8 Choline 胆碱\n2.3 3.8 Biotin 生物素\n0.71 0.63 Pantothenic acid 泛酸 （以每100g 可食部计）',
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      foodCode: '011207',
      foodName: '小麦面粉（富强粉、特一粉）',
      nutrients: {
        choline: 46.9,
        vitaminB7: 2.3,
        vitaminB5: 0.71,
      },
    });
    expect(rows[1]).toMatchObject({
      foodCode: '011206',
      foodName: '小麦面粉（标准粉）',
      nutrients: {
        choline: 41.8,
        vitaminB7: 3.8,
        vitaminB5: 0.63,
      },
    });
  });

  it('keeps DHA and EPA special-table rows without CFCT food codes for review', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        volume: '第六版 第二册',
        page: 389,
        fullText:
          '部分食用鱼贝类中 DHA 和 EPA 含量 DHA and EPA content of selected edible fishes and shellfishes\n序号 食物名称 科学名称 DHA EPA EPA+DHA DHA EPA EPA+DHA SFA MUFA PUFA Remark\nDE001 巴基斯坦艾利鲶 Ailia coila 1.8 Tr 1.8 9.3 Tr 9.3 51.9 9.1 36.6 印度，野生',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      foodName: '巴基斯坦艾利鲶',
      reviewStatus: 'NEEDS_REVIEW',
      qualityFlags: ['MISSING_FOOD_CODE'],
      nutrients: {
        dha: 1800,
        epa: 0,
      },
      unmappedNutrients: {
        cfctDhaEpaTotalMg: 1800,
        cfctDhaPercentOfTotalFattyAcids: 9.3,
        cfctEpaPercentOfTotalFattyAcids: 0,
      },
    });
  });

  it('keeps CFCT iodine sequence table values as reviewable source rows', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        page: 233,
        fullText:
          '常见食物中碘含量 Iodine Content of Common Foods\n35 莜麦 34 燕麦米 33 荞麦面 Food name 食物名称\n1.4 3.9 6.8 Iodine 碘含量 （μg/100g可食部）',
      },
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      foodName: '莜麦',
      reviewStatus: 'NEEDS_REVIEW',
      qualityFlags: ['MISSING_FOOD_CODE'],
      nutrients: { iodine: 1.4 },
      unmappedNutrients: { cfctSequenceNumber: 35 },
    });
    expect(rows[2]).toMatchObject({
      foodName: '荞麦面',
      nutrients: { iodine: 6.8 },
      unmappedNutrients: { cfctSequenceNumber: 33 },
    });
  });

  it('aligns CFCT column-style sequence numbers names and values', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        page: 241,
        fullText:
          '常见食物中碘含量 Iodine Content of Common Foods\n283 282 281\n海带浓缩液 海藻饮料 中华可乐 Food name 食物名称\n22780.0 184.5 68.4 Iodine 碘含量 （μg/100g可食部）',
      },
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      foodName: '海带浓缩液',
      nutrients: { iodine: 22780 },
      unmappedNutrients: { cfctSequenceNumber: 283 },
    });
    expect(rows[2]).toMatchObject({
      foodName: '中华可乐',
      nutrients: { iodine: 68.4 },
      unmappedNutrients: { cfctSequenceNumber: 281 },
    });
  });

  it('keeps CFCT folate sequence table values as reviewable vitamin B9 rows', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        page: 246,
        fullText:
          'Table 5-1 Folic Acid Content of Common Foods 表5-1 常见食物中叶酸含量\n3 小麦粉（红芒） 2 小麦粉（青海） 1 小麦粉［面粉］ Food name 食物名称\n13.6 6.8 23.7 Folic acid 叶酸 （μg/100g可食部）',
      },
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      foodName: '小麦粉（红芒）',
      nutrients: { vitaminB9: 13.6 },
      unmappedNutrients: { cfctSequenceNumber: 3 },
    });
  });

  it('keeps CFCT purine sequence table totals as unmapped review rows', () => {
    const rows = buildCfctRowsFromOcrPages([
      {
        ...basePage,
        volume: '第六版 第二册',
        page: 372,
        fullText:
          '常见食物嘌呤含量 Purine content of common foods\n2 面包（去皮） 1 面包（带皮） Food name 食物名称\n7.8 8.6 Guanine 鸟嘌呤\n3.9 6.1 Adenine 腺嘌呤\n12 15 Purine 总嘌呤含量 （mg/100g 可食部）',
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      foodName: '面包（去皮）',
      nutrients: {},
      unmappedNutrients: {
        cfctSequenceNumber: 2,
        cfctPurineTotalMg: 12,
      },
      qualityFlags: ['MISSING_FOOD_CODE'],
    });
  });

  it('validates structured rows against hard nutrition sanity checks', () => {
    expect(
      validateStructuredCfctRow({
        foodName: '鸡胸肉',
        nutrients: {
          energyKcal: 133,
          moisture: 73.2,
          crudeProtein: 24.6,
          crudeFat: 1.9,
          ash: 1.1,
          carbohydrate: 0,
        },
        ocrConfidence: 0.92,
      }),
    ).toEqual([]);

    expect(
      validateStructuredCfctRow({
        foodName: '鸡胸肉',
        nutrients: {
          energyKcal: 10,
          moisture: 150,
          crudeProtein: 60,
          crudeFat: 60,
          ash: 10,
          carbohydrate: 60,
        },
        ocrConfidence: 0.4,
      }),
    ).toEqual(
      expect.arrayContaining([
        'LOW_OCR_CONFIDENCE',
        'WATER_OUT_OF_RANGE',
        'MACRO_SUM_OUT_OF_RANGE',
        'ENERGY_MACRO_MISMATCH',
      ]),
    );
  });
});
