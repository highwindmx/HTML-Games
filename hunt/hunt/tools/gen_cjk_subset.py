#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
弓猎 — 根据游戏实际文案重新生成中文子集字体
============================================
根因：先前子集是按旧版文案截取，游戏迭代后新增了菜单/HUD/武器名等文案，
      部分汉字未被纳入子集 → Web 端这些字渲染成方块(tofu)。

本脚本：
  1. 扫描 hunt/scripts/*.gd + hunt/scenes/*.tscn 里出现的所有字符；
  2. 合并 ASCII 可打印 + CJK 标点 + 全角符号，构成所需字符集；
  3. 从系统完整字体 (NotoSansSC-VF.ttf，OFL 可商用) 实例化 Regular 并子集化；
  4. 覆盖写出 hunt/fonts/NotoSansSC-Subset.ttf；
  5. 报告覆盖率（应为 100%），缺失字符会列出，方便补字。

用法：
    python tools/gen_cjk_subset.py
依赖：fonttools  (pip install fonttools)
"""
import glob
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # hunt/
SRC_FONT = r"C:\Windows\Fonts\NotoSansSC-VF.ttf"
OUT_FONT = os.path.join(ROOT, "fonts", "NotoSansSC-Subset.ttf")


def collect_chars() -> set[int]:
    chars = set()
    _log_kw = ("push_warning(", "push_error(", "print(", "printerr(", "print_verbose(")
    # 扫描游戏源码与场景文本
    for pat in ("scripts/*.gd", "scenes/*.tscn"):
        for f in glob.glob(os.path.join(ROOT, pat)):
            is_gd = f.endswith(".gd")
            try:
                lines = open(f, encoding="utf-8").read().splitlines()
            except Exception:
                continue
            for line in lines:
                # 跳过 GDScript 注释（整行与行内）：注释永不渲染，
                # 不应占用子集，避免写中文注释就误报缺字。
                if is_gd:
                    h = line.find("#")
                    if h != -1:
                        line = line[:h]
                    # 跳过日志/告警调用所在行的字符串：非显示文本（如 push_warning 中文说明）
                    if any(k in line for k in _log_kw):
                        continue
                chars.update(ord(c) for c in line)
    # ASCII 可打印
    chars.update(range(0x20, 0x7F))
    # CJK 标点 + 全角符号 + 常用符号兜底
    for lo, hi in ((0x3000, 0x303F), (0xFF00, 0xFFEF), (0x2000, 0x206F),
                   (0x2022, 0x2026), (0x00B7, 0x00B7), (0x2014, 0x2015),
                   (0x2018, 0x201F), (0x3001, 0x3002)):
        chars.update(range(lo, hi + 1))
    # 仅保留 BMP 内合理码点（避免代理区等无意义码点）
    chars = {c for c in chars if 0x20 <= c <= 0xFFFF and not (0xD800 <= c <= 0xDFFF)}
    return chars


def main() -> int:
    if not os.path.exists(SRC_FONT):
        print(f"[FAIL] 未找到源字体 {SRC_FONT}")
        return 1

    needed = collect_chars()
    print(f"[INFO] 所需字符数(去重码点): {len(needed)}")

    font = TTFont(SRC_FONT)
    # 可变字体 → 实例化 Regular (wght=400)，得到静态字体，Godot 兼容性最好
    if "fvar" in font:
        print("[INFO] 检测到可变字体，实例化为 wght=400 (Regular)")
        instancer.instantiateVariableFont(font, {"wght": 400}, inplace=True)

    # 子集化
    ss = subset.Subsetter(options=subset.Options(
        glyph_names=False,
        recalc_bounds=True,
        recalc_timestamp=False,
        drop_tables=[],
        name_IDs=["*"],
        notdef_outline=True,
        layout_features="*",
    ))
    ss.populate(unicodes=needed)
    ss.subset(font)

    # 覆盖率自检
    cmap = font.getBestCmap()
    missing = sorted(c for c in needed if c not in cmap and 0x4E00 <= c <= 0x9FFF)
    print(f"[INFO] 子集后支持码点: {len(cmap)}")
    if missing:
        print(f"[WARN] 仍有 {len(missing)} 个汉字缺失: " + "".join(chr(c) for c in missing))
    else:
        print("[OK] 全部游戏用汉字均已覆盖(100%)")

    font.save(OUT_FONT)
    size = os.path.getsize(OUT_FONT)
    print(f"[OK] 已写出 {OUT_FONT}  ({size/1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
