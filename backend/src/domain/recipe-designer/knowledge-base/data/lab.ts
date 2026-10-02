import type { KnowledgeEntry } from '../types';

/**
 * LAB 领域知识条目（检查指标解读）。
 *
 * 来源：IRIS 2026 肾病指南、Merck 兽医手册（临床生化 / 血液学 / 肝功能检查）、
 *       SACN5 相关章节。
 *
 * ── 一条贯穿全领域的设计决定：不给死参考区间 ────────────────
 *
 *   兽医化验的参考区间**因实验室而异**（不同仪器、不同方法、不同人群），
 *   报告上印的区间才是这一份结果该用的区间。
 *   所以这里只写"这个指标反映什么、偏高偏低通常意味着什么、该结合什么一起看、
 *   下一步查什么"，**一律不写具体数值区间** —— 写了就会有人拿它去套别人的报告。
 *
 * 全部标 `reviewStatus: 'APPROVED'`（2026-10-02 合作兽医全数通过，老板同意对顾客开放）。
 * ⚠️ 以后**新写的条目一律先写 `PENDING_REVIEW`**：顾客侧只放 APPROVED。
 *    改动某条内容时也要把它退回 PENDING_REVIEW —— 换了内容就等于没审过。
 *
 * 建立日期：2026-10-01
 */
export const LAB_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'lab-001',
    domain: 'LAB',
    title: '看懂化验单的第一件事：参考区间是这家实验室的',
    keywords: ['化验单', '参考区间', '参考范围', '正常值', '怎么看', '报告解读'],
    applicableTo: ['lab', 'all'],
    summary:
      '化验单上的"参考区间"是**出具这份报告的实验室**针对自己的仪器与方法制定的，不是全国统一标准。判断某个值是否异常，只能对着**这份报告上印的区间**看，不能拿别家的区间套。',
    details: [
      '不同实验室的检测原理、仪器、试剂、以及所依据的动物群体都不同，区间自然不同。',
      '部分指标还会按年龄、品种、性别细分区间（幼犬与成年犬差别尤其大）。',
      '报告上没有印区间的，应向出具报告的医院索取完整报告，而不是自己去网上找一个区间。',
      '同一个指标在不同时间、不同实验室测出的数值，可能因为方法差异而不可直接比较。',
      '因此"上次是 2.0，这次是 2.3，是不是变差了"这类判断，必须结合两次报告各自的区间与检测方法。',
    ],
    caveats: [
      '本条目不提供任何具体数值区间 —— 这是刻意的：给了就会被拿去套用别人的报告。',
      '任何指标的解读都应由执业兽医结合临床表现判断。',
    ],
    citations: [
      { source: 'Merck 兽医手册 · 临床生化', chapter: '参考区间与检测方法' },
    ],
    sources: [
      { sourceId: 'MERCK-CLINICAL-BIOCHEM', locator: '参考区间章节', note: '区间随实验室与方法而异' },
    ],
    priority: 'HIGH',
    questionType: 'INTERPRET',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'lab-002',
    domain: 'LAB',
    title: '一个指标超出区间，不等于得了病',
    keywords: ['指标异常', '超标', '轻度升高', '假阳性', '要不要紧', '化验异常'],
    applicableTo: ['lab', 'all'],
    summary:
      '单次、轻度的指标偏离在健康动物身上并不少见，可能来自脱水、应激、进食、剧烈运动、采样或检测误差。**判断一个异常值有没有意义，要看它偏离多少、是否持续、以及有没有配套的其他异常。**',
    details: [
      '许多指标会受到非疾病因素影响：饮水与脱水状态、采血前的进食、应激、运动、甚至采血时的姿势。',
      '一次异常更像是一个"值得复查的信号"，而不是结论。',
      '真正提示问题的模式通常是：多项相关指标同时异常、或同一指标在复查中持续恶化。',
      '不同指标的敏感度与特异度差别很大：有的升高很特异，有的稍微一动就超标但没有临床意义。',
    ],
    caveats: [
      '本条目不是"异常也不用管"的意思 —— 发现异常应该让兽医判断要不要复查、多久复查。',
      '如果动物同时有症状（精神差、呕吐、食欲废绝等），不要等复查，尽快就医。',
    ],
    citations: [
      { source: 'Merck 兽医手册 · 临床生化', chapter: '结果解读的一般原则' },
    ],
    sources: [
      { sourceId: 'MERCK-CLINICAL-BIOCHEM', locator: '结果解读原则', note: '非疾病因素对指标的影响' },
    ],
    priority: 'MEDIUM',
    questionType: 'INTERPRET',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'lab-003',
    domain: 'LAB',
    title: '肌酐与尿素：反映肾功能，但都不是唯一依据',
    keywords: ['肌酐', '尿素', '肾功能', 'creatinine', 'BUN', '肾指标'],
    applicableTo: ['lab', 'ckd', 'renal', 'kidney', 'senior'],
    summary:
      '肌酐与尿素是评估肾功能的常用指标，但两者都会受肾外因素影响（脱水、蛋白摄入、肌肉量、消化道出血等）。**轻度尿素升高本身不构成肾病诊断**，需要结合肌酐、尿检、尿比重等一起判断。',
    details: [
      '尿素容易受饮食蛋白与脱水影响，单独轻度升高常见且不特异。',
      '肌酐相对稳定，但也受肌肉量影响：肌肉发达的犬与消瘦的犬，同样的肾功能下数值可以不同。',
      '肾病的确认需要**持续**的肾损伤或功能下降证据，而不是一次抽血的结果。',
      '尿检（尿比重、尿蛋白）与影像学是判读肾功能时不可缺少的配套信息。',
      'SDMA 是另一个可用的指标，但同样需要结合整体判断。',
    ],
    caveats: [
      '是否需要分期、分到几期，必须由兽医结合多次检查判断 —— 不能凭单次尿素或肌酐升高下结论。',
      '脱水、高蛋白饮食、剧烈运动都可能让这些数值一过性升高，复查前的状态要如实告诉兽医。',
    ],
    citations: [
      { source: 'IRIS 肾病指南 2026', chapter: 'CKD 分期与判读前提' },
      { source: 'Merck 兽医手册 · 临床生化', chapter: '尿素与肌酐' },
    ],
    sources: [
      { sourceId: 'IRIS-CKD-2026', locator: '分期系统与判读前提', note: '需持续性证据、氮质血症须定位为肾性来源' },
      { sourceId: 'MERCK-CLINICAL-BIOCHEM', locator: '尿素与肌酐段落', note: '肾前因素与肌肉量对数值的影响' },
    ],
    priority: 'HIGH',
    questionType: 'INTERPRET',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'lab-004',
    domain: 'LAB',
    title: 'IRIS 分期是什么：为什么它要兽医来做',
    keywords: ['IRIS', '肾病分期', 'CKD分期', '慢性肾病', '肾衰分期'],
    applicableTo: ['lab', 'ckd', 'renal', 'kidney', 'senior'],
    summary:
      'IRIS 是国际肾病协会制定的慢性肾病分期体系，按**稳定的血清肌酐**把 CKD 分为四期，另外再按蛋白尿与血压细分。这两个前提很关键：CKD 必须已被确认，且氮质血症必须已定位为肾性来源。',
    details: [
      '分期的两个前提：CKD 的存在已被确认；氮质血症（如果存在）已确认为肾性来源。',
      '分期依据是**稳定**的血清肌酐，即不能拿一次脱水状态下的结果来分期。',
      '分期之外还要评估蛋白尿与血压，它们决定了治疗与监测的强度。',
      '蛋白尿的评估通常用尿蛋白/肌酐比（UPC）。',
      '分期不是一次性的：随病程推进会变化，需要按期复查。',
    ],
    caveats: [
      '分期与诊断必须由兽医完成 —— 需要稳定肌酐、尿检、血压等一整套数据。',
      '本条目只说明分期体系怎么运作，不给具体肌酐数值区间（理由见 lab-001）。',
    ],
    citations: [
      { source: 'IRIS 肾病指南 2026', chapter: 'IRIS Staging System' },
      { source: '小动物临床营养学（第5版）', chapter: '第37章 慢性肾病', note: 'IRIS 分期表与营养管理启动时机' },
    ],
    sources: [
      { sourceId: 'IRIS-CKD-2026', locator: 'IRIS Staging System', note: '分期前提、按稳定肌酐四期、另按蛋白尿与血压细分' },
      { sourceId: 'SACN5', locator: '第37章 慢性肾病', note: '分期与营养管理时机' },
    ],
    priority: 'HIGH',
    questionType: 'INTERPRET',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'lab-005',
    domain: 'LAB',
    title: '肝酶升高说明什么（以及不说明什么）',
    keywords: ['肝酶', 'ALT', 'ALP', 'AST', '肝功能', '肝脏指标', '转氨酶'],
    applicableTo: ['lab', 'hepatic', 'liver', 'senior'],
    summary:
      '肝酶（如 ALT、ALP）升高反映的是"肝细胞受到刺激或损伤"，**不等于肝功能衰竭**。有些酶受药物、激素、骨骼生长等因素影响；真正的"肝功能"要看白蛋白、胆红素、胆汁酸、凝血等指标。',
    details: [
      'ALT 更多反映肝细胞损伤；ALP 受胆管、药物（如激素类）、以及幼犬骨骼生长影响，特异性较低。',
      '酶升高与"肝功能好坏"是两件事：肝脏代偿能力强，酶升高时功能可能仍然正常；反过来，晚期肝病酶可能不升甚至下降。',
      '评估肝功能更看白蛋白、胆红素、胆汁酸、血糖、凝血功能等。',
      '判断意义需要结合病史（近期用药、食欲、体重）、体检与其他指标一起。',
    ],
    caveats: [
      '发现肝酶升高应先由兽医判断原因，不要自行给"保肝"产品 —— 有些补充剂本身会加重肝脏负担。',
      '幼犬生长期 ALP 偏高可以是正常现象，要与成犬区别看待。',
    ],
    citations: [
      { source: 'Merck 兽医手册 · 临床生化', chapter: '肝酶解读' },
      { source: 'ACVIM 犬慢性肝炎诊断与治疗共识 2019', chapter: '肝功能评估' },
    ],
    sources: [
      { sourceId: 'MERCK-CLINICAL-BIOCHEM', locator: '肝酶段落', note: 'ALT/ALP 的影响因素与特异性差异' },
      { sourceId: 'ACVIM-CONSENSUS', locator: 'ACVIM 2019 犬慢性肝炎共识', note: '肝功能评估需要多项指标' },
    ],
    priority: 'MEDIUM',
    questionType: 'INTERPRET',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'lab-006',
    domain: 'LAB',
    title: '血常规怎么看：三类细胞各管什么',
    keywords: ['血常规', 'CBC', '红细胞', '白细胞', '血小板', '贫血', '感染'],
    applicableTo: ['lab', 'all', 'hemo'],
    summary:
      '血常规主要看三类：**红细胞**（携带氧气，反映贫血或脱水）、**白细胞**（免疫与炎症）、**血小板**（凝血）。单看总数意义有限，要看分类比例与形态。',
    details: [
      '红细胞相关：红细胞数、血红蛋白、红细胞压积。偏低提示贫血，偏高常见于脱水。',
      '白细胞相关：总数与分类（中性粒细胞、淋巴细胞、嗜酸性粒细胞等）。不同分类升高提示的方向不同（细菌感染、应激、过敏、寄生虫等）。',
      '血小板：参与凝血。数值偏低时要注意出血倾向，但也可能是采血或检测造成的假性偏低。',
      '血常规的异常往往是"提示进一步查什么"，而不是直接给出诊断。',
    ],
    caveats: [
      '血小板偏低或动物出现不明原因的瘀斑、牙龈出血、鼻出血，应尽快就医。',
      '血常规需要结合生化、尿检与临床表现一起读。',
    ],
    citations: [
      { source: 'Merck 兽医手册 · 临床血液学', chapter: '血常规指标解读' },
      { source: 'ACVIM 犬猫免疫介导性溶血性贫血诊断共识 2019', chapter: '贫血的分类与鉴别' },
    ],
    sources: [
      { sourceId: 'MERCK-HEME', locator: '血常规解读', note: '三类细胞的意义' },
      { sourceId: 'ACVIM-CONSENSUS', locator: 'ACVIM 2019 IMHA 诊断共识', note: '贫血的分类思路' },
    ],
    priority: 'MEDIUM',
    questionType: 'INTERPRET',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'lab-007',
    domain: 'LAB',
    title: '尿检为什么不能省',
    keywords: ['尿检', '尿比重', '尿蛋白', 'UPC', '尿液', '肾病检查'],
    applicableTo: ['lab', 'ckd', 'renal', 'kidney', 'urinary'],
    summary:
      '尿检能提供血液检查给不了的信息：尿液浓缩能力（尿比重）、有没有蛋白尿、有没有感染或结晶。**肾病的判读离不开尿检** —— 单看血里的肌酐无法区分"肾性"还是"肾前性"。',
    details: [
      '尿比重反映肾脏浓缩尿液的能力，是判断氮质血症来源的重要依据。',
      '尿蛋白的定量评估常用尿蛋白/肌酐比（UPC）。',
      '持续且明显的肾性蛋白尿本身就是肾损伤的证据，即使血里指标还正常。',
      '尿沉渣可以看细胞、结晶、细菌，帮助判断感染或结石。',
      '留尿方式（自然排尿、导尿、膀胱穿刺）会影响结果的解读，应告诉兽医是怎么采的。',
    ],
    caveats: [
      '尿检结果需要结合采尿方式与动物当时的饮水状态解读。',
      '发现蛋白尿或结晶不等于已确诊某种病，需要兽医进一步评估。',
    ],
    citations: [
      { source: 'IRIS 肾病指南 2026', chapter: '蛋白尿与尿检评估' },
      { source: 'Merck 兽医手册 · 临床生化', chapter: '尿液分析' },
    ],
    sources: [
      { sourceId: 'IRIS-CKD-2026', locator: '蛋白尿评估', note: 'UPC 与肾性蛋白尿的意义' },
      { sourceId: 'MERCK-CLINICAL-BIOCHEM', locator: '尿液分析', note: '尿比重与尿沉渣的作用' },
    ],
    priority: 'HIGH',
    questionType: 'INTERPRET',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'lab-008',
    domain: 'LAB',
    title: '为什么医生要说"复查"而不是当场下结论',
    keywords: ['复查', '随访', '什么时候复查', '监测', '趋势'],
    applicableTo: ['lab', 'all', 'prevention'],
    summary:
      '绝大多数指标的价值在于**趋势**而不是单点。复查的目的有三个：确认异常是否持续、看变化速度、以及评估治疗或饮食调整有没有效果。所以"过多久复查"本身就是医嘱的一部分。',
    details: [
      '单次异常 → 复查确认是否持续，可排除一过性因素与检测误差。',
      '已知疾病 → 按病程定期监测，看是稳定、好转还是进展。',
      '调整治疗或饮食后 → 用复查判断有没有达到预期效果。',
      '复查间隔由疾病种类、严重程度、用药情况决定，没有统一答案。',
      '复查时带上**上一次的报告**，医生才能比较趋势。',
    ],
    caveats: [
      '把每次的报告按日期存好（拍照即可），复诊时一起给医生 —— 这比口头描述有用得多。',
      '医生说的复查时间不要自行拉长；提前或推迟都会影响判断。',
    ],
    citations: [
      { source: 'IRIS 肾病指南 2026', chapter: '监测频率建议' },
      { source: 'AAHA 犬生命阶段指南 2019', chapter: '分阶段健康检查' },
    ],
    sources: [
      { sourceId: 'IRIS-CKD-2026', locator: '监测与复查', note: '按分期定复查频率' },
      { sourceId: 'AAHA-LIFE-STAGE-2019', locator: '生命阶段检查', note: '不同年龄的检查节奏' },
    ],
    priority: 'MEDIUM',
    questionType: 'FOLLOWUP',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'lab-009',
    domain: 'LAB',
    title: '化验前要不要空腹：不按要求做会让结果失真',
    keywords: ['空腹', '禁食', '化验前准备', '采样', '结果不准'],
    applicableTo: ['lab', 'all'],
    summary:
      '不少生化指标会受进食影响，所以医生会要求空腹采血。**没有按要求空腹，结果可能失真、甚至需要重抽一次** —— 最省事的做法是采血前跟医院确认一次要求。',
    details: [
      '血脂、血糖等指标受进食影响明显。',
      '是否需要空腹、空腹多久，取决于要查哪些项目，不同项目要求不同。',
      '水通常不需要禁，但要看医生的具体要求。',
      '应激也会影响部分指标，尽量让动物在采血前保持平静。',
      '正在服用的药物、保健品要主动告诉医生，有些会影响结果。',
    ],
    caveats: [
      '幼犬、糖尿病或正在用药的动物**不能自行长时间禁食** —— 必须先问医生。',
      '如果没按要求准备，如实告诉医生，比隐瞒后拿到一个失真的结果要好。',
    ],
    citations: [
      { source: 'Merck 兽医手册 · 临床生化', chapter: '样本采集与影响因素' },
    ],
    sources: [
      { sourceId: 'MERCK-CLINICAL-BIOCHEM', locator: '采样前准备', note: '进食与应激对指标的影响' },
    ],
    priority: 'MEDIUM',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'lab-010',
    domain: 'LAB',
    title: '"检查都正常"也是有价值的结果',
    keywords: ['检查正常', '没查出问题', '为什么还不好', '排除诊断'],
    applicableTo: ['lab', 'all'],
    summary:
      '检查正常不是白花钱：它排除了很多可能性，把方向收窄到剩下的几种。临床上"排除了严重问题"本身就是一个重要结论，接下来往往靠观察、复查或更有针对性的检查来推进。',
    details: [
      '诊断过程常常是"排除法"：先排掉危险和常见的，再看剩下什么。',
      '正常结果能让人放心地采取"观察+复查"的策略，而不是马上上治疗。',
      '有些疾病在早期、或间歇发作时，检查确实可以是正常的 —— 这时"什么时候复查"比"再查一遍"更重要。',
      '如果症状持续，把症状发生的时间、频率、诱因记下来带给医生，比反复做同样的检查更有帮助。',
    ],
    caveats: [
      '检查正常但症状持续或加重时，应复诊而不是自行观察太久。',
      '把症状细节记录下来，是这阶段最有用的一件事。',
    ],
    citations: [
      { source: 'Merck 兽医手册 · 临床生化', chapter: '诊断思路' },
    ],
    sources: [
      { sourceId: 'MERCK-CLINICAL-BIOCHEM', locator: '诊断思路', note: '排除法在诊断中的作用' },
    ],
    priority: 'LOW',
    questionType: 'INTERPRET',
    riskLevel: 'LOW',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
];
