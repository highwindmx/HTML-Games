extends Node

# 《弓猎》Web 版中文渲染修复（自动加载，最先初始化）
#
# 根因（已确诊，与字体文件无关）：
#   Godot 桌面端能显示中文，是因为引擎缺字时回退到了【系统字体】
#   （Windows / macOS 自带 CJK 字形）；而 Web 导出【没有系统字体】，
#   项目默认字体（Open Sans）又不含中文 → 中文显示为方块。
#   字体文件本身完好（已用 Pillow/freetype 验证 NotoSansSC 字形完整）。
#
# 修复：把含中文的 CJK 字体（FontFile）设为全局回退字体 ThemeDB.fallback_font。
#   默认字体缺字时，文本服务器会回落到本字体渲染中文，Web 端即可正常显示。
#   完全依赖 Godot 4 标准文本服务器，不需要 BitmapFont——Godot 4 已移除 BitmapFont 类
#   （迁移文档：BitmapFont → FontFile），旧方案在 Godot 4 上无法编译。
#
# 仅 Web 端启用；桌面端已有系统字体回退，无需处理。
#
# 注意：本字体现已【非主显示依赖】——所有可见 UI 文字（Label/Button/3D 飘字）
# 都已改为烘焙图片文字（见 ImageText.gd + ui_text/glyph_atlas.png），Web 端必出、
# 不会再出现方块。此处的动态字体仅用于【按钮 tooltip 的中文兜底】。
#
# 关键：不再用顶层 const preload()，否则 Godot 在解析阶段就要加载已导入字体，
# 一旦本地还没重新导入（缺 .fontdata）就会直接 Parser Error 让整个 autoload 崩掉。
# 改为 _ready 里运行时 load()，加载失败也只是 tooltip 无中文，不影响主游戏。

func _ready():
	if not OS.has_feature("web"):
		return
	var CJK_FONT := load("res://fonts/ZCOOLKuaiLe-Regular.ttf")
	if CJK_FONT == null:
		push_warning("CJKFont: 运行时未找到 CJK 字体资源（fonts/ZCOOLKuaiLe-Regular.ttf 未重新导入？）。仅影响按钮 tooltip 中文，主 UI 为烘焙图片文字不受影响。")
		return
	# 设为全局回退字体：按钮 tooltip 等原生文本在缺字（如中文）时会回落到本字体。
	ThemeDB.fallback_font = CJK_FONT
	# 诊断：确认字体真的含中文字形。若字体未正确打进包，这里会明确告警，
	# 而不是静默地让中文显示成方块，便于定位部署问题。
	if CJK_FONT.has_method("has_glyph"):
		var ok: bool = CJK_FONT.has_glyph(0x4E2D)   # “中”
		if not ok:
			push_warning("CJKFont: 回退字体缺少“中”字形，Web 端中文会显示成方块！请确认 fonts/ZCOOLKuaiLe-Regular.ttf 已正确重新导入并导出。")
		print("CJKFont: 已将 CJK 字体设为 Web 全局回退字体（含“中”字形=%s），修复中文方块" % ok)
	else:
		print("CJKFont: 已将 CJK 字体设为 Web 全局回退字体（无法检测字形，请上线后目视确认）")
