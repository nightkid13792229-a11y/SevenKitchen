/**
 * 需求分类节点词典（种子数据的唯一来源）。
 *
 * 与 `docs/superpowers/specs/2026-10-26-recipe-taxonomy-nodes.md` 一一对应：
 * 主蛋白 3+17、健康需求 12+36、场景 4、季节 6、工艺形态 5，合计 83 个节点。
 *
 * 改动这里的定义等于改运营的判断口径，改之前同步更新词典文件。
 */

export interface TaxonomySeedNode {
  name: string;
  definition: string;
  sort: number;
  children?: TaxonomySeedNode[];
}

export interface TaxonomySeedKind {
  code: string;
  name: string;
  sort: number;
  nodes: TaxonomySeedNode[];
}

export const TAXONOMY_KIND_CODES = [
  'MAIN_PROTEIN',
  'HEALTH_NEED',
  'SCENARIO',
  'SEASON',
  'PROCESS',
] as const;

const proteinNode = (
  name: string,
  definition: string,
  sort: number,
): TaxonomySeedNode => ({ name, definition, sort });

export const TAXONOMY_SEED: TaxonomySeedKind[] = [
  {
    code: 'MAIN_PROTEIN',
    name: '主蛋白',
    sort: 10,
    nodes: [
      {
        name: '畜类',
        definition: '占比第一的动物蛋白来自陆生哺乳类家畜',
        sort: 10,
        children: [
          proteinNode('猪', '主蛋白是猪肉', 10),
          proteinNode('牛', '主蛋白是牛肉', 20),
          proteinNode('羊', '主蛋白是羊肉', 30),
          proteinNode('兔', '主蛋白是兔肉', 40),
          proteinNode('鹿', '主蛋白是鹿肉', 50),
        ],
      },
      {
        name: '禽类',
        definition: '占比第一的动物蛋白来自禽类',
        sort: 20,
        children: [
          proteinNode('鸡', '主蛋白是鸡肉', 10),
          proteinNode('鸭', '主蛋白是鸭肉', 20),
          proteinNode('火鸡', '主蛋白是火鸡肉', 30),
          proteinNode('鹅', '主蛋白是鹅肉', 40),
          proteinNode('鹌鹑', '主蛋白是鹌鹑肉', 50),
          proteinNode('鸽', '主蛋白是鸽肉', 60),
        ],
      },
      {
        name: '鱼类',
        definition: '占比第一的动物蛋白来自鱼',
        sort: 30,
        children: [
          proteinNode('三文鱼', '主蛋白是三文鱼', 10),
          proteinNode('鳕鱼', '主蛋白是鳕鱼', 20),
          proteinNode('青花鱼', '主蛋白是青花鱼（鲭鱼）', 30),
          proteinNode('鲈鱼', '主蛋白是鲈鱼', 40),
          proteinNode('沙丁鱼', '主蛋白是沙丁鱼', 50),
          proteinNode('龙利鱼', '主蛋白是龙利鱼', 60),
        ],
      },
    ],
  },
  {
    code: 'HEALTH_NEED',
    name: '健康需求',
    sort: 20,
    nodes: [
      {
        name: '消化',
        definition: '涉及口腔到肠道的消化吸收问题，含症状与已确诊疾病',
        sort: 10,
        children: [
          proteinNode('软便', '主人反馈排便不成形、偏稀，但未确诊疾病', 10),
          proteinNode('便秘', '主人反馈排便间隔变长、粪便干硬', 20),
          proteinNode('胀气', '主人反馈腹部胀、排气多', 30),
          proteinNode('呕吐', '主人反馈进食后偶发呕吐，但未确诊疾病', 40),
          proteinNode('胰腺炎', '已确诊或既往发作过胰腺炎', 50),
          proteinNode('食物不耐受', '对特定食材出现不良反应，但未达到过敏诊断', 60),
          proteinNode('肝病', '已确诊肝脏相关疾病', 70),
          proteinNode('挑食', '主人反馈进食意愿低、需要拌食才吃', 80),
        ],
      },
      {
        name: '皮肤毛发',
        definition: '皮肤、被毛相关的外观异常与已确诊皮肤病',
        sort: 20,
        children: [
          proteinNode('瘙痒', '主人反馈频繁抓挠、啃咬自己', 10),
          proteinNode('脱毛', '主人反馈非换毛季的异常掉毛', 20),
          proteinNode('皮屑', '主人反馈皮肤干燥、有皮屑', 30),
          proteinNode('皮炎', '已确诊皮肤炎症', 40),
        ],
      },
      {
        name: '骨关节',
        definition: '骨骼与关节相关的结构或退行性问题',
        sort: 30,
        children: [
          proteinNode('关节炎', '已确诊关节炎症', 10),
          proteinNode('髋关节发育不良', '已确诊髋关节发育不良', 20),
          proteinNode('骨质疏松', '已确诊骨密度偏低', 30),
        ],
      },
      {
        name: '体重体态',
        definition: '体重偏离理想区间，需要靠能量与配比调整',
        sort: 40,
        children: [
          proteinNode('超重', '体况评分偏高但未达肥胖', 10),
          proteinNode('肥胖', '已达肥胖标准', 20),
          proteinNode('消瘦', '体况评分偏低、需要增重', 30),
        ],
      },
      {
        name: '肾脏泌尿',
        definition: '肾脏与泌尿系统相关的已确诊疾病',
        sort: 50,
        children: [
          proteinNode('慢性肾病', '已确诊慢性肾病', 10),
          proteinNode('尿石症', '已确诊或既往有尿路结石', 20),
          proteinNode('尿路感染', '已确诊或反复发生尿路感染', 30),
        ],
      },
      {
        name: '心脏',
        definition: '心脏相关的已确诊疾病',
        sort: 60,
        children: [
          proteinNode('心脏病', '已确诊心脏疾病', 10),
          proteinNode('心衰', '已确诊心力衰竭', 20),
        ],
      },
      {
        name: '口腔',
        definition: '牙齿与口腔的清洁度、气味与炎症问题',
        sort: 70,
        children: [
          proteinNode('牙结石', '已观察到明显牙结石', 10),
          proteinNode('口臭', '主人反馈持续口臭', 20),
          proteinNode('牙龈炎', '已确诊牙龈炎症', 30),
        ],
      },
      {
        name: '免疫过敏',
        definition: '免疫与过敏相关的已确诊问题',
        sort: 80,
        children: [
          proteinNode('食物过敏', '已确诊或高度怀疑食物过敏', 10),
          proteinNode('免疫低下', '已确诊免疫功能偏低', 20),
        ],
      },
      {
        name: '内分泌',
        definition: '内分泌腺体相关的已确诊疾病',
        sort: 90,
        children: [
          proteinNode('糖尿病', '已确诊糖尿病', 10),
          proteinNode('甲减', '已确诊甲状腺功能减退', 20),
          proteinNode('甲亢', '已确诊甲状腺功能亢进', 30),
          proteinNode('库欣', '已确诊肾上腺皮质功能亢进', 40),
        ],
      },
      {
        name: '老年认知',
        definition: '老年犬的认知退化表现',
        sort: 100,
        children: [
          proteinNode(
            '认知障碍',
            '已确诊或明显出现老年认知退化表现',
            10,
          ),
        ],
      },
      {
        name: '肿瘤',
        definition: '已确诊肿瘤',
        sort: 110,
      },
      {
        name: '血液代谢',
        definition: '血液与体液相关的异常状态',
        sort: 120,
        children: [
          proteinNode('贫血', '已确诊贫血', 10),
          proteinNode('脱水', '存在脱水风险或已出现脱水', 20),
        ],
      },
    ],
  },
  {
    code: 'SCENARIO',
    name: '场景',
    sort: 30,
    nodes: [
      proteinNode(
        '日常主食',
        '可作为长期主食，有明确主蛋白，不限定使用时机',
        10,
      ),
      proteinNode(
        '初次尝试',
        '面向第一次购买、需要低门槛小份试用的场景',
        20,
      ),
      proteinNode(
        '换粮过渡',
        '从干粮或其它食物切换到鲜食的过渡期使用',
        30,
      ),
      proteinNode('出行', '需要便携、耐储存或分装携带的场景', 40),
    ],
  },
  {
    code: 'SEASON',
    name: '季节',
    sort: 40,
    nodes: [
      proteinNode('春', '主要食材在春季供应', 10),
      proteinNode('夏', '主要食材在夏季供应', 20),
      proteinNode('秋', '主要食材在秋季供应', 30),
      proteinNode('冬', '主要食材在冬季供应', 40),
      proteinNode(
        '应季',
        '跟随当季食材变化，不固定归属某个季节',
        50,
      ),
      proteinNode(
        '换季敏感期',
        '季节交替期间用于皮肤或肠胃波动的场景',
        60,
      ),
    ],
  },
  {
    code: 'PROCESS',
    name: '工艺形态',
    sort: 50,
    nodes: [
      proteinNode(
        '蒸煮鲜食',
        '低温蒸煮熟制后冷冻配送（当前唯一在产形态）',
        10,
      ),
      proteinNode('生食', '未经热处理的生鲜配方', 20),
      proteinNode('冻干', '冷冻干燥成型', 30),
      proteinNode('风干', '低温风干成型', 40),
      proteinNode('烘焙', '烘烤成型', 50),
    ],
  },
];

/** 把两层结构摊平成节点列表，附带所属分类 code 与父节点名。 */
export function flattenTaxonomySeed(): Array<
  TaxonomySeedNode & { kind: string; parentName: string | null }
> {
  return TAXONOMY_SEED.flatMap((kind) =>
    kind.nodes.flatMap((node) => [
      { ...node, kind: kind.code, parentName: null },
      ...(node.children ?? []).map((child) => ({
        ...child,
        kind: kind.code,
        parentName: node.name,
      })),
    ]),
  );
}
