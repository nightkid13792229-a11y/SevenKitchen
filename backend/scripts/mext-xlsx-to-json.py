#!/usr/bin/env python3
"""MEXT 日本食品標準成分表2020年版（八訂） Excel -> JSON 转换器。

输入：官方下载的 Excel（主表 mext8_table1.xlsx；氨基酸表 mext8_amino.xlsx；
脂肪酸表 mext8_fatty.xlsx）。
输出：每食品一行的 JSON 数组，组件键统一为 INFOODS 风格编码。

用法：
  python3 mext-xlsx-to-json.py <input.xlsx> <output.json> [--mode main|amino|fatty]
"""
import json
import sys

import openpyxl

IDENT_ROW_INDEX = 11  # 主表：成分識別子行（0-based）
DATA_START_INDEX = 12  # 主表：第一条数据行

# 氨基酸表 / 脂肪酸表 的布局
SUB_IDENT_ROW_INDEX = 3
SUB_DATA_START_INDEX = 5

# 氨基酸表日语标签 -> 统一代码
AMINO_LABEL_TO_CODE = {
    "水分": "WATER",
    "アミノ酸組成によるたんぱく質": "PROTCAA",
    "たんぱく質": "PROT-",
    "イソロイシン": "ILE",
    "ロイシン": "LEU",
    "リシン\n（リジン）": "LYS",
    "含硫アミノ酸；\nメチオニン": "MET",
    "含硫アミノ酸；\nシスチン": "CYS",
    "含硫アミノ酸；\n合計": "METCYS",
    "芳香族アミノ酸；\nフェニルアラニン": "PHE",
    "芳香族アミノ酸；\nチロシン": "TYR",
    "芳香族アミノ酸；\n合計": "PHETYR",
    "トレオニン\n（スレオニン）": "THR",
    "トリプトファン": "TRP",
    "バリン": "VAL",
    "ヒスチジン": "HIS",
    "アルギニン": "ARG",
    "アラニン": "ALA",
    "アスパラギン酸": "ASP",
    "グルタミン酸": "GLU",
    "グリシン": "GLY",
    "プロリン": "PRO",
    "セリン": "SER",
    "ヒドロキシプロリン": "HYP",
    "アミノ酸組成計": "AATOTAL",
    "アンモニア": "NH3",
    "剰余アンモニア": "NH3RES",
}


def clean_cell(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    text = str(value).strip()
    if text == "" or text == "-" or text == "Tr":
        return None
    return text.rstrip("*")


def extract_rows(rows, ident_index, data_start, mode):
    identifiers = []
    for cell in rows[ident_index]:
        if not isinstance(cell, str):
            identifiers.append(None)
            continue
        raw = clean_cell(cell)
        if mode == "amino":
            identifiers.append(AMINO_LABEL_TO_CODE.get(raw, raw))
        else:
            identifiers.append(raw)

    foods = []
    for row in rows[data_start:]:
        food_number = clean_cell(row[1])
        if not food_number:
            continue
        food_name = clean_cell(row[3])
        if not food_name:
            continue
        components = {}
        for idx, identifier in enumerate(identifiers):
            if (
                not identifier
                or identifier in ("成分識別子", "単位")
                or identifier in ("食品群", "食品番号", "索引番号", "食品名")
            ):
                continue
            raw = clean_cell(row[idx])
            if raw is not None:
                components[identifier] = raw
        foods.append(
            {
                "foodGroup": clean_cell(row[0]),
                "foodNumber": str(food_number),
                "indexNumber": clean_cell(row[2]),
                "foodName": str(food_name),
                "refuse": clean_cell(row[4]) if mode == "main" else None,
                "components": components,
            }
        )
    return foods


def main():
    if len(sys.argv) not in (3, 5):
        print(__doc__)
        sys.exit(1)
    input_path, output_path = sys.argv[1], sys.argv[2]
    mode = "main"
    if len(sys.argv) == 5 and sys.argv[3] == "--mode":
        mode = sys.argv[4]

    wb = openpyxl.load_workbook(input_path, read_only=True, data_only=True)
    ws = wb["表全体"]
    rows = list(ws.iter_rows(values_only=True))

    if mode == "main":
        foods = extract_rows(rows, IDENT_ROW_INDEX, DATA_START_INDEX, "main")
    elif mode in ("amino", "fatty"):
        foods = extract_rows(rows, SUB_IDENT_ROW_INDEX, SUB_DATA_START_INDEX, mode)
    else:
        print(f"未知 mode：{mode}（应为 main|amino|fatty）")
        sys.exit(1)

    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(foods, handle, ensure_ascii=False, indent=2)
    print(f"转换完成（{mode}）：{len(foods)} 条食品 -> {output_path}")


if __name__ == "__main__":
    main()
