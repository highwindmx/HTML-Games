extends RefCounted

# 全局 UI 缩放系数（集中管理，避免逐个场景改像素）。
# 策略：桌面轻微放大(1.1)，触屏/手机放大更多(1.35)——手机屏小、尤其要看得清。
# 调用方：ImageText(文字)、StartMenu/TouchControl(按钮命中区) 等。
static func ui_scale() -> float:
	var s := 1.1                       # 桌面：轻微放大
	var touch := false
	if OS.has_feature("web"):
		# Web 上靠 JS 探测触摸（手机浏览器 UA/特性不可靠，maxTouchPoints 最稳）
		touch = bool(JavaScriptBridge.eval("('ontouchstart' in window) || navigator.maxTouchPoints > 0", false))
	else:
		touch = OS.has_feature("mobile") or DisplayServer.is_touchscreen_available()
	if touch:
		s = 1.35                       # 触屏/手机：放大更多
	return s
