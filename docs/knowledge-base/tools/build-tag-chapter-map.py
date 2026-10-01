#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
建「检索标签 → 章节」映射表——资料库 B 方案第 5 步（人工建一次，长期复用）。

为什么不用向量检索：
    这只狗是什么领域，我们**本来就知道**（标签是 `ckd` / `pancreatitis` / `vaccine`…）。
    知道领域就能直接定位到第几章，比让机器猜语义更准，页码也更精确。
    所以这张表是原文层的定位底座：AI 要"读原文并给出第几章第几页"，先查这张表。

产出：
    docs/knowledge-base/tag-chapter-map.csv
      检索标签, 来源ID, 相对路径, 定位（章节/文档部位）, 页数, 用途, 优先级

用法：
    cd <repo>
    python3 docs/knowledge-base/tools/build-tag-chapter-map.py

前置：先跑 build-source-index.py（本脚本从章节索引里取页数，取不到会报错停下）。
只读索引 CSV + 写一份 CSV。
"""
import csv
import os
import re
import sys

# (检索标签, 来源ID, 相对路径, 定位, 用途, 优先级)
# 标签必须来自 tag-vocabulary.ts 的受控词表；路径必须与资料库里的一致。
MAPPING = [
    # ── 肾脏 ───────────────────────────────────────────────
    ("ckd", "IRIS-CKD-2026", "iris/IRIS_staging_guidelines-2026.pdf", "全文（分期标准）", "CKD 分期与判断依据", "高"),
    ("renal", "IRIS-CKD-2026", "iris/IRIS-DOG-Treatment_Recommendations_may-2026.pdf", "犬治疗建议全文", "犬 CKD 的处理与复查路径", "高"),
    ("renal", "SACN5", "sacn5/chapters/SACN5_37.pdf", "第37章 慢性肾病", "肾病营养管理的原理与目标", "高"),
    ("proteinuria", "IRIS-CKD-2026", "iris/IRIS_Pocket_Guide_to_CKD_June-2026-cn6g.pdf", "口袋指南（UPC 与血压）", "蛋白尿与血压的判读前提", "高"),
    ("critical", "IRIS-CKD-2026", "iris/IRIS-AKI-Grading_2026.pdf", "全文（AKI 分级）", "急性肾损伤分级", "中"),

    # ── 胰腺 / 血脂 ────────────────────────────────────────
    ("pancreatitis", "SACN5", "sacn5/chapters/SACN5_67.pdf", "第67章 胰腺炎", "胰腺炎的实验室诊断与营养管理", "高"),
    ("low-fat", "SACN5", "sacn5/chapters/SACN5_28.pdf", "第28章 高脂血症", "甘油三酯升高与脂肪限制", "高"),
    ("hyperlipidemia", "SACN5", "sacn5/chapters/SACN5_28.pdf", "第28章 高脂血症", "高脂血症的分类与处理", "高"),

    # ── 肝胆 ───────────────────────────────────────────────
    ("hepatic", "SACN5", "sacn5/chapters/SACN5_68.pdf", "第68章 肝胆疾病", "肝病营养管理原理", "高"),
    ("liver", "ACVIM-CONSENSUS", "acvim/ACVIM-2019-犬慢性肝炎诊断与治疗.xml", "全文（诊断与治疗）", "犬慢性肝炎的诊断与治疗口径", "高"),
    ("copper-toxicosis", "ACVIM-CONSENSUS", "acvim/ACVIM-2019-犬慢性肝炎诊断与治疗.xml", "铜相关段落", "铜蓄积性肝病", "中"),

    # ── 胃肠道 ─────────────────────────────────────────────
    ("gi", "ACVIM-CONSENSUS", "acvim/ACVIM-2026-慢性肠病诊断与治疗共识.xml", "全文（诊断与治疗）", "慢性肠病的诊断流程与治疗", "高"),
    ("ibd", "SACN5", "sacn5/chapters/SACN5_57.pdf", "第57章 炎症性肠病", "IBD 的饮食管理原理", "高"),
    ("cie", "ACVIM-CONSENSUS", "acvim/ACVIM-2022-犬慢性肠病-现状综述.xml", "全文", "慢性肠病现状与排除性饮食", "高"),
    ("acute-gastroenteritis", "SACN5", "sacn5/chapters/SACN5_56.pdf", "第56章 急性胃肠炎与肠炎", "急性胃肠炎的表现与处理原则", "高"),
    ("vomiting", "SACN5", "sacn5/chapters/SACN5_51.pdf", "第51章 呕吐", "呕吐的分诊与鉴别方向", "高"),
    ("vomiting", "SACN5", "sacn5/chapters/SACN5_52.pdf", "第52章 胃炎", "胃炎相关呕吐", "中"),
    ("red-flag", "SACN5", "sacn5/chapters/SACN5_53.pdf", "第53章 胃扩张与胃扭转", "腹胀干呕（GDV）的急症口径", "高"),
    ("constipation", "SACN5", "sacn5/chapters/SACN5_64.pdf", "第64章 便秘", "便秘与巨结肠方向", "中"),
    ("diarrhea", "SACN5", "sacn5/chapters/SACN5_55.pdf", "第55章 小肠疾病", "小肠性腹泻的判读", "中"),
    ("large-bowel", "SACN5", "sacn5/chapters/SACN5_61.pdf", "第61章 大肠疾病", "大肠性腹泻的判读", "中"),
    ("lymphangiectasia", "SACN5", "sacn5/chapters/SACN5_58.pdf", "第58章 蛋白丢失性肠病", "蛋白丢失性肠病与低脂", "中"),
    ("sibo", "SACN5", "sacn5/chapters/SACN5_60.pdf", "第60章 小肠细菌过度生长", "SIBO 方向", "低"),

    # ── 泌尿结石 ───────────────────────────────────────────
    ("urolith", "SACN5", "sacn5/chapters/SACN5_38.pdf", "第38章 尿石症", "结石总论与饮食管理", "高"),
    ("urate", "SACN5", "sacn5/chapters/SACN5_39.pdf", "第39章 尿酸盐结石", "尿酸结石（达尔马提亚犬）", "中"),
    ("oxalate", "SACN5", "sacn5/chapters/SACN5_40.pdf", "第40章 草酸钙结石", "草酸钙结石", "中"),
    ("struvite", "SACN5", "sacn5/chapters/SACN5_43.pdf", "第43章 鸟粪石", "鸟粪石（感染性结石）", "中"),
    ("cystine", "SACN5", "sacn5/chapters/SACN5_42.pdf", "第42章 胱氨酸结石", "胱氨酸结石", "低"),
    ("urinary", "ACVIM-CONSENSUS", "acvim/ACVIM-2024-犬尿失禁诊断与管理.xml", "全文", "犬尿失禁的诊断与管理", "中"),

    # ── 口腔 ───────────────────────────────────────────────
    ("dental", "WSAVA-DENTAL", "wsava/dental/WSAVA-Global-Dental-Guidelines-JSAPMandarin.pdf", "全文（中文正本）", "牙周病分期与预防", "高"),
    ("oral", "AAHA-DENTAL-2019", "aaha/AAHA-2019-Dental-Care-Guidelines.pdf", "全文", "口腔检查与洁牙节奏", "高"),
    ("periodontal", "WSAVA-DENTAL", "wsava/dental/GDC-Toothbrushing-Toolkit-1.pdf", "刷牙工具包", "家庭刷牙方法", "高"),
    ("oral", "SACN5", "sacn5/chapters/SACN5_49.pdf", "第49章 口腔疾病", "口腔疾病的营养相关面", "低"),

    # ── 心脏 ───────────────────────────────────────────────
    ("cardio", "SACN5", "sacn5/chapters/SACN5_36.pdf", "第36章 心血管疾病", "心脏病营养管理（钠/热量）", "高"),
    ("chf", "ACVIM-CONSENSUS", "acvim/ACVIM-2020-心肌病分类诊断与管理.xml", "全文", "心肌病分类与诊断", "中"),
    ("cardiac", "ACVIM-CONSENSUS", "acvim/ACVIM-2020-肺动脉高压.xml", "全文", "肺动脉高压与心脏标志物", "中"),
    ("hypertension", "ACVIM-CONSENSUS", "acvim/ACVIM-2018-系统性高血压-识别评估与管理.xml", "全文", "系统性高血压（靶器官）", "中"),

    # ── 骨关节 / 疼痛 ──────────────────────────────────────
    ("ortho", "SACN5", "sacn5/chapters/SACN5_34.pdf", "第34章 骨关节炎的营养管理", "OA 营养管理", "高"),
    ("arthritis", "WSAVA-PAIN-2022", "wsava/pain/topic-sheets/Degenerative-joint-disease.pdf", "单页（退行性关节病）", "OA 疼痛识别", "高"),
    ("pain", "WSAVA-PAIN-2022", "wsava/pain/WSAVA-2022疼痛识别评估和治疗指南-中文.pdf", "全文（中文；**扫描件无文字层，需先 OCR**）", "疼痛识别与评估（第 4 生命征）", "高"),

    # ── 内分泌 / 体重 ──────────────────────────────────────
    ("diabetes", "SACN5", "sacn5/chapters/SACN5_29.pdf", "第29章 内分泌疾病（糖尿病段）", "糖尿病营养管理", "高"),
    ("thyroid", "SACN5", "sacn5/chapters/SACN5_29.pdf", "第29章 内分泌疾病（甲状腺段）", "甲状腺功能减退", "高"),
    ("obese", "SACN5", "sacn5/chapters/SACN5_27.pdf", "第27章 肥胖", "减重原理与目标", "高"),
    ("overweight", "AAHA-2021-NUTRITION", "aaha/AAHA-2021-Nutrition-and-Weight-Management-Guidelines.pdf", "全文", "体重管理与体况评分", "高"),
    ("weight-loss", "WSAVA-NUTRITION", "wsava/nutrition/Body-Condition-Score-Dog-2025.pdf", "犬 BCS 2025", "在家做体况评分", "高"),
    ("weight-loss", "WSAVA-NUTRITION", "wsava/nutrition/Muscle-Condition-Score-Dog.pdf", "犬 MCS", "肌肉状况评分（与 BCS 不同）", "中"),

    # ── 皮肤 / 食物过敏 ────────────────────────────────────
    ("skin", "SACN5", "sacn5/chapters/SACN5_32.pdf", "第32章 皮肤与毛发疾病", "皮肤与被毛的营养相关面", "高"),
    ("food-allergy", "SACN5", "sacn5/chapters/SACN5_31.pdf", "第31章 食物不良反应", "排除性饮食与再挑战", "高"),
    ("coat", "SACN5", "sacn5/chapters/SACN5_32.pdf", "第32章 皮肤与毛发疾病", "被毛问题的营养相关面", "中"),

    # ── 肿瘤 / 血液 ────────────────────────────────────────
    ("onco", "SACN5", "sacn5/chapters/SACN5_30.pdf", "第30章 癌症", "肿瘤病患营养", "中"),
    ("tumor", "WSAVA-POSITION", "wsava/position-statements/WSAVA-微芯片与肿瘤立场声明.pdf", "立场声明", "微芯片与肿瘤（背景）", "低"),
    ("anemia", "ACVIM-CONSENSUS", "acvim/ACVIM-2019-免疫介导性溶血性贫血-诊断.xml", "全文", "免疫介导性溶血性贫血", "中"),
    ("blood", "ACVIM-CONSENSUS", "acvim/ACVIM-2024-免疫性血小板减少症-诊断.xml", "全文", "免疫性血小板减少症", "中"),

    # ── 老年 / 认知 / 行为 ─────────────────────────────────
    ("senior", "AAHA-LIFE-STAGE-2019", "aaha/AAHA-2019-Canine-Life-Stage-Guidelines.pdf", "全文（生命阶段表）", "各生命阶段的体检节奏", "高"),
    ("geriatric", "AAHA-SENIOR-2023", "aaha/AAHA-2023-Senior-Care-Toolkit.pdf", "工具包全文（家长自查清单）", "老年犬居家观察与筛查", "高"),
    ("cds", "SACN5", "sacn5/chapters/SACN5_35.pdf", "第35章 犬认知功能障碍", "CDS 表现与环境丰富化", "高"),
    ("senior", "SACN5", "sacn5/chapters/SACN5_14.pdf", "第14章 中老年犬的饲喂", "中老年犬营养", "中"),
    ("behavior", "WSAVA-WELFARE", "wsava/welfare/WSAVA-Animal-Welfare-Guidelines-2018.pdf", "行为与福利章节", "行为变化是最早的不适线索", "中"),

    # ── 生长 / 繁殖 / 危重 ─────────────────────────────────
    ("puppy", "SACN5", "sacn5/chapters/SACN5_17.pdf", "第17章 幼犬生长", "幼犬生长与能量", "高"),
    ("puppy", "SACN5", "sacn5/chapters/SACN5_16.pdf", "第16章 新生幼犬", "新生儿护理与低血糖", "中"),
    ("growth", "SACN5", "sacn5/chapters/SACN5_33.pdf", "第33章 大型/巨型犬幼犬喂养", "大型犬幼犬生长控制", "高"),
    ("pregnant", "WSAVA-REPRO", "wsava/reproduction/WSAVA犬猫生殖管理指南-中文版.pdf", "中文正本", "繁殖管理", "中"),
    ("lactating", "SACN5", "sacn5/chapters/SACN5_15.pdf", "第15章 繁殖犬的饲养", "妊娠哺乳期营养", "中"),
    ("critical", "SACN5", "sacn5/chapters/SACN5_25.pdf", "第25章 重症监护营养", "住院/危重营养支持", "中"),
    ("hospitalized", "WSAVA-NUTRITION", "wsava/nutrition/Feeding-Guide-Hospitalized-Dogs-Cats.pdf", "住院饲喂指南", "住院病患饲喂", "中"),

    # ── 免疫 / 疫苗 / 法规 ─────────────────────────────────
    ("vaccine", "WSAVA-VACC-2024", "wsava/vaccination/WSAVA-Vaccination-guidelines-2024.pdf", "全文（首要依据）", "核心/非核心疫苗与加强", "高"),
    ("immune", "AAHA-VACC-2022", "aaha/AAHA-2022-Canine-Vaccination-Guidelines-2024update.pdf", "全文", "把 WSAVA 建议落到场景", "高"),
    ("prevention", "CN-EPIDEMIC-LAW", "cn-regulation/中华人民共和国动物防疫法-全国人大公报版.pdf", "狂犬病强制免疫条款", "国内强制免疫与免疫证明", "高"),
    ("prevention", "CN-RABIES-TECH", "cn-regulation/狂犬病防治技术规范-中国动物疫病预防控制中心.pdf", "全文", "狂犬病防治技术要求", "高"),

    # ── 食品安全 / 营养基线 ────────────────────────────────
    ("safe", "SACN5", "sacn5/chapters/SACN5_11.pdf", "第11章 食品安全", "家庭自制与食品安全", "高"),
    ("food-safety", "WSAVA-NUTRITION", "wsava/nutrition/Raw-Meat-Based-Diets-for-Pets-2021.pdf", "立场声明", "生食风险", "高"),
    ("homemade", "SACN5", "sacn5/chapters/SACN5_10.pdf", "第10章 家庭自制宠物食品", "自制配方完整性", "高"),
    ("maintenance", "FEDIAF-2025", "fediaf/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf", "营养需要表", "成年犬营养需要", "高"),
    ("general", "SACN5", "sacn5/chapters/SACN5_13.pdf", "第13章 青年成年犬饲养", "成年犬维持", "中"),
    ("adult", "SACN5", "sacn5/chapters/SACN5_12.pdf", "第12章 正常犬饲养导论", "维持营养导论", "中"),
    ("supplement", "NRC-2006", "nrc/NRC-2006-Nutrient-Requirements-Dogs-Cats.epub", "营养需要章节", "上限与缺乏（背景）", "中"),

    # ── 品种遗传 ───────────────────────────────────────────
    ("breed-risk", "WSAVA-HEREDITARY", "wsava/hereditary/WSAVA-Hereditary-Disease-Committee-Position-Paper-HDC-Edited.pdf", "立场文件", "遗传病与筛查原则", "高"),
    ("breed-risk", "WSAVA-WELFARE", "wsava/welfare/WSAVA-Animal-Welfare-Guidelines-2018.pdf", "繁育者与遗传福利章节", "繁育伦理与福利", "中"),

    # ── 检查指标 / 就医时机 / 护理 / 就诊准备 ───────────────
    ("lab", "MERCK-CLINICAL-BIOCHEM", "merck/临床生化.txt", "全文（Merck 手册抓取版）", "生化指标解读", "高"),
    ("lab", "MERCK-HEME", "merck/临床血液学.txt", "全文（Merck 手册抓取版）", "血常规解读", "高"),
    ("lab", "MERCK-HEPATIC", "merck/肝功能检查.txt", "全文（Merck 手册抓取版）", "肝功能组合解读", "高"),
    ("clinical", "ACVIM-CONSENSUS", "acvim/ACVIM-2024-癫痫持续状态与集群发作.xml", "全文", "抽搐的急症口径", "高"),
    ("clinical", "ACVIM-CONSENSUS", "acvim/ACVIM-2022-犬胸腰段椎间盘突出-诊断与管理.xml", "全文", "突然站不起来/瘫痪", "高"),
    ("triage", "ACVIM-CONSENSUS", "acvim/ACVIM-2024-免疫性血小板减少症-诊断.xml", "出血相关段落", "出血不止的判读", "中"),
    ("nursing", "WSAVA-NUTRITION", "wsava/nutrition/Global-Nutritional-Assesment-Guidelines-Chinese.pdf", "中文版全文（含 BCS/MCS）", "营养评估与体况评分", "高"),
    ("visit-prep", "WSAVA-NUTRITION", "wsava/nutrition/Diet-History-Form.pdf", "饮食史表", "就诊时医生会问的饮食信息", "高"),
    ("visit-prep", "WSAVA-NUTRITION", "wsava/nutrition/Nutritional-Assessment-Checklist.pdf", "评估清单", "就诊前该准备的信息", "高"),
]


def known_tags(repo: str) -> set:
    """从受控词表里取全部合法标签，防止映射表用了系统永远不会产出的标签。"""
    path = os.path.join(
        repo, "backend/src/domain/recipe-designer/knowledge-base/tag-vocabulary.ts"
    )
    text = open(path, encoding="utf-8").read()
    return set(re.findall(r"'([a-z0-9\-]+)'", text))


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "../../.."))
    index_path = os.path.join(repo, "docs/knowledge-base/source-chapter-index.csv")
    if not os.path.isfile(index_path):
        print("先跑 build-source-index.py 生成章节索引", file=sys.stderr)
        return 1

    vocabulary = known_tags(repo)
    unknown_tags = sorted({tag for tag, *_ in MAPPING if tag not in vocabulary})
    if unknown_tags:
        print(
            "以下标签不在受控词表里（系统永远不会产出，映射了也检索不到）："
            + "、".join(unknown_tags),
            file=sys.stderr,
        )
        return 1

    pages = {}
    with open(index_path, encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            pages[row["相对路径"]] = row["页数"]

    rows = []
    missing = []
    for tag, source_id, path, locator, purpose, priority in MAPPING:
        if path not in pages:
            missing.append(path)
        rows.append(
            {
                "检索标签": tag,
                "来源ID": source_id,
                "相对路径": path,
                "定位": locator,
                "页数": pages.get(path, ""),
                "用途": purpose,
                "优先级": priority,
            }
        )

    if missing:
        print("以下路径在章节索引里找不到，请核对：", file=sys.stderr)
        for path in sorted(set(missing)):
            print(f"  - {path}", file=sys.stderr)
        return 1

    out_path = os.path.join(repo, "docs/knowledge-base/tag-chapter-map.csv")
    with open(out_path, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["检索标签", "来源ID", "相对路径", "定位", "页数", "用途", "优先级"],
        )
        writer.writeheader()
        writer.writerows(rows)

    tags = sorted({row["检索标签"] for row in rows})
    print(f"映射 {len(rows)} 条，覆盖 {len(tags)} 个检索标签：")
    print("  " + "、".join(tags))
    print(f"\n已写入：{out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
