#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
建「来源章节索引」——资料库 B 方案第 4 步（离线跑一次，产出 CSV 进仓库）。

为什么要它：
    AI 要能"读原文并给出第几章第几页"，前提是先知道**每份文件里有什么、在哪一页**。
    169 个文件（668 MB）人工翻一遍不现实，所以先机器抽一遍：
    页数、首屏标题、有没有文字层（没有文字层=扫描件，AI 读不到，得单独处理）。

产出：
    docs/knowledge-base/source-chapter-index.csv
      来源目录, 相对路径, 格式, 页数, 首屏标题, 有无文字层, 抽取字符数, 说明

用法：
    python3 docs/knowledge-base/tools/build-source-index.py \
        --archive ~/Documents/SevenKitchen-knowledge-sources \
        --out docs/knowledge-base/source-chapter-index.csv

依赖：PyMuPDF（`pip3 install pymupdf`）。不装进项目依赖，因为这是离线建索引用的。
注意：本脚本**只读**资料库、只写一份 CSV，不上传、不改原文。
"""
import argparse
import csv
import os
import re
import sys
import xml.etree.ElementTree as ET

TEXT_SAMPLE_PAGES = 3


def clean(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text


def guess_source_id(rel_path: str) -> str:
    """从相对路径猜来源 ID，与 source-registry 的命名对齐（猜不到就留目录名）。"""
    head = rel_path.split("/")[0]
    mapping = {
        "aaha": "AAHA",
        "acvim": "ACVIM-CONSENSUS",
        "cn-regulation": "CN-REGULATION",
        "fediaf": "FEDIAF-2025",
        "iris": "IRIS-CKD-2026",
        "merck": "MERCK",
        "nrc": "NRC-2006",
        "sacn5": "SACN5",
        "wsava": "WSAVA",
    }
    base = mapping.get(head, head.upper())

    name = os.path.basename(rel_path).lower()
    if head == "wsava":
        if "vaccination" in rel_path or "vacc" in name:
            base = "WSAVA-VACC"
        elif "pain" in rel_path:
            base = "WSAVA-PAIN-2022"
        elif "dental" in rel_path:
            base = "WSAVA-DENTAL"
        elif "nutrition" in rel_path:
            base = "WSAVA-NUTRITION"
        elif "welfare" in rel_path:
            base = "WSAVA-WELFARE"
        elif "reproduction" in rel_path:
            base = "WSAVA-REPRO"
        elif "renal" in rel_path:
            base = "WSAVA-RENAL"
        elif "hereditary" in rel_path:
            base = "WSAVA-HEREDITARY"
        elif "position" in rel_path:
            base = "WSAVA-POSITION"
    if head == "sacn5":
        m = re.search(r"SACN5_(\d+[a-z]?)\.pdf$", rel_path)
        if m:
            base = f"SACN5 第{m.group(1)}章"
    if head == "merck":
        base = "MERCK"
    return base


def describe_pdf(path: str) -> dict:
    import fitz  # PyMuPDF

    with fitz.open(path) as doc:
        pages = doc.page_count
        chars = 0
        title = ""
        for index in range(min(TEXT_SAMPLE_PAGES, pages)):
            text = doc.load_page(index).get_text("text")
            chars += len(text or "")
            if not title:
                for line in (text or "").splitlines():
                    candidate = clean(line)
                    # 跳过页码、纯数字、过短的行
                    if len(candidate) >= 6 and not candidate.isdigit():
                        title = candidate
                        break
        return {
            "format": "PDF",
            "pages": pages,
            "title": title[:120],
            "has_text": "有" if chars > 200 else "无（疑似扫描件）",
            "chars": chars,
        }


def describe_xml(path: str) -> dict:
    try:
        tree = ET.parse(path)
        root = tree.getroot()
    except ET.ParseError as error:
        return {
            "format": "XML",
            "pages": "",
            "title": f"解析失败：{error}",
            "has_text": "无",
            "chars": 0,
        }
    title = ""
    for tag in ("article-title", "title"):
        node = root.find(f".//{tag}")
        if node is not None and node.text:
            title = clean(node.text)
            break
    text_length = len(clean("".join(root.itertext())))
    return {
        "format": "XML",
        "pages": "",
        "title": title[:120],
        "has_text": "有" if text_length > 200 else "无",
        "chars": text_length,
    }


def describe_text(path: str) -> dict:
    """HTML / TXT / CSV / MD：没有页码概念，只统计字符数（Merck 手册是抓下来的网页正文）。"""
    raw = open(path, encoding="utf-8", errors="ignore").read()
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", raw, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = clean(text)
    title = ""
    match = re.search(r"<title[^>]*>(.*?)</title>", raw, flags=re.S | re.I)
    if match:
        title = clean(match.group(1))
    if not title:
        title = text[:80]
    suffix = os.path.splitext(path)[1].lstrip(".").upper()
    return {
        "format": suffix,
        "pages": "",
        "title": title[:120],
        "has_text": "有" if len(text) > 200 else "无",
        "chars": len(text),
    }


def describe_epub(path: str) -> dict:
    """EPUB 是 zip：用里面 xhtml/html 的数量当"章节数"，总字符数为正文规模。"""
    import zipfile

    with zipfile.ZipFile(path) as archive:
        names = [
            name
            for name in archive.namelist()
            if name.lower().endswith((".xhtml", ".html", ".htm"))
        ]
        chars = 0
        for name in names:
            chars += len(
                clean(
                    re.sub(
                        r"<[^>]+>",
                        " ",
                        archive.read(name).decode("utf-8", errors="ignore"),
                    )
                )
            )
    return {
        "format": "EPUB",
        "pages": len(names),
        "title": f"EPUB：{len(names)} 个章节文件",
        "has_text": "有" if chars > 200 else "无",
        "chars": chars,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True, help="资料库根目录")
    parser.add_argument("--out", required=True, help="输出 CSV 路径")
    args = parser.parse_args()

    archive = os.path.expanduser(args.archive)
    if not os.path.isdir(archive):
        print(f"资料库目录不存在：{archive}", file=sys.stderr)
        return 1

    rows = []
    wanted = (".pdf", ".xml", ".html", ".htm", ".txt", ".md", ".csv", ".epub")
    for root, _dirs, files in os.walk(archive):
        for name in sorted(files):
            if not name.lower().endswith(wanted):
                continue
            full = os.path.join(root, name)
            rel = os.path.relpath(full, archive)
            lower = name.lower()
            try:
                if lower.endswith(".xml"):
                    info = describe_xml(full)
                elif lower.endswith(".pdf"):
                    info = describe_pdf(full)
                elif lower.endswith(".epub"):
                    info = describe_epub(full)
                else:
                    info = describe_text(full)
            except Exception as error:  # noqa: BLE001 - 建索引不该因为一个文件中断
                info = {
                    "format": name.rsplit(".", 1)[-1].upper(),
                    "pages": "",
                    "title": f"读取失败：{error}",
                    "has_text": "未知",
                    "chars": 0,
                }
            rows.append(
                {
                    "来源": guess_source_id(rel),
                    "相对路径": rel,
                    "格式": info["format"],
                    "页数": info["pages"],
                    "首屏标题": info["title"],
                    "有无文字层": info["has_text"],
                    "抽取字符数": info["chars"],
                    "说明": "",
                }
            )
            print(f"  {rel} → {info['pages']} 页 / {info['has_text']}")

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["来源", "相对路径", "格式", "页数", "首屏标题", "有无文字层", "抽取字符数", "说明"],
        )
        writer.writeheader()
        writer.writerows(rows)

    scanned = [row for row in rows if row["有无文字层"].startswith("无")]
    print(f"\n共 {len(rows)} 个文件，其中无文字层（疑似扫描件）{len(scanned)} 个：")
    for row in scanned:
        print(f"  - {row['相对路径']}")
    print(f"\n已写入：{args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
