extends CanvasLayer

# WSADgame — HUD：血条 / 弹药 / 击杀 / 结束提示

var player: Player
var game: Node3D

@onready var health_fg: ColorRect = $HealthBG/HealthFG
@onready var health_bg: ColorRect = $HealthBG
@onready var ammo_label: Label = $AmmoLabel
@onready var score_label: Label = $ScoreLabel
@onready var wave_label: Label = $WaveLabel
@onready var bomb_label: Label = $BombLabel
@onready var msg_label: Label = $MsgLabel
@onready var damage_vignette: ColorRect = $DamageVignette
@onready var pressure_badges: HBoxContainer = $PressureBadges

func _ready():
	player = get_tree().get_first_node_in_group("player")
	game = get_tree().current_scene
	player.health_changed.connect(_on_health)
	player.ammo_changed.connect(_on_ammo)
	player.bombs_changed.connect(_on_bombs)
	game.score_changed.connect(_on_score)
	game.wave_changed.connect(_on_wave)
	game.game_over.connect(_on_game_over)
	game.pressures_applied.connect(show_pressures)
	_on_health(player.health, player.MAX_HEALTH)
	_on_ammo(player.quiver, player.MAX_QUIVER)
	_on_bombs(player.bombs, player.MAX_BOMBS)
	_on_score(game.score)
	_on_wave(game.wave)
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
		ammo_label.text = "箭 ∞"
	else:
		ammo_label.text = "箭 %d / %d" % [cur, max_ammo]

func _on_score(s: int):
	score_label.text = "击杀 %d" % s

func _on_bombs(b: int, _max_b: int):
	bomb_label.text = "炸弹 %d" % b

func _on_wave(w: int):
	wave_label.text = "波次 %d" % w

func _on_game_over():
	msg_label.text = "游戏结束\n按 R 重新开始"
	msg_label.visible = true

# 受伤反馈：红色暗角快速淡入淡出
func flash_damage():
	damage_vignette.modulate.a = 0.45
	var tw := create_tween()
	tw.tween_property(damage_vignette, "modulate:a", 0.0, 0.35)

# 开始游戏后，把已开启的压力以徽章形式显示在 HUD 右上角
func show_pressures(labels: Array):
	for c in pressure_badges.get_children():
		c.queue_free()
	for t in labels:
		var p := PanelContainer.new()
		var l := Label.new()
		l.text = t
		l.add_theme_font_size_override("font_size", 18)
		l.add_theme_color_override("font_color", Color(1, 1, 1, 1))
		p.add_child(l)
		p.self_modulate = Color(0.95, 0.55, 0.15, 1)
		pressure_badges.add_child(p)
