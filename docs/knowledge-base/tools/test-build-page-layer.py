#!/usr/bin/env python3
"""页级解析器 / 页图渲染器的无依赖自检（不需要 pytest）。

用法：
    python3 docs/knowledge-base/tools/test-build-page-layer.py

覆盖：
1. 用 fitz 生成 3 页 PDF（第 1 页标题+正文+一张小图，第 2 页带文字的表格线，第 3 页空白），
   设一条 TOC，跑 build-page-layer.py，断言 pageCount / 文本 / table 块 / TOC 页范围；
2. 生成一个 .txt，断言伪页 pageCount、hasTextLayer、imagePath=null；
3. manifest 指向不存在的文件时，解析器以非 0 退出；
4. 跑一次 render-page-images.py，断言 JPG 存在且非空。
"""

import csv
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import fitz

TOOLS_DIR = Path(__file__).resolve().parent
BUILD_SCRIPT = TOOLS_DIR / "build-page-layer.py"
RENDER_SCRIPT = TOOLS_DIR / "render-page-images.py"

CHECKS = []


def check(label, condition, detail=""):
    CHECKS.append((label, bool(condition)))
    status = "ok" if condition else "FAIL"
    print(f"[{status}] {label}" + (f" :: {detail}" if detail else ""))
    if not condition:
        raise AssertionError(f"{label} {detail}".strip())


def run(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def make_pdf(path):
    """3 页 PDF：标题/正文/图、表格线、空白；带 TOC。"""
    doc = fitz.open()
    page1 = doc.new_page(width=595, height=842)
    page1.insert_text((72, 90), "CKD Nutrition", fontsize=20)
    page1.insert_text(
        (72, 130),
        "Chronic kidney disease (CKD) in dogs and cats: phosphorus restriction.",
        fontsize=11,
    )
    # 一张 20x20 的小图，用来验证 figure 块
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 20, 20))
    pix.set_rect(pix.irect, (200, 30, 30))
    page1.insert_image(fitz.Rect(72, 180, 172, 280), pixmap=pix)
    page1.insert_text((72, 300), "Figure 1. A tiny red square.", fontsize=11)

    page2 = doc.new_page(width=595, height=842)
    page2.insert_text((72, 90), "Table 1. Blood values", fontsize=12)
    x0, y0, width, height = 72, 120, 300, 90
    rows, cols = 3, 3
    for i in range(rows + 1):
        y = y0 + i * height / rows
        page2.draw_line((x0, y), (x0 + width, y))
    for j in range(cols + 1):
        x = x0 + j * width / cols
        page2.draw_line((x, y0), (x, y0 + height))
    for i in range(rows):
        for j in range(cols):
            page2.insert_text(
                (x0 + j * width / cols + 6, y0 + i * height / rows + 20),
                f"r{i}c{j}",
                fontsize=10,
            )

    doc.new_page(width=595, height=842)  # 第 3 页：空白
    doc.set_toc([[1, "Chapter 1", 1]])
    doc.save(path)
    doc.close()


def write_manifest(path, rows):
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["来源ID", "相对路径", "字节", "SHA256", "说明"])
        for row in rows:
            writer.writerow(row)


def read_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def main():
    if not BUILD_SCRIPT.is_file():
        print(f"[FAIL] 解析器不存在：{BUILD_SCRIPT}")
        return 2
    if not RENDER_SCRIPT.is_file():
        print(f"[FAIL] 渲染器不存在：{RENDER_SCRIPT}")
        return 2

    tmp = Path(tempfile.mkdtemp(prefix="kb-page-layer-test-"))
    try:
        archive = tmp / "archive"
        archive.mkdir()
        (archive / "demo").mkdir()
        out = tmp / "page-layer"
        ids_dir = tmp / "ids"
        ids_dir.mkdir()

        pdf_path = archive / "demo" / "sample.pdf"
        make_pdf(pdf_path)
        (ids_dir / "demo-sample.json").write_text("{}", encoding="utf-8")

        write_manifest(
            archive / "manifest.csv",
            [["DEMO", "demo/sample.pdf", pdf_path.stat().st_size, "", "Demo sample document"]],
        )

        code, stdout, stderr = run(
            [
                sys.executable,
                str(BUILD_SCRIPT),
                "--archive",
                str(archive),
                "--out",
                str(out),
                "--ids-from",
                str(ids_dir),
                "--only",
                "demo-sample",
                "--force",
            ]
        )
        check("PDF 解析退出码 0", code == 0, f"code={code} stderr={stderr[-500:]}")

        json_path = out / "demo-sample.json"
        check("输出文件存在", json_path.is_file(), str(json_path))
        data = read_json(json_path)

        source = data["source"]
        pages = data["pages"]
        toc = data["toc"]

        check("source.id 稳定 ID", source["id"] == "demo-sample", source["id"])
        check("collection 取路径第一段大写", source["collection"] == "DEMO", source["collection"])
        check("title 取 manifest 说明", source["title"] == "Demo sample document", source["title"])
        check("status 默认 unknown", source["status"] == "unknown")
        check("license 默认 internal", source["license"] == "internal")
        check("checksum 由文件计算", len(source["checksum"]) == 64, source["checksum"])
        check("archivePath 为相对路径", source["archivePath"] == "demo/sample.pdf")
        check("pageCount=3", source["pageCount"] == 3, str(source["pageCount"]))
        check("pages 数量=3", len(pages) == 3, str(len(pages)))
        check("hasTextLayer=True", source["hasTextLayer"] is True)

        check("第 1 页文本含 CKD", "CKD" in pages[0]["text"], pages[0]["text"][:60])
        check("第 1 页 imagePath", pages[0]["imagePath"] == "demo-sample/p0001.jpg", pages[0]["imagePath"])
        check("第 1 页有 figure 块", any(b["kind"] == "figure" for b in pages[0]["blocks"]))
        check(
            "第 1 页图注取 Figure 首行",
            any(
                b["caption"] and b["caption"].startswith("Figure 1")
                for b in pages[0]["blocks"]
                if b["kind"] == "figure"
            ),
            str([b["caption"] for b in pages[0]["blocks"] if b["kind"] == "figure"]),
        )
        check("第 1 页有 paragraph 块", any(b["kind"] == "paragraph" for b in pages[0]["blocks"]))
        check(
            "页内块 ID 规则",
            all(b["id"].startswith("demo-sample-p0001-b") for b in pages[0]["blocks"]),
        )
        check("第 1 页尺寸存在", pages[0]["width"] and pages[0]["height"] == 842)

        table_blocks = [b for b in pages[1]["blocks"] if b["kind"] == "table"]
        check("第 2 页有 table 块", len(table_blocks) >= 1, str(len(table_blocks)))
        if table_blocks:
            bbox = table_blocks[0]["bbox"]
            check(
                "table bbox 是几何框",
                bbox["x1"] > bbox["x0"] and bbox["y1"] > bbox["y0"],
                str(bbox),
            )
            check(
                "表题取 Table 首行",
                (table_blocks[0]["caption"] or "").startswith("Table 1"),
                str(table_blocks[0]["caption"]),
            )

        check("第 3 页空白文本", pages[2]["text"].strip() == "", repr(pages[2]["text"]))
        check("第 3 页仍有 imagePath", pages[2]["imagePath"] == "demo-sample/p0003.jpg")

        check("TOC 1 条", len(toc) == 1, str(len(toc)))
        check("TOC pageFrom=1", toc[0]["pageFrom"] == 1, str(toc[0]))
        check("TOC pageTo=3", toc[0]["pageTo"] == 3, str(toc[0]))
        check("TOC id 规则", toc[0]["id"] == "demo-sample-toc-1", toc[0]["id"])

        # --- 幂等：不加 --force 时跳过 ---
        code, stdout, stderr = run(
            [
                sys.executable,
                str(BUILD_SCRIPT),
                "--archive",
                str(archive),
                "--out",
                str(out),
                "--ids-from",
                str(ids_dir),
                "--only",
                "demo-sample",
            ]
        )
        check("已存在不加 --force 跳过", code == 0 and "skip" in stdout.lower(), stdout[-300:])

        # --- TXT 伪页 ---
        txt_path = archive / "demo" / "notes.txt"
        txt_path.write_text("Chronic kidney disease notes. " * 40, encoding="utf-8")
        (ids_dir / "demo-notes.json").write_text("{}", encoding="utf-8")
        write_manifest(
            archive / "manifest.csv",
            [
                ["DEMO", "demo/sample.pdf", pdf_path.stat().st_size, "", "Demo sample document"],
                ["DEMO", "demo/notes.txt", txt_path.stat().st_size, "", ""],
            ],
        )
        code, stdout, stderr = run(
            [
                sys.executable,
                str(BUILD_SCRIPT),
                "--archive",
                str(archive),
                "--out",
                str(out),
                "--ids-from",
                str(ids_dir),
                "--only",
                "demo-notes",
                "--force",
            ]
        )
        check("TXT 解析退出码 0", code == 0, f"code={code} stderr={stderr[-500:]}")
        txt_data = read_json(out / "demo-notes.json")
        check("TXT pageCount=1", txt_data["source"]["pageCount"] == 1, str(txt_data["source"]["pageCount"]))
        check("TXT hasTextLayer=True", txt_data["source"]["hasTextLayer"] is True)
        check("TXT imagePath=null", txt_data["pages"][0]["imagePath"] is None)
        check("TXT 页有文本", len(txt_data["pages"][0]["text"]) > 100)
        check("TXT 无 TOC 时写全文", len(txt_data["toc"]) == 1 and txt_data["toc"][0]["pageTo"] == 1)

        # --- 长 TXT：按 ~3,000 字切伪页 ---
        long_path = archive / "demo" / "long.txt"
        long_path.write_text("CKD paragraph about phosphorus. " * 400, encoding="utf-8")
        (ids_dir / "demo-long.json").write_text("{}", encoding="utf-8")
        write_manifest(
            archive / "manifest.csv",
            [
                ["DEMO", "demo/sample.pdf", pdf_path.stat().st_size, "", "Demo sample document"],
                ["DEMO", "demo/notes.txt", txt_path.stat().st_size, "", ""],
                ["DEMO", "demo/long.txt", long_path.stat().st_size, "", ""],
            ],
        )
        code, stdout, stderr = run(
            [
                sys.executable,
                str(BUILD_SCRIPT),
                "--archive",
                str(archive),
                "--out",
                str(out),
                "--ids-from",
                str(ids_dir),
                "--only",
                "demo-long",
                "--force",
            ]
        )
        check("长 TXT 解析退出码 0", code == 0, f"code={code} stderr={stderr[-500:]}")
        long_data = read_json(out / "demo-long.json")
        check(
            "长 TXT 切成多页伪页",
            long_data["source"]["pageCount"] >= 2
            and long_data["source"]["pageCount"] == len(long_data["pages"])
            and all(p["imagePath"] is None for p in long_data["pages"])
            and all(len(p["text"]) <= 3200 for p in long_data["pages"]),
            str(long_data["source"]["pageCount"]),
        )

        # --- 缺失文件：非 0 退出 ---
        bad_archive = tmp / "bad-archive"
        bad_archive.mkdir()
        bad_ids = tmp / "bad-ids"
        bad_ids.mkdir()
        (bad_ids / "demo-gone.json").write_text("{}", encoding="utf-8")
        write_manifest(
            bad_archive / "manifest.csv",
            [["DEMO", "demo/gone.pdf", 0, "", "Missing file"]],
        )
        code, stdout, stderr = run(
            [
                sys.executable,
                str(BUILD_SCRIPT),
                "--archive",
                str(bad_archive),
                "--out",
                str(tmp / "bad-out"),
                "--ids-from",
                str(bad_ids),
                "--only",
                "demo-gone",
                "--force",
            ]
        )
        check("缺失文件非 0 退出", code != 0, f"code={code} stdout={stdout[-300:]}")

        # --- 未支持格式（.docx）：明确报错，不静默漏 ---
        docx_path = archive / "demo" / "unknown.docx"
        docx_path.write_bytes(b"PK\x03\x04 not a real docx")
        (ids_dir / "demo-unknown.json").write_text("{}", encoding="utf-8")
        write_manifest(
            archive / "manifest.csv",
            [["DEMO", "demo/unknown.docx", docx_path.stat().st_size, "", ""]],
        )
        code, stdout, stderr = run(
            [
                sys.executable,
                str(BUILD_SCRIPT),
                "--archive",
                str(archive),
                "--out",
                str(out),
                "--ids-from",
                str(ids_dir),
                "--only",
                "demo-unknown",
                "--force",
            ]
        )
        check(
            "未支持格式非 0 退出并说明原因",
            code != 0 and "不支持" in stdout,
            f"code={code} stdout={stdout[-300:]}",
        )

        # --- 渲染器 ---
        images = tmp / "page-images"
        code, stdout, stderr = run(
            [
                sys.executable,
                str(RENDER_SCRIPT),
                "--archive",
                str(archive),
                "--layer",
                str(out),
                "--out",
                str(images),
                "--only",
                "demo-sample",
            ]
        )
        check("渲染器退出码 0", code == 0, f"code={code} stderr={stderr[-500:]}")
        for page_no in (1, 2, 3):
            jpg = images / "demo-sample" / f"p{page_no:04d}.jpg"
            check(f"页图 p{page_no:04d} 存在", jpg.is_file(), str(jpg))
            if jpg.is_file():
                raw = jpg.read_bytes()
                check(f"页图 p{page_no:04d} 非空且是 JPEG", len(raw) > 1000 and raw[:2] == b"\xff\xd8", str(len(raw)))

        # 第二次渲染应跳过
        code, stdout, stderr = run(
            [
                sys.executable,
                str(RENDER_SCRIPT),
                "--archive",
                str(archive),
                "--layer",
                str(out),
                "--out",
                str(images),
                "--only",
                "demo-sample",
            ]
        )
        check("渲染器已存在跳过", code == 0 and "skip" in stdout.lower(), stdout[-300:])

        print(f"\nPASS：{len(CHECKS)} 项检查全部通过（{tmp}）")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
