import type { KnowledgeEntry } from '../types';

/**
 * NURSING 领域（日常护理）。
 *
 * 审计缺口第 5 项：口腔、耳道、皮肤、被毛、指甲、洗浴、驱虫以外的居家照护。
 * 这一块不进 AI 的核心判断，但会出现在第 ① 项「健康总评」与第 ⑦ 项「就诊前准备」里。
 *
 * ── 硬规矩 ──────────────────────────────────────────────────
 *   1. 每条必须带检索标签 `nursing`（由 health-analysis 的 SECTION_TAGS 产出），
 *      具体部位再带 `dental` / `oral` / `skin` / `coat` 等词表内标签。
 *   2. 写"在家怎么做、多久做一次、做到什么程度算异常"，
 *      不写治疗手段、不写用药剂量。
 *   3. 涉及产品/器械的，只写原理与选择要点，不推荐具体品牌。
 *
 * 全部标 `reviewStatus: 'PENDING_REVIEW'`：未经专业审核，顾客侧看不到。
 *
 * 建立日期：2026-10-01
 */
export const NURSING_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'nurse-001',
    domain: 'NURSING',
    title: '刷牙：方法、顺序与每天一次的频率',
    keywords: ['刷牙', '刷牙频率', '刷牙方法', '牙菌斑', '牙龈线', '口腔清洁'],
    applicableTo: ['nursing', 'dental', 'oral', 'periodontal', 'prevention'],
    summary:
      '刷牙是目前去除牙菌斑最有效的方法，理想频率是**每天一次**；已确诊牙周病的犬需要每天刷，兽医可能建议每天两次。有效的关键不是力度而是位置与动作：牙刷与牙齿长轴成 45 度角，刷毛放在牙龈缘，沿牙弓做圆周运动，优先刷颊侧面。',
    details: [
      '频率：理想上每天一次 —— 需要这个水平的照护才能预防牙菌斑形成。已经确诊牙周病的病例需要每天刷牙，并可能被建议每天两次。',
      '停刷的代价：研究显示即使只暂停刷牙一个月，牙龈发炎的程度就会回到与未治疗病例相同的水平，"想起来才刷"基本等于没刷。',
      '角度与动作：牙刷与牙齿长轴成 45 度角，刷毛放在牙龈缘（gumline），以圆周运动沿牙弓移动。最容易接触到的颊侧面，恰好也是牙结石积聚较多的位置，是刚开始刷牙时的重点。',
      '不要一开始就掰嘴：大多数动物很反感嘴巴被硬撑开，容易引起抵抗。可以先闭着嘴刷颊侧面，把牙刷轻柔插入颊侧就能刷到后方牙齿；确实需要张嘴时，把惯用手拇指放在下犬齿后面（口内最安全的位置）。',
      '上手节奏（GDC 刷牙工具包五步法）：先接受手在脸边 → 逐颗牙触碰 → 轻轻按摩牙龈 → 过渡到牙刷 → 逐步覆盖更多牙齿；每一步都用奖励强化，几周才完全适应是正常的。',
      '开始时机：恒牙长齐后（约 6–7 个月龄）或兽医专业洁牙之后正式开始；但让犬适应被触碰嘴巴的训练，应从到家第一天就开始。',
    ],
    caveats: [
      '牙龈已经发炎时刷牙会痛，并可能造成犬只抗拒；这种情况先请兽医评估口腔状况，再决定怎么刷。',
      '即使每天刷牙，也不能替代麻醉下的口腔检查、牙科 X 光与专业治疗；专业洁牙后通常需要按医嘱在 10–14 天复查。',
      '本条目只讲家庭刷牙方法，不涉及药物、漱口水成分与剂量；是否需要抗菌类口腔护理产品由兽医决定。',
    ],
    citations: [
      {
        source: 'WSAVA 全球牙科指南',
        chapter: '居家照护－主动式居家照护：刷牙技巧与频率（中文版 E121）',
      },
      {
        source: 'AAHA 牙科护理指南',
        chapter: 'Recommending Home Oral Hygiene and Products（JAAHA 55(2):17）',
      },
      {
        source: 'WSAVA 全球牙科委员会刷牙工具包',
        chapter: 'STEP 1–5：从触碰脸部到过渡到牙刷',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-DENTAL',
        locator: '居家照护－工具与刷牙方式／刷牙技巧（PDF p.85–86）；GDC 刷牙工具包 STEP 1–5',
        note: '每天一次、确诊牙周病可每天两次、45 度角与牙龈缘、颊侧面优先、停刷一个月复发',
      },
      {
        sourceId: 'AAHA-DENTAL-2019',
        locator: 'Recommending Home Oral Hygiene and Products（p.17）',
        note: '刷牙只去除菌斑不去除结石、需要每天刷才有效、牙龈发炎时刷牙会痛',
      },
    ],
    priority: 'HIGH',
    questionType: 'PREVENTION',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-002',
    domain: 'NURSING',
    title: '牙刷与牙膏怎么选：为什么不能用人的牙膏',
    keywords: ['牙刷选择', '宠物牙膏', '犬用牙膏', '人用牙膏', '指套牙刷', '儿童牙刷'],
    applicableTo: ['nursing', 'dental', 'oral', 'prevention'],
    summary:
      '唯一真正重要的工具是牙刷，按体型与配合度选：小型犬可用软毛儿童牙刷，玩具犬和幼犬用婴儿牙刷常常比大号宠物牙刷更好用。**不要用人用牙膏** —— 通常含清洁剂、氟化物与小苏打，被吞下可能引起胃部不适或氟中毒；宠物专用牙膏主要作用是提高接受度，真正去除牙菌斑的是牙刷的机械动作。',
    details: [
      '牙刷：唯一重要的工具是牙刷，按病患体型选择。市面上的动物牙刷（双面、3D、不同刷头角度）都有效；也可用软毛尼龙人用牙刷替代，小型犬选儿童牙刷，玩具犬与幼年动物用婴儿牙刷可能更合适。',
      '不推荐纱布和毛巾：它们无法清洁牙龈线以下的区域。',
      '机械（电动）牙刷在人的研究中优于手动牙刷，但振动对动物是异常感觉、可能造成恐惧，只适合耐受性高的犬。',
      '牙膏：宠物牙膏可以大幅提高接受度，部分含钙螯合剂、有助减少牙结石沉积；但牙结石本身基本不致病，牙膏对减少牙菌斑和牙龈炎并不是关键贡献者 —— 关键是牙刷移动带来的机械清除。',
      '人用牙膏：通常含清洁剂、氟化物与小苏打，吞入消化道可能导致胃部不适或氟中毒，不建议给犬使用。',
      '让犬参与选择：先让它闻一闻、舔一舔牙膏，确认喜欢这个味道；也可以把牙刷蘸一点它喜欢的汤汁来提高接受度。',
    ],
    caveats: [
      '不要用硬毛牙刷，也不要为了"刷干净"用力压牙龈；刷毛要软，动作要轻。',
      '看产品是否有效，看有没有权威的功效认可（如 VOHC 的"控制牙菌斑 / 控制牙结石"认证），不看包装上的"洁齿 / 清新口气"字样。',
      '口腔护理产品的选择与是否需要抗菌类替代方案，应由兽医按个体情况决定。',
    ],
    citations: [
      {
        source: 'WSAVA 全球牙科指南',
        chapter: '居家照护－主动式居家照护：工具与刷牙方式、牙膏（中文版 E120–E121）',
      },
      {
        source: 'WSAVA 全球牙科指南',
        chapter: '被動式居家照護－寵物食品法規與 VOHC 認證（中文版 E122）',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-DENTAL',
        locator: '居家照护－工具与刷牙方式／牙膏（PDF p.85–86）；VOHC 认证（PDF p.87）',
        note: '牙刷按体型选、不推荐纱布毛巾、电动牙刷的限制、人用牙膏的氟化物与清洁剂风险、VOHC 两类认证',
      },
    ],
    priority: 'HIGH',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-003',
    domain: 'NURSING',
    title: '牙结石与口臭：在家看什么、什么时候要看医生',
    keywords: ['牙结石', '口臭', '牙菌斑', '牙龈出血', '口腔异味', '在家检查'],
    applicableTo: ['nursing', 'dental', 'oral', 'periodontal', 'triage', 'prevention'],
    summary:
      '在家能判断的是"牙龈有没有发炎"，不是"结石有多少"。牙结石本身基本不致病：正常牙龈呈珊瑚粉色、边缘细薄光滑，没有明显菌斑与结石；出现牙龈发红 → 水肿 → 口臭的顺序，说明已经在发炎。更早的信号是刷牙或啃咬时牙龈出血。看到牙龈发红、出血或持续口臭，就应该安排就诊。',
    details: [
      '时间线：牙菌斑在 24 小时内形成，牙结石在 3 天内形成，牙龈炎最早可在 2 周出现 —— 这正是"必须每天刷"的原因。',
      '正常牙龈：珊瑚粉色（可以有正常色素沉着）、边缘细薄、质地光滑规则，牙齿表面没有明显沉积物。',
      '牙龈炎的顺序：先出现牙龈红斑，随后水肿，再出现口臭；在牙龈明显变红之前，刷牙、啃咬或牙周探查时的出血可能已经出现。',
      '结石多不等于病重、结石少不等于没问题：可见的牙结石本身基本不致病；牙龈炎可以发生在没有结石的牙齿上，也可能有大量结石却只有很轻的牙龈炎。因此判断要不要处理，看牙龈炎症程度，不看结石多少。',
      '口臭在兽医牙科里被视为未处理牙痛的间接表现之一，其他还包括牙齿打颤、体重下降、进食习惯改变、精神变差与行为改变。',
      '确诊需要麻醉下的完整口腔检查、牙周探查与牙科 X 光；清醒时能看到的只是其中一部分。',
    ],
    caveats: [
      '不要自己在家刮牙结石：非麻醉洁牙（美容院或自己抠）只是外观改善，不改善口腔与全身健康，还可能造成疼痛、恐惧、出血与感染；洁牙必须由兽医在麻醉下完成并抛光。',
      '口臭也可能来自口腔以外的问题，不要只当口腔问题自行处理。',
      '本条目只提示什么时候该就诊，不判断牙周病分期、不给治疗方案与用药建议。',
    ],
    citations: [
      {
        source: 'WSAVA 全球牙科指南',
        chapter: '牙周疾病的臨床特徵（中文版 E53）、重點整理（中文版 E56）',
      },
      {
        source: 'AAHA 牙科护理指南',
        chapter: 'Addressing Pain（p.15）、Nonanesthetic Scaling of Teeth（p.17）',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-DENTAL',
        locator: '临床特征（PDF p.17）；重点整理（PDF p.23）；居家照护（PDF p.85）',
        note: '菌斑 24 小时、结石 3 天、牙龈炎 2 周；牙龈炎顺序为红斑－水肿－口臭；结石本身非致病',
      },
      {
        sourceId: 'AAHA-DENTAL-2019',
        locator: 'Addressing Pain（p.15）；Nonanesthetic Scaling of Teeth（p.17）',
        note: '口臭等表现提示未处理的牙痛；非麻醉洁牙属美容操作且有风险',
      },
    ],
    priority: 'HIGH',
    questionType: 'TRIAGE',
    riskLevel: 'MEDIUM',
    urgency: 'SOON',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-004',
    domain: 'NURSING',
    title: '耳朵多久清一次：多数时候"能不管就不管"',
    keywords: ['耳朵', '清耳', '洗耳', '耳道', '耳垢', '外耳炎'],
    applicableTo: ['nursing', 'skin', 'prevention', 'otitis'],
    summary:
      '健康耳道多数不需要频繁清洗。家长该做的是把耳廓与耳道开口纳入定期的体表检查（至少每周一次），看有没有红肿、异味、分泌物、抓挠或摇头；真正需要清洗时的频次与方式由兽医按个体决定，没有适用于所有犬的固定间隔，频繁洗耳本身也可能刺激耳道。',
    details: [
      '检查频率：把耳廓、耳道开口、皮肤与被毛放在一起做定期检查，建议至少每周一次 —— 这是家长能做的部分。',
      '健康耳道：耳道是皮肤贴合、相对潮湿的腔道，属于酵母菌等微生物容易增殖的部位之一，所以"保持干爽"比"频繁清洗"更重要。',
      '耳道问题常与潜在过敏相关：外耳道炎在异位性皮炎与食物不良反应的犬中很常见，有些犬甚至只有耳朵症状；慢性或反复发作的耳道问题一定要往回找原因，而不是反复洗耳。',
      '诊断要靠耳镜检查与耳道分泌物压片，这些都需要兽医完成 —— 家长看不到耳道深部，也判断不了耳道里的情况。',
      '需要清洁时，用兽医推荐的耳道清洁产品，按兽医示范的方法与频次做；耳道护理产品的选择与使用时长由兽医决定，不建议长期自行使用。',
      '把耳朵写进记录：出现异常的日期、耳朵（单侧/双侧）、看到的分泌物颜色与气味、犬的反应，就诊时一并提供给兽医。',
    ],
    caveats: [
      '出现异味、黄褐色分泌物、耳道红肿、频繁摇头抓耳、耳廓肿胀或头歪，应尽快就医，不要先在家洗几天看看。',
      '不要用棉签、挖耳勺等物品伸进耳道深部；犬耳道不是直的，深部操作容易造成损伤，也可能把分泌物推向更深处。',
      '不要往耳道里滴人用滴耳液、酒精、双氧水或精油；耳道用药必须由兽医决定。',
    ],
    citations: [
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'Principles of Wellness－Principles of Dermatology（2025，p.8）',
      },
      {
        source: '小动物临床营养学（第 5 版）',
        chapter: '第 31 章 食物不良反应－马拉色菌与耳道、外耳炎的诊断',
      },
      {
        source: 'AAHA 老年犬猫护理指南',
        chapter: 'Your Senior Pet From Head to Toe：Inner and Outer Ear Flaps, Skin, Fur（Home Monitoring Tips p.3–4）',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'Principles of Wellness 2025－Principles of Dermatology（p.8）',
        note: '皮肤与被毛需定期（如每周）检查；异常应交兽医；处理须用兽医许可产品并遵兽医建议',
      },
      {
        sourceId: 'SACN5',
        locator: '第 31 章 食物不良反应－马拉色菌皮炎、外耳炎',
        note: '耳道属于潮湿贴合皮肤面；外耳炎常与潜在过敏相关，诊断靠耳镜与分泌物压片',
      },
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Home Monitoring Tips：Inner and Outer Ear Flaps, Skin, Fur, Nails, and Nail Beds',
        note: '把耳廓与皮肤变化列为需要联系兽医的信号',
      },
    ],
    priority: 'HIGH',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-005',
    domain: 'NURSING',
    title: '清耳手法与边界：什么时候绝对不能自己掏',
    keywords: ['清耳手法', '掏耳朵', '棉签', '耳道损伤', '洗耳', '耳朵护理'],
    applicableTo: ['nursing', 'skin', 'safe', 'otitis', 'prevention'],
    summary:
      '家庭能安全做的只有外耳廓与耳道开口可见部分的清洁；耳道深部的清理、冲洗与用药都必须由兽医完成。出现疼痛（碰耳就躲或叫）、耳道红肿、脓性分泌物、明显异味、频繁摇头抓耳时，不要自己掏耳，也不要往耳道里滴任何液体。',
    details: [
      '只清洁看得见的部分：用兽医推荐的清洁液润湿棉片或纱布，轻轻擦拭耳廓内侧与耳道开口周围，擦完保持干燥。',
      '不要用棉签、挖耳勺、发卡等硬物进入耳道：犬耳道分为垂直与水平两段，硬物进去既看不到深部，也容易划伤耳道、把污物推向深处。',
      '深部冲洗不是家庭项目：鼓膜是否完整、耳道是否被分泌物堵住，家长判断不了，因此耳道深部冲洗与用药要由兽医先评估、再操作。',
      '兽医诊断耳道问题靠耳镜检查与耳道分泌物压片，这本身也说明深部处理是专业操作。',
      '如果兽医开了耳道用药，按医嘱完成整个疗程；症状一好转就停药容易反复，也容易让后续判断更困难。',
      '清洁后观察：擦出来的分泌物是什么颜色、有没有异味、犬是否抗拒，都是就诊时对兽医有用的信息。',
    ],
    caveats: [
      '任何情况下都不要往耳道里灌人用滴耳液、酒精、双氧水、精油或"偏方"液体。',
      '突然出现头歪、转圈、眼球震颤等表现，属于需要立即就医的信号（AAHA 老年护理指南把前庭与神经类表现列为立即就医），不要在家观察。',
      '本条目只写护理边界与操作原则，不写耳道用药、剂量与具体产品；需要时请让兽医现场示范一次再回家做。',
    ],
    citations: [
      {
        source: '小动物临床营养学（第 5 版）',
        chapter: '第 31 章 食物不良反应－外耳炎的诊断（耳镜检查与耳道分泌物压片）',
      },
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'Principles of Wellness－Principles of Dermatology（2025，p.8）',
      },
      {
        source: 'AAHA 老年犬猫护理指南',
        chapter: 'Home Monitoring Tips：Brain, Spinal Cord, and Nervous System（Seek immediate veterinary care）',
      },
    ],
    sources: [
      {
        sourceId: 'SACN5',
        locator: '第 31 章 食物不良反应－耳道属于潮湿贴合皮肤面、外耳炎诊断',
        note: '耳道深部检查与分泌物判读需要专业器械与显微镜',
      },
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'Principles of Wellness 2025－Principles of Dermatology（p.8）',
        note: '皮肤与被毛异常的处理必须使用兽医许可产品并遵兽医建议',
      },
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Home Monitoring Tips：Brain, Spinal Cord, and Nervous System',
        note: '前庭/神经表现属于立即就医信号',
      },
    ],
    priority: 'HIGH',
    questionType: 'SAFETY',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-006',
    domain: 'NURSING',
    title: '洗澡频率没有统一答案：先别洗太勤',
    keywords: ['洗澡', '洗澡频率', '洗浴', '犬种差异', '皮肤屏障', '浴液'],
    applicableTo: ['nursing', 'skin', 'coat', 'prevention'],
    summary:
      '洗澡频率取决于品种、被毛类型、皮肤状况与生活方式，没有统一答案；总原则是不要洗得太勤 —— 不必要的频繁洗澡会伤害被毛与皮肤，合适的间隔应与兽医讨论后确定。洗澡只是被毛护理的一部分，日常更重要的是规律梳理与检查。',
    details: [
      '过度洗澡可能有害：被毛与皮肤的清洁护理（梳毛、洗澡、修剪）需求随物种与品种不同，不必要的频繁洗澡会伤害被毛和/或皮肤；因此合适的间隔应由兽医按个体给出。',
      '犬种与被毛类型是频率差异的主要原因：被毛长短、是否持续生长、是否集中换毛，决定了打理方式与频次，不能照搬别的犬的做法。',
      '洗澡只是其中一环：日常护理还包括规律梳理、修剪与体表检查；只靠洗澡解决不了皮肤与被毛问题。',
      '用犬用的洗护产品：动物的皮肤与被毛需求与人有差异，人的洗护产品不是按犬的皮肤特点设计的。',
      '皮肤有问题时：按兽医指定的洗护产品与频次执行，不要自行加频次或换产品。',
      '每次洗后都要彻底擦干与吹干，尤其是耳道口、腋下、腹股沟、趾间和皮肤褶皱处，这些是潮湿后容易出问题的部位。',
    ],
    caveats: [
      '皮肤已经发红、脱毛、结痂、有异味，或犬频繁抓挠时，不要靠"多洗几次"解决，先就医明确原因。',
      '本条目不给"几天洗一次"的通用数字：频率必须结合品种、被毛、皮肤状况与兽医建议。',
      '涉及洗护产品只讲选择原则（犬用、温和、按被毛类型），不推荐具体品牌；药用洗护产品的使用频次与疗程遵医嘱。',
    ],
    citations: [
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'Principles of Wellness－At Home：Skin and Coat Care（2025，p.5）',
      },
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'Principles of Wellness－Principles of Dermatology（2025，p.8）',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'Principles of Wellness 2025－Skin and Coat Care（p.5）、Principles of Dermatology（p.8）',
        note: '洗澡频率应与兽医讨论；不必要或过度的洗澡会伤害被毛与皮肤；犬猫需求不同',
      },
    ],
    priority: 'MEDIUM',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-007',
    domain: 'NURSING',
    title: '洗完必须吹干：潮湿是皮肤问题的帮凶',
    keywords: ['吹干', '洗完澡', '潮湿', '趾间', '皮肤褶皱', '耳道进水'],
    applicableTo: ['nursing', 'skin', 'coat', 'prevention'],
    summary:
      '潮湿是皮肤问题的帮凶：酵母菌等微生物容易在潮湿、皮肤互相贴合的部位的增殖，耳道、腋下、腹股沟、趾间与皮肤褶皱正属于这类部位。所以洗澡、淋雨、游泳或踩水之后，要把这些地方彻底擦干、吹干，而不只是把表面被毛吹到不滴水。',
    details: [
      '重点部位：耳道口周围、腋下、腹股沟、趾间、皮肤褶皱、尾根下方 —— 共同点是贴合、通风差、容易存水。',
      '只吹表面不够：被毛厚、双层毛或卷毛的犬，外层干了内层还湿。可以先用毛巾按压吸水，再用手拨开被毛分区域吹干。',
      '吹风机的距离与温度要控制，避免烫伤皮肤；噪音可能让犬恐惧，建议从幼年开始用短时间、给奖励的方式做脱敏。',
      '外出遇到雨天、泥地、草地活动后，同样建议清洁脚掌并彻底擦干趾间。',
      '潮湿也与足垫与趾间的问题相关；发现犬频繁舔脚，往往说明该区域不舒服，需要检查与记录。',
      '环境温度：犬需要能避寒、避热、避潮湿的环境（属于基本福利需求）；洗完澡后不要把湿着被毛的犬留在闷热不通风的地方。',
    ],
    caveats: [
      '洗后或潮湿后出现持续抓挠、皮肤发红、耳道异味、趾间红肿或频繁舔咬，应尽快就医，不要反复清洗。',
      '本条目不含任何洗护产品、药物或烘干设备推荐；皮肤已有异常时用什么产品由兽医决定。',
      '吹风设备属于电器，不要在人离开时留在犬身边；也不要把用于人的加热垫给犬使用或无人看管地使用（见老年犬卧床护理条目）。',
    ],
    citations: [
      {
        source: '小动物临床营养学（第 5 版）',
        chapter: '第 31 章 食物不良反应－马拉色菌皮炎：潮湿、贴合的皮肤面',
      },
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'Principles of Wellness－Principles of Dermatology（2025，p.8）',
      },
      {
        source: 'WSAVA 动物福利指南',
        chapter: 'The need for a suitable environment（2018，p.36）',
      },
    ],
    sources: [
      {
        sourceId: 'SACN5',
        locator: '第 31 章 食物不良反应－马拉色菌皮炎',
        note: '酵母菌等微生物易在潮湿、皮肤互相贴合的唇褶/鼻褶/趾间/腋下/腹股沟/耳道增殖',
      },
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'Principles of Wellness 2025－Principles of Dermatology（p.8）',
        note: '被毛与皮肤的定期清洁护理；异常交兽医评估',
      },
      {
        sourceId: 'WSAVA-WELFARE',
        locator: 'The need for a suitable environment（p.36）',
        note: '环境需能避免极端温度、穿堂风、潮湿等不适挑战',
      },
    ],
    priority: 'MEDIUM',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-008',
    domain: 'NURSING',
    title: '被毛梳理：双层毛、长毛、卷毛犬的差别',
    keywords: ['梳毛', '被毛', '双层毛', '长毛犬', '卷毛犬', '换毛'],
    applicableTo: ['nursing', 'coat', 'skin', 'prevention', 'breed'],
    summary:
      '梳理不只是为了好看，更是检查皮肤的机会。被毛类型决定重点：长毛犬的皮肤问题容易被毛盖住，必须拨开被毛看皮肤；持续生长型（如贵宾、雪纳瑞）毛发几乎不停生长，需要定期修剪与梳理，否则容易打结；北欧类等静止期长的品种换毛集中，换毛期需要更勤地梳理。',
    details: [
      '品种差异有生理基础：犬的毛囊生长周期分生长期、退行期与静止期，周期长短是品种特异的 —— 贵宾、雪纳瑞等属于生长期主导，毛发几乎持续生长；北欧类品种静止期更长，靠厚被毛保暖，被毛集中脱落。',
      '长毛犬：做任何检查都要特别注意被毛下面的皮肤，问题藏在毛下不容易被看到。',
      '卷毛与长毛犬的结团：打结会牵拉皮肤、藏污纳垢，也会掩盖皮肤病；发现打结不要硬扯，必要时请专业美容师处理。',
      '换毛：季节性换毛是正常现象，但掉毛量突然明显增加、出现局部秃斑，不属于正常换毛，需要就医。',
      '把梳理当成每周体检：至少每周一次从头到尾看一遍皮肤与被毛 —— 有没有脱毛、红肿、皮屑、结痂、寄生虫、肿块、异味、油腻感，发现异常交给兽医判断。',
      '梳理时的脱敏：从幼年开始短时间、给奖励地做，不要按倒强梳；愿意配合的犬，后续修剪、吹风、检查都会容易得多。',
    ],
    caveats: [
      '修剪方式、修剪频率与是否适合剃短，按品种与季节咨询兽医或专业美容师，不要照搬其他犬的做法。',
      '皮肤异常的处理要使用兽医许可的产品并遵兽医建议；不要自行长期使用药浴或人用护发产品。',
      '一旦出现打结贴皮、皮肤破溃、异味或明显疼痛，先就医或找专业美容师，不要在家硬剪。',
    ],
    citations: [
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'Principles of Wellness－Principles of Dermatology：Additional Guidance（2025，p.8）',
      },
      {
        source: '小动物临床营养学（第 5 版）',
        chapter: '第 32 章 犬猫皮肤与毛发疾病－Box 32-1 毛囊结构与毛发周期',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'Principles of Wellness 2025－Principles of Dermatology（p.8）',
        note: '长毛动物需注意被毛下的皮肤；换毛差异（如贵宾较少掉毛）；特殊被毛需更频繁检查',
      },
      {
        sourceId: 'SACN5',
        locator: '第 32 章－Box 32-1 毛囊结构与毛发周期',
        note: '毛囊周期为品种特异：贵宾/雪纳瑞生长期主导，北欧品种静止期更长',
      },
    ],
    priority: 'MEDIUM',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-009',
    domain: 'NURSING',
    title: '剪指甲：按长度而不是按天数，血线看不清就别硬剪',
    keywords: ['剪指甲', '指甲', '血线', '狼趾', '趾甲过长', '指甲修剪'],
    applicableTo: ['nursing', 'senior', 'geriatric', 'safe', 'prevention', 'older-dog'],
    summary:
      '修剪频率按"长度"决定，而不是按固定天数：标准是指甲不影响站立与行走、不卷曲扎进肉垫。指甲内部有血管与神经（血线），剪过头会出血疼痛；深色指甲看不清血线时，每次只剪极小一段、分次完成，没有把握就交给兽医或专业美容师。',
    details: [
      '判断标准（不靠天数）：指甲不应长到卷曲扎进肉垫；站立时不应顶住地面、改变趾部姿势；狼趾（悬趾）最容易长到卷进肉垫，需要单独检查。',
      '检查节奏：把指甲长度、指甲与甲床外观纳入定期的体表检查（建议至少每周一次）；老年犬尤其要留意指甲与甲床的变化，这属于需要联系兽医的信号之一。',
      '深色指甲：看不到血线时，建议每次只剪极小一段、分几次完成，让指甲逐步缩短；不要为了"一次剪到位"冒险。',
      '工具与手法：用锋利的专用指甲剪，剪切时避免扭转或挤压指甲（会造成疼痛与甲裂）；少量多次比一次剪太多安全。',
      '需要协助的情况：老年犬、关节疼痛或行动不便的犬，剪指甲需要更稳的支撑与更短的单次时间，必要时请兽医或美容师协助。',
      '记录：指甲多久需要剪一次、哪一只（尤其是狼趾）长得特别快或形状异常，就诊时告诉兽医。',
    ],
    caveats: [
      '剪出血时先按压止血并保持清洁；出血不止、指甲劈裂、甲床红肿或有分泌物，应尽快就医。',
      '有关节疾病、凝血异常或甲床疾病的犬，修剪方式与频率请先咨询兽医。',
      '本条目不涉及任何止血药、镇静或麻醉用药；用药请遵医嘱。',
    ],
    citations: [
      {
        source: 'AAHA 老年犬猫护理指南',
        chapter: 'Your Senior Pet From Head to Toe：Nails, Nail Beds（Home Monitoring Tips p.3–4）',
      },
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'Principles of Wellness－Principles of Dermatology（2025，p.8）',
      },
    ],
    sources: [
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Home Monitoring Tips：Inner and Outer Ear Flaps, Skin, Fur, Nails, and Nail Beds',
        note: '定期修剪并监测指甲长度；确保指甲没有卷进肉垫；特别注意狼趾；指甲与甲床变化需联系兽医',
      },
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'Principles of Wellness 2025－Principles of Dermatology（p.8）',
        note: '皮肤与被毛／体表应定期（如每周）检查，异常由兽医处理',
      },
    ],
    priority: 'HIGH',
    questionType: 'SAFETY',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-010',
    domain: 'NURSING',
    title: '指甲过长对步态的影响：别把变化都当成"老了"',
    keywords: ['趾甲过长', '步态', '走路姿势', '拖脚', '起立困难', '关节负担'],
    applicableTo: ['nursing', 'senior', 'geriatric', 'joint', 'arthritis', 'prevention', 'older-dog'],
    summary:
      '指甲过长会改变脚掌着地方式与步态。家长能观察到的相关信号包括：走路拖着后脚、指甲在地面刮擦、上下楼梯或跳上车犹豫、起身僵硬、活动量下降。这些信号既可能来自指甲过长，也可能来自关节或神经问题，因此不要只在家剪指甲了事。',
    details: [
      '观察信号：指甲拖地或刮地、拖脚、上下楼梯犹豫、跳上沙发或车犹豫、起身僵硬、走一会儿就停下、不愿散步。',
      '指甲卷进肉垫会直接造成疼痛与局部损伤；指甲过长也会让趾部在站立时着力点改变。',
      '不要默认"只是老了"：行动能力变化、拖脚、指甲刮擦，在老年犬的居家监测清单里都属于需要联系兽医的信号。',
      '关节疼痛与活动量互相影响：疼痛让活动减少，体重上升又加重关节负担，因此体重与体况管理和步态问题是同一件事的一部分。',
      '在家做的两件事：定期检查并按需修剪指甲（见指甲修剪条目）；记录步态与活动量的变化（发生时间、场景、频率），就诊时带给兽医。',
      '走滑的地面会让步态问题更明显：观察犬在瓷砖、木地板与防滑垫上的差别，也是环境改造的依据（见防滑与环境改造条目）。',
    ],
    caveats: [
      '出现持续跛行、拖脚、起立困难或不愿走动，应尽快就医；这些不是靠剪指甲就能解决的问题。',
      '不要把"指甲过长"当成跛行的唯一解释：关节、神经与甲床问题都需要兽医评估。',
      '本条目只讲观察与护理，不做诊断，也不给任何止痛或关节用药建议。',
    ],
    citations: [
      {
        source: 'AAHA 老年犬猫护理指南',
        chapter: 'Home Monitoring Tips：Muscles, Joints, and Bones；Brain, Spinal Cord, and Nervous System',
      },
      {
        source: '小动物临床营养学（第 5 版）',
        chapter: '第 34 章 骨关节炎－疼痛、活动与体重控制',
      },
    ],
    sources: [
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Home Monitoring Tips：Muscles, Joints, and Bones／Brain, Spinal Cord, and Nervous System',
        note: '拖脚、指甲刮擦、上下楼梯困难、起立僵硬、活动减少均属需要联系兽医的信号',
      },
      {
        sourceId: 'SACN5',
        locator: '第 34 章 骨关节炎－活动能力与体重控制',
        note: '行动能力下降常被误认为单纯老化；活动减少与体重上升相互加重关节负担',
      },
    ],
    priority: 'MEDIUM',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-011',
    domain: 'NURSING',
    title: '足垫与趾间护理：最容易被忽略的高发区',
    keywords: ['足垫', '趾间', '脚掌', '舔脚', '趾间红肿', '肉垫'],
    applicableTo: ['nursing', 'skin', 'prevention', 'dermatitis', 'itching'],
    summary:
      '足垫与趾间是"接触与摩擦最多、又容易存水"的部位，属于皮肤问题的高发区。日常要做的就是三件事：定期看（有没有红肿、脱毛、破皮、异味、分泌物）、保持干爽、外出后清洁并擦干；发现犬频繁舔脚、走路不敢着地或趾间有异味，应尽快就医。',
    details: [
      '为什么容易出问题：脚垫是持续承受接触与摩擦的部位；趾间属于皮肤互相贴合、潮湿的区域，是酵母菌等微生物容易增殖的地方。',
      '定期检查：把指甲、甲床与趾间放在一起检查（兽医体检里也专门强调不要漏掉这些位置），看有没有红肿、脱毛、破皮、结痂、异味、褐色或黄白色分泌物。',
      '舔脚与啃脚：频繁舔脚、啃脚趾是家长能发现的最早线索之一，不要当成"爱干净"。',
      '外出后护理：雨天、泥地、草地活动后，用清水或温和的方式把脚掌洗干净并彻底擦干，尤其是趾间。',
      '环境因素：高温路面与冬季化雪用的融雪剂都可能刺激或损伤足垫，外出前后检查脚掌是常规预防做法；具体防护产品与做法可咨询兽医（这部分为一般性预防建议）。',
      '记录：哪只脚、什么时间开始、是否与散步路线或季节相关、有没有用过什么产品 —— 这些信息对兽医很有价值。',
    ],
    caveats: [
      '持续舔脚、跛行、趾间红肿或破溃、异味、分泌物、脚垫开裂出血，应尽快就医；不要自行涂人用药膏或长期泡脚。',
      '脚垫与趾间的皮肤问题常与过敏、寄生虫或环境因素相关，需要由兽医找原因，而不是反复清洗。',
      '本条目不给路面温度判断标准、不给任何护足或药浴产品品牌与剂量建议。',
    ],
    citations: [
      {
        source: '小动物临床营养学（第 5 版）',
        chapter: '第 31 章 食物不良反应－潮湿贴合皮肤面；第 32 章 犬猫皮肤与毛发疾病－脚垫病变',
      },
      {
        source: 'AAHA 老年犬猫护理指南',
        chapter: 'Table 2 Integument：Do not forget nails, nail beds, and interdigital spaces（p.2）',
      },
    ],
    sources: [
      {
        sourceId: 'SACN5',
        locator: '第 31 章（趾间等贴合皮肤面易增殖微生物）；第 32 章（脚垫是接触与摩擦、易受损部位）',
        note: '趾间潮湿与脚垫摩擦是皮肤问题的常见背景',
      },
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Table 2 Integument（p.2）；Home Monitoring Tips：Nails, Nail Beds',
        note: '体检与居家检查都不要漏掉指甲、甲床与趾间',
      },
    ],
    priority: 'MEDIUM',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-012',
    domain: 'NURSING',
    title: '眼周清洁与泪痕：只做清洁和观察，别乱滴东西',
    keywords: ['眼周', '泪痕', '眼屎', '眼部清洁', '眼部分泌物', '眼睛发红'],
    applicableTo: ['nursing', 'skin', 'prevention'],
    summary:
      '眼周日常护理只有两件事：轻柔清洁与观察变化。用干净的湿棉片或纱布从内眼角向外擦拭眼周毛发与皮肤，动作要轻，不要碰到眼球；不使用人用眼药水或刺激性清洁剂。泪痕本身不等于疾病，但持续加重或分泌物性状改变时需要就医。',
    details: [
      '清洁方法：用温水或生理盐水润湿棉片或纱布，从内向外单向擦拭眼周；一块只擦一次，不要来回蹭；擦完保持干燥。',
      '观察重点：分泌物的量与性状（清亮、黏稠、脓性）、颜色，是只在早晨少量还是全天都有；结膜是否发红；是否眯眼、畏光、频繁用爪子洗脸或在地毯上蹭脸。',
      '泪痕与毛色变化：被毛出现异常色素沉着时，需要考虑多种可能原因，包括唾液或泪液染色这类外部来源，以及营养、内分泌等因素，应由兽医判断。',
      '长毛犬：眼周毛发会遮挡视线与皮肤，检查时要拨开看，必要时请专业美容师修剪眼周毛发（不要自己用剪刀贴近眼球操作）。',
      '处理原则：皮肤与被毛的异常应使用兽医许可的产品并遵兽医建议；不要自行给犬使用人用滴眼液、眼膏或"去泪痕"类保健品。',
      '记录：出现时间、单侧还是双侧、分泌物的样子（最好拍照）、近期饮食与环境变化，就诊时提供给兽医。',
    ],
    caveats: [
      '出现脓性分泌物、眼睛红肿睁不开、角膜发白或浑浊、频繁抓眼、视力异常，应尽快就医，不要等。',
      '泪痕的原因很多（泪液排出、眼睑结构、毛发刺激、过敏、环境刺激等），需要兽医判断，本条目不做诊断。',
      '也不要把泪痕只当外观问题，长期只靠清洁产品处理而忽视潜在原因。',
    ],
    citations: [
      {
        source: '小动物临床营养学（第 5 版）',
        chapter: '第 32 章 犬猫皮肤与毛发疾病－被毛色素异常与外部来源（唾液染色等）',
      },
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'Principles of Wellness－Principles of Dermatology（2025，p.8）',
      },
    ],
    sources: [
      {
        sourceId: 'SACN5',
        locator: '第 32 章 犬猫皮肤与毛发疾病－毛发色素异常的外部来源与鉴别考虑',
        note: '被毛颜色异常需考虑唾液/泪液染色等外部来源，也需排除营养与内分泌因素',
      },
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'Principles of Wellness 2025－Principles of Dermatology（p.8）',
        note: '皮肤被毛需定期检查，异常由兽医评估；处理须用兽医许可产品',
      },
    ],
    priority: 'MEDIUM',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-013',
    domain: 'NURSING',
    title: '皮肤褶皱犬的褶皱护理：清洁之后必须弄干',
    keywords: ['皮肤褶皱', '褶皱护理', '巴哥', '法斗', '沙皮', '褶皱清洁'],
    applicableTo: ['nursing', 'skin', 'prevention', 'dermatitis', 'breed', 'itching'],
    summary:
      '皮肤褶皱（唇褶、鼻褶等皮肤互相贴合的缝隙）潮湿、通风差，是酵母菌等微生物容易增殖的部位。面部褶皱多的犬需要更频繁的检查与护理：清洁褶皱内部之后**一定要把水分弄干**，只清洁不擦干等于给微生物创造环境；发现发红、异味、分泌物或犬频繁蹭脸抓脸，就要找兽医。',
    details: [
      '为什么褶皱容易出问题：微生物容易在潮湿、皮肤互相贴合的部位增殖 —— 唇褶、鼻褶、趾间、腋下、腹股沟、耳道都属于这一类。',
      '品种差异：有特殊皮肤或被毛结构的犬（例如褶皱多的品种）可能需要更频繁的检查与护理，具体频率可以让兽医按个体指导。',
      '清洁与干燥：用清水或兽医推荐的方式清洁褶皱内部，再用干燥的棉片或纱布把水分吸干；缝隙里的水分不弄干，护理等于白做。',
      '观察要点：褶皱内皮肤发红、颜色变深、有异味、有褐色或黄白色分泌物，犬频繁蹭脸、用爪子抓脸或抗拒被碰脸。',
      '找原因：褶皱内的皮肤问题常与过敏、食物不良反应等潜在原因相关，反复发作时要请兽医找原因，而不只是反复清洁。',
      '把褶皱纳入每周检查：面部褶皱、唇褶、尾根与趾间一起看，发现变化拍照记录，便于比较进展。',
    ],
    caveats: [
      '不要在褶皱里长期自行使用药膏、粉剂或人用护肤品；需要用产品时由兽医选择。',
      '出现明显疼痛（碰脸就躲或叫）、破溃、渗液、严重异味，应尽快就医。',
      '环境温度与湿度管理属于基本福利需求（避免极端温度、闷热与潮湿）；如果犬在闷热环境里明显不适，请与兽医讨论护理与活动安排。',
    ],
    citations: [
      {
        source: '小动物临床营养学（第 5 版）',
        chapter: '第 31 章 食物不良反应－马拉色菌皮炎：唇褶、鼻褶等贴合皮肤面',
      },
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'Principles of Wellness－Principles of Dermatology：Additional Guidance（2025，p.8）',
      },
      {
        source: 'WSAVA 动物福利指南',
        chapter: 'The need for a suitable environment（2018，p.36）',
      },
    ],
    sources: [
      {
        sourceId: 'SACN5',
        locator: '第 31 章 食物不良反应－马拉色菌皮炎',
        note: '潮湿、互相贴合的皮肤面（唇褶、鼻褶、趾间、腋下、耳道）是微生物易增殖部位',
      },
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'Principles of Wellness 2025－Principles of Dermatology（p.8）',
        note: '有特殊皮肤或被毛（如皮肤褶皱多）的动物需要更频繁的检查与护理，可由兽医指导',
      },
      {
        sourceId: 'WSAVA-WELFARE',
        locator: 'The need for a suitable environment（p.36）',
        note: '环境需能避免极端温度、潮湿等不适挑战',
      },
    ],
    priority: 'HIGH',
    questionType: 'PREVENTION',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-014',
    domain: 'NURSING',
    title: '肛周与尾部护理：先看排便，再看局部',
    keywords: ['肛周', '肛门', '尾部护理', '排便', '便秘', '蹭屁股'],
    applicableTo: ['nursing', 'triage', 'prevention', 'gi', 'senior'],
    summary:
      '肛周与尾根是容易被忽略的部位。日常护理就是观察排便过程与肛周外观、保持该区域清洁干燥（长毛犬尤其要避免粪便粘附）。排便费力或疼痛、持续便秘、肛周红肿破溃或有分泌物、频繁舔咬该区域，都需要尽快就医。',
    details: [
      '为什么先看排便：肛门囊疾病、肛周瘘、会阴疝等肛周与会阴部问题，常因为排便时疼痛而导致便秘；疼痛让犬憋便，粪便停留更久、水分被吸收更多、越来越干硬，形成恶性循环。关节问题导致排便姿势疼痛时也可能有同样效果。',
      '在家观察：排便姿势与用力程度、是否中途停下或叫、粪便性状（干硬、带血、带黏液）、排便频率；肛周有没有红肿、破溃、分泌物、异味；犬是否频繁舔咬或摩擦该区域。',
      '清洁：长毛犬与尾根下方的被毛容易粘附粪便，需要按兽医或美容师的建议定期修剪或清洁，保持干爽；清洁时动作要轻，避免擦破皮肤。',
      '一起记录：排便情况与食欲、饮水、体重变化放在同一份记录里，就诊时带给兽医。',
      '老年犬：排便费力与便秘被明确列为需要联系兽医的信号，不要长期只靠"多喝水、换粮"自行处理。',
      '复诊节奏：肛周问题的复查频率与检查项目由兽医按情况安排，本条目不给时间表。',
    ],
    caveats: [
      '便秘持续、排便明显疼痛、肛周红肿破溃或有脓性分泌物、频繁舔咬或摩擦肛周，应尽快就医。',
      '不要自行挤压肛门囊：手法不当会造成损伤与感染，是否需要处理、怎么处理由兽医判断。',
      '肛周问题的饮食与用药管理必须由兽医决定，本条目不给药物、剂量或具体纤维用量。',
    ],
    citations: [
      {
        source: '小动物临床营养学（第 5 版）',
        chapter: '第 64 章 便秘与排便障碍－会阴与肛周疾病、风险因素',
      },
      {
        source: 'AAHA 老年犬猫护理指南',
        chapter: 'Home Monitoring Tips：Stomach, Intestines, Liver, and Gall Bladder',
      },
    ],
    sources: [
      {
        sourceId: 'SACN5',
        locator: '第 64 章 便秘与排便障碍－会阴/肛周疾病与便秘的相互影响',
        note: '肛门囊疾病、肛周瘘、会阴疝常因排便疼痛导致便秘与粪便滞留',
      },
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Home Monitoring Tips：Stomach, Intestines, Liver, and Gall Bladder',
        note: '排便疼痛或费力、便秘属于需要联系兽医的信号',
      },
    ],
    priority: 'MEDIUM',
    questionType: 'TRIAGE',
    riskLevel: 'MEDIUM',
    urgency: 'SOON',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-015',
    domain: 'NURSING',
    title: '老年犬卧床护理：减压、干燥、每天查皮肤',
    keywords: ['卧床护理', '压疮', '老年犬', '翻身', '支撑垫', '长期趴卧'],
    applicableTo: ['nursing', 'senior', 'geriatric', 'prevention', 'older-dog', 'osteoarthritis', 'pain'],
    summary:
      '长期卧床或起身困难的犬，护理核心是三件事：减压（合适的支撑垫 + 定时帮助变换姿势）、干燥清洁（尿便污染会加速皮肤损伤）、每天检查皮肤。骨突处是重点观察部位，一旦出现压不褪色的发红、破皮、渗液或异味，就要就医。',
    details: [
      '支撑垫：考虑骨科或记忆棉类的支撑垫，让体重分散而不是压在一点上；垫子要平整、不堆褶，弄湿了立刻更换。',
      '变换姿势：长时间同一姿势受压会增加皮肤受损风险，需要定时帮它换姿势、调整受压部位；具体间隔与体位请让兽医或康复人员按个体情况指导（本条目不给固定数字）。',
      '保持干燥清洁：及时清理尿便，擦干皮肤与被毛；潮湿加污染是皮肤破损的加速器。',
      '每天检查皮肤：掀开被毛看骨突部位与身体两侧，找发红、发紫、破皮、肿胀、异味、渗出；被毛厚的犬要用手完整摸一遍。',
      '温度：可以用加热或降温垫类产品，但不要使用给人设计的加热垫，也不要让犬在无人看管时使用任何加热垫。',
      '搬动与转移：用毛巾或担架式支撑协助起身与转移，避免拽前肢；减少高处跳上跳下，配合防滑与坡道改造（见防滑与环境改造条目）。',
    ],
    caveats: [
      '皮肤出现压不褪色的发红、破溃、渗液、异味或明显疼痛，应尽快就医；压疮一旦形成，家庭护理很难处理。',
      '已经完全不能自主翻身、不能自主排尿排便，或出现呼吸急促、疼痛呻吟，应尽快联系兽医，可能需要住院护理。',
      '本条目不含任何药物、敷料或营养补充剂建议；所有护理方案请由兽医制定。',
    ],
    citations: [
      {
        source: 'AAHA 老年犬猫护理指南',
        chapter: 'Home Monitoring Tips：Muscles, Joints, and Bones；Inner and Outer Ear Flaps, Skin, Fur',
      },
      {
        source: 'WSAVA 动物福利指南',
        chapter: 'The need for a suitable environment（2018，p.36）',
      },
    ],
    sources: [
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Home Monitoring Tips：Muscles, Joints, and Bones（骨科床垫、加热垫警示）；Skin, Fur',
        note: '建议骨科/加热或降温寝具；避免人用加热垫与无人看管使用；皮肤红肿、破损、异味需联系兽医',
      },
      {
        sourceId: 'WSAVA-WELFARE',
        locator: 'The need for a suitable environment（p.36）',
        note: '需提供合适的休息处与寝具，并考虑行动不便等特殊需求；环境不得成为危害',
      },
    ],
    priority: 'HIGH',
    questionType: 'PREVENTION',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-016',
    domain: 'NURSING',
    title: '慢性病犬的居家观察记录：饮水、尿量、体重怎么记',
    keywords: ['居家记录', '饮水量', '尿量', '体重记录', '慢性病监测', '观察日记'],
    applicableTo: ['nursing', 'followup', 'monitoring', 'chronic-disease', 'ckd', 'diabetes', 'senior'],
    summary:
      '居家监测不需要专业设备，关键是固定方法、连续记录：饮水量、排尿情况、体重、食欲、粪便与精神活动。记录的价值在于趋势 —— 单次数字意义有限，连续几周的变化才是兽医调整方案时最需要的信息。',
    details: [
      '饮水量怎么记：用固定的水碗，每天在同一时间加满到同一刻度，记录补充量；多犬家庭要分开记录，否则数据没意义。饮水量受天气、运动与食物含水量影响，记录时顺带写一句当天情况。',
      '排尿怎么记：记录大致次数、每次尿量比平时多还是少、颜色与气味变化；尿垫的更换频率也是一个简单指标。',
      '体重怎么记：同一台秤、同一时间段（建议固定在饭前、排空后）、同一地点；小型犬可以抱着称再减去人的体重。体重与体况评分（BCS）一起记更有意义。',
      '其他固定项目：食欲与进食量、呕吐或腹泻、精神状态与活动量、被毛与皮肤变化、用药与补充剂的实际执行情况（吃了什么、有没有漏）。',
      '记录工具：手机备忘录或一张表格即可，每天一页、项目固定，比事后回忆可靠得多；就诊时把记录带给兽医。',
      '需要更密切监测的阶段：生长发育期、妊娠与哺乳期、老年、患病或正在调整饮食与用药的犬，都比健康成年犬需要更密切的监测。',
    ],
    caveats: [
      '饮水量或排尿明显增多或减少、体重持续下降、食欲明显变差，应尽快就医；不要靠在家里自行调整饮水或饮食来解决。',
      '本条目只讲"怎么记录"，不给"多少算异常"的通用阈值 —— 判断需要结合个体情况、化验结果与兽医意见。',
      '不要因为记录看起来稳定就自行停药或改药；用药调整必须遵医嘱。',
    ],
    citations: [
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'Principles of Wellness－Principles of Nutrition（2025，p.9）：监测饮水量',
      },
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'WSAVA 全球营养准则－营养评估准则：监测（中文版 p.13）',
      },
      {
        source: 'AAHA 老年犬猫护理指南',
        chapter: 'Home Monitoring Tips：Urinary Tract and Kidneys／Endocrine Glands',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'Principles of Wellness 2025－Principles of Nutrition（p.9）；WSAVA 营养评估准则中文版－监测（p.13）',
        note: '应监测饮水量（过多或过少都可能是疾病早期信号）；在家监测项目含食物摄入、BCS 与体重、胃肠表现、整体外观与活动力',
      },
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Home Monitoring Tips：Urinary Tract and Kidneys／Endocrine Glands',
        note: '饮水与排尿增多、体重变化属于需要联系兽医的信号',
      },
    ],
    priority: 'HIGH',
    questionType: 'FOLLOWUP',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-017',
    domain: 'NURSING',
    title: '在家做体况评分（BCS）：靠摸，不靠看',
    keywords: ['体况评分', 'BCS', '触诊', '胖瘦判断', '肋骨', '肌肉状况'],
    applicableTo: ['nursing', 'obese', 'overweight', 'underweight', 'weight-loss', 'weight-gain', 'assessment', 'prevention'],
    summary:
      '体况评分（BCS）评估的是体脂，9 分制的目标通常是 4–5 分。BCS 必须靠看加摸：隔着被毛摸肋骨、腰椎、骨盆与腹部脂肪，中长毛犬尤其要摸。也要单独评估肌肉状况（MCS）—— 超重的犬同样可能有明显肌肉丢失。单次分数只是参考，隔一段时间重复测才有意义。',
    details: [
      '9 分制的锚点：4–5 分＝肋骨容易摸到、脂肪覆盖很少，从上往下能看到腰线，从侧面看腹部上收；7–8 分＝肋骨需要用力甚至很用力才能摸到、腰线消失或几乎看不到、腰部和尾根有明显脂肪堆积（8 分时腹部也不再上收）；1–3 分＝肋骨、腰椎与骨盆骨容易看到或摸到，几乎没有脂肪。',
      '怎么摸：站在犬侧面，双手平贴胸廓两侧轻轻按压摸肋骨，再摸腰椎与骨盆（髂骨翼），最后摸腹部与尾根处的脂肪。中长毛犬必须靠触诊，光看会误判。',
      '数值参考：9 分制 BCS 与体脂率相关，每升高 1 分大致相当于体脂率增加约 5%（AAHA 2021 指南）；原指南另有 BCS 与超重程度的对应表，本条目不逐一列出，以免家长直接套用数字给自己下结论。',
      '也要看肌肉：MCS 分正常、轻度、中度、重度丢失，最早出现在脊柱两侧的肌肉；BCS 与 MCS 不直接相关，必须分开评 —— 超重的犬也可能有明显肌肉丢失，偏瘦的犬也可能肌肉尚可。',
      '评估节奏：健康成年犬定期评估；患病、老年、生长发育期、妊娠哺乳期以及正在减重的犬需要更频繁评估。家长学会评估后，最好由兽医团队核对一次手法。',
      '记录方式：分数 + 日期 + 体重一起记（体重怎么记见居家观察记录条目），就诊时给兽医看趋势。',
    ],
    caveats: [
      '本条目只讲怎么摸、怎么记，不给任何减重或增重方案；体重管理方案由兽医制定。',
      '家长常把目标体况（4–5 分）误认为"太瘦"，这是最常见的误解；拿不准时请兽医现场示范一次。',
      'BCS 低于 4/9 或高于 5/9、肌肉出现任何程度的丢失、体重出现无法解释的变化，都提示需要进一步评估（AAHA 2021），应尽快安排就诊。',
    ],
    citations: [
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'Body Condition Score－Dogs（2025，1–9 分制评分卡）；Muscle Condition Score－Dog',
      },
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'WSAVA 全球营养准则－BCS 与 MCS（中文版 p.4–5）',
      },
      {
        source: 'AAHA 营养与体重管理指南',
        chapter: '2021－BCS 与 MCS 的定义与判读阈值（JAAHA 57(4):155–157）',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'BCS Dog 2025 评分卡；MCS Dog 评分卡；WSAVA 营养评估准则中文版 p.4–5',
        note: '9 分制各级描述；目标 4–5 分、超过 6 分风险升高；BCS 与 MCS 均需触诊且不直接相关',
      },
      {
        sourceId: 'AAHA-2021-NUTRITION',
        locator: 'BCS/MCS 评估（JAAHA 57(4):155–157）',
        note: '9 分制每升 1 分约等于体脂增加约 5%；BCS 低于 4/9 或高于 5/9、MCS 有任何程度丢失、体重出现无法解释的变化都提示需要进一步评估；建议教家长学会评估并由兽医团队核对',
      },
    ],
    priority: 'HIGH',
    questionType: 'INTERPRET',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-018',
    domain: 'NURSING',
    title: '防滑与环境改造：老年犬与术后犬的居家安全',
    keywords: ['防滑', '地垫', '环境改造', '坡道', '术后护理', '老年犬居家'],
    applicableTo: ['nursing', 'prevention', 'senior', 'geriatric', 'joint', 'arthritis', 'surgery'],
    summary:
      '对行动不便的老年犬或术后犬，家里最容易出问题的是地面。核心改造三条：防滑（地垫、地毯、防滑垫）、减台阶（用坡道代替跳上跳下）、易达（水碗、休息处、排便点都在短距离内且不用跨门槛）。',
    details: [
      '地面：瓷砖、木地板等硬质光滑地面对关节疼痛或术后犬是风险；环境设计上应使用防滑材质，垫子要贴地不滑动（可用防滑底垫固定）。',
      '减少跳与跨：沙发、床、车这些跳上跳下的动作最容易受伤；可以用坡道或台阶过渡，或在活动范围内限制它接近高处。',
      '生活资源位置：食物、水、休息处与排便点安排在短距离、无门槛、光线充足的位置；视力或听力下降的犬需要更亮的照明与更明确的位置提示。',
      '温度与休息：提供合适的垫子与遮蔽，避免极端温度、穿堂风与潮湿（基本环境福利需求）。',
      '评估时机：进入老年期、确诊关节疾病、术后恢复期，都应重新看一遍家里的环境，并按个体情况调整。',
      '记录改造效果：改造前后记录活动量、起立速度与走路状态，复诊时告诉兽医，便于判断是否需要进一步干预（如疼痛管理或康复）。',
    ],
    caveats: [
      '术后犬的活动限制（能不能上下楼、能不能跳、是否需要限制活动范围）必须按手术兽医的医嘱执行，本条目不能替代术后医嘱。',
      '环境改造不能替代疼痛管理：如果犬仍然僵硬、不愿走动、夜里不安，需要就医评估疼痛，而不是只加垫子。',
      '本条目不含康复器械与药品推荐；具体器具的选择可咨询兽医或康复人员。',
    ],
    citations: [
      {
        source: 'WSAVA 动物福利指南',
        chapter: 'The need for a suitable environment（2018，p.36）',
      },
      {
        source: 'AAHA 犬生命阶段指南',
        chapter: '2019－Table 2：Environmental adaptations for mobility, sight, and hearing',
      },
      {
        source: 'AAHA 老年犬猫护理指南',
        chapter: 'Home Monitoring Tips：Muscles, Joints, and Bones',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-WELFARE',
        locator: 'The need for a suitable environment（p.36）',
        note: '地面必须防滑；需提供合适的休息处与寝具；行动不便等特殊需求要单独考虑',
      },
      {
        sourceId: 'AAHA-LIFE-STAGE-2019',
        locator: 'Table 2－Environment：evaluate necessary environmental adaptations for mobility, sight, and hearing',
        note: '老年阶段需评估行动、视力与听力相关的环境改造，并注意避开冷热与夜间行走的困难',
      },
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Home Monitoring Tips：Muscles, Joints, and Bones',
        note: '建议骨科寝具与康复评估；行动与起立变化需联系兽医',
      },
    ],
    priority: 'MEDIUM',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-019',
    domain: 'NURSING',
    title: '幼犬到家：基础护理与适应期该建立的习惯',
    keywords: ['幼犬', '刚到家', '适应期', '换粮', '脱敏', '环境安全'],
    applicableTo: ['nursing', 'puppy', 'growth', 'prevention', 'behavior'],
    summary:
      '幼犬到家的头几周，护理重点是把"以后要做一辈子的事"变成习惯：固定作息与排泄点、逐步换粮（7–10 天过渡）、从第一天开始做摸脸摸爪摸耳吹风的脱敏、家里做幼犬安全排查。这个阶段的体验，会影响它一辈子对护理的接受度。',
    details: [
      '换粮：换新食物建议用 7–10 天逐步过渡，边换边观察接受度与大便情况；突然换粮容易引起消化道不适。',
      '从第一天开始的脱敏：摸脸、翻嘴唇、摸爪子与指甲、摸耳朵、摸尾巴、梳毛、听吹风机声音，每天短时间、给奖励、不强迫。',
      '刷牙的起点：让犬适应被触碰嘴巴的训练从到家第一天开始；正式刷牙可以在恒牙长齐后（约 6–7 个月龄）或兽医专业洁牙之后开始。',
      '环境安全：这一阶段要特别留意家里的危险（植物、电线、小物件、异物、高处坠落），幼犬的好奇与啃咬行为需要提前做环境排查。',
      '作息与排泄：固定喂食、排泄与睡眠的时间地点，配合围栏或笼养管理，有助于建立规律；训练以正向奖励为主。',
      '体重与体况：幼犬处于生长阶段，需要定期称重并评估体况；生长过快或过慢都应让兽医评估。',
    ],
    caveats: [
      '疫苗程序、驱虫与外出时间点必须按兽医安排执行，本条目不替代免疫计划（见免疫相关条目）。',
      '幼犬出现呕吐、腹泻、精神差或不吃，应尽快就医；幼犬脱水与低血糖进展快。',
      '社会化不等于"多接触所有犬"：接触对象与场所请按兽医与行为训练师的建议安排。',
    ],
    citations: [
      {
        source: 'AAHA 犬生命阶段指南',
        chapter: '2019－Table 2：Behavior／Environment（Puppy 列）',
      },
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'Principles of Wellness－Principles of Nutrition：换粮 7–10 天（2025，p.10）',
      },
      {
        source: 'WSAVA 全球牙科委员会刷牙工具包',
        chapter: '开始刷牙的时机与训练起点',
      },
    ],
    sources: [
      {
        sourceId: 'AAHA-LIFE-STAGE-2019',
        locator: 'Table 2－Behavior／Environment（Puppy 列）',
        note: '幼犬期需开始社会化与抚摸训练、处理梳洗脱敏需求、注意家居危险与幼犬防护、用围栏/笼养辅助排泄训练',
      },
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'Principles of Wellness 2025－Principles of Nutrition（p.10）',
        note: '换粮应逐步过渡 7–10 天，以观察接受度与耐受',
      },
      {
        sourceId: 'WSAVA-DENTAL',
        locator: 'GDC 刷牙工具包：何时开始刷牙、从第一天开始训练',
        note: '恒牙长出（约 6–7 个月龄）或专业洁牙后开始正式刷牙；适应训练从第一天做起',
      },
    ],
    priority: 'MEDIUM',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
  {
    id: 'nurse-020',
    domain: 'NURSING',
    title: '皮肤与被毛：什么算异常、什么情况要看医生',
    keywords: ['皮肤异常', '掉毛', '瘙痒', '皮肤红肿', '异味', '就医信号'],
    applicableTo: ['nursing', 'skin', 'coat', 'triage', 'red-flag', 'clinical', 'itching', 'pruritus'],
    summary:
      '皮肤与被毛的问题，家长能做的是定期看、记录变化、及时就医。需要联系兽医的信号包括：皮肤发红、肿胀、脱毛、皮屑或结痂、渗出、异味、被毛油腻，指甲与甲床的变化，以及**剧烈或持续加重的瘙痒**（严重瘙痒本身是重大福利问题）。不要长期靠换洗护产品或保健品自行处理。',
    details: [
      '检查节奏：至少每周一次，从头到脚看一遍皮肤与被毛；长毛犬要拨开被毛看皮肤，不能只看毛。',
      '常见异常信号：发红、肿胀、脱毛或秃斑、皮屑或结痂、破溃或渗出、异味、被毛油腻、指甲与甲床变化、局部肿块。',
      '瘙痒：瘙痒明显加重，或严重到影响进食、睡眠与日常活动时，是需要就医的信号 —— 严重瘙痒被视为显著的福利问题，也可能是疼痛性的。',
      '把变化记录下来：发生时间、部位（最好拍照）、变化速度、是否与季节相关、近期饮食/环境/洗护产品的变化、用过什么产品。',
      '处理原则：皮肤与被毛异常的处理应使用兽医许可的产品并遵兽医建议；营养补充（如鱼油类）是否合适也要由兽医按个体判断。',
      '自我梳理减少也是信号：老年犬"不像以前那样打理自己"，属于需要留意并联系兽医的行为变化。',
    ],
    caveats: [
      '出现剧烈瘙痒、大面积脱毛、皮肤破溃或渗出、明显异味、疼痛或精神食欲下降，应尽快就医。',
      '本条目不判断病因（过敏、寄生虫、感染、内分泌等都可能有相似表现），也不给任何用药建议。',
      '不要长期自行使用人用药膏、"激素类"或偏方产品：可能掩盖表现，让后续诊断更困难。',
    ],
    citations: [
      {
        source: 'WSAVA 营养指南与工具包',
        chapter: 'Principles of Wellness－Principles of Dermatology（2025，p.8）',
      },
      {
        source: 'AAHA 老年犬猫护理指南',
        chapter: 'Home Monitoring Tips：Inner and Outer Ear Flaps, Skin, Fur, Nails, and Nail Beds；Muscles, Joints, and Bones',
      },
    ],
    sources: [
      {
        sourceId: 'WSAVA-NUTRITION',
        locator: 'Principles of Wellness 2025－Principles of Dermatology（p.8）',
        note: '皮肤与被毛应定期检查并记录异常；严重瘙痒是重大福利问题；处理须用兽医许可产品并遵兽医建议',
      },
      {
        sourceId: 'AAHA-SENIOR-2023',
        locator: 'Home Monitoring Tips：Skin, Fur, Nails, and Nail Beds；Muscles, Joints, and Bones',
        note: '皮肤发红、肿胀、脱毛、感染、异味、被毛油腻及指甲变化需联系兽医；自我梳理减少也是信号',
      },
    ],
    priority: 'HIGH',
    questionType: 'TRIAGE',
    riskLevel: 'HIGH',
    urgency: 'SOON',
    reviewBy: '2027-04-01',
    reviewStatus: 'PENDING_REVIEW',
  },
];
