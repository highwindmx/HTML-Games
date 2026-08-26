#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
弓猎 Web 导出前自检清单
======================
在本地用 Godot 4.7 导出 HTML5 之前跑一遍，确保此前修复（中文 fallback_font /
WASD 画布焦点 / MOBA 摇杆 / 死亡卡顿 / 熊脱战）所需的资源与配置都已就绪。

用法：
    python tools/export_checklist.py
退出码：全部 PASS → 0；存在 FAIL → 1。

注意：本脚本只做静态文件/配置校验，不调用 Godot，也不生成任何导出产物。
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # hunt/


def check(name: str, ok: bool, detail: str = "") -> bool:
    mark = "PASS" if ok else "FAIL"
    line = f"[{mark}] {name}"
    if detail:
        line += f"  — {detail}"
    print(line)
    return ok


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def _parse_cmap_cjk(path: Path) -> set[int]:
    """纯 stdlib 解析字体 cmap，返回所有支持的码点集合（fmt 4 / 12）。"""
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        return set()
    if len(data) < 12 or data[:4] not in (b"\x00\x01\x00\x00", b"true", b"OTTO", b"ttcf"):
        return set()
    def u16(o): return (data[o] << 8) | data[o + 1]
    def u32(o): return (data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]
    off = None
    for i in range(u16(4)):
        base = 12 + i * 16
        if data[base:base + 4] == b"cmap":
            off = u32(base + 8)
            break
    if off is None:
        return set()
    out: set[str] = set()
    for i in range(u16(off + 2)):
        e = off + 4 + i * 8
        so = off + u32(e + 4)
        fmt = u16(so)
        if fmt == 4:
            seg = int(u16(so + 6) / 2)
            ends = [u16(so + 14 + j * 2) for j in range(seg)]
            starts = [u16(so + 14 + seg * 2 + 2 + j * 2) for j in range(seg)]
            for j in range(seg):
                st, en = starts[j], ends[j]
                if st == 0xFFFF:
                    continue
                out.update(chr(x) for x in range(st, en + 1))
        elif fmt == 12:
            n = u32(so + 12)
            for k in range(n):
                st = u32(so + 16 + k * 12)
                en = u32(so + 16 + k * 12 + 4)
                out.update(chr(x) for x in range(st, en + 1))
    return out


def _game_cjk_chars(root: Path) -> set[str]:
    """收集 scripts/scenes 中会出现在游戏画面里的汉字。
    跳过 GDScript 注释（按 '#' 截断）与 push_warning/print 等日志调用所在行
    （其字符串非显示文本），避免写中文注释/告警就误报缺字。"""
    _log_kw = ("push_warning(", "push_error(", "print(", "printerr(", "print_verbose(")
    chars: set[str] = set()
    for pat in ("scripts/*.gd", "scenes/*.tscn"):
        for f in root.glob(pat):
            is_gd = f.suffix == ".gd"
            for line in read(f).splitlines():
                if is_gd:
                    h = line.find("#")
                    if h != -1:
                        line = line[:h]
                    if any(k in line for k in _log_kw):
                        continue
                for c in line:
                    if "一" <= c <= "鿿":
                        chars.add(c)
    return chars


def cjk_coverage_ok(root: Path) -> tuple[bool, str]:
    sup = _parse_cmap_cjk(root / "fonts" / "NotoSansSC-Subset.ttf")
    used = _game_cjk_chars(root)
    missing = sorted(c for c in used if c not in sup)
    if not missing:
        return True, f"游戏用字 {len(used)} 个全部覆盖"
    return False, f"缺失 {len(missing)} 字: " + "".join(missing)


def _parse_glyph_map_keys(root: Path) -> set[str]:
    """解析 ui_text/glyph_map.gd 的 MAP 码点集合（图片文字方案）。"""
    txt = read(root / "ui_text" / "glyph_map.gd")
    if not txt:
        return set()
    keys: set[str] = set()
    for m in re.finditer(r'"(\d+)":\s*\[', txt):
        keys.add(chr(int(m.group(1))))
    return keys


def atlas_ok(root: Path) -> tuple[bool, str]:
    """烘焙图集存在且覆盖游戏用到的全部字符（含 ASCII）。"""
    png = root / "ui_text" / "glyph_atlas.png"
    keys = _parse_glyph_map_keys(root)
    if not png.exists():
        return False, "ui_text/glyph_atlas.png 不存在，请先跑 tools/bake_glyph_atlas.py"
    if not keys:
        return False, "ui_text/glyph_map.gd 未解析到字形"
    used: set[str] = set()
    _log_kw = ("push_warning(", "push_error(", "print(", "printerr(", "print_verbose(")
    for pat in ("scripts/*.gd", "scenes/*.tscn"):
        for f in root.glob(pat):
            is_gd = f.suffix == ".gd"
            for line in read(f).splitlines():
                if is_gd:
                    h = line.find("#")
                    if h != -1:
                        line = line[:h]
                    if any(k in line for k in _log_kw):
                        continue
                for c in line:
                    if ord(c) >= 0x20:
                        used.add(c)
    missing = sorted(c for c in used if c not in keys)
    if not missing:
        return True, f"图集 {len(keys)} 字形覆盖全部游戏用字"
    return False, f"图集缺 {len(missing)} 字: " + "".join(missing)


def main() -> int:
    results: list[bool] = []
    print("=" * 60)
    print("弓猎 Web 导出前自检 — hunt/")
    print("=" * 60)

    # ---- 1. 中文 CJK 字体资源（FontFile）----
    cjk_ttf = ROOT / "fonts" / "NotoSansSC-Subset.ttf"
    cjk_import = ROOT / "fonts" / "NotoSansSC-Subset.ttf.import"
    import_txt = read(cjk_import)
    ok = cjk_ttf.exists() and cjk_import.exists() and 'type="FontFile"' in import_txt
    results.append(check(
        "CJK 字体资源齐全（FontFile）", ok,
        "NotoSansSC-Subset.ttf + .import(type=FontFile)"
        if ok else "缺失 ttf 或 .import 或非 FontFile",
    ))

    # ---- 1b. CJK 字体子集覆盖全部游戏用字（防漏字→方块）----
    cov_ok, cov_detail = cjk_coverage_ok(ROOT)
    results.append(check(
        "CJK 字体子集覆盖全部游戏用字", cov_ok, cov_detail,
    ))

    # ---- 1c. 字体导入禁用 MSDF（Web 渲染 CJK 方块的高发原因）----
    ok = ("multichannel_signed_distance_field=false" in import_txt)
    results.append(check(
        "CJK 字体导入禁用 MSDF（防 Web 方块）", ok,
        "multichannel_signed_distance_field=false" if ok
        else "仍为 true：Web/GLES 下 MSDF 易致中文方块，请改为 false",
    ))

    # ---- 1d. 烘焙字形图集覆盖全部游戏用字（图片文字方案）----
    at_ok, at_detail = atlas_ok(ROOT)
    results.append(check(
        "烘焙字形图集覆盖全部游戏用字", at_ok, at_detail,
    ))

    # ---- 1e. 场景中无残留 type=Label（中文已全部改为 ImageText）----
    leftover = 0
    for f in (ROOT / "scenes").glob("*.tscn"):
        for line in read(f).splitlines():
            if 'type="Label"' in line:
                leftover += 1
    results.append(check(
        "场景无残留 Label 节点", leftover == 0,
        f"剩余 {leftover} 个 Label（应改用 ImageText）" if leftover
        else "已全部转为 ImageText",
    ))

    # ---- 2. project.godot autoload ----
    pgodot = read(ROOT / "project.godot")
    ok = '[autoload]' in pgodot and 'CJKFont="*res://scripts/CJKFont.gd"' in pgodot
    results.append(check(
        "project.godot 注册 CJKFont autoload", ok,
        "已注册" if ok else "缺少 [autoload] 或 CJKFont 行",
    ))

    # ---- 3. CJKFont.gd 使用 ThemeDB.fallback_font（Godot 4 合法 API）----
    cjkfont = read(ROOT / "scripts" / "CJKFont.gd")
    ok = ("ThemeDB.fallback_font" in cjkfont) and ("NotoSansSC-Subset.ttf" in cjkfont) \
        and ("BitmapFont.new" not in cjkfont) and ("BitmapFont)" not in cjkfont)
    results.append(check(
        "CJKFont.gd 用 fallback_font 修复（无 BitmapFont 调用）", ok,
        "引用 CJK 字体并赋值 ThemeDB.fallback_font" if ok
        else "未引用 fallback_font 或仍残留 BitmapFont.new() 调用（Godot 4 已移除该类）",
    ))

    # ---- 5. export_presets.cfg 画布焦点 + 手势拦截 ----
    presets = read(ROOT / "export_presets.cfg")
    focus_on_start = "html/focus_canvas_on_start=true" in presets
    results.append(check(
        "导出预设 focus_canvas_on_start", focus_on_start,
        "启动聚焦画布" if focus_on_start else "缺失",
    ))

    m = re.search(r'html/head_include="(.*)"', presets, re.S)
    head = m.group(1) if m else ""
    # 校验转义双引号成对（偶数个 \"）
    esc_count = head.count('\\"')
    esc_ok = (esc_count % 2 == 0)
    # 关键修复片段是否存在
    has_focus = "focus" in head and "pointerdown" in head
    has_gesture = "gesturestart" in head and "passive:false" in head and "contextmenu" in head
    head_ok = bool(m) and esc_ok and has_focus and has_gesture
    detail = []
    if not m:
        detail.append("未找到 head_include")
    if not esc_ok:
        detail.append(f"转义双引号数={esc_count}(需偶数)")
    if not has_focus:
        detail.append("缺画布聚焦(pointerdown/focus)")
    if not has_gesture:
        detail.append("缺手势/长按拦截")
    results.append(check(
        "head_include 含焦点+手势拦截且转义完整", head_ok,
        "OK" if head_ok else "；".join(detail),
    ))

    # ---- 6. TouchControl.tscn 已移除 FireBtn ----
    tc = read(ROOT / "scenes" / "TouchControl.tscn")
    ok = ("FireBtn" not in tc) and ("3_firebtn" not in tc)
    results.append(check(
        "TouchControl.tscn 无 FireBtn 残留", ok,
        "MOBA 合一摇杆，已清理独立开火键" if ok else "仍残留 FireBtn / 3_firebtn",
    ))

    # ---- 6b. 所有 .tscn 不得含缺失 path 的 ext_resource（否则解析失败）----
    bad = []
    for tscn in (ROOT / "scenes").rglob("*.tscn"):
        txt = read(tscn)
        for ln in txt.splitlines():
            s = ln.strip()
            if s.startswith("[ext_resource") and 'path=' not in s:
                bad.append(f"{tscn.name}: {s}")
    ok = not bad
    results.append(check(
        "所有 .tscn 无缺 path 的 ext_resource", ok,
        "OK" if ok else "；".join(bad),
    ))

    # ---- 7. 熊脱战 + 停步间距 ----
    enemy = read(ROOT / "scripts" / "Enemy.gd")
    ok = ("BEAR_LEASH_RANGE" in enemy) and ("BEAR_STANDOFF" in enemy)
    results.append(check(
        "Enemy.gd 含熊脱战/停步间距常量", ok,
        "BEAR_LEASH_RANGE + BEAR_STANDOFF" if ok else "缺失常量",
    ))

    # ---- 8. 导出资源过滤（_warn 级，不计入 FAIL）----
    ef = re.search(r'export_filter="?([^"\n]+)"?', presets)
    if ef and ef.group(1) != "all_resources":
        print(f"[WARN] export_filter={ef.group(1)}（建议 all_resources，确保位图字体资源被打包）")
    else:
        print("[INFO] export_filter=all_resources（位图字体资源会被打包）")

    print("=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"结果：{passed}/{total} 项 PASS")
    if all(results):
        print("✅ 全部就绪，可本地 Godot 4.7 导出 HTML5 并上传 docs/")
        return 0
    print("❌ 存在 FAIL，请先修复后再导出")
    return 1


if __name__ == "__main__":
    sys.exit(main())
