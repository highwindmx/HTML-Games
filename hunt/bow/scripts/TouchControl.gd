extends Control

# WSADgame（弓箭版）— 触摸控制层（仅触摸设备启用）
# 左半屏：虚拟摇杆 → 驱动 move_left/right/up/down 输入动作（复用桌面移动逻辑）
# 右半屏：拖动 = 瞄准（写入 Main._aim_screen）；按下=蓄力，松开发射弓箭
# 屏幕按钮：炸弹（按下蓄力/松开投掷）、暂停（切换暂停菜单）
# 桌面端自动隐藏且 mouse_filter=IGNORE，绝不拦截鼠标，桌面操控不受影响

const JOY_RADIUS := 60.0

var is_touch := false
var player: Player
var joy_origin := Vector2.ZERO
var joy_vec := Vector2.ZERO
var joy_id := -1
var aim_id := -1
var _hint_pos := Vector2.ZERO   # 摇杆默认提示位置（左下）

func _ready():
	is_touch = DisplayServer.is_touchscreen_available() or OS.has_feature("mobile")
	var layer := get_parent() as CanvasLayer
	if not is_touch:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		layer.visible = false   # 关闭所在 CanvasLayer，桌面完全不参与
		return
	layer.visible = true
	player = get_tree().get_first_node_in_group("player")
	$BombBtn.button_down.connect(_on_bomb_down)
	$BombBtn.button_up.connect(_on_bomb_up)
	$PauseBtn.pressed.connect(_on_pause)
	_hint_pos = Vector2(120.0, get_viewport().get_visible_rect().size.y - 120.0)
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
			joy_id = ev.index
			joy_origin = ev.position
			joy_vec = Vector2.ZERO
			_update_joy()
		elif ev.position.x >= half and aim_id < 0:
			aim_id = ev.index
			_set_aim(ev.position)
			_begin_charge()
	else:
		if ev.index == joy_id:
			joy_id = -1
			joy_vec = Vector2.ZERO
			_update_joy()
		elif ev.index == aim_id:
			aim_id = -1
			_end_charge()
	queue_redraw()

func _handle_drag(ev: InputEventScreenDrag):
	if ev.index == joy_id:
		var d := ev.position - joy_origin
		if d.length() > JOY_RADIUS:
			d = d.normalized() * JOY_RADIUS
		joy_vec = d / JOY_RADIUS
		_update_joy()
	elif ev.index == aim_id:
		_set_aim(ev.position)
	queue_redraw()

func _set_aim(p: Vector2):
	if get_tree().current_scene.has_method("set_aim_screen"):
		get_tree().current_scene.set_aim_screen(p)

func _update_joy():
	var jx := joy_vec.x
	var jy := joy_vec.y
	Input.action_press("move_right", max(0.0, jx))
	Input.action_press("move_left", max(0.0, -jx))
	Input.action_press("move_down", max(0.0, jy))
	Input.action_press("move_up", max(0.0, -jy))

func _begin_charge():
	if player != null and player.has_method("begin_charge"):
		player.begin_charge()

func _end_charge():
	if player != null and player.has_method("end_charge"):
		player.end_charge()

func _on_bomb_down():
	if player != null and player.has_method("begin_charge_bomb"):
		player.begin_charge_bomb()

func _on_bomb_up():
	if player != null and player.has_method("end_charge_bomb"):
		player.end_charge_bomb()

func _on_pause():
	get_tree().current_scene.toggle_pause()

func _process(_d):
	if not is_touch:
		return
	if not get_tree().current_scene.is_playing():
		# 离开对局时释放卡住的输入（防摇杆/蓄力卡死）
		if joy_id >= 0 or aim_id >= 0:
			joy_id = -1
			aim_id = -1
			joy_vec = Vector2.ZERO
			_update_joy()
			_end_charge()
		return
	_hint_pos = Vector2(120.0, get_viewport().get_visible_rect().size.y - 120.0)
	queue_redraw()   # 每帧重绘摇杆提示/活动摇杆

func _draw():
	if not is_touch:
		return
	if not get_tree().current_scene.is_playing():
		return
	# 摇杆提示底座（左下）
	draw_circle(_hint_pos, JOY_RADIUS, Color(1, 1, 1, 0.08))
	draw_arc(_hint_pos, JOY_RADIUS, 0.0, TAU, 36, Color(1, 1, 1, 0.25), 2.0)
	# 活动摇杆（手指按下处）
	if joy_id >= 0:
		draw_circle(joy_origin, JOY_RADIUS, Color(1, 1, 1, 0.12))
		draw_circle(joy_origin + joy_vec * JOY_RADIUS, 26.0, Color(0.3, 0.8, 1.0, 0.6))
