extends CanvasLayer

# 弓猎 — HUD：血条 / 弹药 / 积分 / 效率 / 炸蛋 / 计时 / 结束评级

var player: Player
var game: Node3D

@onready var health_fg: ColorRect = $HealthBG/HealthFG
@onready var health_bg: ColorRect = $HealthBG
@onready var ammo_label = $AmmoLabel
@onready var score_label = $ScoreLabel
@onready var eff_label = $EffLabel
@onready var bomb_label = $BombLabel
@onready var time_label = $TimeLabel
@onready var msg_label = $MsgLabel
@onready var damage_vignette: ColorRect = $DamageVignette
@onready var pressure_badges: HBoxContainer = $PressureBadges

func _ready():
	player = get_tree().get_first_node_in_group("player")
	game = get_tree().current_scene
	player.health_changed.connect(_on_health)
	player.ammo_changed.connect(_on_ammo)
	player.bombs_changed.connect(_on_bombs)
	game.score_changed.connect(_on_score)
	game.arrows_fired_changed.connect(_on_arrows_fired)
	game.time_left_changed.connect(_on_time_left)
	game.game_over.connect(_on_game_over)
	game.pressures_applied.connect(show_pressures)
	_on_health(player.health, player.MAX_HEALTH)
	_on_ammo(player.quiver, player.MAX_QUIVER)
	_on_bombs(player.bombs, player.MAX_BOMBS)
	_on_score(game.score)
	_on_arrows_fired(game.arrows_fired)
	# 计时徽章开启时显示倒计时；否则隐藏
	time_label.visible = game.rules.get("timed", false)
	# HUD 不拦截鼠标：全屏的受伤暗角(ColorRect)默认 mouse_filter=STOP 会吃掉鼠标事件，
	# 导致 Player 的 _unhandled_input 收不到左键 → 无法射击。全部设为 IGNORE 让事件穿透到 3D 视口。
	for c in _all_controls(self):
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE

# 递归收集所有 Control 子节点（含嵌套），统一放行鼠标
func _all_controls(n: Node) -> Array:
	var out: Array = []
	for c in n.get_children():
		if c is Control:
			out.append(c)
		out.append_array(_all_controls(c))
	return out

func _on_health(hp: int, max_hp: int):
	var ratio := float(hp) / float(max_hp)
	health_fg.size.x = health_bg.size.x * ratio
	health_fg.color = Color(1.0 - ratio, ratio, 0.2)

func _on_ammo(cur: int, max_ammo: int):
	if player != null and player.infinite_quiver:
		ammo_label.text = "箭 无限"
	else:
		ammo_label.text = "箭 %d / %d" % [cur, max_ammo]

func _on_score(s: int):
	score_label.text = "积分 %d" % s
	_update_efficiency()

func _on_arrows_fired(fired: int):
	_update_efficiency()

func _update_efficiency():
	if game == null or not game.has_method("get_efficiency"):
		return
	var eff: float = game.get_efficiency()
	var pct := int(round(eff * 100.0))
	eff_label.text = "效率 %d%%" % pct
	# 效率颜色：高=绿、中=黄、低=红
	if eff >= 0.9:
		eff_label.color = Color(0.3, 0.95, 0.5, 1)
	elif eff >= 0.5:
		eff_label.color = Color(1.0, 0.85, 0.3, 1)
	else:
		eff_label.color = Color(1.0, 0.4, 0.3, 1)

func _on_bombs(b: int, _max_b: int):
	bomb_label.text = "炸蛋 %d" % b

# 计时徽章：倒计时显示 M:SS，最后 30 秒变红提醒
func _on_time_left(t: float):
	if game == null or not game.rules.get("timed", false):
		return
	time_label.visible = true
	var total := int(ceil(t))
	var m := total / 60
	var s := total % 60
	time_label.text = "时间 %d:%02d" % [m, s]
	if t <= 30.0:
		time_label.color = Color(1.0, 0.35, 0.3, 1)
	else:
		time_label.color = Color(0.5, 0.9, 1, 1)

func _on_game_over():
	# 游戏结束：展示评级 + 积分/箭矢/效率统计
	# 结构性结束（时间到/箭射尽）= "狩猎结束"金色（成就时刻）；被击倒 = "游戏结束"红色
	var rating := "D"
	var fired := 0
	var eff_pct := 0
	var title := "游戏结束"
	var reason := ""
	var col := Color(1.0, 0.3, 0.3, 1)
	if game != null:
		if game.has_method("get_rating"):
			rating = game.get_rating()
		fired = game.arrows_fired
		if game.has_method("get_efficiency"):
			eff_pct = int(round(game.get_efficiency() * 100.0))
		var er = game.get("end_reason")
		if er != null and String(er) != "":
			title = "狩猎结束"
			reason = "（%s）" % String(er)
			col = Color(1.0, 0.82, 0.15, 1)
	msg_label.text = "%s%s  评级 %s\n积分 %d  箭矢 %d  效率 %d%%\n按 R 重新开始" % [title, reason, rating, game.score, fired, eff_pct]
	msg_label.color = col
	msg_label.visible = true

# 受伤反馈：红色暗角快速淡入淡出
func flash_damage():
	damage_vignette.modulate.a = 0.45
	var tw := create_tween()
	tw.tween_property(damage_vignette, "modulate:a", 0.0, 0.35)

# 开始游戏后，把已开启的狩猎难度以徽章形式显示在 HUD 右上角
func show_pressures(labels: Array):
	for c in pressure_badges.get_children():
		c.queue_free()
	for t in labels:
		var p := PanelContainer.new()
		var l := preload("res://scripts/ImageText.gd").new()
		l.text = t
		l.font_size = 18
		l.color = Color(1, 1, 1, 1)
		p.add_child(l)
		p.self_modulate = Color(0.95, 0.55, 0.15, 1)
		pressure_badges.add_child(p)
