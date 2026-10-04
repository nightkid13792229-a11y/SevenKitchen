import type { KnowledgeEntry } from '../types';

/**
 * VISITPREP 领域（就诊前准备与摘要）。
 *
 * 审计缺口第 6 项：需求第 8 条直接要的"就诊助手"——
 * 去之前该带什么、该记什么、医生最想知道哪几件事、怎么描述才不遗漏。
 *
 * ── 硬规矩 ──────────────────────────────────────────────────
 *   1. 每条必须带检索标签 `visit-prep`（由 SECTION_TAGS.visitPrep 产出）。
 *   2. 这一块是"沟通方法"，不是医学结论；但仍然要写清依据出处。
 *   3. 不承诺任何诊疗结果，不替医生排优先级（可以说"医生通常会先问 X"）。
 *
 * 全部标 `reviewStatus: 'APPROVED'`（2026-10-02 合作兽医全数通过，老板同意对顾客开放）。
 * ⚠️ 以后**新写的条目一律先写 `PENDING_REVIEW`**：顾客侧只放 APPROVED。
 *    改动某条内容时也要把它退回 PENDING_REVIEW —— 换了内容就等于没审过。
 *
 * 建立日期：2026-10-01
 */
export const VISIT_PREP_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'visit-001',
    domain: 'VISITPREP',
    title: '就诊前先记"可观察事实"，不要记主人的判断',
    keywords: [
      '就诊前准备',
      '症状记录',
      '发生时间',
      '频率',
      '诱因',
      '变化趋势',
    ],
    applicableTo: ['visit-prep', 'clinical', 'all', 'monitoring'],
    summary:
      '同样一件事，"今天吐了三次，都在饭后十分钟左右"比"我觉得它得了肠胃炎"有用得多。**要记的是四类可观察事实：什么时候开始、多久一次、什么情况下发生、比前几天是好还是坏**——判断留给医生。',
    details: [
      '写时间：第一次出现是哪一天、大概几点；呕吐、咳嗽、抽搐、跛行这类发作性的表现，记下每次的**持续时长与间隔**。',
      '写频率与量：一天几次、每次大概多少（"半碗""一小摊"这种自家单位就行，不必刻意精确）。',
      '写诱因与场景：饭前还是饭后、换粮第几天、外出或洗澡或来客人之后、运动后、白天还是夜里。',
      '写趋势：附一句"比三天前多了／少了／差不多"——医生最需要的是变化方向。',
      '用看到的具体表现代替笼统的词：把"精神不好"换成"不迎人、趴着不动、叫它没反应"，把"有点瘸"换成"走十几米就坐下、后腿不敢落地"。',
      '记法越省事越能坚持：手机备忘录按"日期—表现—频率—备注"一行一条，就诊时直接给医生看或照着念。',
    ],
    caveats: [
      '不要用主人的判断替代事实（"我觉得是吃坏了""应该是过敏"）——先入为主的结论会影响判断方向。',
      '记录代替不了就诊：出现呼吸费力、反复呕吐、站不起来、大量出血这类表现时，不要等记录完整，先联系医院。',
      '本条目不判断病情轻重，也不建议任何家庭处理方式。',
    ],
    citations: [
      {
        source: 'AAHA 犬生命阶段指南 2019',
        chapter: '表 2 面诊时应讨论、复查、检查与执行的项目（总则栏）',
        note: '采集家长在家观察到的活动与行动能力变化；记录并复核重要临床参数的趋势',
      },
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: '全球营养评估准则（2011）· 监测段／营养评估清单',
        note: '家长在家监测项：食物摄取量与食欲、体况与体重、胃肠道病征、整体外观与活动力',
      },
      {
        source: 'AAHA 老年犬猫护理指南 2023',
        chapter: 'Home Monitoring Tips for Senior Pets（家长手册）',
        note: '发作类表现建议记录持续时长与频率，并拍视频给兽医看',
      },
    ],
    sources: [
      {
        sourceId: 'AAHA-LIFE-STAGE-2019',
        locator: 'Table 2「General」栏',
        note: 'Collect pet owner observations of mobility and activity at home；Document and review trends on important clinical parameters in the medical record',
      },
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: '全球营养评估准则（2011）「监测」段',
        note: '在家监测清单；监测计划应由医疗团队与家长商定',
      },
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Home Monitoring Tips for Senior Pets',
        note: 'Note duration and frequency of seizure, take video to show to your veterinarian',
      },
    ],
    priority: 'HIGH',
    questionType: 'SAFETY',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'visit-002',
    domain: 'VISITPREP',
    title:
      '去医院带上这五样：免疫记录、既往报告、用药清单、照片视频、现在吃的粮',
    keywords: [
      '就诊带什么',
      '疫苗本',
      '既往报告',
      '用药清单',
      '照片视频',
      '资料准备',
    ],
    applicableTo: ['visit-prep', 'clinical', 'all', 'supplement'],
    summary:
      '同一只狗的**接种史、既往检查、正在用的药**，决定了这次该查什么、要不要重复查，也关系到用药安全。出门前按五样核对一遍，比到院后凭记忆回想可靠得多。',
    details: [
      '免疫记录：疫苗本、免疫卡或接种医院的记录截图。完整的接种记录应包含**接种日期、疫苗信息与注射部位**；国内办理养犬登记还需要动物诊疗机构出具的免疫证明，建议一并保存好。',
      '既往化验与影像报告：上一次的血检、尿检、B 超／X 光报告，纸质或手机照片都行。**带原始数值的报告，比"上次医生说没问题"有用**。',
      '正在吃的药与保健品清单：药名、剂量、每天几次、从哪天开始、还剩多少；包括驱虫药、关节或皮肤类保健品、中草药。写不清就**把药盒和说明书一起带来**。',
      '照片视频：呕吐物、粪便、跛行步态、咳嗽或抽搐发作、皮肤病灶——拍清楚并**带上拍摄时间**，发作类表现最好能看出持续时长与频率。',
      '现在吃的粮：拍下包装正面的品牌名与背面的成分／保证分析，记下每天喂多少、喂几顿、零食与人的食物大概占多少。',
      '异地就诊或转诊时，把整理好的资料连同一份时间线一起带上，能少重复叙述一遍。',
    ],
    caveats: [
      '不要因为"上次查过都正常"就不带报告：判断趋势需要原始数值与日期。',
      '不要把药说成"那个小白片"——说不清就带药盒；漏报用药与保健品有安全风险。',
      '本条目不评价任何药物或保健品该不该继续用，是否调整由开药的兽医决定。',
    ],
    citations: [
      {
        source: 'WSAVA 疫苗接种指南 2024',
        chapter: '病历记录要求（Medical records documentation）',
        note: '接种信息与注射部位应记入永久病历或免疫卡',
      },
      {
        source: '中华人民共和国动物防疫法',
        chapter: '第三十条',
        note: '犬只应定期免疫接种狂犬病疫苗，凭动物诊疗机构出具的免疫证明办理养犬登记',
      },
      {
        source: 'AAHA 犬生命阶段指南 2019',
        chapter: '表 2 总则栏',
        note: '面诊时应询问当前使用的药物、补充剂、营养保健品与草药',
      },
      {
        source: 'AAHA 老年犬猫护理指南 2023',
        chapter: 'Home Monitoring Tips for Senior Pets（家长手册）',
        note: '发作与异常表现建议记录时长与频率，拍视频给兽医看',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-VACC-2024',
        locator: 'Medical records documentation',
        note: 'At the time of vaccine administration… recorded in the patient’s permanent medical record；注射部位记入病历或免疫卡',
      },
      {
        sourceId: 'CN-EPIDEMIC-LAW',
        locator: '第三十条',
        note: '凭动物诊疗机构出具的免疫证明向所在地养犬登记机关申请登记',
      },
      {
        sourceId: 'AAHA-LIFE-STAGE-2019',
        locator: 'Table 2「General」栏',
        note: 'Consult about any current medications and supplements, nutraceuticals, herbs',
      },
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Home Monitoring Tips for Senior Pets',
        note: '拍视频并记录发作时长与频率，供兽医判断',
      },
    ],
    priority: 'HIGH',
    questionType: 'SAFETY',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'visit-003',
    domain: 'VISITPREP',
    title: '一段话讲清病情：时间线叙述法',
    keywords: ['怎么描述病情', '时间线', '主诉', '先说哪几句', '沟通技巧'],
    applicableTo: ['visit-prep', 'clinical', 'all'],
    summary:
      '把病情说清楚有个固定顺序：**什么时候开始 → 现在什么频率 → 比之前好了还是差了 → 已经做了什么**。四句说完再补充其他，医生能在最短时间里抓住重点；至于"是什么病、要不要紧"，那是医生的部分。',
    details: [
      '第一句给时间锚点："X 月 X 日晚上开始"，不要用"有一阵子了""好久了"。',
      '第二句给频率与程度："一天三到四次""每次两三分钟""走十几米就要坐下"。',
      '第三句给趋势："比昨天好一点""这一周明显变频繁"——医生据此判断是在好转还是在进展。',
      '第四句给已经做过的事：自己给过什么药或保健品、看过哪家医院、效果如何，**包括自己买的和别人推荐的**。',
      '四句说完再补充背景（换粮、疫苗、环境变化、既往病史），然后按医生的提问回答，不要一坐下就讲很长的故事。',
      '提前写在纸上或手机备忘录里，紧张时照着念，比现场组织语言可靠。',
    ],
    caveats: [
      '不要在这四句里塞自己的结论（"我觉得是胰腺炎"）或点药（"给我开 XX 药"）——结论由医生下。',
      '不要漏说已经自行用过的东西，包括人用药、中草药、朋友推荐的药：这会影响医生的判断与后续用药选择。',
      '如果医生先问的是别的（例如先问食欲和饮水），按医生的顺序来；本条只是没有头绪时的兜底顺序。',
    ],
    citations: [
      {
        source: 'AAHA 犬生命阶段指南 2019',
        chapter: '表 2 行为栏（病史采集与开放式提问）',
        note: '用开放式问题了解变化与家长的具体担心',
      },
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: '短版饮食史表（Fed since 栏）／营养评估清单',
        note: '"从什么时候开始"是表上的固定项目；变化按项目逐条记录',
      },
      {
        source: 'Merck 兽医手册 · 临床生化',
        chapter: '病史与临床检查的作用',
        note: '鉴别诊断建立在病史与临床检查之上（仅作背景与警示）',
      },
    ],
    sources: [
      {
        sourceId: 'AAHA-LIFE-STAGE-2019',
        locator: 'Table 2「Behavior」栏',
        note: 'Ask open-ended questions about changes and any specific client concerns',
      },
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'Short Diet History Form「Fed since」栏',
        note: '每种食物从何时开始喂是必填项',
      },
      {
        sourceId: 'MERCK-CLINICAL-BIOCHEM',
        locator: '病史与临床检查（history and clinical examination）',
        note: 'A list of differential diagnoses should already be established based on the history and clinical examination（背景与警示）',
      },
    ],
    priority: 'HIGH',
    questionType: 'SAFETY',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'visit-004',
    domain: 'VISITPREP',
    title:
      '医生通常会先问这几件事：食欲、饮水、排尿排便、精神、体重、有没有误食',
    keywords: ['医生会问什么', '食欲', '饮水', '排便排尿', '体重变化', '误食'],
    applicableTo: ['visit-prep', 'clinical', 'all', 'nutritional', 'safe'],
    summary:
      '这几项是面诊时几乎一定会被问到的"基础六问"：它们同时反映消化、泌尿、内分泌等多个方向，也决定要不要加做检查。**提前把答案想好（最好带上记录或数字），面诊能快很多。**',
    details: [
      '食欲：吃不吃、吃多少（比平时少几成）、对零食还有没有兴趣；"完全不吃"和"吃得少"要分开说。',
      '饮水：水碗每天加几次、有没有突然喝得明显多；多饮常和排尿增多同时出现，两条一起答。',
      '排尿排便：次数、量、颜色与形状（粪便软硬、有没有血或黑色柏油样）、有没有用力或疼痛的表现。',
      '精神与活动：比平时安静还是烦躁、愿不愿意出门、还能不能跳上沙发、睡眠有没有变化。',
      '体重：最近一次称重的时间与体重；没有称重条件，就说"项圈变松了""摸得到肋骨""腰变粗了"这类变化。',
      '有没有误食：垃圾桶、袜子、玩具、骨头、人用药、木糖醇或葡萄干等；**即使不确定，也要如实说"可能吃了"**。',
    ],
    caveats: [
      '答不上来不是错，但别猜：记不清就说记不清，比给一个编出来的数字安全。',
      '"吐了""咳嗽""发抖"各家理解不同，尽量描述看到的动作与频率，必要时拍视频。',
      '本条只是把常见问题列出来帮你准备；实际问什么、按什么顺序问，由医生决定。',
    ],
    citations: [
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: '营养评估清单与扩展评估表',
        note: '进食量变化、咀嚼、吞咽、恶心、呕吐、反流；原因不明的体重改变',
      },
      {
        source: 'AAHA 老年犬猫护理指南 2023',
        chapter: 'Home Monitoring Tips for Senior Pets（家长手册）',
        note: '饮水与排尿变化、食欲下降、排便异常、体重变化等居家观察项',
      },
      {
        source: 'AAHA 犬生命阶段指南 2019',
        chapter: '表 2 与宠物生活方式与安全评估',
        note: '喂养与饮水习惯；家中潜在异物、对犬有毒的人用食物',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'Nutritional Assessment Checklist／2011 准则「监测」段',
        note: '在家监测项：食物摄取量与食欲、体况与体重、胃肠道病征、整体外观与活动力',
      },
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Home Monitoring Tips for Senior Pets',
        note: '饮水与排尿变化、食欲下降、呕吐腹泻、排便异常、体重下降或上升',
      },
      {
        sourceId: 'AAHA-LIFE-STAGE-2019',
        locator: 'Table 2 与 Pet Lifestyle and Safety Assessment',
        note: 'feeding and watering habits；潜在异物与对犬有毒的人用食物（如木糖醇、葡萄干）',
      },
    ],
    priority: 'MEDIUM',
    questionType: 'SAFETY',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'visit-005',
    domain: 'VISITPREP',
    title: '急诊先说三句：最危急的表现、开始时间、基础病与正在用的药',
    keywords: [
      '急诊',
      '急救沟通',
      '最危急表现',
      '开始时间',
      '基础病',
      '正在用的药',
    ],
    applicableTo: ['visit-prep', 'clinical', 'triage', 'all'],
    summary:
      '到了急诊（或打电话求助），先说三句：**① 现在最危险的表现是什么 ② 从什么时候开始 ③ 有没有基础病、正在用什么药**。这三句决定接下来是先抢救还是先检查；其余细节等医生问。',
    details: [
      '第一句说表现与程度："现在喘不上气／止不住地抽／站不起来／流血不停"——用一句话说最严重的那个。',
      '第二句说时间："二十分钟前开始""今早六点到现在"，急诊里时间就是判断依据。',
      '第三句说背景：有没有慢性病、正在用什么药与保健品、疫苗是否齐全、有没有可能误食。',
      '说完再补充：刚才在家有没有呕吐、排便、受伤，路上做过什么处理，之前在哪家医院看过。',
      '如果来得及，**先打个电话**告诉医院"我们正在来，情况是……"，让医院提前准备；同时把药盒、免疫记录与既往报告带上。',
      '说不清或来不及说时，直接把手机里拍的视频给医生看，比形容更快。',
    ],
    caveats: [
      '呼吸费力或张口呼吸、舌色发紫、牙龈苍白、反复抽搐、无法起立、大量出血、意识不清、腹部快速膨大这类表现，不要在家等，也不要等"记录完整"再出门。',
      '急诊的先后顺序由医院分诊决定：可能先抢救、后补问病史，这不是被忽略。',
      '本条不判断具体表现有多严重，也不安排优先级；到院后一切听急诊团队安排。',
    ],
    citations: [
      {
        source: 'AAHA 犬生命阶段指南 2019',
        chapter: '表 2 总则栏',
        note: '面诊时应询问当前使用的药物、补充剂、营养保健品与草药',
      },
      {
        source: 'WSAVA 动物福利指南 2018',
        chapter: '第 3 章 就诊相关的福利需求（到院前准备与到院时分诊）',
        note: '到院前应做准备，到院时由前台／分诊人员先行判断',
      },
      {
        source: 'AAHA 老年犬猫护理指南 2023',
        chapter: 'Seek immediate veterinary care 清单（家长手册）',
        note: '呼吸与牙龈颜色、无法起立、腹部膨大等属于需立即就医的表现',
      },
    ],
    sources: [
      {
        sourceId: 'AAHA-LIFE-STAGE-2019',
        locator: 'Table 2「General」栏',
        note: 'Consult about any current medications and supplements, nutraceuticals, herbs',
      },
      {
        sourceId: 'WSAVA-WELFARE',
        locator: 'Chapter 3: Pre-arrival／Receiving area（triage）',
        note: '到院前准备建议与到院时的分诊流程',
      },
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Seek immediate veterinary care 清单',
        note: '呼吸费力、牙龈苍白或发蓝、无法起立、腹部膨大等立即就医信号',
      },
    ],
    priority: 'HIGH',
    questionType: 'TRIAGE',
    riskLevel: 'HIGH',
    urgency: 'IMMEDIATE',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'visit-006',
    domain: 'VISITPREP',
    title: '慢性病复诊前准备：家庭监测数据、用药依从情况、这段时间的变化',
    keywords: ['复诊准备', '慢性病', '家庭监测', '用药依从', '这段时间的变化'],
    applicableTo: [
      'visit-prep',
      'followup',
      'senior',
      'chronic-disease',
      'monitoring',
    ],
    summary:
      '慢性病复诊看的是**趋势**，而趋势的一半数据来自家里。带上家庭监测记录、这段时间的用药情况、以及变化从什么时候开始，医生才能判断方案要不要调整。',
    details: [
      '体重与体况：家里能称就按周记；不能称就记"摸得到肋骨""腰变粗了""项圈松了"。',
      '进食与饮水：每天吃多少、有没有挑食或拒食、水碗每天加几次——很多慢性病最先变化的就是这两项。',
      '排尿排便与呕吐：次数、形状、颜色，有异常的拍下来并带上日期。',
      '用药与保健品：药名、每天几次、有没有漏服或吐出来、哪天换过药；**漏了就写漏了**，这直接影响医生对这次结果的解读。',
      '如果医生之前教过你在家做某项监测（例如数静息呼吸频率），按他教的方法把记录整理成表带来。',
      '把上一次的报告和这次想问的问题（写下来，2–3 个）一起带上；预约时问一句这次要不要空腹、要不要留尿样或粪便样本。',
    ],
    caveats: [
      '不要因为"这阵子看着挺好"就自行减药或停药，也不要自行加保健品——调整由开药的兽医决定。',
      '复查间隔按疾病种类、严重程度与用药决定，不要自行拉长或提前；医生给的间隔本身就是医嘱的一部分。',
      '在家监测的数据只用于给医生参考，不能替代医院的检查。',
    ],
    citations: [
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: '全球营养评估准则（2011）· 监测段／营养评估清单',
        note: '家长在家监测项与"是否给出监测建议"的清单项',
      },
      {
        source: 'AAHA 犬生命阶段指南 2019',
        chapter: '表 2 总则栏与表 4（按年龄的检查建议）',
        note: '记录并复核重要临床参数的趋势；老年犬建议每 6–12 个月检查',
      },
      {
        source: 'IRIS 肾病指南 2026',
        chapter: '监测与复查',
        note: '以慢性肾病为例：复查频率按分期与病情决定',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: '2011 准则「监测」段／Nutritional Assessment Checklist',
        note: '在家监测清单；监测计划由医疗团队与家长商定',
      },
      {
        sourceId: 'AAHA-LIFE-STAGE-2019',
        locator: 'Table 2「General」栏；Table 4',
        note: 'Document and review trends on important clinical parameters；老年犬每 6–12 个月做较全面检查',
      },
      {
        sourceId: 'IRIS-CKD-2026',
        locator: '监测与复查',
        note: '复查节奏随分期与病情变化',
      },
    ],
    priority: 'MEDIUM',
    questionType: 'FOLLOWUP',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'visit-007',
    domain: 'VISITPREP',
    title: '体检／化验前要不要禁食、要不要停药：按医院要求，不要自己停',
    keywords: ['空腹', '禁食', '停药', '体检前准备', '化验前准备', '用药清单'],
    applicableTo: ['visit-prep', 'lab', 'prevention', 'all'],
    summary:
      '**要不要空腹、空腹多久、要不要停药，只有一个依据：这家医院对这次检查的具体要求。**不同项目要求不同；长期用药尤其不要自行停——先打电话问开药的兽医，并把用药清单交给医院，由医生决定。',
    details: [
      '预约时一次问清三件事：这次检查要不要空腹、空腹多久、水要不要限制。',
      '如果需要空腹，按医院给的时间执行；**幼犬、糖尿病或正在用药的动物不能自行长时间禁食**，必须先问医生。',
      '不要自行停长期用药：停不停、怎么安排由开药的兽医决定——这也是要把用药清单交给医院的原因。',
      '如果某顿药与采血时间冲突，问医生怎么排，不要自己改时间或自己减量。',
      '清单要写全：药名、剂量、每天几次、从哪天开始，加上保健品与中草药；进食、运动与应激都会影响部分指标，医生需要据此解读结果。',
      '没按要求准备就如实说：与其让医生拿着失真的结果判断，不如告诉他实际情况，必要时改期或重抽。',
    ],
    caveats: [
      '本条目不判断任何具体药物能不能停、能不能空腹服用——只提醒"由开药的兽医决定"。',
      '不同医院、不同项目的准备要求不一样，不要拿上一次或别家的要求套这次。',
      '如果检查当天动物状态明显变差，先联系医院说明情况，不要硬按原计划走。',
    ],
    citations: [
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: '营养评估清单：筛查风险因子',
        note: '"正在使用药物或营养补充品"属于必须做进阶评估的项目',
      },
      {
        source: 'AAHA 犬生命阶段指南 2019',
        chapter: '表 2 总则栏',
        note: '面诊时应询问当前使用的药物、补充剂、营养保健品与草药',
      },
      {
        source: 'Merck 兽医手册 · 临床生化',
        chapter: '影响检验值的因素与采样',
        note: '进食、运动、应激与部分用药会影响指标（仅作背景与警示）',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-NUTRITION',
        locator:
          'Nutritional Assessment Checklist：Nutritional screening risk factors',
        note: 'Currently receiving medications and/or dietary supplements 属必须做进阶评估的项目',
      },
      {
        sourceId: 'AAHA-LIFE-STAGE-2019',
        locator: 'Table 2「General」栏',
        note: 'Consult about any current medications and supplements, nutraceuticals, herbs',
      },
      {
        sourceId: 'MERCK-CLINICAL-BIOCHEM',
        locator: '影响分析物的因素（进食、运动、应激、用药）',
        note: 'high-carbohydrate meals、exercise、stress 及部分用药会影响指标（背景与警示）',
      },
    ],
    priority: 'HIGH',
    questionType: 'PREVENTION',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'visit-008',
    domain: 'VISITPREP',
    title: '看完之后：把医嘱记下来，知道什么情况要提前回来',
    keywords: ['医嘱记录', '复诊时间', '观察重点', '什么时候回来', '随访'],
    applicableTo: ['visit-prep', 'followup', 'clinical', 'all'],
    summary:
      '离院前把三件事写下来：**下次什么时候复诊、这段时间在家重点观察什么、出现什么情况要提前回来**。回家按日期记观察结果，复诊时带上——这样"有没有效果"才有依据。',
    details: [
      '复诊时间：具体到日期或"X 周后"，并问清这次复查要查哪些项目、要不要空腹。',
      '用药与饮食怎么执行：怎么给、给多久、要不要随餐；不确定就当场问，不要回家猜。',
      '观察重点：医生提到的每一项（进食量、饮水、排尿排便、体重、呼吸、活动能力、伤口等）按天记一行，有异常拍下来带日期。',
      '提前回来的信号：把医生说的"如果出现 X 就马上来"按原话记下来；没听清就复述一遍请医生确认。',
      '记在手机备忘录里并设提醒；家里有其他人喂食或给药的，把清单贴在冰箱或粮桶上，避免重复或漏掉。',
      '下次就诊前，把这段时间的记录和想问的问题（2–3 个）整理好一起带去。',
    ],
    caveats: [
      '医嘱以主诊医生的交代为准；本条只是记录与落实方法的建议。',
      '回家后不确定医嘱内容，**当天打电话回医院确认**，不要凭印象执行或自行加减。',
      '出现医生没提到但让你担心的变化，也先联系医院，而不是等到复诊日。',
    ],
    citations: [
      {
        source: 'WSAVA 动物福利指南 2018',
        chapter: '第 3 章 就诊相关的福利需求 · 记录保存',
        note: '检查、治疗与反应应准确及时记录，便于随访与交接',
      },
      {
        source: 'AAHA 犬生命阶段指南 2019',
        chapter: '表 2 总则栏（复诊频率与趋势记录）',
        note: '记录并复核重要临床参数的趋势；按生命阶段给出复诊频率建议',
      },
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: '营养评估清单：监测建议（Recommendations for monitoring）',
        note: '监测项清单：体重、体况、肌况、进食、食欲、胃肠道表现、活动、整体外观',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-WELFARE',
        locator: 'Chapter 3: Record keeping',
        note: '治疗与反应的记录应准确及时，便于随访与交接',
      },
      {
        sourceId: 'AAHA-LIFE-STAGE-2019',
        locator: 'Table 2「General」栏',
        note: 'Document and review trends on important clinical parameters in the medical record',
      },
      {
        sourceId: 'WSAVA-NUTRITION',
        locator:
          'Nutritional Assessment Checklist：Recommendations for monitoring',
        note: 'BW、BCS、MCS、food intake、appetite、gastrointestinal clinical signs、activity、overall appearance',
      },
    ],
    priority: 'MEDIUM',
    questionType: 'FOLLOWUP',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
];
