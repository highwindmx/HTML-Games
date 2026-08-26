#!/usr/bin/env python3
# WSADgame - 字体子集生成 (fonttools)
# 解决 HTML5 导出后手机端中文显示为豆腐块(tofu)：
#   Web 导出环境 Godot TextServer 无法访问系统字体做回退，且**不会套用可变字体(VF)的变体轴**，
#   所以直接用 Noto Sans SC 可变字体子集化会让默认字形为空 → 方块。
#   本脚本：① 把 Noto VF 实例化为 wght=400 静态字体(去掉 fvar/gvar) ② 再子集化，确保 Web 端正常渲染。
#   输出文件名 NotoSansSC-Subset.ttf（OFL 许可的 Noto 子集，可自由分发；与 project.godot 的 default_font 路径一致）。
#
# 用法: python tools/gen_font.py
import os, glob
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
from fontTools.varLib.instancer import instantiateVariableFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")                      # hunt/
SRC_FONT = r"C:\Windows\Fonts\NotoSansSC-VF.ttf"    # 系统完整 Noto Sans SC（可变字体；OFL 可自由分发）
OUT_FONT = os.path.join(ROOT, "fonts", "NotoSansSC-Subset.ttf")  # 子集字体文件名（Noto 内容）；与 project.godot 的 default_font 路径一致

# 1) 收集游戏源码中所有出现过的字符
chars = set()
for pat in ("scripts/*.gd", "scenes/*.tscn"):
    for f in glob.glob(os.path.join(ROOT, pat)):
        with open(f, "r", encoding="utf-8", errors="ignore") as fh:
            chars.update(fh.read())
# 2) 额外补齐：ASCII 可打印 + 全角 + 常用符号，避免动态文本(数字/评级 SABCD/%/标点)漏字
for cp in range(0x20, 0x7F):
    chars.add(chr(cp))
for cp in range(0xFF01, 0xFF5F):
    chars.add(chr(cp))
extra = "　、。，．·：；！？“”‘’（）《》〈〉【】「」—…‰℃×÷±≈≠≤≥°①②③④⑤⑥⑦⑧⑨⑩"
chars.update(extra)

# 3) 诊断：现有子集缺哪些字（证据）
missing_existing = []
if os.path.exists(OUT_FONT):
    ef = TTFont(OUT_FONT)
    ecmap = ef.getBestCmap()
    missing_existing = sorted(c for c in chars if ord(c) not in ecmap)
    if missing_existing:
        print(f"[诊断] 现有子集缺字({len(missing_existing)}个):", "".join(missing_existing))

# 4) 实例化 VF → 静态（关键：去掉变体轴，否则 Web 端 tofu）
assert os.path.exists(SRC_FONT), f"找不到系统字体: {SRC_FONT}"
font = TTFont(SRC_FONT)
if "fvar" in font:
    instantiateVariableFont(font, {"wght": 400}, inplace=True)
    print("[步骤] Noto VF 已实例化为 wght=400 静态字体（fvar/gvar 已移除）")
else:
    print("[步骤] 源字体非可变字体，跳过实例化")

# 4.5) 备份完整字体的 OS/2 ulUnicodeRange（真实 OpenType 规范位，CJK 主区=bit57）。
#      注意：fontTools 这一版把 CJK 主区错归到 bit59，而 Godot Web 按真实规范查 bit57；
#      子集化默认 prune_unicode_ranges 只"关"不"开"，会把 CJK 主区真实位丢掉 → 中文 tofu。
#      稍后把完整字体的真实位写回子集（子集是完整字体的子集，声明相同覆盖合法）。
_orig_os2 = (
    font["OS/2"].ulUnicodeRange1,
    font["OS/2"].ulUnicodeRange2,
    font["OS/2"].ulUnicodeRange3,
    font["OS/2"].ulUnicodeRange4,
)

# 5) 子集化
unicodes = sorted(ord(c) for c in chars if c.strip() != "")
opts = Options()
opts.glyph_names = False
opts.recalc_bounds = True
opts.drop_tables = []
opts.notdef_outline = True
ss = Subsetter(options=opts)
ss.populate(unicodes=unicodes)
ss.subset(font)

# 5.5) 关键修复：把完整 Noto 字体的真实 OS/2 ulUnicodeRange 位写回子集，
#      确保 CJK 主区(bit57)被声明 → Godot Web 正常渲染中文。
font["OS/2"].ulUnicodeRange1 = _orig_os2[0]
font["OS/2"].ulUnicodeRange2 = _orig_os2[1]
font["OS/2"].ulUnicodeRange3 = _orig_os2[2]
font["OS/2"].ulUnicodeRange4 = _orig_os2[3]
print("[步骤] OS/2 ulUnicodeRange 已写回完整字体的真实覆盖位（含 CJK 主区 bit57）")

font.save(OUT_FONT)

# 6) 校验新子集完整性
nf = TTFont(OUT_FONT)
ncmap = nf.getBestCmap()
still_missing = [c for c in chars if ord(c) not in ncmap]
print(f"[完成] 新子集 字符数={len(ncmap)} 体积={os.path.getsize(OUT_FONT)//1024}KB 仍含变体表={('fvar' in nf) or ('gvar' in nf)}")
if still_missing:
    print("[警告] 仍缺字:", "".join(still_missing))
else:
    print("[完成] 全部所需字形已覆盖，手机端不会再出现方块。")
