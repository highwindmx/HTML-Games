extends Control

const UIUtil = preload("res://scripts/UIUtil.gd")   # 全局 UI 缩放（手机/触屏放大更多）

# 从烘焙字形图集（ui_text/glyph_atlas.png + glyph_map.gd）按需切片绘制文字。
# 彻底绕开 Godot Web 动态字体：图片纹理在 Web 上必出，方块问题根治。
# 用法：像 Label 一样用——设置 text / font_size / color / align，
# 也可作为按钮子节点（full_rect + align=1/valign=1 居中）。
#
# 注意：图集与图集元数据在 _ready 里 load()，不在顶层 preload，避免解析阶段
# 依赖未导入资源导致脚本解析失败。
#
# 【场景用法】节点类型必须写 type="Control"（本控件的原生基类），
# 再挂 script = ExtResource("...ImageText.gd")。不要写 type="ImageText"——
# ImageText 只是本脚本的 class_name，不是原生类；Godot 在部分环境（尤其 Web 导出 /
# 刚重导入）无法解析该类型，会报 "Cannot get class 'ImageText'" 并回退成 Node，
# 与本脚本 extends Control 冲突。运行时 load() 失败也只是不绘制文字，不会让场景崩掉。

# 后备变量：避免 setter 内对属性自身赋值导致递归（Godot 4 行为不一致）
var _text: String = ""
var _font_size: int = 32
var _color: Color = Color(1, 1, 1, 1)
var _align: int = 0          # 0 左 1 中 2 右
var _valign: int = 1         # 0 上 1 中 2 下
var _line_spacing: float = 1.1
var _center_origin: bool = false   # true：以节点原点为中心绘制（飘字用）

var _atlas: Texture = null
var _cell: int = 0
var _map: Dictionary = {}

@export var text: String = "" :
	get: return _text
	set(v): _text = v; _recompute()
@export var font_size: int = 32 :
	get: return _font_size
	set(v): _font_size = v; _recompute()
@export var color: Color = Color(1, 1, 1, 1) :
	get: return _color
	set(v): _color = v; queue_redraw()
@export var align: int = 0 :
	get: return _align
	set(v): _align = v; queue_redraw()
@export var valign: int = 1 :
	get: return _valign
	set(v): _valign = v; queue_redraw()
@export var line_spacing: float = 1.1 :
	get: return _line_spacing
	set(v): _line_spacing = v; _recompute()
@export var center_origin: bool = false :
	get: return _center_origin
	set(v): _center_origin = v; queue_redraw()

func _ready():
	# 纯绘制控件，对鼠标透明，否则铺在按钮上的 full_rect 文字会拦截点击
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_atlas = load("res://ui_text/glyph_atlas.png")
	var gm = load("res://ui_text/glyph_map.gd")
	if gm != null:
		_cell = gm.CELL
		_map = gm.MAP
	else:
		push_warning("ImageText: 图集元数据 ui_text/glyph_map.gd 加载失败，文字将不绘制")
	_recompute()

func _recompute():
	if _cell == 0:
		return
	var scale_f := float(_font_size) * UIUtil.ui_scale() / float(_cell)
	var lines := _text.split("\n", true)
	var max_w := 0.0
	for ln in lines:
		var lw := 0.0
		for ch in ln:
			lw += _adv(ch) * scale_f
		max_w = max(max_w, lw)
	var pitch := float(_cell) * scale_f
	var total_h := pitch * float(lines.size()) * _line_spacing
	custom_minimum_size = Vector2(max_w, total_h)
	queue_redraw()

# 单元宽（图集 px）—— 缺字用半格占位
func _adv(ch: String) -> float:
	var key := str(ch.unicode_at(0))
	if _map.has(key):
		return float(_map[key][2])
	return float(_cell) * 0.5

func _draw():
	if _atlas == null or _cell == 0 or _map.is_empty() or _text == "":
		return
	var scale_f := float(_font_size) * UIUtil.ui_scale() / float(_cell)
	var pitch := float(_cell) * scale_f
	var lines := _text.split("\n", true)
	var total_h := pitch * float(lines.size()) * _line_spacing
	var block_w := 0.0
	for ln in lines:
		var lw := 0.0
		for ch in ln:
			lw += _adv(ch) * scale_f
		block_w = max(block_w, lw)

	var ox := 0.0
	var oy := 0.0
	if _center_origin:
		ox = -block_w * 0.5
		oy = -total_h * 0.5
	else:
		if _align == 1:
			ox = (size.x - block_w) * 0.5
		elif _align == 2:
			ox = size.x - block_w
		if _valign == 1:
			oy = (size.y - total_h) * 0.5
		elif _valign == 2:
			oy = size.y - total_h

	for li in range(lines.size()):
		var ln: String = lines[li]
		var y := oy + float(li) * pitch * _line_spacing
		var x := ox
		for ch in ln:
			var key := str(ch.unicode_at(0))
			if _map.has(key):
				var g: Array = _map[key]
				var sx := float(g[0]); var sy := float(g[1]); var sw := float(g[2])
				var dst := Rect2(x, y, sw * scale_f, float(_cell) * scale_f)
				var src := Rect2(sx, sy, sw, float(_cell))
				draw_texture_rect_region(_atlas, dst, src, _color)
			x += _adv(ch) * scale_f
