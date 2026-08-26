extends Control

const UIUtil = preload("res://scripts/UIUtil.gd")   # 全局 UI 缩放（手机放大更多）

# WSADgame（弓箭版）— 触摸控制层（仅触摸设备启用）
# 左半屏：虚拟摇杆 → 驱动 move_left/right/up/down 输入动作（复用桌面移动逻辑）
# 右半屏：瞄准+射击合一摇杆（王者荣耀式）：
#   按下 = 开始蓄力；拖动 = 瞄准（准星随手指方向）；松手 = 发射弓箭
#   蓄力随时间累积（与桌面按住左键一致），松手即按当前蓄力发射。
# 屏幕按钮：炸蛋（按下蓄力/松开投掷）、暂停（切换暂停菜单）、全屏（点击切换 进入↔退出，并同步按钮文案）
# 桌面端自动隐藏且 mouse_filter=IGNORE，绝不拦截鼠标，桌面操控不受影响

const JOY_RADIUS := 180.0         # 摇杆最大拖动半径（原 90，应需求放大一倍，提升手感与可操作范围）
const AIM_SCALE := 2.0            # 右摇杆拖动向量 → 瞄准屏幕偏移的放大系数（仅方向有意义）

var is_touch := false
var player: Player
var joy_origin := Vector2.ZERO
var joy_vec := Vector2.ZERO
var joy_id := -1
var aim_origin := Vector2.ZERO
var aim_vec := Vector2.ZERO
var aim_id := -1
var _hint_pos := Vector2.ZERO   # 摇杆默认提示位置（左下）
var full_label                  # 全屏按钮的文字（ImageText 子节点，用于同步进入/退出文案）
var _fullscreen_on := false     # 本地记录全屏状态，驱动按钮文案
var _full_poll_t := 0.0         # 全屏状态轮询节流计时器

# 摇杆提示位置：按视口比例定位并用 JOY_RADIUS 做边界夹取，
# 保证放大后的圈（半径 JOY_RADIUS）完整落在屏幕内，且不贴底手势死区
func _hint_default() -> Vector2:
	var vs: Vector2 = get_viewport().get_visible_rect().size
	var m := JOY_RADIUS + 14.0
	var x: float = clamp(vs.x * 0.24, m, max(m, vs.x - m))
	var y: float = vs.y - clamp(vs.y * 0.32, m, max(m, vs.y - m))
	return Vector2(x, y)

func _ready():
	is_touch = DisplayServer.is_touchscreen_available() or OS.has_feature("mobile")
	var layer := get_parent() as CanvasLayer
	if not is_touch:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		layer.visible = false   # 关闭所在 CanvasLayer，桌面完全不参与
		return
	layer.visible = true
	# 触屏按钮命中区按 UI 缩放放大（手机屏小，按钮要够大好点）
	var s := UIUtil.ui_scale()
	for b in [$BombBtn, $PauseBtn, $FullBtn]:
		b.offset_left *= s
		b.offset_top *= s
		b.offset_right *= s
		b.offset_bottom *= s
	# 移动端必须让本层捕获触摸事件，否则 _gui_input 永远收不到，
	# 整层触摸（含左下方向摇杆）全部失效。用 PASS 而非 STOP，事件向下透传，
	# 不挡住下层 StartMenu/PauseMenu/HUD（它们位于更高 layer 或仅作显示）。
	mouse_filter = Control.MOUSE_FILTER_PASS
	player = get_tree().get_first_node_in_group("player")
	$BombBtn.button_down.connect(_on_bomb_down)
	$BombBtn.button_up.connect(_on_bomb_up)
	$PauseBtn.pressed.connect(_on_pause)
	if has_node("FullBtn"):
		$FullBtn.pressed.connect(_on_fullscreen)
		full_label = $FullBtn/FullLabel
	_hint_pos = _hint_default()
	queue_redraw()

func _gui_input(event):
	if not is_touch:
		return
	if not get_tree().current_scene.is_playing():
		return
	if event is InputEventScreenTouch:
		_handle_touch(event as InputEventScreenTouch)
	elif event is InputEventScreenDrag:
		_handle_drag(event as InputEventScreenDrag)

func _handle_touch(ev: InputEventScreenTouch):
	var half := get_viewport().get_visible_rect().size.x * 0.5
	if ev.pressed:
		if ev.position.x < half and joy_id < 0:
			# 左半屏：移动摇杆
			joy_id = ev.index
			joy_origin = ev.position
			joy_vec = Vector2.ZERO
			_update_joy()
		elif ev.position.x >= half and aim_id < 0:
			# 右半屏：瞄准+射击摇杆 —— 按下即开始蓄力
			aim_id = ev.index
			aim_origin = ev.position
			aim_vec = Vector2.ZERO
			if player != null and player.has_method("begin_charge"):
				player.begin_charge()
			_set_aim(Vector2.ZERO)
	else:
		if ev.index == joy_id:
			joy_id = -1
			joy_vec = Vector2.ZERO
			_update_joy()
		elif ev.index == aim_id:
			# 松手即发射（按当前蓄力）
			aim_id = -1
			if player != null and player.has_method("end_charge"):
				player.end_charge()
	queue_redraw()

func _handle_drag(ev: InputEventScreenDrag):
	if ev.index == joy_id:
		var d := ev.position - joy_origin
		if d.length() > JOY_RADIUS:
			d = d.normalized() * JOY_RADIUS
		joy_vec = d / JOY_RADIUS
		_update_joy()
	elif ev.index == aim_id:
		aim_vec = ev.position - aim_origin
		_set_aim(aim_vec)
	queue_redraw()

# 右摇杆方向 → 瞄准屏幕坐标（屏幕中心 + 方向向量），复用桌面鼠标瞄准管线
func _set_aim(vec: Vector2):
	if get_tree().current_scene.has_method("set_aim_screen"):
		var vs := get_viewport().get_visible_rect().size
		var center := vs * 0.5
		var p := center + vec * AIM_SCALE
		get_tree().current_scene.set_aim_screen(p)

func _update_joy():
	var jx := joy_vec.x
	var jy := joy_vec.y
	Input.action_press("move_right", max(0.0, jx))
	Input.action_press("move_left", max(0.0, -jx))
	Input.action_press("move_down", max(0.0, jy))
	Input.action_press("move_up", max(0.0, -jy))

func _on_bomb_down():
	if player != null and player.has_method("begin_charge_bomb"):
		player.begin_charge_bomb()

func _on_bomb_up():
	if player != null and player.has_method("end_charge_bomb"):
		player.end_charge_bomb()

func _on_pause():
	get_tree().current_scene.toggle_pause()

func _on_fullscreen() -> void:
	# 移动端浏览器全屏（点击切换：进入 ↔ 退出）：
	#   Android Chrome / 桌面：Element.requestFullscreen / document.exitFullscreen 可用
	#                        （点按钮=用户手势，满足触发条件）。
	#   iOS Safari：不支持任意元素 requestFullscreen，只能“添加到主屏幕”以 PWA 全屏
	#               （依赖 export_presets 的 apple-mobile-web-app-capable）。
	if not OS.has_feature("web"):
		return
	var js := """
	(function(){
	  try {
	    var c = document.querySelector('canvas') || document.documentElement;
	    if (!c) { console.warn('[弓猎] 未找到 canvas，无法全屏'); return; }
	    var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement ||
	                  document.mozFullScreenElement || document.msFullscreenElement);
	    if (isFs) {
	      // 已在全屏 → 退出
	      var ex = document.exitFullscreen || document.webkitExitFullscreen ||
	               document.mozCancelFullScreen || document.msExitFullscreen;
	      if (ex) { var px = ex.call(document); if (px && px.catch) px.catch(function(e){}); }
	    } else {
	      // 未全屏 → 进入
	      var fn = c.requestFullscreen || c.webkitRequestFullscreen ||
	               c.mozRequestFullScreen || c.msRequestFullscreen;
	      if (!fn) { console.warn('[弓猎] 当前浏览器不支持 requestFullscreen（iOS Safari 请“添加到主屏幕”以 PWA 全屏）'); return; }
	      var p = fn.call(c);
	      if (p && p.catch) { p.catch(function(e){ console.warn('[弓猎] 全屏请求被拒绝:', e && e.message); }); }
	    }
	  } catch (e) { console.warn('[弓猎] 全屏异常:', e); }
	})();
	"""
	var jsb = Engine.get_singleton("JavaScriptBridge")
	if jsb != null:
		jsb.eval(js, true)

# 读取浏览器真实全屏状态（Web 才有效；非 Web 返回 false）
func _is_fullscreen() -> bool:
	if not OS.has_feature("web"):
		return false
	var jsb = Engine.get_singleton("JavaScriptBridge")
	if jsb == null:
		return _fullscreen_on   # 非 Web 兜底用本地记忆
	var js := """
	!!(document.fullscreenElement || document.webkitFullscreenElement ||
	   document.mozFullScreenElement || document.msFullscreenElement);
	"""
	var v = jsb.eval(js, true)
	return bool(v)

func _process(_d):
	if not is_touch:
		return
	# 节流轮询真实全屏状态（0.5s），同步按钮文案（无论是否暂停都生效）：
	# 覆盖「用户用浏览器原生手势退出全屏（安卓下滑/Esc）」导致本地状态错位的情况
	_full_poll_t -= _d
	if _full_poll_t <= 0.0:
		_full_poll_t = 0.5
		var on := _is_fullscreen()
		if on != _fullscreen_on:
			_fullscreen_on = on
			if full_label != null:
				full_label.text = "退出" if on else "全屏"
	if not get_tree().current_scene.is_playing():
		# 离开对局时释放卡住的输入（防摇杆/蓄力卡死）
		if joy_id >= 0 or aim_id >= 0:
			joy_id = -1
			aim_id = -1
			joy_vec = Vector2.ZERO
			aim_vec = Vector2.ZERO
			_update_joy()
			# 射击/炸弹若在对局外被按住，松开事件可能丢失，这里兜底清空蓄力
			if player != null and player.has_method("end_charge"):
				player.end_charge()
			if player != null and player.has_method("end_charge_bomb"):
				player.end_charge_bomb()
		return
	_hint_pos = _hint_default()
	queue_redraw()   # 每帧重绘摇杆提示/活动摇杆

func _draw():
	if not is_touch:
		return
	if not get_tree().current_scene.is_playing():
		return
	# 左摇杆提示底座（左下）
	draw_circle(_hint_pos, JOY_RADIUS, Color(1, 1, 1, 0.08))
	draw_arc(_hint_pos, JOY_RADIUS, 0.0, TAU, 36, Color(1, 1, 1, 0.25), 2.0)
	# 左活动摇杆（手指按下处）
	if joy_id >= 0:
		draw_circle(joy_origin, JOY_RADIUS, Color(1, 1, 1, 0.12))
		draw_circle(joy_origin + joy_vec * JOY_RADIUS, 26.0, Color(0.3, 0.8, 1.0, 0.6))
	# 右瞄准摇杆（按下处显示，提示“拖动向哪打哪”）
	if aim_id >= 0:
		draw_circle(aim_origin, JOY_RADIUS, Color(1, 0.7, 0.3, 0.12))
		var knob := aim_origin + aim_vec
		if knob.distance_to(aim_origin) > JOY_RADIUS:
			knob = aim_origin + (knob - aim_origin).normalized() * JOY_RADIUS
		draw_circle(knob, 30.0, Color(1.0, 0.6, 0.2, 0.7))
