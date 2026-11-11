#!/usr/bin/env python3
"""PDF / TXT / XML / HTML / EPUB → 页级 JSON（page-layer）。

一条命令：读归档根 `manifest.csv`（来源ID / 相对路径 / SHA256 / 说明），
逐份解析成 `{source, pages, toc}` 的 JSON，供后端导入 `kb_source/kb_page/kb_block/kb_toc`。

设计真源：`docs/knowledge-base/2026-11-11-kb-v3-design.md` §8
计划：`docs/superpowers/plans/2026-11-11-kb-v3-implementation.md` Task 2

用法：
    python3 docs/knowledge-base/tools/build-page-layer.py \
        --archive "$HOME/Documents/SevenKitchen-knowledge-sources" \
        --out docs/knowledge-base/page-layer \
        [--ids-from docs/knowledge-base/source-layer] \
        [--only sacn5-chapters-SACN5-37] [--collection SACN5] [--force]

约定：
- `source.id` 用稳定文档 ID（`source-layer/<docId>.json` 的文件名，如
  `sacn5-chapters-SACN5-37`）；manifest 的 `来源ID` 在本归档里是**归集键**
  （`SACN5` 一份覆盖 69 个文件，159 行只有 22 个唯一值），不能当文档 ID
  ——否则导入时 69 本书会撞成同一个 id。`来源ID` 只用于校验归档归属。
- 只解析 `--ids-from` 目录文件名对应的 docId；默认目录必须是 159 个，
  不是 159 就先停（防止拿错白名单静默漏解析）。
- 生成物不进 git（见 `docs/knowledge-base/.gitignore`）。
"""

import argparse
import csv
import hashlib
import json
import os
import re
import sys
import zipfile
from html import unescape
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover - 环境问题要直说
    sys.stderr.write("缺少依赖 PyMuPDF（pip install pymupdf）\n")
    raise

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_IDS_DIR = REPO_ROOT / "docs" / "knowledge-base" / "source-layer"
EXPECTED_DEFAULT_ID_COUNT = 159

# 非 PDF 按 ~3,000 字切伪页（设计 §8.1）
PSEUDO_PAGE_CHARS = 3000
# 表题/图注只在 bbox 邻近距离内取，不跨页、不猜
CAPTION_MAX_DISTANCE = 80.0
CAPTION_PATTERNS = {
    "table": re.compile(r"(?i)\btable\b"),
    "figure": re.compile(r"(?i)\bfigure\b"),
}
# PDF metadata title 里的排版文件名（QuarkXPress / InDesign）不是标题
JUNK_TITLE_RE = re.compile(r"(?i)\.(qxd|indd|pm\d|fm|doc|docx|pdf)\s*$")
SUPPORTED_PDF = ".pdf"


# --------------------------------------------------------------------------- #
# manifest / docId 白名单
# --------------------------------------------------------------------------- #
def read_manifest(archive: Path):
    path = archive / "manifest.csv"
    if not path.is_file():
        raise SystemExit(f"manifest.csv 不存在：{path}")
    with open(path, encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        fields = set(reader.fieldnames or [])
        required = {"来源ID", "相对路径", "SHA256", "说明"}
        missing = required - fields
        if missing:
            raise SystemExit(f"manifest.csv 缺少列：{', '.join(sorted(missing))}")
        rows = []
        for raw in reader:
            row = {k: (v or "").strip() for k, v in raw.items() if k is not None}
            if not row.get("相对路径"):
                continue
            rows.append(row)
    if not rows:
        raise SystemExit(f"manifest.csv 没有数据行：{path}")
    return rows


def normalize_relative_path(rel: str) -> str:
    """归档相对路径 → 稳定 docId 的归一化形式。

    `sacn5/chapters/SACN5_37.pdf` → `sacn5-chapters-SACN5-37`
    （`source-layer` 的 docId 就是这条规则，再按历史规则截断 60 字符）。
    """
    stem = os.path.splitext(rel)[0]
    value = stem.replace("\\", "/").replace("/", "-").replace("_", "-")
    return re.sub(r"-{2,}", "-", value)


def build_manifest_index(rows):
    return {row["相对路径"]: normalize_relative_path(row["相对路径"]) for row in rows}


def find_manifest_row(doc_id, rows, normalized):
    """按 docId 找 manifest 行；找不到/歧义都返回 (row, error)。"""
    candidates = []
    for row in rows:
        name = normalized.get(row["相对路径"], "")
        if not name:
            continue
        if name == doc_id or name[:60] == doc_id:
            candidates.append(row)
        elif name.startswith(doc_id) and len(name) > len(doc_id) and not name[len(doc_id)].isalnum():
            candidates.append(row)
    if len(candidates) == 1:
        return candidates[0], None
    if not candidates:
        return None, f"manifest.csv 里找不到与 docId {doc_id!r} 对应的相对路径"
    paths = ", ".join(row["相对路径"] for row in candidates[:5])
    return None, f"docId {doc_id!r} 在 manifest.csv 里有 {len(candidates)} 个候选：{paths}"


def load_doc_ids(directory: Path):
    if not directory.is_dir():
        raise SystemExit(f"docId 目录不存在：{directory}")
    ids = []
    for path in sorted(directory.iterdir()):
        if not path.is_file() or path.suffix.lower() != ".json":
            continue
        if path.name.startswith("_"):  # _stats.json / _expected-counts.json / _excluded-README.json
            continue
        if path.stem.upper() in {"README", "MANIFEST"}:
            continue
        ids.append(path.stem)
    return ids


# --------------------------------------------------------------------------- #
# 文件级工具
# --------------------------------------------------------------------------- #
def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def collection_from_path(rel: str) -> str:
    first = rel.replace("\\", "/").split("/")[0]
    return first.upper()


def clean_title(value) -> str:
    text = (value or "").strip()
    if not text or text.lower() in {"untitled", "无标题"}:
        return ""
    if JUNK_TITLE_RE.search(text):
        return ""
    return text


def pick_title(manifest_row, metadata, file_path: Path) -> str:
    for candidate in (manifest_row.get("说明", ""), (metadata or {}).get("title", "")):
        title = clean_title(candidate)
        if title:
            return title
    return file_path.name


# --------------------------------------------------------------------------- #
# 文本型资料 → 伪页
# --------------------------------------------------------------------------- #
def strip_markup(markup: str) -> str:
    text = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", markup)
    text = re.sub(r"(?s)<[^>]+>", "\n", text)
    text = unescape(text)
    lines = [re.sub(r"[ \t\f\v]+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def split_pseudo_pages(text: str, target: int = PSEUDO_PAGE_CHARS):
    """按 ~target 字切伪页，优先段落/句号/换行边界。"""
    text = (text or "").strip()
    if not text:
        return [""]
    pages = []
    rest = text
    while len(rest) > target:
        window = rest[:target]
        cut = window.rfind("\n\n")
        if cut < target // 2:
            cut = max(
                window.rfind(". "),
                window.rfind("。"),
                window.rfind("! "),
                window.rfind("? "),
                window.rfind("; "),
            )
        if cut < target // 2:
            cut = window.rfind("\n")
        if cut < target // 2:
            cut = target
        chunk = rest[:cut].strip()
        if chunk:
            pages.append(chunk)
        rest = rest[cut:].strip()
    if rest:
        pages.append(rest)
    return pages


def read_text_source(path: Path):
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md", ".csv"}:
        return path.read_text(encoding="utf-8", errors="replace")
    if suffix in {".xml", ".html", ".htm", ".xhtml"}:
        return strip_markup(path.read_text(encoding="utf-8", errors="replace"))
    if suffix == ".epub":
        chunks = []
        with zipfile.ZipFile(path) as archive:
            names = sorted(
                name
                for name in archive.namelist()
                if name.lower().endswith((".xhtml", ".html", ".htm"))
            )
            for name in names:
                chunks.append(strip_markup(archive.read(name).decode("utf-8", errors="replace")))
        return "\n\n".join(chunk for chunk in chunks if chunk)
    raise ValueError(f"不支持的格式：{suffix or '(无扩展名)'}（仅支持 pdf/txt/xml/html/epub）")


def pseudo_pages(text: str):
    pages = []
    for index, chunk in enumerate(split_pseudo_pages(text), start=1):
        pages.append(
            {
                "pageNo": index,
                "text": chunk,
                "charCount": len(chunk),
                "width": None,
                "height": None,
                "imagePath": None,
                "blocks": [],
            }
        )
    return pages


# --------------------------------------------------------------------------- #
# PDF → 页
# --------------------------------------------------------------------------- #
def first_line(text: str) -> str:
    for line in (text or "").splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return ""


def nearest_caption(bbox, text_blocks, kind: str):
    """在 bbox 邻近（上/下）的文本块里取首行；不匹配 Table/Figure 就返回 None。"""
    pattern = CAPTION_PATTERNS[kind]
    best = None
    for other_bbox, text in text_blocks:
        horizontally_overlaps = not (other_bbox[2] < bbox[0] or other_bbox[0] > bbox[2])
        if not horizontally_overlaps:
            continue
        if kind == "table":
            # 表题在表格上方
            if other_bbox[3] > bbox[1] + 2:
                continue
            distance = bbox[1] - other_bbox[3]
        else:
            # 图注在图片下方
            if other_bbox[1] < bbox[3] - 2:
                continue
            distance = other_bbox[1] - bbox[3]
        if distance < -2 or distance > CAPTION_MAX_DISTANCE:
            continue
        if best is None or distance < best[0]:
            best = (distance, text)
    if best is None:
        return None
    line = first_line(best[1])
    return line if line and pattern.search(line) else None


def rect_to_bbox(rect):
    return {
        "x0": round(float(rect[0]), 3),
        "y0": round(float(rect[1]), 3),
        "x1": round(float(rect[2]), 3),
        "y1": round(float(rect[3]), 3),
    }


def page_blocks(page, page_no: int, source_id: str):
    """页内块：正文段落 + 表 + 图，按阅读顺序编号。"""
    raw_blocks = []
    text_blocks = []
    try:
        page_dict = page.get_text("dict")
    except Exception:
        page_dict = {"blocks": []}
    for raw in page_dict.get("blocks", []):
        if raw.get("type") != 0:
            continue
        lines = []
        for line in raw.get("lines", []):
            content = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
            if content:
                lines.append(content)
        if not lines:
            continue
        bbox = raw.get("bbox")
        if not bbox:
            continue
        text = "\n".join(lines)
        text_blocks.append((bbox, text))
        raw_blocks.append({"kind": "paragraph", "bbox": bbox, "text": text, "caption": None})

    # 表：find_tables() 的 bbox，不取行列（表格内容看页图）
    try:
        tables = page.find_tables().tables
    except Exception as exc:  # 个别畸形页会让检测器抛错，不拖垮整份文档
        sys.stderr.write(f"  [warn] p{page_no:04d} find_tables 失败：{exc}\n")
        tables = []
    for table in tables:
        bbox = tuple(table.bbox)
        raw_blocks.append(
            {
                "kind": "table",
                "bbox": bbox,
                "text": None,
                "caption": nearest_caption(bbox, text_blocks, "table"),
            }
        )

    # 图：get_images / get_image_rects 的 bbox
    seen_rects = set()
    try:
        images = page.get_images(full=True)
    except Exception:
        images = []
    for image in images:
        xref = image[0]
        try:
            rects = page.get_image_rects(xref)
        except Exception:
            rects = []
        for rect in rects:
            if rect.width <= 1 or rect.height <= 1:
                continue
            key = (round(rect.x0, 1), round(rect.y0, 1), round(rect.x1, 1), round(rect.y1, 1))
            if key in seen_rects:
                continue
            seen_rects.add(key)
            bbox = (rect.x0, rect.y0, rect.x1, rect.y1)
            raw_blocks.append(
                {
                    "kind": "figure",
                    "bbox": bbox,
                    "text": None,
                    "caption": nearest_caption(bbox, text_blocks, "figure"),
                }
            )

    order = {"paragraph": 0, "table": 1, "figure": 2}
    raw_blocks.sort(
        key=lambda item: (
            round(float(item["bbox"][1]), 1),
            round(float(item["bbox"][0]), 1),
            order.get(item["kind"], 9),
        )
    )
    blocks = []
    for index, item in enumerate(raw_blocks, start=1):
        blocks.append(
            {
                "id": f"{source_id}-p{page_no:04d}-b{index:04d}",
                "kind": item["kind"],
                "bbox": rect_to_bbox(item["bbox"]),
                "text": item["text"],
                "caption": item["caption"],
                "orderIndex": index,
            }
        )
    return blocks


def build_toc(toc_entries, page_count: int, source_id: str):
    entries = []
    for level, title, page_no in toc_entries:
        try:
            page_no = int(page_no)
        except (TypeError, ValueError):
            continue
        if page_no < 1 or page_no > page_count:
            continue
        entries.append((int(level or 1), str(title or "").strip(), page_no))
    if not entries:
        return [
            {
                "id": f"{source_id}-toc-1",
                "title": f"全文 1..{page_count}",
                "level": 1,
                "pageFrom": 1,
                "pageTo": page_count,
                "orderIndex": 1,
            }
        ]
    toc = []
    for index, (level, title, page_from) in enumerate(entries, start=1):
        page_to = page_count if index == len(entries) else entries[index][2] - 1
        page_to = max(page_from, min(page_to, page_count))
        toc.append(
            {
                "id": f"{source_id}-toc-{index}",
                "title": title or f"第 {index} 节",
                "level": level,
                "pageFrom": page_from,
                "pageTo": page_to,
                "orderIndex": index,
            }
        )
    return toc


def parse_pdf(path: Path, source_id: str):
    doc = fitz.open(path)
    try:
        page_count = doc.page_count
        pages = []
        for index in range(page_count):
            page = doc[index]
            page_no = index + 1
            text = page.get_text("text") or ""
            pages.append(
                {
                    "pageNo": page_no,
                    "text": text,
                    "charCount": len(text),
                    "width": round(float(page.rect.width), 3),
                    "height": round(float(page.rect.height), 3),
                    # 与 render-page-images.py 的输出路径一致
                    "imagePath": f"{source_id}/p{page_no:04d}.jpg",
                    "blocks": page_blocks(page, page_no, source_id),
                }
            )
        toc = build_toc(doc.get_toc(), page_count, source_id)
        metadata = doc.metadata or {}
        has_text = any(page["text"].strip() for page in pages)
    finally:
        doc.close()
    return pages, toc, metadata, has_text


# --------------------------------------------------------------------------- #
# 单份文档
# --------------------------------------------------------------------------- #
def build_document(archive: Path, doc_id: str, row, collection_override):
    rel = row["相对路径"]
    file_path = archive / rel
    if not file_path.is_file():
        raise FileNotFoundError(f"归档文件不存在：{file_path}")

    expected_sha = row.get("SHA256", "").strip().lower()
    actual_sha = sha256_file(file_path)
    if expected_sha and expected_sha != actual_sha:
        raise ValueError(
            f"SHA256 不一致（manifest={expected_sha[:12]}…, 文件={actual_sha[:12]}…），不导入"
        )

    # 稳定文档 ID：source-layer 文件名（设计 §5.1 / 附录 A 都用这个 ID）
    source_id = doc_id

    collection = (collection_override or collection_from_path(rel)).upper()
    suffix = file_path.suffix.lower()

    if suffix == SUPPORTED_PDF:
        pages, toc, metadata, has_text = parse_pdf(file_path, source_id)
    else:
        text = read_text_source(file_path)
        pages = pseudo_pages(text)
        toc = build_toc([], len(pages), source_id)
        metadata = {}
        has_text = True

    title = pick_title(row, metadata, file_path)

    return {
        "source": {
            "id": source_id,
            "collection": collection,
            "title": title,
            "publisher": collection,
            "version": None,
            "publishedYear": None,
            "status": "unknown",
            "license": "internal",
            "checksum": actual_sha,
            "archivePath": rel,
            "pageCount": len(pages),
            "hasTextLayer": bool(has_text),
        },
        "pages": pages,
        "toc": toc,
    }


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="PDF/TXT → 页级 JSON（page-layer）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--archive", required=True, help="归档根目录（含 manifest.csv）")
    parser.add_argument("--out", required=True, help="输出目录（每份一个 <sourceId>.json）")
    parser.add_argument(
        "--ids-from",
        default=None,
        help=f"docId 白名单目录，默认 {DEFAULT_IDS_DIR}（必须是 159 个）",
    )
    parser.add_argument("--only", default=None, help="只解析一个 docId")
    parser.add_argument("--collection", default=None, help="覆盖 collection（默认路径第一段大写）")
    parser.add_argument("--force", action="store_true", help="覆盖已存在的 JSON")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    archive = Path(args.archive).expanduser().resolve()
    out_dir = Path(args.out).expanduser().resolve()
    if not archive.is_dir():
        sys.stderr.write(f"归档目录不存在：{archive}\n")
        return 2

    using_default_ids = args.ids_from is None
    ids_dir = Path(args.ids_from).expanduser().resolve() if args.ids_from else DEFAULT_IDS_DIR
    doc_ids = load_doc_ids(ids_dir)
    if using_default_ids and len(doc_ids) != EXPECTED_DEFAULT_ID_COUNT:
        sys.stderr.write(
            f"默认 docId 白名单 {ids_dir} 有 {len(doc_ids)} 个，期望 {EXPECTED_DEFAULT_ID_COUNT} 个；先停下来核对。\n"
        )
        return 2
    if not doc_ids:
        sys.stderr.write(f"docId 白名单为空：{ids_dir}\n")
        return 2

    rows = read_manifest(archive)
    normalized = build_manifest_index(rows)
    out_dir.mkdir(parents=True, exist_ok=True)

    targets = doc_ids
    if args.only:
        if args.only not in doc_ids:
            sys.stderr.write(f"--only {args.only!r} 不在 docId 白名单 {ids_dir} 里；先停下来核对。\n")
            return 2
        targets = [args.only]

    parsed = skipped = failed = 0
    for doc_id in targets:
        out_path = out_dir / f"{doc_id}.json"
        if out_path.exists() and not args.force:
            skipped += 1
            print(f"[skip] {doc_id}（已存在 {out_path.name}）")
            continue
        try:
            row, error = find_manifest_row(doc_id, rows, normalized)
            if error:
                raise ValueError(error)
            data = build_document(archive, doc_id, row, args.collection)
            payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            tmp_path = out_path.with_suffix(".json.tmp")
            tmp_path.write_text(payload, encoding="utf-8")
            tmp_path.replace(out_path)
            parsed += 1
            kinds = {}
            for page in data["pages"]:
                for block in page["blocks"]:
                    kinds[block["kind"]] = kinds.get(block["kind"], 0) + 1
            print(
                f"[ok] {doc_id} pages={data['source']['pageCount']} "
                f"toc={len(data['toc'])} blocks={kinds} -> {out_path}"
            )
        except Exception as exc:  # 单份失败不拖垮整批，但退出码要为非 0
            failed += 1
            print(f"[fail] {doc_id}: {exc}")

    print(f"\n解析完成：parsed={parsed} skipped={skipped} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
