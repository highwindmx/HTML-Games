#!/usr/bin/env python3
"""烘焙中文/符号字形图集：把游戏用到的所有文字渲染成一张 PNG（白字透明底），
并生成 glyph_map.gd（图集元数据）。运行时由 scripts/ImageText.gd 按需切片绘制，
彻底绕开 Godot Web 动态字体（图片纹理在 Web 上必出，方块问题根治）。

用法： python tools/bake_glyph_atlas.py
依赖： Pillow + 项目自带圆体字体 fonts/ZCOOLKuaiLe-Regular.ttf（站酷快乐体，OFL 开源，圆润粗体，神似幼圆）
说明： 提高 REF/CELL_H 让字形烘焙分辨率更高，缩小显示时更锐利、不糊。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent          # hunt/
FONT = ROOT / "fonts" / "ZCOOLKuaiLe-Regular.ttf"
OUT_DIR = ROOT / "ui_text"

ATLAS_W = 4096
CELL_H = 160          # 单元高度(px) —— 字形垂直居中（高于 REF 留出上下边距，防裁切）
REF = 140             # 字形渲染字号(px)（<= CELL_H，留白）—— 比旧 96 高，缩放更锐利
GAP = 8               # 单元左右内边距基准

# 全 ASCII 可打印字符（0x20-0x7E）一并纳入，防患未然（数字/字母/符号）
ASCII_PRINT = [chr(c) for c in range(0x20, 0x7F)]


# 日志/告警调用关键字：其字符串参数是调试信息，非渲染文本，不应占用图集/子集，
# 否则写一句中文告警就会误报缺字（如 ImageText.gd 的 push_warning）。
_LOG_KEYWORDS = ("push_warning(", "push_error(", "print(", "printerr(", "print_verbose(")


def collect_chars() -> set[str]:
    """收集 scripts/scenes 中【会出现在渲染里】的字符。
    跳过 GDScript 注释（按 '#' 截断，已确认显示字符串不含 '#'）；
    跳过 push_warning/print 等日志调用所在行（其字符串非显示文本）。
    注释永不渲染、日志非渲染，均不应占用图集/子集，避免写中文就误报缺字。"""
    text = ""
    for pat in ("scripts/*.gd", "scenes/*.tscn"):
        for f in ROOT.glob(pat):
            is_gd = f.suffix == ".gd"
            for line in f.read_text(encoding="utf-8").splitlines():
                if is_gd:
                    h = line.find("#")
                    if h != -1:
                        line = line[:h]
                    if any(k in line for k in _LOG_KEYWORDS):
                        continue  # 日志/告警行的字符串非显示文本
                if not line.strip():
                    continue
                text += line + "\n"
    chars = set(text)
    chars.update(ASCII_PRINT)
    # 仅保留可打印（过滤控制字符）
    chars = {c for c in chars if ord(c) >= 0x20}
    return chars


def is_wide(ch: str) -> bool:
    """宽字符（CJK / 全角 / 部分标点）→ 占满单元宽；其余按墨宽。"""
    cp = ord(ch)
    if 0x2E80 <= cp <= 0x9FFF:
        return True
    if 0xF900 <= cp <= 0xFAFF:
        return True
    if 0xFF00 <= cp <= 0xFFEF:
        return True      # 全角形式
    if cp == 0x3000:
        return True      # 全角空格
    if ch in ("·", "…", "、", "。", "《", "》", "「", "」", "【", "】", "（", "）", "：", "，", "！", "？"):
        return True
    return False


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    chars = sorted(collect_chars(), key=lambda c: ord(c))
    font = ImageFont.truetype(str(FONT), REF)

    tmp = ImageDraw.Draw(Image.new("RGBA", (10, 10)))

    def ink_w(ch: str) -> int:
        try:
            bb = tmp.textbbox((0, 0), ch, font=font, anchor="ls")
        except Exception:
            return 0
        return bb[2] - bb[0]

    # 先测每个字形墨宽，定单元宽（防裁切）
    cells: dict[int, int] = {}
    for ch in chars:
        w = ink_w(ch)
        if is_wide(ch):
            cw = max(CELL_H, w + GAP * 2)
        else:
            cw = max(CELL_H // 2, w + GAP * 2)
        cells[ord(ch)] = cw

    # 排样（shelf pack）：单行宽超 ATLAS_W 则换行
    total_w = sum(cells.values())
    rows = (total_w + ATLAS_W - 1) // ATLAS_W + 1
    atlas = Image.new("RGBA", (ATLAS_W, rows * CELL_H), (0, 0, 0, 0))

    x = 0
    y = 0
    map_data: dict[str, list[int]] = {}
    for ch in chars:
        cp = ord(ch)
        cw = cells[cp]
        if x + cw > ATLAS_W:
            x = 0
            y += CELL_H
        cell = Image.new("RGBA", (cw, CELL_H), (0, 0, 0, 0))
        d = ImageDraw.Draw(cell)
        d.text((cw / 2, CELL_H / 2), ch, font=font,
               fill=(255, 255, 255, 255), anchor="mm")
        atlas.paste(cell, (x, y), cell)
        map_data[str(cp)] = [x, y, cw]
        x += cw

    atlas_h = y + CELL_H
    atlas = atlas.crop((0, 0, ATLAS_W, atlas_h))
    atlas.save(OUT_DIR / "glyph_atlas.png")

    # 写 glyph_map.gd（Godot 脚本常量，导出安全，免去 JSON 导入坑）
    lines = [
        "extends RefCounted",
        "# 自动生成，勿手改。由 tools/bake_glyph_atlas.py 生成。",
        "# 字形图集元数据：CELL=单元高度(px)；MAP: 码点字符串 -> [x, y, w]",
        f"const CELL := {CELL_H}",
        "const MAP := {",
    ]
    for cp, (mx, my, mw) in map_data.items():
        lines.append(f'\t"{cp}": [{mx}, {my}, {mw}],')
    lines.append("}")
    (OUT_DIR / "glyph_map.gd").write_text("\n".join(lines), encoding="utf-8")

    missing = [c for c in chars if ink_w(c) == 0]
    print(f"字形数: {len(chars)}  图集: {ATLAS_W}x{atlas_h}  缺失字形: {len(missing)}")
    if missing:
        print("警告：以下字符字体缺字形（将渲染为空）：", "".join(missing))


if __name__ == "__main__":
    main()
