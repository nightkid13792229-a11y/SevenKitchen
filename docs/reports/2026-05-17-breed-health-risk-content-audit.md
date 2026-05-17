# 犬种健康关注项本地样例内容审核 v0.1

日期：2026-05-17

范围：金毛、拉布拉多、雪纳瑞(小型) 三个本地审核样例犬种。

状态：待业务确认。本文档用于确认第一版知识库内容边界；确认后再更新本地导入数据，并重新执行本地导入、接口验证和小程序手动验证。

## 审核原则

1. 只展示有明确来源支撑的内容，不使用未标注来源的经验判断。
2. 优先收录犬种俱乐部、OFA/CHIC、AKC Canine Health Foundation、兽医教材、大学兽医学院或同行评议论文。
3. 将“繁育筛查项”和“普通主人日常管理风险”分开理解。筛查项可以提示用户阅读，但文案不能暗示该犬一定会患病。
4. 分级是产品展示分级，不是权威数据库统一给出的医学风险等级：
   - 重点关注：来源强、犬种特异性明确，且对日常健康管理或早期就医判断有明显价值。
   - 建议了解：来源明确，但更偏筛查、繁育沟通或需要结合具体犬只情况。
   - 补充了解：较窄的遗传项目、低频但可检测项目，适合在展开详情中阅读。
   - 暂不第一版展示：证据不足、与已收录项重复、过度专业，或容易造成误导。
5. 页面文案继续保留免责声明：内容为品种资料科普，不替代兽医诊断。

## 总体结论

金毛：现有 5 项可以作为第一版本地审核样例，其中“肿瘤相关关注”应保留为重点关注。之前没有展示肿瘤，是因为最小样例数据第一版只覆盖了 CHIC/犬种俱乐部的繁育筛查项，遗漏了研究与犬种俱乐部资料中对金毛肿瘤的长期关注。

拉布拉多：当前 4 项筛查类内容可以保留；建议第一版新增“体重管理/肥胖倾向关注”为重点关注，并将 CNM 作为补充了解候选项。

雪纳瑞(小型)：当前 4 项筛查/遗传检测内容可以保留；建议第一版新增“胰腺炎/高脂血症相关关注”为重点关注，新增“泌尿结石相关关注”为建议了解。

## 金毛 Golden Retriever

| 候选关注项 | 当前状态 | 建议分级 | 第一版建议 | 主要来源 | 文案边界 |
| --- | --- | --- | --- | --- | --- |
| 髋关节发育不良 | 已收录 | 重点关注 | 保留 | GRCA 健康筛查；OFA Hip Dysplasia；OFA CHIC | 表述为“需关注筛查和体况管理”，不说所有金毛高概率患病。 |
| 肘关节发育不良 | 已收录 | 重点关注 | 保留 | GRCA 健康筛查；OFA Elbow Dysplasia；OFA CHIC | 可提示前肢跛行、运动后不适需要就医。 |
| 遗传性眼部疾病 | 已收录 | 建议了解 | 保留，详情中点名色素性葡萄膜炎和年度眼科检查 | GRCA 健康筛查；OFA Eye Disease；AKC CHF 金毛条目 | 不把泛化眼病说成单一疾病；强调眼科检查和年龄相关变化。 |
| 心脏健康筛查 | 已收录 | 建议了解 | 保留 | GRCA 健康筛查；OFA Cardiac Disease；AKC CHF 金毛条目 | 以 SAS 等心脏筛查线索表达，避免直接下诊断。 |
| 肿瘤相关关注 | 已补充 | 重点关注 | 保留 | Morris Golden Retriever Lifetime Study；AKC CHF Golden Retriever；PLOS One 金毛肿瘤死亡研究；GRCA Understanding Cancer | 说“肿瘤相关关注价值明确”，不说有通用筛查方案；建议定期体检和异常就医。 |
| 甲状腺功能减退 | 未收录 | 暂不第一版展示 | 后续再审 | GRCA 健康资源中有相关主题，但常规繁育筛查页未作为核心筛查 | 可能造成内容过宽，先不放入最小样例。 |
| 鱼鳞病、NCL、其他遗传皮肤/神经项目 | 未收录 | 补充了解或暂不展示 | 后续随知识库扩展再审 | AKC/犬种资料可继续核对 | 更偏繁育/遗传检测，第一版不抢占核心阅读空间。 |

## 拉布拉多 Labrador Retriever

| 候选关注项 | 当前状态 | 建议分级 | 第一版建议 | 主要来源 | 文案边界 |
| --- | --- | --- | --- | --- | --- |
| 髋关节发育不良 | 已收录 | 重点关注 | 保留 | Labrador Retriever Club 健康声明；AKC Sporting Group 健康测试要求；OFA Hip Dysplasia | 大型犬关节管理与筛查提示，保守表达。 |
| 肘关节发育不良 | 已收录 | 重点关注 | 保留 | Labrador Retriever Club 健康声明；AKC Sporting Group 健康测试要求；OFA Elbow Dysplasia | 与髋关节一起作为核心关节项展示。 |
| 运动诱发性虚脱 EIC | 已收录 | 重点关注 | 保留 | Labrador Retriever Club 健康声明；AKC 健康测试要求；OFA EIC | 强调高兴奋/高强度运动后的异常需停运动并就医。 |
| 遗传性眼部疾病 / PRA | 已收录 | 建议了解 | 保留，详情可补充 prcd-PRA | Labrador Retriever Club 健康声明；LRC 健康术语；AKC 健康测试要求；OFA Eye Disease | 不把所有眼病混成 PRA；PRA 作为其中一个可检测方向。 |
| 体重管理/肥胖倾向关注 | 未收录 | 重点关注 | 建议新增第一版 | Cell Metabolism POMC 研究；Broad Institute 论文摘要 | 不是“疾病诊断”，应表述为体重管理关注；强调食量、体况评分、运动和兽医营养建议。 |
| 中心核肌病 CNM | 未收录 | 补充了解 | 建议新增为补充了解，或与 EIC 同属遗传肌肉/运动异常组 | Labrador Retriever Club 健康声明；LRC 新犬主资料；AKC 健康测试要求 | 偏遗传检测和繁育沟通，避免让普通主人误解为常见症状。 |
| 心脏筛查 | 未收录 | 建议了解 | 第一版可暂缓，后续扩展 | LRC 健康声明提到许多成员选择心脏检查；LRC 新犬主资料提到 cardiac examination | 不是当前核心 CHIC 项，先不放进最小样例。 |
| 肿瘤、胃扩张扭转、耳部感染 | 未收录 | 暂不第一版展示 | 后续单独审 | 需进一步限定来源和犬种特异性 | 容易变成泛犬种常见病列表，第一版先不展示。 |

## 雪纳瑞(小型) Miniature Schnauzer

| 候选关注项 | 当前状态 | 建议分级 | 第一版建议 | 主要来源 | 文案边界 |
| --- | --- | --- | --- | --- | --- |
| 遗传性眼部疾病 / PRA | 已收录 | 重点关注 | 保留 | AMSC 2024 健康声明；AKC Terrier Group 健康测试要求；University of Minnesota Miniature Schnauzer Health Panel；OFA Eye Disease | 保留年度眼科检查和 PRA DNA 检测两个层级。 |
| 心脏健康筛查 | 已收录 | 建议了解 | 保留 | AMSC 2024 健康声明；AKC Terrier Group 健康测试要求；OFA Cardiac Disease | 表述为推荐筛查项，不暗示每只犬存在心脏病。 |
| 先天性肌强直 | 已收录 | 补充了解 | 保留 | AMSC 2024 健康声明；University of Minnesota Miniature Schnauzer Health Panel | 偏遗传检测，详情页展示即可，不做默认强提醒。 |
| 鸟分枝杆菌复合体 MAC 易感 | 已收录 | 补充了解 | 保留 | AMSC 2024 健康声明；University of Minnesota Miniature Schnauzer Health Panel；The Kennel Club DNA testing scheme | 说明是特定遗传易感，不把感染风险泛化。 |
| 胰腺炎/高脂血症相关关注 | 未收录 | 重点关注 | 建议新增第一版 | Merck Veterinary Manual Pancreatitis；AKC CHF Miniature Schnauzer；University of Minnesota hyperlipidemia 研究资料 | 适合用户日常管理，尤其饮食脂肪、呕吐腹痛、精神食欲异常等就医提示；不替代兽医诊断。 |
| 泌尿结石/草酸钙尿石关注 | 未收录 | 建议了解 | 建议新增第一版 | AKC CHF Miniature Schnauzer grant；Morris Animal Foundation Miniature Schnauzer bladder stones；American Journal of Veterinary Research 摘要 | 提示血尿、排尿困难、频繁排尿需就医；避免自行调整处方饮食。 |
| 糖尿病 | 未收录 | 建议了解或后续扩展 | 第一版可暂缓，作为胰腺炎/高脂血症条目的关联风险补充 | Hill's Vet Diabetes Mellitus 客户资料；AKC CHF Miniature Schnauzer | 证据支持品种倾向，但用户展示中若单列可能过多，建议第二批扩展。 |
| 皮肤粉刺综合征、牙周问题、其他常见小型犬问题 | 未收录 | 暂不第一版展示 | 后续再审 | 需更多权威来源和犬种特异性确认 | 第一版避免扩展成泛健康百科。 |

## 建议进入下一轮本地数据更新的变更

1. 金毛：保持当前 5 项；不再回退肿瘤相关关注。
2. 拉布拉多：新增“体重管理/肥胖倾向关注”为重点关注；新增 CNM 为补充了解候选。
3. 雪纳瑞(小型)：新增“胰腺炎/高脂血症相关关注”为重点关注；新增“泌尿结石相关关注”为建议了解。
4. 小程序标签颜色建议：
   - 重点关注：暖橙/红橙，强调优先阅读。
   - 建议了解：蓝绿色或绿色，表示建议阅读但不制造紧张感。
   - 补充了解：中性灰绿，表示展开后补充资料。

## 来源索引

- AKC Canine Health Foundation: Golden Retriever Cancer Research: https://www.akcchf.org/educational-resources/library/articles/breed/golden-retriever/
- AKC Canine Health Foundation: Miniature Schnauzer Research: https://www.akcchf.org/educational-resources/library/articles/breed/miniature-schnauzer/
- AKC Sporting Group Health Testing Requirements: https://www.akc.org/breeder-programs/breed-health-testing-requirements/sporting-group-health-testing-requirements/
- AKC Terrier Group Health Testing Requirements: https://www.akc.org/breeder-programs/breed-health-testing-requirements/terrier-group-health-testing-requirements/
- American Miniature Schnauzer Club 2024 Health Statement: https://s3.amazonaws.com/cdn-origin-etr.akc.org/wp-content/uploads/2024/07/18134123/American-Miniature-Schnauzer-Club-Inc.-Health-Statement-7-24-Final.pdf
- Broad Institute / Cell Metabolism: A Deletion in the Canine POMC Gene Is Associated with Weight and Appetite in Obesity-Prone Labrador Retriever Dogs: https://www.broadinstitute.org/publications/broad8179
- Golden Retriever Club of America: Health Screenings for the Parents of a Litter: https://grca.org/about-the-breed/health-research/health-screenings-for-the-parents-of-a-litter/
- Golden Retriever Club of America: Understanding Cancer in Golden Retrievers: https://grca.org/about-the-breed/health-research/understanding-cancer-in-golden-retrievers/
- Hill's Vet: Diabetes Mellitus client information: https://www.hillsvet.com/content/dam/cp-sites/hills/hills-vet/en_us/client-information-series/digestive-system/diabetes_mellitus_en.pdf
- Labrador Retriever Club Health Statement: https://cdn.akc.org/Marketplace/Health-Statement/Labrador-Retriever.pdf
- Labrador Retriever Club New Puppy Flyer: https://thelabradorclub.com/wp-content/uploads/2023/06/AKC-LRC-new-puppy-flyer.pdf
- Merck Veterinary Manual: Pancreatitis and Other Disorders of the Pancreas in Dogs: https://www.merckvetmanual.com/dog-owners/digestive-disorders-of-dogs/pancreatitis-and-other-disorders-of-the-pancreas-in-dogs
- Morris Animal Foundation: Detecting and Preventing Bladder Stones in Miniature Schnauzers: https://www.morrisanimalfoundation.org/study/detecting-and-preventing-bladder-stones-miniature-schnauzers
- Morris Animal Foundation: Golden Retriever Lifetime Study: https://www.morrisanimalfoundation.org/study/golden-retriever-lifetime-study
- OFA CHIC Program: https://ofa.org/chic-programs/
- PLOS One: Association of cancer-related mortality, age and gonadectomy in golden retriever dogs at a veterinary academic center (1989-2016): https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0192578
- University of Minnesota: Miniature Schnauzer Health Panel: https://vetmed.umn.edu/research/research-labs/canine-genetics-lab/canine-genetics-testing/miniature-schnauzer-health-panel
- University of Minnesota: Prevalence of calcium oxalate uroliths in miniature schnauzers: https://experts.umn.edu/en/publications/prevalence-of-calcium-oxalate-uroliths-in-miniature-schnauzers/
- University of Minnesota: Resolving the major dyslipidemia phenotypes and genetic risk factors for familial hyperlipidemia in Miniature Schnauzers: https://conservancy.umn.edu/items/80d090de-9f17-4990-8e5d-8754f536575f

## 审核后执行清单

1. 业务确认本文档中的“建议进入下一轮本地数据更新的变更”。
2. 更新 `backend/prisma/import-breed-health-risks.shared.ts` 的条件、犬种风险和来源。
3. 补充导入数据单元测试，覆盖新增风险项和来源数量。
4. 在本地独立数据库重新执行 `npm run import:breed-health-risks:apply`。
5. 调用本地接口确认三类犬种返回项、分级和来源数量。
6. 重新编译小程序 dev 包，并在微信开发者工具手动验证默认折叠、分级标签颜色、二级来源展开。
7. 本地审核通过后，再准备生产迁移脚本和生产部署清单。
