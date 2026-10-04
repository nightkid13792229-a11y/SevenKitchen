import type { KnowledgeEntry } from '../types';

/**
 * CLINICAL 领域知识条目（常见表现与就医时机）。
 *
 * 来源：WSAVA 疼痛指南 2022、WSAVA 牙科指南、ACVIM 各专科共识、
 *       AAHA 生命阶段与老年护理指南。
 *
 * ── 这个领域最容易越界，所以纪律最严 ──────────────────────
 *
 *   老板把边界定死了："边界把严一点，我们不做诊断，只做初步分析。"
 *   所以这里**一条都不写"这可能是 XX 病"**，只写：
 *     · 该观察什么（家长在家能看到的）
 *     · 什么情况算红旗信号、要多急（写在 urgency 里，AI 只能照用）
 *     · 去医院时该准备什么
 *
 *   凡是 TRIAGE 类，urgency 必填 —— 这是唯一不让 AI 自由发挥的判断。
 *
 * 全部标 `reviewStatus: 'APPROVED'`（2026-10-02 合作兽医全数通过，老板同意对顾客开放）。
 * ⚠️ 以后**新写的条目一律先写 `PENDING_REVIEW`**：顾客侧只放 APPROVED。
 *    改动某条内容时也要把它退回 PENDING_REVIEW —— 换了内容就等于没审过。
 *
 * 建立日期：2026-10-01
 */
export const CLINICAL_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'clinical-001',
    domain: 'CLINICAL',
    title: '这些情况不要等：需要立刻就医的红旗信号',
    keywords: ['急症', '急诊', '红旗信号', '马上就医', '紧急', '危险信号', 'red flag'],
    applicableTo: ['clinical', 'red-flag', 'all'],
    summary:
      '出现以下任一情况，**不要在家观察、不要等明天**，立即联系兽医或送急诊：呼吸困难或持续张嘴喘、牙龈苍白或发紫、抽搐、倒地起不来、腹部明显膨大且干呕、无法排尿、大量出血、误食有毒物或异物、体温异常。',
    details: [
      '呼吸：费力呼吸、张口呼吸、喘得停不下来、舌头或牙龈发紫。',
      '循环：牙龈苍白、发白或发紫；四肢冰凉；虚弱站不稳。',
      '神经：抽搐、意识不清、突然失明、转圈、头歪且站不稳。',
      '腹部：腹部快速膨大、干呕但吐不出东西（大型深胸犬尤其要警惕）。',
      '排尿：想尿但尿不出来、频繁蹲下无尿 —— 尿路堵塞是急症。',
      '出血：外伤后持续出血、鼻出血不止、牙龈出血、便血或呕血。',
      '中毒/异物：误食药物、老鼠药、巧克力、木糖醇、葡萄、洋葱，或吞下骨头、玩具、绳子。',
      '难产：母犬强烈努责超过一段时间仍未产出，或间隔很久没有下一只。',
    ],
    caveats: [
      '本条目只做分诊提示，不判断病因、也不给任何处理或用药建议。',
      '拿不准的时候按急症处理 —— 白跑一趟的代价，远小于错过窗口。',
    ],
    citations: [
      { source: 'WSAVA 疼痛识别、评估与治疗指南 2022', chapter: '疼痛与痛苦的识别' },
      { source: 'ACVIM 犬癫痫持续状态与集群发作共识 2024', chapter: '急症识别' },
    ],
    sources: [
      { sourceId: 'WSAVA-PAIN-2022', locator: '疼痛与痛苦识别', note: '动物不会叫痛，行为变化是主要线索' },
      { sourceId: 'ACVIM-CONSENSUS', locator: 'ACVIM 2024 癫痫持续状态共识', note: '抽搐类急症的界定' },
    ],
    priority: 'HIGH',
    questionType: 'TRIAGE',
    riskLevel: 'HIGH',
    urgency: 'IMMEDIATE',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-002',
    domain: 'CLINICAL',
    title: '狗不会喊痛：疼痛要看行为变化',
    keywords: ['疼痛', '痛不痛', '忍着', '行为变化', '疼痛识别', '跛行'],
    applicableTo: ['clinical', 'red-flag', 'ortho', 'joint', 'senior'],
    summary:
      '动物天生会隐藏疼痛。**行为变了就是最重要的线索**：不愿跳上沙发、上下楼梯犹豫、被摸某个部位时躲开或低吼、睡觉姿势改变、比以前爱趴着、脾气变差、舔咬某一处。',
    details: [
      '活动变化：不愿散步或走一半停下、不愿上下楼梯或跳上车、起身僵硬。',
      '姿势变化：弓背、头低垂、"祈祷姿势"（前腿趴下后腿站立）、坐着时后腿姿势异常。',
      '互动变化：被触碰某部位时回头、躲开、低吼或咬；不愿被抱。',
      '日常变化：进食或饮水姿势改变、舔咬身体某一处、频繁伸展。',
      '情绪变化：易怒、躲藏、对环境反应变差 —— 老年动物尤其容易被误当成"老了就这样"。',
      '慢性疼痛（如骨关节炎）往往表现为"慢慢变得不爱动了"，而不是明显叫痛。',
    ],
    caveats: [
      '疼痛不能靠家长自行判断轻重，也不应自行给人用止痛药 —— 对狗可能有毒。',
      '突然出现的疼痛、或伴随站不起来、拖后腿，属于急症，应立即就医。',
    ],
    citations: [
      { source: 'WSAVA 疼痛识别、评估与治疗指南 2022', chapter: '疼痛识别与评估' },
      { source: 'ACVIM 犬胸腰段椎间盘突出共识 2022', chapter: '神经急症的识别' },
    ],
    sources: [
      { sourceId: 'WSAVA-PAIN-2022', locator: '疼痛识别', note: '行为变化是主要线索' },
      { sourceId: 'ACVIM-CONSENSUS', locator: 'ACVIM 2022 IVDD 共识', note: '突发不能行走属急症' },
    ],
    priority: 'HIGH',
    questionType: 'TRIAGE',
    riskLevel: 'HIGH',
    urgency: 'SOON',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-003',
    domain: 'CLINICAL',
    title: '突然站不起来或拖后腿：分秒必争',
    keywords: ['站不起来', '瘫痪', '拖后腿', '后腿无力', '椎间盘', 'IVDD', '急症'],
    applicableTo: ['clinical', 'red-flag', 'ortho', 'neuro'],
    summary:
      '突然出现后腿无力、走路摇晃、拖行甚至完全站不起来，可能是脊髓急症。**这类情况越早处理恢复机会越大**，不要在家观察，立即就医。',
    details: [
      '典型表现：突然不愿意走、后腿发软、走路交叉或摇晃、脚背拖地、完全不能站立。',
      '椎间盘突出在软骨发育不良的犬种（如腊肠犬、比熊、法斗等）中更常见。',
      '关键区分：**还能走**和**已经不能走**，以及有没有失去痛觉 —— 后者最紧急。',
      '就医越早，能保留的神经功能越多；拖延可能从"能治"变成"治不了"。',
      '搬运时尽量用硬板或平托，减少脊柱扭动，不要拎前腿或抱起上半身让后躯悬空。',
    ],
    caveats: [
      '出现"完全不能站立"或"脚趾被掐也没反应"是最高级别的急症。',
      '本条目只做分诊提示，不给诊断与治疗建议。',
    ],
    citations: [
      { source: 'ACVIM 共识 / 背书声明', chapter: 'ACVIM 2022 犬胸腰段椎间盘突出诊断与管理共识 · 急诊评估与分级' },
    ],
    sources: [
      { sourceId: 'ACVIM-CONSENSUS', locator: 'ACVIM 2022 胸腰段 IVDD 共识', note: '神经功能分级与紧急程度' },
      { sourceId: 'WSAVA-PAIN-2022', locator: '急性疼痛与神经损伤', note: '急性疼痛与神经功能丧失的紧急程度' },
    ],
    priority: 'HIGH',
    questionType: 'TRIAGE',
    riskLevel: 'HIGH',
    urgency: 'IMMEDIATE',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-004',
    domain: 'CLINICAL',
    title: '呕吐和腹泻：什么时候能观察，什么时候要去医院',
    keywords: ['呕吐', '拉稀', '腹泻', '软便', '便血', '肠胃', '要不要去医院'],
    applicableTo: ['clinical', 'red-flag', 'gi', 'ibd'],
    summary:
      '偶尔一次呕吐或软便、精神食欲都正常，可以先观察并记录；但如果**频繁呕吐、呕吐物带血、腹泻带血或呈黑色柏油状、伴随精神差或不吃、或持续超过一天**，应尽快就医。',
    details: [
      '可以先观察的情况：偶发一两次、吐完精神照常、还想吃东西、没有其他异常。',
      '需要尽快就医：反复呕吐（一天多次）、喝水都吐、呕吐物带血或咖啡渣样。',
      '腹泻需要就医的情况：带鲜血、呈黑色柏油状、频繁水样、伴随明显精神差。',
      '幼犬、老年犬、或有慢性病的狗，脱水速度更快，门槛要放低。',
      '记录三件事带给医生：发生时间与次数、呕吐物/粪便的样子（拍照）、精神与饮水情况。',
      '在医生判断之前，不要自行禁食太久、也不要自行给药。',
    ],
    caveats: [
      '幼犬未完成免疫前出现呕吐腹泻，要优先排除传染病，尽早就医。',
      '怀疑吞了异物（骨头、玩具、绳子）时，即使暂时没症状也应尽快就医。',
    ],
    citations: [
      { source: 'ACVIM 共识 / 背书声明', chapter: 'ACVIM 2026 慢性肠病诊断与治疗共识 · 消化道症状的评估' },
      // 2026-10-02：这里原来还引了一份「WSAVA 胃肠道指南」，但登记表第六节写明
      // 该指南只拿到 2009 年 JSAP 摘要（Wiley 403）、本地也没有归档，
      // 登记表自己给的处置就是「ACVIM 慢性肠病共识 2 份可替代」——
      // 所以改成引已登记的 ACVIM 共识，不保留一份我们手上没有的资料当依据。
      { source: 'ACVIM 共识 / 背书声明', chapter: 'ACVIM 2026 慢性肠病共识 · 消化道疾病的评估流程' },
    ],
    sources: [
      { sourceId: 'ACVIM-CONSENSUS', locator: 'ACVIM 2026 慢性肠病共识', note: '消化道症状的评估思路' },
      { sourceId: 'WSAVA-NUTRITION', locator: '营养评估工具', note: '消化道症状出现时的营养评估前提' },
    ],
    priority: 'HIGH',
    questionType: 'TRIAGE',
    riskLevel: 'HIGH',
    urgency: 'SOON',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-005',
    domain: 'CLINICAL',
    title: '喝水变多、尿变多：别当成"天气热"',
    keywords: ['多饮', '多尿', '喝水多', '尿多', '口渴', '糖尿病', '肾'],
    applicableTo: ['clinical', 'red-flag', 'endocrine', 'ckd', 'renal'],
    summary:
      '饮水量和尿量**明显增加**是需要重视的信号，涉及内分泌、肾脏等多个方向。先做一件事：**如实测一下每天喝多少**，这个数字对医生非常有用。',
    details: [
      '怎么量：用量杯给固定量的水，24 小时后看剩下多少，连续记 2–3 天。',
      '同时观察：尿量是否增多、有没有在室内排尿、体重有没有变化、食欲有没有异常。',
      '可能相关的方向包括内分泌疾病、肾脏问题等，需要兽医通过检查区分。',
      '有些情况（如子宫蓄脓）会同时出现多饮多尿与精神差、腹部不适，属于急症。',
    ],
    caveats: [
      '不要为了"少尿"而限制饮水，除非兽医明确要求 —— 限水可能造成脱水。',
      '母犬未绝育且出现多饮多尿伴精神差、阴道分泌物，应立即就医。',
    ],
    citations: [
      { source: 'Merck 兽医手册 · 临床生化', chapter: '多饮多尿的鉴别方向' },
      { source: 'IRIS 肾病指南 2026', chapter: '肾病相关表现' },
    ],
    sources: [
      { sourceId: 'MERCK-CLINICAL-BIOCHEM', locator: '多饮多尿', note: '鉴别方向' },
      { sourceId: 'IRIS-CKD-2026', locator: '肾病表现', note: '多饮多尿与肾病的关系' },
    ],
    priority: 'MEDIUM',
    questionType: 'TRIAGE',
    riskLevel: 'HIGH',
    urgency: 'SOON',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-006',
    domain: 'CLINICAL',
    title: '体重在掉但饭量没变：值得查一查',
    keywords: ['体重下降', '消瘦', '掉秤', '吃不胖', '体重变化'],
    applicableTo: ['clinical', 'weight', 'senior', 'clinical'],
    summary:
      '饭量没减、甚至吃得更香，体重却在下降 —— 这通常不是"挑食"或"老了"能解释的，值得安排一次检查。**在家定期称重是最容易做到、也最有用的监测**。',
    details: [
      '建议做法：同一台秤、固定频率（如每月一次）、同一时间段称，记录下来。',
      '体重下降同时伴随的线索：饮水量、排尿、食欲、精神状态、呕吐腹泻、被毛变化。',
      '老年犬的体重下降容易被当成正常衰老，但它常常是早期信号。',
      '体况评分（摸肋骨、看腰线）比单纯体重更能反映胖瘦变化。',
    ],
    caveats: [
      '短期内明显掉重（比如几周内掉了体重的 5%–10%）应尽快就医。',
      '伴有食欲废绝、呕吐、精神差时，按红旗信号处理。',
    ],
    citations: [
      { source: 'AAHA 老年犬猫护理指南 2023', chapter: '老年犬体重监测' },
      { source: 'WSAVA 营养指南与工具包', chapter: '体况评分与体重监测' },
    ],
    sources: [
      { sourceId: 'AAHA-SENIOR-2023', locator: '老年护理工具包', note: '体重监测与老年犬评估' },
      { sourceId: 'WSAVA-NUTRITION', locator: '体况评分工具', note: 'BCS 与体重趋势' },
    ],
    priority: 'MEDIUM',
    questionType: 'TRIAGE',
    riskLevel: 'MEDIUM',
    urgency: 'SOON',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-007',
    domain: 'CLINICAL',
    title: '口臭不是"狗本来就这样"',
    keywords: ['口臭', '牙结石', '牙周病', '牙龈', '口腔', '刷牙', '牙齿'],
    applicableTo: ['clinical', 'dental', 'oral', 'prevention'],
    summary:
      '持续口臭几乎总意味着口腔有问题（牙菌斑、牙结石、牙周病）。牙周病不只是口腔问题——它会带来疼痛、影响进食，还与全身健康相关。**口臭值得带去检查，而不是忍着。**',
    details: [
      '在家能看到的信号：口臭、牙面黄褐色沉积、牙龈发红或出血、牙齿松动。',
      '容易被忽略的信号：吃东西时掉食物、只肯吃软食、用一边咀嚼、不愿被碰嘴、流口水。',
      '牙周病在犬中非常常见，且早期往往只有口臭这一个表现。',
      '日常刷牙是目前公认最有效的家庭口腔护理方式，需要循序渐进地让狗适应。',
      '口腔清洁与检查应由兽医评估后再决定是否需要专业洁牙。',
    ],
    caveats: [
      '不要自行给狗啃骨头或硬物来"磨牙" —— 可能造成牙齿折断。',
      '人用的牙膏不能给狗用。',
      '口腔内出现持续存在的肿块、或进食明显困难，应尽快就医。',
    ],
    citations: [
      { source: 'WSAVA 全球牙科指南', chapter: '牙周病的分级与家庭护理' },
      { source: 'AAHA 牙科护理指南 2019', chapter: '口腔评估与护理' },
    ],
    sources: [
      { sourceId: 'WSAVA-DENTAL', locator: '牙周病与家庭护理', note: '刷牙是最有效的家庭护理' },
      { sourceId: 'AAHA-DENTAL-2019', locator: '口腔评估', note: '口腔检查要点' },
    ],
    priority: 'MEDIUM',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-008',
    domain: 'CLINICAL',
    title: '皮肤痒、掉毛、反复抓：先分清"痒"和"秃"',
    keywords: ['瘙痒', '抓痒', '掉毛', '皮肤病', '脱毛', '舔爪子', '过敏'],
    applicableTo: ['clinical', 'skin', 'food-allergy', 'coat'],
    summary:
      '皮肤问题先分两条线：**以痒为主**（反复抓挠、舔咬、蹭地）和**以掉毛为主**（不痒但毛变稀、对称性脱毛）。两条线要查的方向不同，记清楚"痒不痒"对医生很有价值。',
    details: [
      '记录要素：什么时候开始、哪些部位、痒的程度（影响睡眠吗）、有没有季节性、有没有换粮或换环境。',
      '以痒为主：常与过敏、寄生虫、感染相关，需要兽医逐步排查。',
      '以掉毛为主且不痒：方向可能在内分泌或营养，需要血液检查。',
      '反复舔前爪、舔到发红脱毛，是很典型的"痒"的表现。',
      '耳朵反复发臭、摇头、挠耳，也常与过敏或感染相关，需要检查耳道。',
    ],
    caveats: [
      '不要自行长期使用人用或网购的激素类药膏、药浴。',
      '皮肤问题很少能靠"换一款粮"一次解决，需要兽医按流程排查。',
      '出现大面积迅速脱毛、皮肤破溃流脓、或伴随精神食欲异常，应尽快就医。',
    ],
    citations: [
      { source: 'WSAVA 全球营养指南与工具包', chapter: '皮肤与被毛的营养评估' },
      { source: '小动物临床营养学（第5版）', chapter: '皮肤病的鉴别思路' },
    ],
    sources: [
      { sourceId: 'WSAVA-NUTRITION', locator: '皮肤被毛评估', note: '营养与皮肤被毛的关系' },
      { sourceId: 'SACN5', locator: '皮肤病章节', note: '痒与不痒的鉴别方向' },
    ],
    priority: 'MEDIUM',
    questionType: 'TRIAGE',
    riskLevel: 'MEDIUM',
    urgency: 'OBSERVE',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-009',
    domain: 'CLINICAL',
    title: '咳嗽：短鼻犬和老年犬要格外当心',
    keywords: ['咳嗽', '干咳', '卡卡', '气管', '心脏', '呼吸'],
    applicableTo: ['clinical', 'red-flag', 'cardio', 'heart', 'senior'],
    summary:
      '偶尔咳一声、精神照常，可以先观察；但**持续咳嗽、夜间或兴奋时加重、咳嗽后晕倒、呼吸费力**都需要就医。短鼻犬种与老年犬的门槛要放低。',
    details: [
      '观察要点：什么时候咳（夜里、兴奋时、喝水后）、咳的声音、有没有咳出东西、有没有伴随喘。',
      '需要尽快就医的信号：呼吸费力或张口呼吸、舌色发紫、咳嗽后倒地或虚弱、腹部随呼吸明显起伏。',
      '短鼻犬种（法斗、巴哥、英斗等）本身呼吸道结构特殊，出现呼吸异常要更早处理。',
      '老年犬的咳嗽可能与心脏或呼吸道多个方向有关，需要检查区分。',
    ],
    caveats: [
      '呼吸费力、张口呼吸、舌色发紫属于**立即就医**级别。',
      '不要自行给止咳药 —— 咳嗽是症状，压住它可能掩盖病情。',
    ],
    citations: [
      { source: 'ACVIM 共识 / 背书声明', chapter: 'ACVIM 2020 肺动脉高压共识 · 呼吸困难的评估' },
    ],
    sources: [
      { sourceId: 'ACVIM-CONSENSUS', locator: 'ACVIM 2020 肺动脉高压共识（犬）', note: '心脏原因导致的咳嗽与呼吸困难' },
      { sourceId: 'MERCK-HEME', locator: '——', note: '咳嗽的鉴别方向（背景与警示）' },
    ],
    priority: 'HIGH',
    questionType: 'TRIAGE',
    riskLevel: 'HIGH',
    urgency: 'SOON',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-010',
    domain: 'CLINICAL',
    title: '中暑：夏天最容易被低估的急症',
    keywords: ['中暑', '热射病', '夏天', '喘不停', '高温', '急症'],
    applicableTo: ['clinical', 'red-flag', 'all'],
    summary:
      '狗主要靠喘气散热，比人怕热得多。**短鼻犬、肥胖犬、老年犬、长毛深色犬**风险最高。出现剧烈喘气、流大量口水、站不稳、牙龈发红或发紫、呕吐腹泻，属于**立即就医**级别。',
    details: [
      '高危场景：封闭车内、正午遛狗、柏油路面、剧烈运动后、没有遮阴与饮水。',
      '早期表现：喘得比平时厉害、找阴凉、不愿走、舌头伸得很长。',
      '需要立即就医：喘到停不下来、大量流涎、走路摇晃、牙龈鲜红或发紫、呕吐、抽搐、意识不清。',
      '就医途中要做的：移到阴凉处、用常温水（不是冰水）打湿身体、保持通风、尽快送医。',
      '不要用冰水浸泡或强行灌水，也不要自行给退烧药。',
    ],
    caveats: [
      '中暑可能造成多器官损伤，即使看起来缓过来了也必须就医评估。',
      '本条目只做分诊提示，不给处理与用药建议。',
    ],
    citations: [
      { source: 'WSAVA 动物福利指南 2018', chapter: '高温环境下的动物福利' },
    ],
    sources: [
      { sourceId: 'WSAVA-WELFARE', locator: '环境与福利', note: '高温环境对犬只的风险' },
      { sourceId: 'MERCK-CLINICAL-BIOCHEM', locator: '——', note: '中暑的多器官影响（背景与警示）' },
    ],
    priority: 'HIGH',
    questionType: 'TRIAGE',
    riskLevel: 'HIGH',
    urgency: 'IMMEDIATE',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-011',
    domain: 'CLINICAL',
    title: '误食：哪些东西必须马上送医院',
    keywords: ['误食', '中毒', '吃了', '巧克力', '葡萄', '洋葱', '木糖醇', '老鼠药', '异物'],
    applicableTo: ['clinical', 'red-flag', 'safe', 'all'],
    summary:
      '狗误食后**不要等症状出现**。巧克力、葡萄/葡萄干、洋葱大蒜、木糖醇（无糖口香糖等）、老鼠药、人用药物、以及骨头/玩具/绳子等异物，都属于需要**立即联系兽医**的情况。',
    details: [
      '出门前先准备好三样信息：**吃了什么、大概多少量、什么时候吃的**（拍下包装更好）。',
      '常见高风险：巧克力、葡萄与葡萄干、洋葱与大蒜、木糖醇、酒精、老鼠药、人用止痛药。',
      '异物：骨头、玉米芯、袜子、绳子、玩具碎片 —— 即使当下没症状也可能造成梗阻。',
      '有些中毒症状出现得很晚（如老鼠药），等出现症状时已经错过处理窗口。',
      '不要自行催吐 —— 有些物质（尖锐物、腐蚀性液体）催吐会造成二次伤害。',
    ],
    caveats: [
      '误食一律按急症处理，先打电话给兽医或宠物中毒咨询热线，按指导行动。',
      '本条目只做分诊提示，不给催吐、解毒或用药建议。',
    ],
    citations: [
      { source: 'WSAVA 全球营养委员会立场声明', chapter: '食品安全与有毒食物' },
      { source: 'Merck 兽医手册 · 临床生化', chapter: '中毒的初步识别' },
    ],
    sources: [
      { sourceId: 'WSAVA-NUTRITION', locator: '食品安全工具包', note: '高风险食物清单' },
      { sourceId: 'MERCK-CLINICAL-BIOCHEM', locator: '中毒识别', note: '中毒的初步判断原则' },
    ],
    priority: 'HIGH',
    questionType: 'TRIAGE',
    riskLevel: 'HIGH',
    urgency: 'IMMEDIATE',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-012',
    domain: 'CLINICAL',
    title: '老年犬的"变老"里，有多少其实是病',
    keywords: ['老年犬', '老了', '不爱动', '认知障碍', '老年护理', '定期检查'],
    applicableTo: ['clinical', 'senior', 'geriatric', 'prevention', 'neuro'],
    summary:
      '很多被当成"老了就这样"的表现，其实是可以处理的疾病：不爱动可能是关节痛、夜里转圈或对着墙站可能是认知功能障碍、喝水变多可能是内分泌或肾脏问题。**老年犬更需要定期检查，而不是更少。**',
    details: [
      '关节痛的表现：不愿上下楼、跳不上沙发、起身僵硬、散步变短 —— 常被误认为"老了懒了"。',
      '认知变化的表现：夜间不安或转圈、对着墙站、在屋里迷路、与家人互动减少、睡眠节律颠倒。',
      '代谢相关表现：体重变化、饮水量变化、被毛变差。',
      '感官退化：听不见、看不清，会表现为"叫不应"或容易受惊。',
      '老年犬的检查频率通常应高于成年犬，具体由兽医按个体情况安排。',
    ],
    caveats: [
      '不要把新出现的行为变化直接归因为衰老，先让兽医排除可治疗的疾病。',
      '家中可做的调整（防滑垫、矮台阶、夜灯、固定作息）能明显改善老年犬的生活质量。',
    ],
    citations: [
      { source: 'AAHA 老年犬猫护理指南 2023', chapter: '老年犬评估与护理' },
      { source: 'WSAVA 疫苗接种指南 2024', chapter: '老年动物的预防保健' },
    ],
    sources: [
      { sourceId: 'AAHA-SENIOR-2023', locator: '老年护理工具包', note: '老年犬常见可治疗问题与护理调整' },
      { sourceId: 'WSAVA-VACC-2024', locator: 'Aged animals 段落', note: '老年宠物仍需定期健康检查' },
    ],
    priority: 'MEDIUM',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-013',
    domain: 'CLINICAL',
    title: '母犬未绝育：子宫蓄脓要认得出来',
    keywords: ['子宫蓄脓', '未绝育', '母犬', '发情后', '阴道分泌物', '急症'],
    applicableTo: ['clinical', 'red-flag', 'repro'],
    summary:
      '未绝育母犬在**发情后几周到两个月内**出现精神差、喝水多、呕吐、腹部变大或阴道分泌物，要高度警惕子宫蓄脓 —— 这是**危及生命的急症**，必须立即就医。',
    details: [
      '典型时间窗：发情结束后的几周到两个月内。',
      '常见表现：精神不振、食欲下降、饮水量增多、呕吐、腹部膨大。',
      '阴道分泌物：可能是有味的脓性分泌物；**有些类型不流分泌物**（闭锁型），反而更危险。',
      '这类情况拖延会迅速恶化，属于立即就医级别。',
    ],
    caveats: [
      '本条目只做分诊提示，不诊断、不给治疗建议。',
      '未绝育母犬出现上述任一表现，不要在家观察。',
    ],
    citations: [
      { source: 'WSAVA 犬猫生殖管理指南 2024', chapter: '繁殖相关疾病的风险' },
    ],
    sources: [
      { sourceId: 'WSAVA-REPRO', locator: '生殖管理指南', note: '未绝育母犬的疾病风险与就诊时机' },
      { sourceId: 'MERCK-CLINICAL-BIOCHEM', locator: '——', note: '子宫蓄脓的全身影响（背景与警示）' },
    ],
    priority: 'HIGH',
    questionType: 'TRIAGE',
    riskLevel: 'HIGH',
    urgency: 'IMMEDIATE',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-014',
    domain: 'CLINICAL',
    title: '带狗去医院前，准备这三样东西',
    keywords: ['就诊准备', '去医院', '怎么跟医生说', '症状记录', '问医生什么'],
    applicableTo: ['clinical', 'all', 'prevention'],
    summary:
      '去医院前准备三样：**症状的时间线、正在吃的所有东西、想问的问题清单**。这三样能显著提高一次问诊的效率，也让医生少走弯路。',
    details: [
      '时间线：什么时候开始、变化过程、什么情况下加重或缓解。手机备忘录记几行就够。',
      '照片/视频：呕吐物、粪便、走路姿势、咳嗽发作 —— 有些症状到了医院就不出现了。',
      '正在吃的所有东西：主粮、零食、保健品、药物（包括别人给的、网购的），拍下包装。',
      '既往记录：之前的化验单、诊断、用药与过敏史。健康管理里的记录可以直接给医生看。',
      '问题清单：把最想问的写在最前面，避免出了诊室才想起来。',
      '如果是复诊，带上上一次的报告，医生才能比较趋势。',
    ],
    caveats: [
      '如实告知所有在用的药物与保健品，包括中草药与"天然"产品 —— 它们可能与处方冲突。',
    ],
    citations: [
      { source: 'AAHA 犬生命阶段指南 2019', chapter: '就诊准备与沟通' },
      { source: 'WSAVA 疫苗接种指南 2024', chapter: '病历记录与沟通' },
    ],
    sources: [
      { sourceId: 'AAHA-LIFE-STAGE-2019', locator: '就诊沟通', note: '就诊前的信息准备' },
      { sourceId: 'WSAVA-VACC-2024', locator: 'Medical records documentation', note: '完整记录对后续判断的价值' },
    ],
    priority: 'MEDIUM',
    questionType: 'PREVENTION',
    riskLevel: 'LOW',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'clinical-015',
    domain: 'CLINICAL',
    title: '绝育与不绝育：决策要看什么',
    keywords: ['绝育', '去势', '要不要绝育', '什么时候绝育', '繁殖'],
    applicableTo: ['clinical', 'repro', 'prevention'],
    summary:
      '绝育的利弊与**品种、体型、性别、年龄、生活方式**都有关，没有统一答案。WSAVA 的生殖管理指南强调个体化决策，而不是"到年龄就做"。',
    details: [
      '不绝育的风险方向：未绝育母犬的子宫蓄脓、乳腺肿瘤风险；未绝育公犬的生殖系统疾病与行为问题。',
      '绝育的风险方向：与品种、体型、以及**绝育时的年龄**有关，不同犬种的研究结论并不一致。',
      '大型犬与小型犬的最佳时机可能不同，需要按品种与个体评估。',
      '决策要结合主人的饲养条件（能否管理发情、能否防止意外繁殖）。',
    ],
    caveats: [
      '本条目只说明决策要看哪些因素，**不给"该不该做、什么时候做"的结论** —— 这必须由兽医结合个体情况判断。',
      '不同研究对时机的结论存在差异，网上单一说法不足以作为决策依据。',
    ],
    citations: [
      { source: 'WSAVA 犬猫生殖管理指南 2024', chapter: '生殖控制与个体化决策' },
    ],
    sources: [
      { sourceId: 'WSAVA-REPRO', locator: '生殖管理指南', note: '绝育决策的个体化原则' },
    ],
    priority: 'LOW',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
];
