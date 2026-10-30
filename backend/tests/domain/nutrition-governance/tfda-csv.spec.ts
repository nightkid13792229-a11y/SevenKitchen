import {
  parseTfdaCsv,
  parseTfdaCsvWithStats,
} from 'src/domain/nutrition-governance/tfda-csv';

const HEADER = [
  '食品分類',
  '資料類別',
  '整合編號',
  '樣品名稱',
  '樣品英文名稱',
  '內容物描述',
  '廢棄率',
  '分析項',
  '含量單位',
  '每100克含量',
].join(',');

const FIXTURE = `\uFEFF${HEADER}
"魚貝類","樣品基本資料","F001","鯊魚, 雙髻鯊","","樣品狀態:生; 前處理描述:""去鱗"",含皮","62.2","熱量","kcal","               117"
"魚貝類","樣品基本資料","F001","鯊魚, 雙髻鯊"," Hammerhead shark ","","","粗蛋白","g","               20.1"
"魚貝類","樣品基本資料","F001","鯊魚, 雙髻鯊","Second English","","","鈣","mg",""
"魚貝類","樣品基本資料","F001","鯊魚, 雙髻鯊","","","","鐵","mg","Tr"
"魚貝類","樣品基本資料","F001","鯊魚, 雙髻鯊","","","","鋅","mg","-"
"魚貝類","樣品基本資料","F001","鯊魚, 雙髻鯊","","","","鈉","mg","1.00/1.69/3.20"
"魚貝類","樣品平均值","F001","鯊魚, 雙髻鯊","","","","鉀","mg","               250"
"魚貝類","樣品基本資料","F001","鯊魚, 雙髻鯊","","","","鉀","mg","               240"
"魚貝類","樣品基本資料","F001","鯊魚, 雙髻鯊","","","","水分","g","   "
"魚貝類","樣品基本資料","F001","鯊魚, 雙髻鯊","","","","","mg","               5"
"蛋類","樣品基本資料","F002","雞蛋（全蛋）","","","","熱量","kcal","              143"
"蛋類","樣品基本資料","F002","雞蛋（全蛋）","Egg, whole","樣品狀態:生","12.5","維生素A總量(IU)","I.U.","               40"
"魚貝類","樣品基本資料","","壞資料","","","","熱量","kcal","               100"
"魚貝類","樣品基本資料","   ","空白編號","","","","熱量","kcal","               100"
`;

describe('parseTfdaCsv', () => {
  it('去 BOM、按整合編號聚合，并保持首次出现顺序', () => {
    const foods = parseTfdaCsv(FIXTURE);

    expect(foods).toHaveLength(2);
    expect(foods.map((food) => food.foodCode)).toEqual(['F001', 'F002']);
    // BOM 若没被去掉，第一行 header 名会带 \uFEFF，食品分類就会是 null。
    expect(foods[0].category).toBe('魚貝類');
  });

  it('中文名原样保留引号内的逗号，描述里的 "" 还原成 "', () => {
    const [shark] = parseTfdaCsv(FIXTURE);

    expect(shark.name).toBe('鯊魚, 雙髻鯊');
    expect(shark.description).toBe('樣品狀態:生; 前處理描述:"去鱗",含皮');
  });

  it('樣品英文名稱取第一个非空值，并 trim 外侧空格', () => {
    const foods = parseTfdaCsv(FIXTURE);

    expect(foods[0].nameEn).toBe('Hammerhead shark');
    expect(foods[1].nameEn).toBe('Egg, whole');
  });

  it('內容物描述也取第一个非空值', () => {
    const foods = parseTfdaCsv(FIXTURE);

    expect(foods[1].description).toBe('樣品狀態:生');
  });

  it('廢棄率取第一个能解析成有限数的值', () => {
    const foods = parseTfdaCsv(FIXTURE);

    expect(foods[0].refuseRate).toBe(62.2);
    expect(foods[1].refuseRate).toBe(12.5);
  });

  it('空白 / Tr / - / 非数字 / 空分析項 一律跳过，不补 0', () => {
    const [shark] = parseTfdaCsv(FIXTURE);

    expect(shark.rows.map((row) => row.name)).toEqual([
      '熱量',
      '粗蛋白',
      '鉀',
      '鉀',
    ]);
    expect(shark.rows.every((row) => Number.isFinite(row.value))).toBe(true);
    for (const skipped of ['鈣', '鐵', '鋅', '鈉', '水分', '']) {
      expect(shark.rows.some((row) => row.name === skipped)).toBe(false);
    }
  });

  it('重复营养素行全部保留，資料類別原样带上', () => {
    const potassium = parseTfdaCsv(FIXTURE)[0].rows.filter(
      (row) => row.name === '鉀',
    );

    expect(potassium).toHaveLength(2);
    expect(potassium.map((row) => row.dataType)).toEqual([
      '樣品平均值',
      '樣品基本資料',
    ]);
    expect(potassium.map((row) => row.value)).toEqual([250, 240]);
    expect(potassium.every((row) => row.unit === 'mg')).toBe(true);
  });

  it('含量单位原样保留 I.U.，不在解析层改写', () => {
    const egg = parseTfdaCsv(FIXTURE)[1];

    expect(egg.rows.map((row) => row.name)).toEqual([
      '熱量',
      '維生素A總量(IU)',
    ]);
    expect(egg.rows[1].unit).toBe('I.U.');
    expect(egg.rows[1].value).toBe(40);
  });

  it('无效（空白）整合編號整行跳过', () => {
    const foods = parseTfdaCsv(FIXTURE);

    expect(foods.some((food) => food.foodCode.trim() === '')).toBe(false);
    expect(foods.map((food) => food.name)).toEqual([
      '鯊魚, 雙髻鯊',
      '雞蛋（全蛋）',
    ]);
  });

  it('容忍 CRLF 换行', () => {
    const crlf = FIXTURE.replace(/\n/gu, '\r\n');
    const foods = parseTfdaCsv(crlf);

    expect(foods).toHaveLength(2);
    expect(foods[0].name).toBe('鯊魚, 雙髻鯊');
    expect(foods[1].rows).toHaveLength(2);
  });

  it('空文本 / 只有表头返回空数组', () => {
    expect(parseTfdaCsv('')).toEqual([]);
    expect(parseTfdaCsv(`\uFEFF${HEADER}`)).toEqual([]);
  });

  it('缺少必需列时抛错', () => {
    expect(() => parseTfdaCsv('整合編號,樣品名稱\nF001,測試')).toThrow(
      /每100克含量|分析項|含量單位/u,
    );
  });

  it('解析统计能解释每一类丢弃行', () => {
    const { foods, stats } = parseTfdaCsvWithStats(FIXTURE);

    expect(foods).toHaveLength(2);
    expect(stats).toEqual({
      dataRows: 12,
      numericRows: 6,
      blankRows: 2,
      traceRows: 1,
      dashRows: 1,
      nonNumericRows: 1,
      emptyNutrientNameRows: 1,
      invalidFoodRows: 2,
    });
    // 有效整合編號的行必须全部有归类，不能悄悄消失。
    expect(stats.dataRows).toBe(
      stats.numericRows +
        stats.blankRows +
        stats.traceRows +
        stats.dashRows +
        stats.nonNumericRows +
        stats.emptyNutrientNameRows,
    );
  });
});
