import type { KnowledgeEntry } from '../types';

/**
 * ORTHO 领域知识条目：骨关节炎（退行性关节病）的营养管理。
 *
 * 适用对象：患骨关节炎/退行性关节病的犬（猫数据有限但部分适用）。
 * 本领域聚焦骨关节炎的饮食干预原则与数值目标。
 *
 * 出处（均为本地资料，逐一解析核对，未编造数字）：
 * - 《小动物临床营养学》第5版（SACN5）第34章 骨关节炎的营养管理
 *   （Nutritional Management of Osteoarthritis）
 *   —— 表34-2 骨关节炎患者关键营养因素；风险因素、omega-3/EPA 机制、
 *     L-肉碱、氨基葡萄糖/硫酸软骨素、体重管理与控制、猫的数据。
 */
export const ORTHO_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'ortho-001',
    domain: 'ORTHO',
    title: '骨关节炎的营养管理总体原则与风险因素',
    keywords: [
      '骨关节炎', '关节炎', '关节', '退行性关节病', '营养管理', '风险因素',
      'osteoarthritis', 'arthritis', 'joint', 'degenerative joint', 'risk factor',
    ],
    applicableTo: ['ortho', 'arthritis', 'oain', 'joint', 'osteoarthritis'],
    summary:
      '骨关节炎（退行性关节病）是慢性进展性疾病，特征是关节软骨退变、蛋白聚糖与胶原丢失、新生骨增生和炎症反应。犬 1 岁以上约 20% 受累。常见危险因素为发育性骨科病、创伤（含十字韧带断裂）和肥胖。营养管理目标是：控制危险因素、控制临床症状、延缓疾病进展。',
    details: [
      '发病：犬 1 岁以上约 20% 受累；猫 1 岁以上约 20%（老年猫 90% 有影像学证据）；英国是犬最常见的非创伤性骨科问题。',
      '风险因素（犬）：年龄、品种（大型/巨型犬）、遗传、发育性骨科病（髋关节发育不良 CHD、骨软骨病、肘发育不良等）、创伤、肥胖。',
      '高风险犬种（发育性骨科病遗传易感）：德国牧羊犬、罗威纳、拉布拉多、金毛。',
      '综合管理：手术矫正 + 非甾体抗炎药（NSAID）+ 物理康复 + 治疗性营养 + 体重控制与运动；多数患者需综合治疗。',
      '骨关节炎多为不可逆，但良好管理可减轻疼痛、延缓进展；治疗应个体化。',
    ],
    caveats: [
      '骨关节炎常不可逆，营养管理旨在减轻症状与延缓进展，需与药物/康复/体重管理协同。',
      '影像学与临床症状不一定一致；早期诊断难度较大。',
    ],
    citations: [
      { source: '小动物临床营养学（第5版）', chapter: '第34章 骨关节炎的营养管理', note: 'CLINICAL IMPORTANCE、Risk Factors、综合治疗' },
    ],
    priority: 'HIGH',
  },
  {
    id: 'ortho-002',
    domain: 'ORTHO',
    title: '骨关节炎的营养管理关键因素（表34-2）',
    keywords: [
      '骨关节炎营养', '关键营养因素', 'omega-3', 'L-肉碱', '氨基葡萄糖', '硫酸软骨素',
      'osteoarthritis nutrition', 'key nutrients', 'omega-3', 'carnitine', 'glucosamine', 'chondroitin',
    ],
    applicableTo: ['ortho', 'arthritis', 'joint', 'osteoarthritis'],
    summary:
      '骨关节炎患者的治疗性食物应提供：总 omega-3 3.5-4.0%、EPA 0.4-1.1%、omega-6:omega-3 <1:1、L-肉碱 ≥300mg/kg、氨基葡萄糖 ≤0.10%、硫酸软骨素 ≤0.08%、维E ≥400IU/kg、维C ≥100mg/kg、硒 0.5-1.3mg/kg、磷 0.3-0.7%、钠 0.2-0.4%（均干物质）。这些营养有助于减轻炎症与疼痛、延缓降解、与药物互补。',
    details: [
      '总 omega-3：3.5-4.0% DM；EPA 0.4-1.1% DM；omega-6:omega-3 比例 <1:1；犬每日约 50-100mg EPA/kg 体重。',
      'L-肉碱：≥300mg/kg DM——在减重时帮助保留瘦体重。',
      '氨基葡萄糖 HCl ≤0.10%、硫酸软骨素 ≤0.08%（DM），作为营养补充剂剂量安全。',
      '抗氧化剂：维E ≥400IU/kg、维C ≥100mg/kg、硒 0.5-1.3mg/kg DM。',
      '磷 0.3-0.7%、钠 0.2-0.4% DM——骨关节炎犬常处于肾病/心脏病风险年龄。',
    ],
    caveats: [
      '各数值均基于干物质；具体食物选择需结合个体（年龄、共病肾病/心衰）调整。',
      '营养是骨关节炎综合管理的组成部分，不能替代手术/药物/康复。',
    ],
    citations: [
      { source: '小动物临床营养学（第5版）', chapter: '第34章 骨关节炎的营养管理', note: '表34-2 骨关节炎患者关键营养因素' },
    ],
    priority: 'HIGH',
  },
  {
    id: 'ortho-003',
    domain: 'ORTHO',
    title: 'omega-3 脂肪酸与骨关节炎：抗炎与保护软骨',
    keywords: [
      'omega-3', 'EPA', 'DHA', '抗炎', '炎症', '软骨', 'agrecan', '鱼油',
      'omega-3', 'EPA', 'DHA', 'anti-inflammatory', 'cartilage', 'aggrecan', 'fish oil',
    ],
    applicableTo: ['ortho', 'arthritis', 'joint', 'osteoarthritis'],
    summary:
      'omega-3 脂肪酸（尤其 EPA）通过抑制促炎介质（PGE2、LTB4）并促进促化解素/保护素等炎症消退介质，调节炎症。EPA 还能抑制软骨 aggrecan 降解（阻断 aggrecanase 信号），减少蛋白聚糖丢失。因此，骨关节炎治疗性食物应强化 omega-3（总 3.5-4.0%、EPA 0.4-1.1%、n-6:n-3 <1:1）。',
    details: [
      '机制：omega-6 衍生的促炎产物（PGE2、LTB4）启动炎症；omega-3 衍生的 resolvins（E/D 系列）和 protectins 是强效抗炎、促消退介质，终止炎症、促进回到稳态。',
      'EPA 保护软骨：体外犬软骨模型中，EPA 显著抑制 oncostatin M 刺激的 aggrecan 丢失，抑制 aggrecanase 上调。',
      '临床证据：4 项随机双盲对照研究显示，喂 omega-3 强化治疗粮（总 omega-3 3.48%、EPA 0.38%、n-6:n-3 0.7:1）的关节炎犬，在起身、跑跳、行走等参数显著改善，疼痛与跛行、承重能力改善。',
      '目标：总 omega-3 3.5-4.0% DM、EPA 0.4-1.1% DM、n-6:n-3 <1:1；每日约 50-100mg EPA/kg 体重。',
      '补充剂 vs 食物：达到临床有效 EPA 水平需大量补充剂（27kg 犬需 4-27 粒），依从性差；用强化治疗粮更可行。',
    ],
    caveats: [
      'omega-3 对骨关节炎的获益证据主要来自犬随机对照研究；最佳剂量在猫有限。',
      '大量补充 EPA 可能影响血小板功能（已有猫高 omega-3 的报道），需在兽医指导下进行。',
    ],
    citations: [
      { source: '小动物临床营养学（第5版）', chapter: '第34章 骨关节炎的营养管理', note: 'omega-3 机制、EPA 保护软骨、临床研究、表34-3/34-4' },
    ],
    priority: 'HIGH',
  },
  {
    id: 'ortho-004',
    domain: 'ORTHO',
    title: '骨关节炎与体重管理：控制体重是关键',
    keywords: [
      '体重管理', '肥胖', '减重', 'L-肉碱', '瘦体重', '炎症', '骨科',
      'weight', 'obesity', 'weight loss', 'carnitine', 'lean mass', 'joint',
    ],
    applicableTo: ['ortho', 'arthritis', 'joint', 'obese', 'overweight'],
    summary:
      '控制体重是骨关节炎管理的关键。肥胖不仅是机械负荷，更是慢性低度炎症（脂肪细胞分泌 TNF-α、IL-6、IL-8、IL-10 等炎症脂肪因子）。轻微减重即可显著改善症状（肥胖犬需长期治疗骨关节炎症状平均 10.3 岁 vs 正常体况 13.3 岁）。减重/维持粮应含 L-肉碱 ≥300mg/kg 以在减重中保留瘦体重。',
    details: [
      '肥胖=慢性炎症：脂肪细胞分泌炎症脂肪因子（TNF-α、IL-6、IL-8、IL-10），在肥胖时升高，可能是肥胖相关疾病（含骨关节炎）的病理机制之一。',
      '轻微减重即有效：相对较小幅度的减重可带来临床症状的显著改善，这解释了机械负荷之外的炎症机制。',
      '长期研究：体况评分高于正常的犬骨关节炎患病率与严重度更高；超重犬需长期治疗的年龄更早（10.3岁 vs 13.3岁）。',
      'L-肉碱：≥300mg/kg DM 的减重粮帮助在减重时保留瘦体重；肉碱促进长链脂肪酸进入线粒体β氧化。',
      '猫：超重猫跛行风险是无超重猫的 2.9 倍（非咬伤脓肿相关）。',
    ],
    caveats: [
      '肥胖本就常见于骨关节炎犬（因品种、年龄、活动减少）；减重需循序渐进，避免过度。',
      '减重时应保证蛋白与必需脂肪酸，预防营养缺乏；需兽医/营养师制定。',
    ],
    citations: [
      { source: '小动物临床营养学（第5版）', chapter: '第34章 骨关节炎的营养管理', note: 'Risk Factors 肥胖、L-Carnitine、体重管理、猫数据' },
    ],
    priority: 'HIGH',
  },
  {
    id: 'ortho-005',
    domain: 'ORTHO',
    title: '氨基葡萄糖与硫酸软骨素在骨关节炎中的使用',
    keywords: [
      '氨基葡萄糖', '硫酸软骨素', '关节保护', '软骨', '补充剂', '黏多糖',
      'glucosamine', 'chondroitin', 'joint', 'cartilage', 'supplement', 'GAG',
    ],
    applicableTo: ['ortho', 'arthritis', 'joint', 'osteoarthritis', 'supplement'],
    summary:
      '氨基葡萄糖和硫酸软骨素是软骨基质（黏多糖）的组分前体，可能与减少蛋白聚糖降解、抑制降解酶（aggrecanase/基质金属蛋白酶）与炎症介质（一氧化氮、PGE2）有关，并有促进软骨合成的作用。剂量适当时对犬猫安全；骨关节炎治疗食物通常含氨基葡萄糖 ≤0.10%、硫酸软骨素 ≤0.08%（干物质）。',
    details: [
      '机制：葡萄糖胺减少蛋白聚糖降解、抑制降解酶和炎症介质；刺激 GAG 与蛋白聚糖合成。',
      '有效性：对犬猫的效益主要通过营养学机制与食物结合；人用荟萃分析显示中到大幅减少疼痛与残疾（硫酸软骨素效果略优于葡萄糖胺，但可能有发表偏倚）。',
      '安全性：适当剂量对犬猫安全；30 天超倍剂量未见血液/生化/凝血异常。',
      '注意：因 GAG 与肝素结构相似，与苯基丁氮酮/阿司匹林等其他血小板抑制剂同用可能禁忌。',
      '可轻度胃肠不适，随餐给予可缓解。',
    ],
    caveats: [
      '氨基葡萄糖/硫酸软骨素为营养补充剂，不能替代处方药与标准治疗；效果因人/宠物而异。',
      '与抗凝/抗血小板药物同用前应咨询兽医。',
    ],
    citations: [
      { source: '小动物临床营养学（第5版）', chapter: '第34章 骨关节炎的营养管理', note: 'Glucosamine 与 chondroitin、机制、安全性与注意事项' },
    ],
    priority: 'MEDIUM',
  },
  {
    id: 'ortho-006',
    domain: 'ORTHO',
    title: '骨关节炎抗氧化需求：维生素E、C与硒',
    keywords: [
      '抗氧化', '维生素E', '维生素C', '硒', '氧化应激', '自由基',
      'antioxidant', 'vitamin E', 'vitamin C', 'selenium', 'oxidative stress',
    ],
    applicableTo: ['ortho', 'arthritis', 'joint', 'osteoarthritis'],
    summary:
      '骨关节炎涉及炎症与氧化应激。治疗性食物应含抗氧化剂：维E ≥400IU/kg、维C ≥100mg/kg、硒 0.5-1.3mg/kg（干物质），以辅助减少氧化损伤、支持关节健康。',
    details: [
      '维E：≥400IU/kg DM，细胞膜抗氧化剂。',
      '维C：≥100mg/kg DM，可再生成氧化型维E。',
      '硒：0.5-1.3mg/kg DM，抗氧化酶（谷胱甘肽过氧化物酶）组分。',
      '氧化应激在软骨退变与炎症中发挥作用；充足的抗氧化剂有助于控制氧化损伤。',
    ],
    caveats: [
      '抗氧化剂的具体有效剂量尚未完全确立；应避免过量（尤其硒）。',
      '抗氧化剂是综合营养管理的一部分，不能替代核心治疗。',
    ],
    citations: [
      { source: '小动物临床营养学（第5版）', chapter: '第34章 骨关节炎的营养管理', note: '表34-2 抗氧化剂目标' },
    ],
    priority: 'MEDIUM',
  },
  {
    id: 'ortho-007',
    domain: 'ORTHO',
    title: '骨关节炎动物的磷与钠考量（合并肾病/心衰风险）',
    keywords: [
      '磷', '钠', '共病', '肾病', '心衰', '老年犬', '骨关节炎',
      'phosphorus', 'sodium', 'comorbid', 'renal', 'cardiac', 'geriatric',
    ],
    applicableTo: ['ortho', 'arthritis', 'joint', 'renal', 'cardiac'],
    summary:
      '骨关节炎患者常处于肾病和/或心脏病风险年龄。治疗性食物磷宜 0.3-0.7%、钠 0.2-0.4%（干物质）。若合并肾病/心衰，需结合肾脏/心脏的营养管理原则统筹（见相应领域）。',
    details: [
      '磷：0.3-0.7% DM——骨关节炎犬常处于肾病风险年龄。',
      '钠：0.2-0.4% DM——需兼顾心衰风险。',
      '共病：骨关节炎动物常合并慢性肾病或心脏病，营养管理需统筹，不能只针对关节。',
      '老年犬：多数骨关节炎犬为中老年，需综合评估骨、肾、心、营养状态。',
    ],
    caveats: [
      '合并肾病/心衰时的磷/钠管理需按相应疾病领域的原则进行（可能比骨关节炎领域的更严格）。',
      '应由兽医/营养师统筹多病共存情况下的营养方案。',
    ],
    citations: [
      { source: '小动物临床营养学（第5版）', chapter: '第34章 骨关节炎的营养管理', note: '表34-2 磷/钠目标、合并肾病/心衰风险' },
    ],
    priority: 'MEDIUM',
  },
  {
    id: 'ortho-008',
    domain: 'ORTHO',
    title: '猫的骨关节炎营养管理要点',
    keywords: [
      '猫骨关节炎', '猫关节炎', '超重猫', '跛行', '老年猫', 'omega-3',
      'feline osteoarthritis', 'cat arthritis', 'overweight cat', 'elderly cat',
    ],
    applicableTo: ['ortho', 'arthritis', 'joint', 'feline', 'obese'],
    summary:
      '猫的骨关节炎常见但常被忽视（大多不表现定位性跛行，多表现为活动减少、不愿跳上/下高处、梳理不全等）。超重猫跛行风险是无超重猫的 2.9 倍；老年猫（>12 岁）94% 有影像学骨关节炎。可结合限热 + omega-3 补充（75-110mg/kg 体重/日）；治疗性食物可含 omega-3（EPA 3.2% DM、DHA 0.23%、蛋氨酸 1.32%、锰 104mg/kg）。',
    details: [
      '流行病学：猫 1 岁以上约 20% 有影像学骨关节炎；>12 岁且照顾良好的猫 90% 以上有影像学证据（一项研究 100 只中 90%）；>10 岁猫发病率最高。',
      '临床：猫大多无定位性跛行；表现活动减少、不愿跳高/上下楼梯、梳理不全、乱排泄、攻击等。',
      '风险：超重猫跛行风险 2.9 倍（非咬伤相关）；年龄相关软骨退变、关节不稳、Scottish fold 软骨发育不良、营养失衡（维A过剩）、糖尿病（神经病变）、免疫性多发性关节炎。',
      '管理：限热量 + omega-3 补充（75-110mg/kg 体重/日），8 周观察更自然步态与更自主活动（影像学无变化）；猫粮可含 omega-3（EPA 3.2%、DHA 0.23%、蛋氨酸 1.32%、锰 104mg/kg）减少关节炎生物标志物。',
      '注意：高 omega-6:omega-3 比例（1.3:1）的猫粮曾有血小板功能不良反应报道（vs 12:1 无），需注意比例。',
    ],
    caveats: [
      '猫骨关节炎营养证据有限，多为小规模/初步研究；需结合猫的个体情况。',
      '猫常同时有肾脏病/甲亢等老年病，营养需统筹。',
    ],
    citations: [
      { source: '小动物临床营养学（第5版）', chapter: '第34章 骨关节炎的营养管理', note: 'Cats、猫骨关节炎风险与管理、omega-3 与生物标志物' },
    ],
    priority: 'MEDIUM',
  },
];
