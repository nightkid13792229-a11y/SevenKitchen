#!/usr/bin/env python3
"""韩国 RDA「국가표준식품성분 DB 10.4」Excel → JSONL 转换。

依赖：openpyxl（**只用于一次性转换**，不参与部署；后端 Node 没有也不需要
xlsx 依赖）。安装：

    python3 -m pip install openpyxl

Usage:
    python3 prepare-korea-xlsx.py <xlsx> <out.jsonl>

输入工作表：
  - 主表 `국가표준식품성분 Database 10.4`：
    第 1 行是分组标题、第 2 行是营养素表头、第 3 行是单位、第 4 行起是数据。
    表头先做空白折叠（`re.sub(r'\\s+', ' ', ...)`）。第 2 行为空时回退到第 1
    行：官方 Excel 把 `폐기율` / `식염상당량` / `콜레스테롤` 的表头纵向合并到
    第 1 行（EF1:EF2 等），read_only 模式下只有左上角有值，不回退就找不到
    `폐기율`。
  - 附录 `부록2)식품코드,국문명,영문명,학명 정보 `（注意：名称末尾有一个空格）：
    按 `DB색인` join，取食品代码 / 英文名 / 学名。

输出：每行一个食品（UTF-8，无 BOM）：

    {index, code, nameKo, nameEn, scientificName, foodGroup, source,
     refuseRate, nutrients: {header: {value, unit}}}

口径：
  - 只保留 Excel 里的**有限数值**单元格；文本一律视为缺失（包括 `-`、`Tr`、
    `(1,200)` 这类括号值和数字文本），不补 0、不猜语义；
  - 没有单位的列（索引 / 食品名等元数据列）不进 `nutrients`；
  - `폐기율` 单独输出为 `refuseRate`（百分数原样，12 表示 12%），不进
    `nutrients`；
  - 任何食品 join 不到附录、或附录里没有食品代码，直接失败退出（不静默）；
  - 索引重复、主表索引为空、表头重复、附录索引重复也直接失败。

成功时打印一行 JSON：`{"foods": 3366, "joined": 3366, "numericCells": ...}`。
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any, Iterable, Sequence

try:
    import openpyxl
except ImportError as error:  # pragma: no cover - 环境缺依赖时给出可执行提示
    raise SystemExit(
        '需要 openpyxl：python3 -m pip install openpyxl'
    ) from error


MAIN_SHEET = '국가표준식품성분 Database 10.4'
APPENDIX_SHEET = '부록2)식품코드,국문명,영문명,학명 정보 '

# 主表固定列（0 基）：第 1 列是 DB 索引，2~5 列是食品元数据。
INDEX_COLUMN = 0
FOOD_GROUP_HEADER = '식품군'
FOOD_NAME_HEADER = '식품명'
SOURCE_HEADER = '출처'
REFUSE_HEADER = '폐기율'

APPENDIX_COLUMNS = ('DB색인', '식품코드', '식품명_국문명', '식품명_영문명', '학명')

# 这些列本来就没有单位；除它们之外的具名列都必须有单位，否则视为结构变化。
UNITLESS_METADATA_HEADERS = frozenset(
    ('DB10.4 색인', '10개정 책자 색인', FOOD_GROUP_HEADER, FOOD_NAME_HEADER, SOURCE_HEADER)
)

WHITESPACE = re.compile(r'\s+')


def normalize_text(value: Any) -> str:
    """单元格 → 去首尾空白的文本；整数浮点（1.0）不加 `.0`。"""
    if value is None:
        return ''
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def collapse_whitespace(value: Any) -> str:
    return WHITESPACE.sub(' ', normalize_text(value)).strip()


def is_finite_number(value: Any) -> bool:
    """只接受真正的数值单元格：bool / 文本 / NaN / Inf 都不算。"""
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def is_blank_row(row: Sequence[Any]) -> bool:
    return all(normalize_text(cell) == '' for cell in row)


def cell_at(row: Sequence[Any], index: int) -> Any:
    return row[index] if index < len(row) else None


def resolve_sheet(workbook: Any, name: str) -> Any:
    if name in workbook.sheetnames:
        return workbook[name]

    # 只容忍首尾空白差异（附录名末尾确实带空格），不做模糊匹配。
    candidates = [item for item in workbook.sheetnames if item.strip() == name.strip()]
    if len(candidates) == 1:
        return workbook[candidates[0]]

    raise SystemExit(
        f'找不到工作表 {name!r}；现有工作表：{workbook.sheetnames}'
    )


def read_main_layout(sheet: Any) -> tuple[list[str], list[str]]:
    """读第 1~3 行，返回空白折叠后的表头与单位（等长）。"""
    rows = sheet.iter_rows(min_row=1, max_row=3, values_only=True)
    row1 = next(rows, ())
    row2 = next(rows, ())
    row3 = next(rows, ())

    width = max(len(row1), len(row2), len(row3))
    headers: list[str] = []
    units: list[str] = []

    for column in range(width):
        header = collapse_whitespace(cell_at(row2, column))
        if not header:
            # 纵向合并的列（폐기율 等）只有第 1 行有值。
            header = collapse_whitespace(cell_at(row1, column))

        headers.append(header)
        units.append(collapse_whitespace(cell_at(row3, column)))

    seen: dict[str, int] = {}
    for column, header in enumerate(headers):
        if not header:
            continue
        if header in seen:
            raise SystemExit(
                f'主表表头重复：{header!r}（第 {seen[header] + 1} 列与第 {column + 1} 列）'
            )
        seen[header] = column

    for required in (FOOD_GROUP_HEADER, FOOD_NAME_HEADER, SOURCE_HEADER, REFUSE_HEADER):
        if required not in seen:
            raise SystemExit(f'主表缺少必需列：{required}')

    unitless = [
        header
        for column, header in enumerate(headers)
        if header and not units[column] and header not in UNITLESS_METADATA_HEADERS
    ]
    if unitless:
        raise SystemExit(f'以下列没有单位，无法当营养素写入：{unitless}')

    return headers, units


def read_appendix(sheet: Any) -> dict[str, dict[str, Any]]:
    """附录 2：DB색인 → {code, nameEn, scientificName}。"""
    rows = sheet.iter_rows(min_row=1, values_only=True)
    header_row = next(rows, ())
    header = [collapse_whitespace(cell) for cell in header_row]

    positions: dict[str, int] = {}
    for name in APPENDIX_COLUMNS:
        if name not in header:
            raise SystemExit(f'附录表缺少必需列：{name}（现有表头：{header}）')
        positions[name] = header.index(name)

    entries: dict[str, dict[str, Any]] = {}
    for row_number, row in enumerate(rows, start=2):
        if is_blank_row(row):
            continue

        key = normalize_text(cell_at(row, positions['DB색인']))
        if not key:
            raise SystemExit(f'附录第 {row_number} 行缺少 DB색인')

        if key in entries:
            raise SystemExit(f'附录 DB색인 重复：{key}（第 {row_number} 行）')

        code = normalize_text(cell_at(row, positions['식품코드']))

        name_en = normalize_text(cell_at(row, positions['식품명_영문명'])) or None
        scientific_name = normalize_text(cell_at(row, positions['학명'])) or None
        entries[key] = {
            'code': code,
            'nameEn': name_en,
            'scientificName': scientific_name,
        }

    return entries


def find_column(headers: Sequence[str], name: str) -> int:
    for column, header in enumerate(headers):
        if header == name:
            return column
    raise SystemExit(f'主表缺少必需列：{name}')


def convert(xlsx_path: Path, out_path: Path) -> dict[str, int]:
    workbook = openpyxl.load_workbook(
        xlsx_path, read_only=True, data_only=True
    )

    try:
        main_sheet = resolve_sheet(workbook, MAIN_SHEET)
        appendix_sheet = resolve_sheet(workbook, APPENDIX_SHEET)

        headers, units = read_main_layout(main_sheet)
        appendix = read_appendix(appendix_sheet)

        name_column = find_column(headers, FOOD_NAME_HEADER)
        group_column = find_column(headers, FOOD_GROUP_HEADER)
        source_column = find_column(headers, SOURCE_HEADER)
        refuse_column = find_column(headers, REFUSE_HEADER)

        nutrient_columns = [
            column
            for column, header in enumerate(headers)
            if header and units[column] and header != REFUSE_HEADER
        ]

        out_path.parent.mkdir(parents=True, exist_ok=True)

        foods = 0
        joined = 0
        numeric_cells = 0
        missing_join: list[str] = []
        missing_code: list[str] = []
        seen_indexes: dict[str, int] = {}

        with out_path.open('w', encoding='utf-8', newline='\n') as handle:
            data_rows: Iterable[Sequence[Any]] = main_sheet.iter_rows(
                min_row=4, values_only=True
            )

            for row_number, row in enumerate(data_rows, start=4):
                if is_blank_row(row):
                    continue

                if len(row) < len(headers):
                    row = tuple(row) + (None,) * (len(headers) - len(row))

                index = normalize_text(cell_at(row, INDEX_COLUMN))
                if not index:
                    raise SystemExit(f'主表第 {row_number} 行缺少索引（第 1 列）')

                if index in seen_indexes:
                    raise SystemExit(
                        f'主表索引重复：{index}（第 {seen_indexes[index]} 行与第 {row_number} 行）'
                    )
                seen_indexes[index] = row_number

                name_ko = normalize_text(cell_at(row, name_column))
                if not name_ko:
                    raise SystemExit(f'主表第 {row_number} 行（索引 {index}）缺少食品名')

                appendix_entry = appendix.get(index)
                if appendix_entry is None:
                    missing_join.append(index)
                    continue

                code = appendix_entry['code']
                if not code:
                    missing_code.append(index)
                    continue

                nutrients: dict[str, dict[str, Any]] = {}
                for column in nutrient_columns:
                    value = cell_at(row, column)
                    if not is_finite_number(value):
                        continue
                    nutrients[headers[column]] = {
                        'value': value,
                        'unit': units[column],
                    }
                    numeric_cells += 1

                refuse_value = cell_at(row, refuse_column)
                refuse_rate = refuse_value if is_finite_number(refuse_value) else None

                record = {
                    'index': index,
                    'code': code,
                    'nameKo': name_ko,
                    'nameEn': appendix_entry['nameEn'],
                    'scientificName': appendix_entry['scientificName'],
                    'foodGroup': normalize_text(cell_at(row, group_column)) or None,
                    'source': normalize_text(cell_at(row, source_column)) or None,
                    'refuseRate': refuse_rate,
                    'nutrients': nutrients,
                }
                handle.write(
                    json.dumps(record, ensure_ascii=False, separators=(',', ':'))
                )
                handle.write('\n')

                foods += 1
                joined += 1

        if missing_join or missing_code:
            details: list[str] = []
            if missing_join:
                details.append(
                    f'join 不到附录的食品 {len(missing_join)} 个：{missing_join[:20]}'
                )
            if missing_code:
                details.append(
                    f'附录中缺少食品代码的食品 {len(missing_code)} 个：{missing_code[:20]}'
                )
            # 失败时删除半成品，避免把不完整 JSONL 当成功产物。
            out_path.unlink(missing_ok=True)
            raise SystemExit('转换失败：' + '；'.join(details))

        if foods == 0:
            out_path.unlink(missing_ok=True)
            raise SystemExit('转换失败：主表没有数据行')

        return {
            'foods': foods,
            'joined': joined,
            'numericCells': numeric_cells,
        }
    finally:
        workbook.close()


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='把韩国 RDA 10.4 Excel 转成导入脚本使用的 JSONL。',
    )
    parser.add_argument('xlsx', help='官方 xlsx 路径')
    parser.add_argument('out', help='输出 JSONL 路径')
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    xlsx_path = Path(args.xlsx).expanduser()
    out_path = Path(args.out).expanduser()

    if not xlsx_path.is_file():
        raise SystemExit(f'找不到 xlsx：{xlsx_path}')

    stats = convert(xlsx_path, out_path)
    print(json.dumps(stats, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
