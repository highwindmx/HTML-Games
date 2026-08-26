extends CanvasLayer

# WSADgame（弓箭版）— 开始菜单（process_mode=ALWAYS，开场显示，选初始箭矢+压力徽章后开始）
# 不再用四档难度，改为把每种“压力”拆成可选徽章，玩家按需叠加难度

signal request_start(initial_arrows: int, infinite: bool, pressures: Dictionary)

# 每种压力徽章：key 用于逻辑，label 显示，desc 悬停说明
const PRESSURE_DEFS := [
	{"key":"hp",    "label":"硬甲", "desc":"敌人更耐打"},
	{"key":"spd",   "label":"迅捷", "desc":"敌人移动更快"},
	{"key":"dmg",   "label":"锋锐", "desc":"敌人伤害更高"},
	{"key":"spawn", "label":"潮涌", "desc":"刷怪更密集"},
	{"key":"size",  "label":"群涌", "desc":"每波规模更大"},
	{"key":"drop",  "label":"贫瘠", "desc":"掉落更稀少"},
	{"key":"fly",   "label":"空袭", "desc":"飞行敌人更多"},
]

var selected_arrows := 20
var selected_infinite := false
var pressure_buttons: Dictionary = {}   # key -> Button

@onready var start_button: Button = $Center/VBox/StartButton
@onready var opt_20: Button = $Center/VBox/ArrowOptions/Opt20
@onready var opt_50: Button = $Center/VBox/ArrowOptions/Opt50
@onready var opt_inf: Button = $Center/VBox/ArrowOptions/OptInf
@onready var badge_container: GridContainer = $Center/VBox/PressureBadges

func _ready():
	start_button.pressed.connect(_on_start_pressed)
	start_button.pressed.connect(_on_click)
	opt_20.pressed.connect(_on_click)
	opt_50.pressed.connect(_on_click)
	opt_inf.pressed.connect(_on_click)
	opt_20.pressed.connect(func(): _select(opt_20, 20, false))
	opt_50.pressed.connect(func(): _select(opt_50, 50, false))
	opt_inf.pressed.connect(func(): _select(opt_inf, 999999, true))
	_select(opt_20, 20, false)
	_build_badges()

# 动态生成压力徽章（toggle 按钮，可多选叠加）
func _build_badges():
	for def in PRESSURE_DEFS:
		var b := Button.new()
		b.toggle_mode = true
		b.text = def["label"]
		b.tooltip_text = def["desc"]
		b.custom_minimum_size = Vector2(120, 52)
		b.add_theme_font_size_override("font_size", 22)
		b.pressed.connect(_on_click)
		badge_container.add_child(b)
		pressure_buttons[def["key"]] = b

func _select(btn: Button, arrows: int, infinite: bool):
	selected_arrows = arrows
	selected_infinite = infinite
	opt_20.modulate = _tint(opt_20 == btn)
	opt_50.modulate = _tint(opt_50 == btn)
	opt_inf.modulate = _tint(opt_inf == btn)

func _tint(selected: bool) -> Color:
	return Color(1.0, 1.0, 1.0, 1.0) if selected else Color(0.5, 0.5, 0.5, 1.0)

# 收集已开启的压力开关，传给 Main 合成倍率
func _collect_pressures() -> Dictionary:
	var d := {}
	for key in pressure_buttons:
		d[key] = pressure_buttons[key].button_pressed
	return d

func _on_start_pressed():
	request_start.emit(selected_arrows, selected_infinite, _collect_pressures())

func _on_click():
	if get_tree().current_scene.has_method("sfx_ui"):
		get_tree().current_scene.sfx_ui()
