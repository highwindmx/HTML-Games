#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
弓猎 Web 导出：修补 export_presets.cfg 的 html/head_include
==========================================================
幂等：若已含标记 MARKER 则跳过；否则在现有 head_include 末尾追加
画布焦点(WASD 键盘) + iOS 手势/长按拦截脚本。

Why: Godot 打开项目重新保存 export_presets.cfg 时，可能丢失 head_include
里的自定义脚本；本脚本可随时一键补回，配合 export_checklist.py 自检。

用法：python tools/fix_head_include.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # hunt/
CFG = ROOT / "export_presets.cfg"

# 幂等标记：写入脚本注释中，便于检测是否已打补丁
MARKER = "GODOT_CANVAS_FOCUS_PATCH"

# 注意：下方 JS 一律使用单引号，使 PATCH 内不含双引号，
# 从而可直接安全嵌入 Godot 的双引号字符串（无需对 " 做 \\" 转义）。
PATCH = (
    '<script>/*' + MARKER + '*/'
    '(function(){'
    'function fc(){var c=document.getElementById(\'canvas\');'
    'if(c){c.setAttribute(\'tabindex\',\'0\');try{c.focus();}catch(e){}}}'
    'document.addEventListener(\'DOMContentLoaded\',function(){fc();'
    'document.addEventListener(\'pointerdown\',function(){fc();},true);});'
    'window.addEventListener(\'load\',fc);'
    '[\'gesturestart\',\'gesturechange\',\'gestureend\'].forEach(function(ev){'
    'document.addEventListener(ev,function(e){e.preventDefault();},{passive:false});});'
    'document.addEventListener(\'touchmove\',function(e){'
    'if(e.touches&&e.touches.length>1){e.preventDefault();}},{passive:false});'
    'document.addEventListener(\'contextmenu\',function(e){e.preventDefault();});'
    'document.addEventListener(\'selectstart\',function(e){e.preventDefault();});'
    '})();</script>'
)


def main() -> int:
    if not CFG.exists():
        print(f"[FAIL] 未找到 {CFG}")
        return 1
    txt = CFG.read_text(encoding="utf-8")
    # head_include 是单行双引号字符串，行尾以 " 结束
    m = re.search(r'^(html/head_include=")(.*)("$)$', txt, re.M)
    if not m:
        print("[FAIL] 未在 export_presets.cfg 找到 html/head_include 行")
        return 1
    prefix, inner, suffix = m.group(1), m.group(2), m.group(3)
    if MARKER in inner:
        print("[INFO] head_include 已含焦点/手势补丁，跳过（幂等）")
        return 0
    new_inner = inner + PATCH  # PATCH 无双引号，直接拼接安全
    new_line = prefix + new_inner + suffix + "\n"
    new_txt = txt[:m.start()] + new_line + txt[m.end():]
    CFG.write_text(new_txt, encoding="utf-8")
    print("[OK] 已追加 画布焦点(WASD) + iOS 手势/长按拦截 到 html/head_include")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
