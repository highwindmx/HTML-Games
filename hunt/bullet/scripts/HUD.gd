extends CanvasLayer

# WSADgame — HUD：血条 / 弹药 / 击杀 / 结束提示

var player: Node3D
var game: Node3D

@onready var health_fg: ColorRect = $HealthBG/HealthFG
@onready var health_bg: ColorRect = $HealthBG
@onready var ammo_label: Label = $AmmoLabel
@onready var score_label: Label = $ScoreLabel
@onready var wave_label: Label = $WaveLabel
@onready var msg_label: Label = $MsgLabel

func _ready():
	player = get_tree().get_first_node_in_group("player")
	game = get_tree().current_scene
	player.health_changed.connect(_on_health)
	game.score_changed.connect(_on_score)
	game.wave_changed.connect(_on_wave)
	game.game_over.connect(_on_game_over)
	_on_health(player.health, player.MAX_HEALTH)
	ammo_label.text = "弹药 ∞"
	_on_score(game.score)
	_on_wave(game.wave)

func _on_health(hp: int, max_hp: int):
	var ratio := float(hp) / float(max_hp)
	health_fg.size.x = health_bg.size.x * ratio
	health_fg.color = Color(1.0 - ratio, ratio, 0.2)

func _on_score(s: int):
	score_label.text = "击杀 %d" % s

func _on_wave(w: int):
	wave_label.text = "波次 %d" % w

func _on_game_over():
	msg_label.text = "游戏结束\n按 R 重新开始"
	msg_label.visible = true
