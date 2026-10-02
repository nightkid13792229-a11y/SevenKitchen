import type { KnowledgeEntry } from '../types';

/**
 * IMMUNE 领域知识条目（免疫 / 疫苗接种）。
 *
 * 来源：WSAVA 2024 疫苗接种指南（首要依据）、AAHA 2022 犬免疫指南、
 *       《中华人民共和国动物防疫法》与《狂犬病防治技术规范》（国内口径）。
 *
 * ── 三条写作纪律 ──────────────────────────────────────────
 *   1. **只写指南说了的**。本领域涉及"要不要打、什么时候打"，写错会害到狗，
 *      所以每条都标了 locator（章节/表号），便于复核。
 *   2. 全部标 `reviewStatus: 'APPROVED'`（2026-10-02 合作兽医全数通过）——
 *      老板的边界没变：未经专业审核的兽医内容不得对顾客开放，顾客侧只放 APPROVED。
 *      以后新写的条目先写 PENDING_REVIEW；改内容就退回 PENDING_REVIEW。
 *   3. 分诊类（TRIAGE）必须写死 urgency，不让 AI 自己判断有多急。
 *
 * 建立日期：2026-10-01
 */
export const IMMUNE_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'immune-001',
    domain: 'IMMUNE',
    title: '犬的核心疫苗是哪几种：每一只狗都应该接种',
    keywords: ['核心疫苗', 'core vaccine', '犬瘟', '细小', '腺病毒', 'CDV', 'CPV', 'CAV', '疫苗种类'],
    applicableTo: ['vaccine', 'immune', 'all'],
    summary:
      '犬的核心疫苗是预防犬瘟热（CDV）、犬腺病毒（CAV）和犬细小病毒（CPV）的疫苗——WSAVA 明确核心疫苗应接种给每一只狗。狂犬病疫苗在中国属于强制免疫，按国内法规执行。',
    details: [
      '核心疫苗针对的是"全球范围内、发病严重或为人畜共患、且疫苗保护力确切"的病。',
      '非核心疫苗（如钩端螺旋体、犬副流感、博德特氏菌）要结合每只狗的生活方式与当地疫情，逐只评估后再决定，不是默认全打。',
      '狂犬病在国内是强制免疫病种，同时关系犬只登记与出行，按国家与当地规定执行。',
      '疫苗分灭活、弱毒（MLV）、亚单位、载体等类型；类型不同，需要的针次与保护期都不同。',
    ],
    caveats: [
      'WSAVA 指南明确说"这不是一套规则"：各国疫情、可用产品、法规差异很大，要结合本地情况调整。',
      '具体打什么、打几针，最终由执业兽医根据这只狗的情况决定。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'The purpose of WSAVA vaccination guidelines / Different types of vaccine' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: 'Different types of vaccine', note: '核心/非核心疫苗的划分与"每一只狗都该打核心疫苗"的立场' },
      { sourceId: 'CN-EPIDEMIC-LAW', locator: '动物防疫法 · 强制免疫', note: '狂犬病在国内属强制免疫，需犬只免疫证明' },
    ],
    priority: 'HIGH',
    questionType: 'IMMUNE',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-002',
    domain: 'IMMUNE',
    title: '母源抗体：幼犬为什么不能只打一针',
    keywords: ['母源抗体', 'MDA', '初乳', '被动免疫', '幼犬', '首免'],
    applicableTo: ['vaccine', 'immune', 'puppy', 'growth'],
    summary:
      '幼犬通过初乳获得母源抗体（MDA），它在出生后按约 9–10 天的半衰期下降。在 MDA 还高的时候打疫苗，疫苗会被中和、**不会产生主动免疫**——所以幼犬首免要打多次，而不是一针就够。',
    details: [
      'MDA 主要在出生后最初几小时通过初乳获得，提供被动免疫。',
      '多数幼犬在约 8–12 周龄时，MDA 会降到允许主动免疫应答的水平；个体差异很大。',
      'MDA 会同时干扰弱毒疫苗与灭活疫苗：如果第一针灭活疫苗被 MDA 阻断，免疫"启动"就没发生，第二针也补不回来。',
      '因此幼犬首免是**多次、连续**的，每 2–4 周一次——这些针**不是加强针**，目的是在 MDA 降下来的第一时间触发主动免疫。',
      '不推荐给很小的幼犬常规测 MDA：需要血清学检测才能知道窗口何时开、何时关，成本与意义都不划算。',
    ],
    caveats: [
      '每窝之间、同一窝的不同幼犬之间，MDA 水平都不一样，所以"按固定周龄算准了就安全"是不成立的。',
      '在完成首免程序之前，幼犬仍可能被感染，应避免去犬只密集、来源不明的场所。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'Effects of maternally derived antibodies on immunisation' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: 'Effects of maternally derived antibodies on immunisation', note: 'MDA 半衰期、8–12 周、重复针次的目的' },
      { sourceId: 'AAHA-VACC-2022', locator: '幼犬免疫程序', note: '幼犬首免的多次接种安排' },
    ],
    priority: 'HIGH',
    questionType: 'IMMUNE',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-003',
    domain: 'IMMUNE',
    title: '易感窗口期：最危险的那几周',
    keywords: ['易感窗口期', 'window of susceptibility', '空窗期', '幼犬', '感染风险'],
    applicableTo: ['vaccine', 'immune', 'puppy', 'growth'],
    summary:
      '母源抗体已经低到**不足以保护**、却又高到**足以干扰疫苗**，中间这段时间叫"易感窗口期"。此时幼犬既防不住病、又打不上免疫——这是它一生中最危险的一段。',
    details: [
      'MDA 的作用是"保护"和"干扰疫苗"两件事同时存在，只是阈值不同。',
      '当 MDA 低于保护阈值、但高于干扰阈值时，就进入了易感窗口期。',
      '不同幼犬这个窗口开启与关闭的时间都不一样，不测血就无法预测。',
      '这正是"每 2–4 周重复接种"的原因：用多次接种去覆盖窗口关闭的那一刻，把危险期尽量缩短。',
    ],
    caveats: [
      '窗口期的幼犬应避免接触来源不明或未接种的犬只，也避免去犬只聚集场所。',
      '一旦出现精神差、呕吐、腹泻（尤其带血）、食欲废绝，属于急症，应立即就医。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'Effects of maternally derived antibodies on immunisation / Fig 1' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: 'Fig 1 与正文', note: '易感窗口期的定义与重复接种的目的' },
      { sourceId: 'AAHA-VACC-2022', locator: '幼犬免疫程序', note: '易感期与接种间隔' },
    ],
    priority: 'HIGH',
    questionType: 'IMMUNE',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-004',
    domain: 'IMMUNE',
    title: '幼犬首免的推荐时间表',
    keywords: ['首免', '幼犬疫苗', '接种时间', '免疫程序', '6周', '16周', '疫苗计划'],
    applicableTo: ['vaccine', 'immune', 'puppy', 'growth'],
    summary:
      'WSAVA 推荐的幼犬核心疫苗首免程序是：从 6–8 周龄开始，每 2–4 周接种一次，直到 16 周龄或更大。16 周龄那一针很关键——它保证在绝大多数幼犬 MDA 已经消退后至少接种到一次。',
    details: [
      '起始时间：6–8 周龄开始首免。',
      '间隔：每 2–4 周一次（重复针次用于覆盖易感窗口期关闭的时刻）。',
      '结束时间：直到 16 周龄或更大，而不是"打满三针就停"。',
      '在 MDA 已充分消退之后接种的一剂弱毒疫苗，通常一针即可建立免疫。',
      'WSAVA 2024 进一步讨论了"给幼犬在 26 周龄以上再补一针核心疫苗"，而不是等到 12–16 月龄——对首免期间可能被 MDA 干扰的个体，这是更稳的做法。',
      '灭活疫苗（多数）与年龄无关，一般需要至少两针、间隔 2–4 周；完全的保护通常在第二针（或最后一针）之后约 2 周才建立。',
    ],
    caveats: [
      '以上是国际指南的通用建议；国内产品说明书与当地法规可能不同，**以执业兽医给出的方案为准**。',
      '每只狗起始周龄与结束周龄会因品种、窝次、当地疫情而调整。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'Effects of maternally derived antibodies / 26+ weeks 讨论' },
      { source: 'AAHA 犬免疫指南 2022（2024 更新）', chapter: '幼犬免疫程序' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: 'MDA 章节与 Fig 1', note: '6–8 周起、每 2–4 周、至 16 周或更大；26 周龄以上的讨论' },
      { sourceId: 'AAHA-VACC-2022', locator: '幼犬免疫程序', note: '把国际建议落到具体场景' },
    ],
    priority: 'HIGH',
    questionType: 'IMMUNE',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-005',
    domain: 'IMMUNE',
    title: '成年犬的加强免疫：三年一次而不是每年一次',
    keywords: ['加强免疫', '年度疫苗', '三年', 'triennial', '成年犬', '保护期', 'DOI'],
    applicableTo: ['vaccine', 'immune', 'adult'],
    summary:
      '对犬瘟、细小、腺病毒这三种核心疫苗，接种后建立的免疫力可以维持**很多年**（远超 3 年）。WSAVA 因此建议这类核心疫苗的加强间隔为三年或更少频次，而不是每年一针。',
    details: [
      '疫苗说明书上的"保护期 1 年"是注册时的**最低**承诺，不等于免疫力的实际持续时间。',
      '指南基于所有已发表的保护期证据，而不只是厂商提交的最低数据，因此可能建议比说明书更长的间隔。',
      '按指南使用（即偏离说明书）属于"标签外使用"，应由兽医取得主人知情同意并记录在病历里。',
      '狂犬病疫苗的保护期由产品与国家/地区法规决定，国内通常为一年一针，按当地规定执行。',
    ],
    caveats: [
      '并非所有疫苗都适用"三年一次"——非核心疫苗、灭活疫苗的保护期通常更短，要按产品与兽医建议。',
      '所在国家或地区若有法规强制按说明书执行，应以法规为准。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'The purpose of WSAVA vaccination guidelines / Serological testing' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: 'Serological testing 章节', note: 'CDV/CPV/CAV 免疫力可维持多年' },
      { sourceId: 'CN-EPIDEMIC-LAW', locator: '强制免疫与免疫证明', note: '狂犬病按国内法规执行' },
    ],
    priority: 'HIGH',
    questionType: 'IMMUNE',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-006',
    domain: 'IMMUNE',
    title: '抗体检测能代替打疫苗吗',
    keywords: ['抗体检测', '滴度', 'titer', '血清学', '能不能不打', '免疫记忆'],
    applicableTo: ['vaccine', 'immune', 'adult'],
    summary:
      '抗体阳性通常说明有保护，可以据此推迟加强；但**抗体阴性不等于没有保护**——细胞免疫与免疫记忆测不出来。所以抗体检测是"可以少打"的依据，不是"不用打"的依据。',
    details: [
      '对犬瘟、细小、腺病毒，成年犬血清抗体阳性很可能是保护力的可靠指标。',
      '抗体阴性不能可靠地判断易感：检测测不到细胞免疫与先天免疫，很多动物靠免疫记忆仍然受保护。',
      '已接种过但抗体阴性的动物，再接种后通常会出现快速、强烈的回忆应答——说明它本来就受保护。',
      '尽管如此，临床惯例仍把"抗体阴性"作为再接种的指征，属于预防性原则。',
      '想确认幼犬首免是否成功：可在 20 周龄及以后、且距最后一针至少 4 周时采血检测；极少数阴性个体应再接种并复测。',
      '院内快速检测试剂盒的敏感性、特异性差异较大，某些指标（如犬瘟抗体）在急性病或慢性病犬上的可靠性存疑。',
    ],
    caveats: [
      '把抗体检测当成"免打疫苗"的通行证是误读——阴性结果的处理方式仍然是补打。',
      '抗体检测不能替代年度健康检查。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'Serological testing of dogs and cats' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: 'Serological testing 章节', note: '阳性与阴性的解读差异、20 周龄复测、院内试剂盒的局限' },
      { sourceId: 'AAHA-VACC-2022', locator: '抗体检测', note: '滴度检测作为替代方案' },
    ],
    priority: 'MEDIUM',
    questionType: 'IMMUNE',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-007',
    domain: 'IMMUNE',
    title: '老年犬还要不要打疫苗',
    keywords: ['老年犬', '疫苗', 'geriatric', '晚年', '免疫记忆'],
    applicableTo: ['vaccine', 'immune', 'senior', 'geriatric'],
    summary:
      '一辈子按指南接种过来的老年犬，**不需要**额外的强化方案；但研究显示"3 年以上没接种"的老年犬抗体达标率更低，所以老年犬仍建议维持三年一次（或更频繁）的核心疫苗加强。',
    details: [
      '没有多少证据支持"按指南接种到老的犬，晚年需要特殊加强方案"。',
      '多数老年犬对核心弱毒疫苗保有免疫记忆；再接种一剂后能迅速恢复防御。',
      '但老年动物对**从未接触过的新抗原**建立初次免疫应答的能力可能较差。',
      '一项研究里，距上次接种超过 3 年的老年犬，犬瘟与腺病毒抗体达标率低于 1–3 年内接种过的老年犬。',
      '基于这些发现，老年宠物的核心疫苗可以按三年一次、或更频繁一些来安排。',
      '为出行首次接种狂犬疫苗的老年犬，相当一部分达不到法定抗体滴度；年轻动物成功率更高。',
    ],
    caveats: [
      '老年犬是否适合接种，还要看它的实际健康状况；有慢性病或正在用药的应由兽医评估。',
      '老年犬的年度健康检查比疫苗本身更重要——疫苗只是整体预防保健的一部分。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'Vaccines as part of comprehensive preventative health care' },
      { source: 'AAHA 老年犬猫护理指南 2023', chapter: '老年犬的预防保健' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: 'Aged animals 段落', note: '老年犬免疫记忆、>3 年接种者抗体达标率更低、建议三年一次' },
      { sourceId: 'AAHA-SENIOR-2023', locator: '老年护理工具包', note: '老年犬检查节奏' },
    ],
    priority: 'MEDIUM',
    questionType: 'IMMUNE',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-008',
    domain: 'IMMUNE',
    title: '疫苗接种记录该记什么（医生最需要的六项）',
    keywords: ['疫苗记录', '接种记录', '疫苗本', '批号', '记录要素'],
    applicableTo: ['vaccine', 'immune', 'all'],
    summary:
      'WSAVA 要求接种时在病历里记下六项：接种日期、接种人、疫苗名称、批号/序列号、有效期、生产厂商，以及接种部位与途径。出问题时，缺哪一项都很难追。',
    details: [
      '接种日期。',
      '执行接种的人（姓名、缩写或代码）。',
      '疫苗名称、批号或序列号、有效期、生产厂商。',
      '接种的解剖部位与途径。',
      '出现的不良反应要记录成"以后每次就诊都会提醒所有员工"的形式。',
      '标签外使用（按指南而不是说明书）应记录主人的知情同意。',
      'WSAVA 还建议疫苗证书上除接种日期外，写清"预期保护到什么时候"，减少主人与寄养机构的困惑。',
    ],
    caveats: [
      '拍疫苗本照片时，尽量把批号、有效期、厂商这几行拍清楚——这几项最常在照片里糊掉。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'Medical records documentation' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: 'Medical records documentation', note: '六项必记内容与疫苗证书建议' },
    ],
    priority: 'MEDIUM',
    questionType: 'IMMUNE',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-009',
    domain: 'IMMUNE',
    title: '打完疫苗后的不良反应：什么情况要立刻回医院',
    keywords: ['疫苗反应', '过敏', '不良反应', '脸肿', '荨麻疹', '呼吸', '紧急'],
    applicableTo: ['vaccine', 'immune', 'all', 'red-flag'],
    summary:
      '接种后出现**面部肿胀、荨麻疹、呕吐、呼吸困难、虚弱倒地**，属于急性过敏反应，需要**立即**回医院；只有轻微精神差、注射部位小硬结、食欲略降，可以先观察。',
    details: [
      '需要立刻就医的信号：面部或眼睑肿胀、全身起风团、剧烈呕吐或腹泻、呼吸急促或困难、牙龈发白、虚弱站不稳、抽搐。',
      '这些通常发生在接种后数分钟到数小时内，属于急性超敏反应，需要兽医处理。',
      '可以先观察的常见反应：接种当天精神稍差、食欲略降、注射部位有一过性小硬结或轻微疼痛。',
      '这些轻微反应一般 24–48 小时内自行缓解。',
      '发生过不良反应的狗，**下次接种前必须告诉兽医**——病历里应有记录，方案可能要调整。',
    ],
    caveats: [
      '任何拿不准的情况，都不要在家等：先联系接种医院。',
      '本条目只做分诊提示，不判断是不是过敏、也不给用药建议。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'Medical records documentation（不良反应记录要求）' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: 'Any adverse events 段落', note: '不良反应须记录并在后续就诊中提示' },
      { sourceId: 'AAHA-VACC-2022', locator: '疫苗不良反应', note: '不良反应的识别与报告' },
    ],
    priority: 'HIGH',
    questionType: 'TRIAGE',
    riskLevel: 'HIGH',
    urgency: 'IMMEDIATE',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-010',
    domain: 'IMMUNE',
    title: '国内狂犬病免疫与犬只登记的关系',
    keywords: ['狂犬疫苗', '犬证', '登记', '强制免疫', '免疫证明', '国内规定'],
    applicableTo: ['vaccine', 'immune', 'all'],
    summary:
      '狂犬病在我国属于强制免疫病种。犬只需要按国家与当地规定接种狂犬疫苗，并取得免疫证明——这既是防疫要求，也通常与养犬登记、出行、寄养挂钩。',
    details: [
      '《中华人民共和国动物防疫法》确立狂犬病的强制免疫地位，饲养者应履行免疫义务。',
      '农业农村主管部门的狂犬病防治技术规范对免疫程序与记录有具体要求。',
      '各地养犬管理条例会进一步规定登记、免疫证明、芯片等事项，**城市之间差异较大**。',
      '出行（尤其是跨地区、出境）对狂犬抗体滴度可能另有要求，需提前确认。',
    ],
    caveats: [
      '本条目只写国家层面的通用要求；**具体到某个城市以当地规定为准**，建议向当地动物疫病预防控制机构或接种医院确认。',
      '各城市对登记月龄、芯片、禁养犬种的要求不一致，不能按其他城市的规定套用。',
    ],
    citations: [
      { source: '中华人民共和国动物防疫法', chapter: '强制免疫与动物疫病预防' },
      { source: '狂犬病防治技术规范', chapter: '免疫与记录要求' },
    ],
    sources: [
      { sourceId: 'CN-EPIDEMIC-LAW', locator: '强制免疫相关条款', note: '狂犬病强制免疫的法律依据' },
      { sourceId: 'CN-RABIES-TECH', locator: '免疫程序与记录', note: '技术规范层面的要求' },
      { sourceId: 'AAHA-VACC-2022', locator: '狂犬病疫苗', note: '狂犬疫苗的接种要求' },
    ],
    priority: 'HIGH',
    questionType: 'IMMUNE',
    riskLevel: 'HIGH',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-011',
    domain: 'IMMUNE',
    title: '疫苗不只是打针：整体预防保健包含哪些',
    keywords: ['预防保健', '年度体检', '驱虫', '口腔', '营养', '行为', '整体健康'],
    applicableTo: ['vaccine', 'immune', 'all', 'prevention'],
    summary:
      'WSAVA 把疫苗定位成"整体预防保健的一部分"：定期（通常每年）健康检查，加上体内外寄生虫、人畜共患病预防、口腔护理、营养建议与行为评估。只打针不体检，等于只做了一半。',
    details: [
      '个体化方案要围绕年龄、品种、生活方式、环境与出行安排来设计。',
      '年度健康检查是讨论疫苗的场合，同时也是评估寄生虫、口腔、营养与行为的机会。',
      '对某些个体，可能需要比一年更频繁的针对性检查。',
      '疫苗的选择与频次应当"按需要"，而不是固定套餐。',
    ],
    caveats: [
      '不同生命阶段的检查重点不同（幼犬、成年、老年），具体项目由兽医按个体安排。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'Vaccines as part of comprehensive preventative health care' },
      { source: 'AAHA 犬生命阶段指南 2019', chapter: '各生命阶段的预防保健' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: 'Comprehensive preventative health care', note: '疫苗在整体预防保健中的定位' },
      { sourceId: 'AAHA-LIFE-STAGE-2019', locator: '生命阶段检查建议', note: '不同阶段该做什么检查' },
    ],
    priority: 'MEDIUM',
    questionType: 'PREVENTION',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-012',
    domain: 'IMMUNE',
    title: '非核心疫苗怎么决定打不打',
    keywords: ['非核心疫苗', '钩端螺旋体', '副流感', '博德特氏菌', '生活方式', '要不要打'],
    applicableTo: ['vaccine', 'immune', 'all'],
    summary:
      '非核心疫苗（钩端螺旋体、副流感、博德特氏菌等）不是默认全打，而是**按每只狗的生活方式与当地疫情逐只评估**：常去草地积水、常接触其他犬、常寄养或参赛的狗，风险更高。',
    details: [
      'WSAVA 的表述：Selected non-core vaccines may be recommended after careful consideration of each pet’s lifestyle and local prevalence。',
      '判断依据主要是：会不会接触到病原（环境、与其他犬的接触频率、是否寄养/参赛/游泳）。',
      '当地某病的流行情况也是关键——同一支疫苗在不同地区价值完全不同。',
      'AAHA 2022 犬免疫指南对部分疫苗（如钩端螺旋体）的定位有具体建议，可与 WSAVA 对照看。',
    ],
    caveats: [
      '打不打由执业兽医结合个体风险评估决定；本条目只说明决策依据，不给具体结论。',
      '非核心疫苗的保护期通常短于核心疫苗，接种间隔也不同。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'Different types of vaccine / 非核心疫苗' },
      { source: 'AAHA 犬免疫指南 2022（2024 更新）', chapter: '非核心疫苗建议' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: '非核心疫苗段落', note: '按生活方式与地方流行率逐只评估' },
      { sourceId: 'AAHA-VACC-2022', locator: '非核心疫苗', note: '落到具体疫苗的建议' },
    ],
    priority: 'MEDIUM',
    questionType: 'IMMUNE',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-013',
    domain: 'IMMUNE',
    title: '疫苗打晚了 / 漏了一针怎么办',
    keywords: ['漏打', '延迟', '补打', '忘记打疫苗', '重新开始', '疫苗中断'],
    applicableTo: ['vaccine', 'immune', 'all'],
    summary:
      '漏打或延迟时，**通常不需要从头再来**：成年犬补一针核心疫苗即可恢复防御（免疫记忆会带来快速应答）。幼犬首免期间漏针，则要看它当时多大、漏的是第几针，由兽医决定怎么补。',
    details: [
      '成年犬此前完成过完整首免：免疫记忆通常长期存在，补一针后能迅速恢复保护。',
      '成年犬超期较久（多年未接种）也可按"补一针"处理，不必重启整个程序。',
      '幼犬首免中途断掉：关键是"最后一次接种时它多大"——若当时已 ≥16 周龄，那一针很可能已经建立免疫；若还小，则需继续补足到 16 周龄以后。',
      '没有把握时，可以考虑做抗体检测来判断是否已有保护。',
    ],
    caveats: [
      '补打的具体安排（打几针、间隔多久）由执业兽医决定；本条目只说明"通常不必从头再来"这个原则。',
      '漏打期间如果接触过病犬或出现症状，应尽快就医而不是等补针。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'Serological testing / MDA 章节' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: '免疫记忆与回忆应答段落', note: '成年犬补一针即可恢复防御；幼犬看最后接种时的周龄' },
    ],
    priority: 'MEDIUM',
    questionType: 'IMMUNE',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-014',
    domain: 'IMMUNE',
    title: '接种部位与途径为什么要记录',
    keywords: ['接种部位', '皮下', '肌肉', '途径', '注射位置'],
    applicableTo: ['vaccine', 'immune', 'all'],
    summary:
      'WSAVA 要求记录接种的**解剖部位与途径**。原因很实际：日后该部位出现肿块、或需要判断某次反应与哪一针有关时，这个信息是唯一的线索。',
    details: [
      '记录内容包括注射的解剖位置（如左后肢、右肩胛间）与途径（皮下、肌肉、鼻内等）。',
      '这是疫苗病历六项必记内容之一，与日期、接种人、疫苗名/批号/有效期/厂商并列。',
      '部分国家/地区对接种部位另有规范要求，按当地执行。',
    ],
    caveats: [
      '接种部位日后出现**持续存在或逐渐变大的肿块**，应尽快让兽医检查——不要在家观察太久。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'Medical records documentation' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: 'Medical records documentation', note: '接种部位与途径属必记项' },
    ],
    priority: 'LOW',
    questionType: 'IMMUNE',
    riskLevel: 'MEDIUM',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
  {
    id: 'immune-015',
    domain: 'IMMUNE',
    title: '接种部位出现肿块：什么时候要看医生',
    keywords: ['接种部位肿块', '注射后硬结', '肿物', '包块', 'red-flag'],
    applicableTo: ['vaccine', 'immune', 'all', 'red-flag'],
    summary:
      '接种后注射部位出现**一过性小硬结**、且 1–2 周内自行变小，可以先观察；如果肿块**持续超过 1 个月、或还在变大**，应尽快就医检查。',
    details: [
      '常见的一过性反应：注射局部轻度肿胀或小硬结，伴轻微触痛，多在短期内缓解。',
      '需要就医的情况：肿块持续存在不消、逐渐增大、表面破溃、动物因疼痛抗拒触碰该部位。',
      '就医时把**接种日期、疫苗名称与批号**一起告诉兽医——这正是疫苗记录那六项存在的意义。',
    ],
    caveats: [
      '本条目只做分诊提示，不判断肿块性质。',
      '任何持续存在或增大的肿块都应由兽医触诊评估。',
    ],
    citations: [
      { source: 'WSAVA 疫苗接种指南 2024', chapter: 'Medical records documentation（不良反应与部位记录）' },
    ],
    sources: [
      { sourceId: 'WSAVA-VACC-2024', locator: '不良反应与接种部位记录', note: '部位记录对后续判断的作用' },
      { sourceId: 'AAHA-VACC-2022', locator: '接种部位反应', note: '注射部位反应的观察' },
    ],
    priority: 'MEDIUM',
    questionType: 'TRIAGE',
    riskLevel: 'HIGH',
    urgency: 'SOON',
    reviewBy: '2027-04-01',
    reviewStatus: 'APPROVED',
  },
];
