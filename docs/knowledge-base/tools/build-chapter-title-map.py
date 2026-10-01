#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从知识条目里反推「SACN5 章号 → 章节标题」对照表。

为什么这么做：
    资料库里的 SACN5 是**按章拆出来的 72 个单章 PDF**，文件名只有章号（SACN5_37.pdf），
    正文里也没有印"Chapter 37: Chronic Kidney Disease"这样的页眉。
    但我们的知识条目在引用时是写全了的（"第37章 慢性肾病"这类），
    所以**条目本身就是一份现成的对照表**——把它抽出来，比重新翻书快得多，也不会抄错。

产出：
    docs/knowledge-base/source-chapter-titles.csv
      章号, 标题, 被引用次数, 示例条目

用法：
    cd <repo>
    python3 docs/knowledge-base/tools/build-chapter-title-map.py

只读 TS 数据文件 + 写一份 CSV。
"""
import csv
import glob
import os
import re
from collections import Counter, defaultdict

REPO_HINT = "backend/src/domain/recipe-designer/knowledge-base/data/*.ts"
NOISE = re.compile(r"(表\d|页|Box|病例|关键因子|转|·|，|,|。|；|;|:|：|（|）|\(|\))")

# 条目里没引用到、或引用时写法有噪声的章节，按**正文首屏**人工核定一次。
# 键=章号，值=(标题, 说明)。说明写清"正文首屏"还是"书名号写法"。
MANUAL_TITLES = {
    48: ("胃肠病患的饲喂", "正文首屏：What should I feed?"),
    49: ("口腔疾病", "正文首屏：disorders of the oral cavity"),
    51: ("呕吐", "正文首屏：Vomiting is the hallmark of gastric disorders"),
    52: ("胃炎", "正文首屏：Gastritis is one of the most common causes of vomiting"),
    53: ("胃扩张与胃扭转", "正文首屏：Gastric dilatation (GD) is distention of the stomach"),
    54: ("胃排空与胃动力疾病", "正文首屏：the stomach should be emptied following an average meal"),
    55: ("小肠疾病", "正文首屏：Disorders of the small intestine"),
    59: ("短肠综合征", "正文首屏：Short bowel syndrome is a malabsorptive state"),
    62: ("结肠炎", "正文首屏：Colitis is a common disorder"),
    63: ("肠易激综合征", "正文首屏：Idiopathic (irritable) bowel syndrome"),
    64: ("便秘", "正文首屏：constipation"),
    65: ("肠胃胀气", "正文首屏：Flatulence is excessive formation of gases"),
    66: ("吸收不良", "正文首屏：Malassimilation is failure of nutrients to pass"),
    46: ("猫下泌尿道疾病（不适用：猫）", "正文首屏：Diseases of the feline lower urinary tract"),
    69: ("药物与营养相互作用（参考资料）", "正文首屏：veterinary pharmaceuticals"),
    70: ("兔/雪貂/啮齿类（不适用：异宠）", "正文首屏：Ferrets, rabbits and rodents"),
    71: ("爬行动物（不适用：异宠）", "正文首屏：Diversity among reptiles"),
    72: ("鸟类（不适用：异宠）", "正文首屏：companion and aviary birds"),
}


def normalize(title: str) -> str:
    """只留章节标题本身：去掉表号、页码、备注与标点尾巴。"""
    text = NOISE.split(title)[0].strip()
    text = text.strip(" 　-—…")
    return text


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "../../.."))
    pattern = os.path.join(repo, REPO_HINT)
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"没找到知识条目文件：{pattern}")
        return 1

    votes = defaultdict(Counter)
    samples = {}
    chapter_re = re.compile(r"第\s*(\d{1,2})\s*章\s*([^\s'\"`,;，。；]{1,40})")

    for path in files:
        text = open(path, encoding="utf-8").read()
        entry_id = ""
        for line in text.splitlines():
            id_match = re.search(r"id:\s*'([^']+)'", line)
            if id_match:
                entry_id = id_match.group(1)
            for chapter, title in chapter_re.findall(line):
                clean = normalize(title)
                if len(clean) < 2:
                    continue
                votes[int(chapter)][clean] += 1
                samples.setdefault((int(chapter), clean), entry_id)

    out_path = os.path.join(repo, "docs/knowledge-base/source-chapter-titles.csv")
    rows = []
    covered = set()
    for chapter in sorted(set(list(votes.keys()) + list(MANUAL_TITLES.keys()))):
        if chapter in MANUAL_TITLES:
            title, note = MANUAL_TITLES[chapter]
            count = votes[chapter].most_common(1)[0][1] if votes[chapter] else 0
            sample = ""
            if votes[chapter]:
                sample = samples.get((chapter, votes[chapter].most_common(1)[0][0]), "")
            rows.append(
                {
                    "章号": chapter,
                    "标题": title,
                    "被引用次数": count,
                    "示例条目": sample,
                    "同章其它写法": " / ".join(
                        f"{name}（{n}）" for name, n in votes[chapter].most_common()[1:4]
                    ),
                    "说明": note,
                }
            )
            covered.add(chapter)
            continue
        title, count = votes[chapter].most_common(1)[0]
        rows.append(
            {
                "章号": chapter,
                "标题": title,
                "被引用次数": count,
                "示例条目": samples.get((chapter, title), ""),
                "同章其它写法": " / ".join(
                    f"{name}（{n}）" for name, n in votes[chapter].most_common()[1:4]
                ),
                "说明": "来源：知识条目引用写法",
            }
        )
        covered.add(chapter)

    with open(out_path, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["章号", "标题", "被引用次数", "示例条目", "同章其它写法", "说明"],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"从 {len(files)} 个条目文件里识别出 {len(votes)} 个章号，人工核定 {len(MANUAL_TITLES)} 个，合计 {len(rows)} 行：")
    for row in rows:
        print(f"  第{row['章号']}章 {row['标题']}（{row['被引用次数']} 次）")
    print(f"\n已写入：{out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
