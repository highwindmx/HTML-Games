extends CanvasLayer

const UIUtil = preload("res://scripts/UIUtil.gd")   # 全局 UI 缩放（手机放大更多）

# WSADgame（弓箭版）— 开始菜单（process_mode=ALWAYS，开场显示，选狩猎徽章后开始）
# 狩猎徽章（统一网格，可多选叠加）：
#   难度压力（硬甲/迅捷/…）→ 叠加难度倍率
#   玩法变体（惊弓之声/积分飘字）→ 改变行为或反馈
#   单局结构（计时狩猎/配额狩猎）→ 改变结束条件；两者可同时开=双重约束

signal request_start(pressures: Dictionary, options: Dictionary)

# 狩猎徽章统一表：一张表驱动一张网格，UI 与逻辑同源
# cat=pressure → 进 build_pressures 合成倍率；cat=rule → 进 rules 字典
const OPTION_DEFS := [
	{"key":"timed", "label":"计时狩猎", "desc":"4 分钟限时冲分，时间到即结算评级", "cat":"rule", "default":false},
	{"key":"quota", "label":"配额狩猎", "desc":"全场仅 30 支箭，箭尽即结算——少箭多猎物", "cat":"rule", "default":false},
	{"key":"hp",    "label":"厚皮", "desc":"猎物更耐打", "cat":"pressure", "default":false},
	{"key":"spd",   "label":"迅捷", "desc":"猎物移动更快", "cat":"pressure", "default":false},
	{"key":"dmg",   "label":"蛮力", "desc":"被激怒的熊冲撞更重", "cat":"pressure", "default":false},
	{"key":"dense", "label":"密集", "desc":"猎物出现更密、同屏更多", "cat":"pressure", "default":false},
	{"key":"drop",  "label":"贫瘠", "desc":"补给掉落更稀少", "cat":"pressure", "default":false},
	{"key":"fly",   "label":"群鸟", "desc":"飞鸟出现更多", "cat":"pressure", "default":false},
	{"key":"noise", "label":"惊弓之声", "desc":"箭落点/中箭/爆炸的声响会惊走附近的鹿（第一箭很贵）", "cat":"rule", "default":false},
	{"key":"popup", "label":"积分飘字", "desc":"击杀点浮现得分（爆头金色/炸蛋灰色/普通白色）", "cat":"rule", "default":true},
]

var option_buttons: Dictionary = {}          # key -> Button（toggle，统一网格）
@onready var hint_label = $Center/VBox/Hint

@onready var start_button: Button = $Center/VBox/StartButton
@onready var option_container: GridContainer = $Center/VBox/OptionBadges

func _ready():
	# 按钮命中区按 UI 缩放放大（手机尤其要够大、好点）
	start_button.custom_minimum_size.y *= UIUtil.ui_scale()
	start_button.pressed.connect(_on_start_pressed)
	start_button.pressed.connect(_on_click)
	# 操作提示：按设备显示键鼠版或触屏版（Web 上靠 JS 探测触摸，避免手机浏览器误判为桌面）
	var touch_device := false
	if OS.has_feature("web"):
		touch_device = bool(JavaScriptBridge.eval("('ontouchstart' in window) || navigator.maxTouchPoints > 0", false))
	else:
		touch_device = OS.has_feature("mobile") or DisplayServer.is_touchscreen_available()
	if touch_device:
		hint_label.text = "左摇杆移动 · 右摇杆瞄准并松手射击 · 右下角投炸蛋/暂停"
	else:
		hint_label.text = "WASD 移动 · 鼠标瞄准 · 按住左键蓄力松开射箭 · 按住右键蓄力投炸蛋 · ESC 暂停"
	_build_options()

# 动态生成统一狩猎徽章网格（压力+规则+结构同表，toggle 可多选叠加）
func _build_options():
	var s := UIUtil.ui_scale()
	for def in OPTION_DEFS:
		var b := Button.new()
		b.toggle_mode = true
		b.button_pressed = bool(def["default"])
		b.tooltip_text = def["desc"]
		b.custom_minimum_size = Vector2(140, 52) * s
		# 文字用 ImageText 子节点（烘焙图片，绕开 Web 动态字体方块）
		var it := preload("res://scripts/ImageText.gd").new()
		it.text = def["label"]
		it.font_size = 22
		it.color = Color(1, 1, 1, 1)
		it.align = 1
		it.valign = 1
		it.set_anchors_preset(Control.PRESET_FULL_RECT)
		b.add_child(it)
		b.pressed.connect(_on_click)
		option_container.add_child(b)
		option_buttons[def["key"]] = b

func _tint(selected: bool) -> Color:
	return Color(1.0, 1.0, 1.0, 1.0) if selected else Color(0.5, 0.5, 0.5, 1.0)

# 收集已开启的难度压力（pressure 类），传给 Main 合成倍率
func _collect_pressures() -> Dictionary:
	var d := {}
	for def in OPTION_DEFS:
		if def["cat"] == "pressure":
			d[def["key"]] = option_buttons[def["key"]].button_pressed
	return d

# 收集玩法变体/反馈+单局结构（rule 类）
func _collect_options() -> Dictionary:
	var d := {}
	for def in OPTION_DEFS:
		if def["cat"] == "rule":
			d[def["key"]] = option_buttons[def["key"]].button_pressed
	return d

func _on_start_pressed():
	request_start.emit(_collect_pressures(), _collect_options())

func _on_click():
	if get_tree().current_scene.has_method("sfx_ui"):
		get_tree().current_scene.sfx_ui()
