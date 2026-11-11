#!/usr/bin/env python3
"""页级 JSON → PDF 整页 JPEG（110 dpi，质量 78）。

设计真源：`docs/knowledge-base/2026-11-11-kb-v3-design.md` §8.2（所有 PDF 页都渲染）
计划：`docs/superpowers/plans/2026-11-11-kb-v3-implementation.md` Task 2

用法：
    python3 docs/knowledge-base/tools/render-page-images.py \
        --archive "$HOME/Documents/SevenKitchen-knowledge-sources" \
        --layer docs/knowledge-base/page-layer \
        --out docs/knowledge-base/page-images \
        [--only sacn5-chapters-SACN5-37] [--dpi 110]

约定：
- 输出路径与页级 JSON 的 `pages[].imagePath` 完全一致：`<out>/<sourceId>/p0001.jpg`；
- 已存在的页图直接跳过（断点续渲），不覆盖；
- 非 PDF 页（`imagePath` 为 null）跳过；
- 生成物不进 git（见 `docs/knowledge-base/.gitignore`）。
"""

import argparse
import json
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    sys.stderr.write("缺少依赖 PyMuPDF（pip install pymupdf）\n")
    raise

JPEG_QUALITY = 78
DEFAULT_DPI = 110


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="PDF 页 → 整页 JPEG")
    parser.add_argument("--archive", required=True, help="归档根目录")
    parser.add_argument("--layer", required=True, help="页级 JSON 目录")
    parser.add_argument("--out", required=True, help="页图输出根目录")
    parser.add_argument("--only", default=None, help="只渲染一个 docId")
    parser.add_argument("--dpi", type=int, default=DEFAULT_DPI, help=f"渲染 dpi（默认 {DEFAULT_DPI}）")
    return parser.parse_args(argv)


def load_layer_files(layer_dir: Path, only: str):
    if not layer_dir.is_dir():
        raise SystemExit(f"页级目录不存在：{layer_dir}")
    files = sorted(layer_dir.glob("*.json"))
    if only:
        files = [path for path in files if path.stem == only]
        if not files:
            raise SystemExit(f"页级目录里没有 {only}.json")
    if not files:
        raise SystemExit(f"页级目录没有任何 JSON：{layer_dir}")
    return files


def render_source(archive: Path, layer_path: Path, out_dir: Path, dpi: int):
    with open(layer_path, encoding="utf-8") as fh:
        data = json.load(fh)
    source = data.get("source") or {}
    source_id = source.get("id") or layer_path.stem
    archive_path = source.get("archivePath")
    pages = data.get("pages") or []
    pdf_pages = [page for page in pages if page.get("imagePath")]
    if not pdf_pages:
        return source_id, 0, 0  # 非 PDF（伪页没有页图）
    if not archive_path:
        raise ValueError(f"{source_id} 缺少 archivePath，无法渲染")
    pdf_path = archive / archive_path
    if not pdf_path.is_file():
        raise FileNotFoundError(f"归档文件不存在：{pdf_path}")

    rendered = skipped = 0
    doc = fitz.open(pdf_path)
    try:
        for page in pdf_pages:
            page_no = int(page["pageNo"])
            target = out_dir / page["imagePath"]
            if target.is_file() and target.stat().st_size > 0:
                skipped += 1
                continue
            if page_no < 1 or page_no > doc.page_count:
                raise ValueError(f"{source_id} 页码越界：p{page_no} / pageCount={doc.page_count}")
            pixmap = doc[page_no - 1].get_pixmap(dpi=dpi)
            raw = pixmap.tobytes("jpg", jpg_quality=JPEG_QUALITY)
            if not raw:
                raise ValueError(f"{source_id} p{page_no:04d} 渲染结果为空")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            rendered += 1
    finally:
        doc.close()
    return source_id, rendered, skipped


def main(argv=None):
    args = parse_args(argv)
    archive = Path(args.archive).expanduser().resolve()
    layer_dir = Path(args.layer).expanduser().resolve()
    out_dir = Path(args.out).expanduser().resolve()
    if not archive.is_dir():
        sys.stderr.write(f"归档目录不存在：{archive}\n")
        return 2
    if args.dpi < 36 or args.dpi > 600:
        sys.stderr.write(f"--dpi 超出合理范围（36–600）：{args.dpi}\n")
        return 2

    files = load_layer_files(layer_dir, args.only)
    out_dir.mkdir(parents=True, exist_ok=True)

    total_rendered = total_skipped = failed = 0
    for layer_path in files:
        try:
            source_id, rendered, skipped = render_source(archive, layer_path, out_dir, args.dpi)
            total_rendered += rendered
            total_skipped += skipped
            if rendered or skipped:
                print(f"[ok] {source_id} rendered={rendered} skip={skipped}")
            else:
                print(f"[skip] {source_id}（无 PDF 页图）")
        except Exception as exc:  # 单份失败不拖垮整批，但退出码非 0
            failed += 1
            print(f"[fail] {layer_path.stem}: {exc}")

    print(f"\n渲染完成：rendered={total_rendered} skipped={total_skipped} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
