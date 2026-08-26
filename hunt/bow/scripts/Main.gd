extends Node3D

# WSADgame — 游戏总管（挂在 Main 根节点）
# 状态机：MENU(开始菜单) / PLAYING / PAUSED / OVER
# 职责：波次刷怪+难度、玩家受伤中转、分数、音效、菜单接线

signal score_changed(score)
signal wave_changed(wave)
signal game_over
signal pressures_applied(labels: Array)

enum State { MENU, PLAYING, PAUSED, OVER }

const ENEMY_SCENE := preload("res://scenes/Enemy.tscn")
const BIRD_SCENE := preload("res://scenes/Bird.tscn")
const OBSTACLE_SCENE := preload("res://scenes/Obstacle.tscn")
const PICKUP_SCENE := preload("res://scenes/Pickup.tscn")

# ---- 音效资源 ----
const S_GUN := preload("res://audio/gun.wav")
const S_HIT := preload("res://audio/hit.wav")
const S_DEATH := preload("res://audio/enemy_death.wav")
const S_WAVE_START := preload("res://audio/wave_start.wav")
const S_WAVE_CLEAR := preload("res://audio/wave_clear.wav")
const S_GAME_OVER := preload("res://audio/game_over.wav")
const S_RELOAD := preload("res://audio/reload.wav")
const S_HURT := preload("res://audio/hurt.wav")
const S_UI := preload("res://audio/ui_click.wav")
const S_BOW := preload("res://audio/bow.wav")

# ---- 波次 / 难度参数 ----
const MAX_CONCURRENT := 12        # 同屏敌人上限（保护性能）
const BASE_WAVE_SIZE := 4
const WAVE_SIZE_STEP := 2
const BASE_SPAWN_INTERVAL := 1.4
const SPAWN_INTERVAL_STEP := 0.1
const MIN_SPAWN_INTERVAL := 0.4
const BETWEEN_WAVE_DELAY := 2.5
const WAVE_ARROW_REFILL := 6      # 每波清场回补箭矢基数（有限模式避免弹尽死局）[PLACEHOLDER]

# ---- 压力徽章（开始菜单多选，叠加难度；不再用四档难度）----
# 每个压力开启时套用对应倍率：hp/spd/dmg 缩放敌人属性；spawn 缩放刷怪间隔(越小越密)；
# size 缩放波次规模；drop 缩放掉落率；fly 为飞行敌出现概率
const PRESSURE_MULT := {
	"hp": 1.25, "spd": 1.2, "dmg": 1.3, "spawn": 0.8,
	"size": 1.2, "drop": 0.8, "fly": 0.4,
}
const PRESSURE_LABELS := {
	"hp":"硬甲", "spd":"迅捷", "dmg":"锋锐", "spawn":"潮涌",
	"size":"群涌", "drop":"贫瘠", "fly":"空袭",
}

# 由开始菜单传来的“压力开关”字典，合成实际倍率；默认全关=基线(普通)
func build_pressures(active: Dictionary) -> Dictionary:
	var d := {"hp":1.0, "spd":1.0, "dmg":1.0, "spawn":1.0, "size":1.0, "drop":1.0, "fly":0.0}
	if active.get("hp", false):    d["hp"] = PRESSURE_MULT["hp"]
	if active.get("spd", false):   d["spd"] = PRESSURE_MULT["spd"]
	if active.get("dmg", false):   d["dmg"] = PRESSURE_MULT["dmg"]
	if active.get("spawn", false): d["spawn"] = PRESSURE_MULT["spawn"]
	if active.get("size", false):  d["size"] = PRESSURE_MULT["size"]
	if active.get("drop", false):  d["drop"] = PRESSURE_MULT["drop"]
	if active.get("fly", false):   d["fly"] = PRESSURE_MULT["fly"]
	return d

# ---- 行星级球面行走 / 相机跟随 / 环形刷怪 ----
const PLANET_RADIUS := 200.0           # 行星半径（球心固定在世界原点）
const GRAVITY := 30.0                   # 指向球心的重力（玩家/敌人共用）
const CAM_OFFSET := Vector3(0.0, 45.0, 38.0)  # 玩家局部坐标系下的相机偏移（上方+后方），随球面一起旋转
const CAM_LERP := 0.12                   # 相机平滑跟随系数
const SPAWN_RING_MIN := 18.0             # 敌人刷新距主角下限（沿球面）
const SPAWN_RING_MAX := 28.0             # 敌人刷新距主角上限（沿球面）
# ---- 障碍物（在主角周围“可见环带”内生成，作为实体掩体/路障）----
const OBSTACLE_COUNT_MIN := 10           # 主角周围可见环带内的障碍物数量（可调）
const OBSTACLE_COUNT_MAX := 18
const OBSTACLE_SAFE_RADIUS := 14.0       # 玩家周围安全区（球面距离），障碍物不在此内生成，避免一出生就卡住玩家
const OBSTACLE_RING_MAX := 70.0          # 障碍物生成距主角上限（球面距离），小于可见地平线(~134)，保证在视野内

var state := State.MENU
var score := 0
var wave := 0
var enemies_alive := 0
var enemies_to_spawn := 0
var obstacles: Array = []
var player: Player
var pressures: Dictionary = {"hp":1.0, "spd":1.0, "dmg":1.0, "spawn":1.0, "size":1.0, "drop":1.0, "fly":0.0}   # 当前各压力倍率（开始菜单徽章合成）

var cam_offset_cur := CAM_OFFSET   # 当前相机在玩家局部坐标系下的偏移（随球面旋转）
var _prev_up := Vector3.ZERO       # 上一帧玩家法线，用于平滑旋转相机偏移
var _last_aim_point := Vector3.ZERO  # 鼠标最近一次命中地表的瞄准点（避免指示环乱跳）
var _aim_screen := Vector2.ZERO      # 当前瞄准的屏幕坐标（鼠标移动 / 触摸瞄准共用，供射线-球求交）
var _shake_time := 0.0            # 受伤震屏剩余时间

@onready var spawn_timer: Timer = $SpawnTimer
@onready var sfx: AudioStreamPlayer = $SFX
@onready var gun_sfx: AudioStreamPlayer = $GunSFX
@onready var start_menu = $StartMenu
@onready var pause_menu = $PauseMenu
@onready var reticle_node: MeshInstance3D = $Reticle
@onready var hud = $HUD

var between_wave_timer: Timer

func _ready():
	player = get_tree().get_first_node_in_group("player")
	if reticle_node != null:
		reticle_node.mesh = _build_reticle_arc()
	_aim_screen = get_viewport().get_visible_rect().get_center()
	spawn_timer.timeout.connect(_on_spawn_timeout)
	between_wave_timer = Timer.new()
	between_wave_timer.one_shot = true
	between_wave_timer.timeout.connect(_on_between_wave_timeout)
	add_child(between_wave_timer)
	# 菜单接线
	start_menu.request_start.connect(_on_start_requested)
	pause_menu.request_resume.connect(toggle_pause)
	pause_menu.request_pause.connect(toggle_pause)
	pause_menu.request_restart.connect(restart_game)
	enter_menu()

# 相机平滑跟随主角（固定在玩家局部坐标系“上方+后方”，随球面一起旋转，永远从天上往下看）
# 行星视觉球 Earth 固定在原点（球心=世界原点），不再跟随玩家
func _process(_delta: float):
	if player == null:
		return
	var up := player.global_position.normalized()
	# 平滑旋转相机偏移：把上一帧的局部偏移按 up 的变化旋转到当前帧，保持相对方位稳定
	if _prev_up == Vector3.ZERO:
		_prev_up = up
	else:
		var q := Quaternion(_prev_up, up)
		cam_offset_cur = q * cam_offset_cur
		_prev_up = up
	var cam: Camera3D = $Camera3D
	if cam != null:
		var desired := player.global_position + cam_offset_cur
		cam.global_position = cam.global_position.lerp(desired, CAM_LERP)
		cam.look_at(player.global_position, up)
		# 受伤震屏：在跟随结果上叠加随机抖动
		if _shake_time > 0.0:
			_shake_time -= _delta
			var s := 0.6
			cam.global_position += Vector3(randf_range(-s, s), randf_range(-s, s), randf_range(-s, s))
	# 瞄准指示环：贴在地表鼠标指向处
	_update_reticle()

# 鼠标移动时同步更新瞄准屏幕坐标（桌面路径）；触摸路径由 TouchControl.set_aim_screen 写入
func _input(event):
	if event is InputEventMouseMotion:
		_aim_screen = event.position

# 鼠标/触摸射线与“以原点为球心、半径 PLANET_RADIUS 的行星”求交，返回地表瞄准点
func get_mouse_planet_point() -> Vector3:
	var cam := get_viewport().get_camera_3d()
	if cam == null:
		return _last_aim_point
	var origin := cam.project_ray_origin(_aim_screen)
	var dir := cam.project_ray_normal(_aim_screen)
	var bdot := origin.dot(dir)                          # O·D
	var c := origin.dot(origin) - PLANET_RADIUS * PLANET_RADIUS
	var disc := bdot * bdot - c
	if disc < 0.0:
		# 没打到球面（鼠标指向太空）→ 沿用上一次命中，避免指示环乱跳
		return _last_aim_point
	var sq := sqrt(disc)
	var t1 := -bdot - sq
	var t2 := -bdot + sq
	var t := t1 if t1 >= 0.0 else t2
	if t < 0.0:
		return _last_aim_point
	var hit := origin + dir * t
	_last_aim_point = hit
	return hit

# 触摸控制写入瞄准屏幕坐标（替代鼠标位置）
func set_aim_screen(p: Vector2):
	_aim_screen = p

# 生成带方向缺口的瞄准环（torus 弧）：缺口中心位于局部 +X 方向；
# _update_reticle 会把局部 +X 朝向主角，于是缺口指示射击方向。
func _build_reticle_arc() -> Mesh:
	var ring_r := 0.95        # 环半径（与旧 Torus 外径一致）
	var tube_r := 0.16        # 环管半径
	var gap_half := deg_to_rad(28.0)   # 缺口半角（总缺口约 56°）
	var theta_seg := 96       # 弧向分段（铺满整圈除缺口）
	var phi_seg := 14         # 管向分段
	var verts: PackedVector3Array = []
	var norms: PackedVector3Array = []
	var indices: PackedInt32Array = []
	var a0 := gap_half
	var a1 := TAU - gap_half
	for it in range(theta_seg + 1):
		var t := a0 + (a1 - a0) * float(it) / float(theta_seg)
		var ct := cos(t)
		var st := sin(t)
		for ip in range(phi_seg + 1):
			var p := TAU * float(ip) / float(phi_seg)
			var cp := cos(p)
			var sp := sin(p)
			var rr := ring_r + tube_r * cp
			verts.append(Vector3(rr * ct, rr * st, tube_r * sp))
			norms.append(Vector3(cp * ct, cp * st, sp))
	for it in range(theta_seg):
		for ip in range(phi_seg):
			var i0 := it * (phi_seg + 1) + ip
			var i1 := i0 + 1
			var i2 := (it + 1) * (phi_seg + 1) + ip
			var i3 := i2 + 1
			indices.append(i0); indices.append(i2); indices.append(i1)
			indices.append(i1); indices.append(i2); indices.append(i3)
	var arr: Array = []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_NORMAL] = norms
	arr[Mesh.ARRAY_INDEX] = indices
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m

# 瞄准指示环：在地表鼠标指向处放一个平躺的环（Torus 轴=地表法线）
func _update_reticle():
	if reticle_node == null:
		return
	var aim := get_mouse_planet_point()
	if aim == Vector3.ZERO:
		reticle_node.visible = false
		return
	reticle_node.visible = true
	var up := aim.normalized()
	# 局部 +X（缺口中心）朝向主角：把“主角方向”投影到球面切平面作为切线
	var tangent: Vector3
	if player != null:
		var to_player := player.global_position - aim
		tangent = (to_player - up * to_player.dot(up)).normalized()
	if player == null or tangent.length_squared() < 1e-6:
		var ref := Vector3(0.0, 0.0, 1.0)
		if abs(up.dot(ref)) > 0.99:
			ref = Vector3(1.0, 0.0, 0.0)
		tangent = (ref - up * up.dot(ref)).normalized()
	var yc := up.cross(tangent).normalized()
	# Torus 轴沿局部 Z；令 Z 列 = up，使环平躺在地表；局部 +X 指向主角 → 缺口示向
	reticle_node.transform.basis = Basis(tangent, yc, up)
	reticle_node.global_position = aim + up * 0.15
	# 蓄力进度视觉：环随蓄力缩放 + 颜色青→(炸弹橙/弓箭黄)渐变；满蓄力轻微脉动
	var cr := 0.0
	var is_bomb := false
	if player != null and player.has_method("get_charge_state"):
		var cs := player.get_charge_state()
		cr = float(cs["ratio"])
		is_bomb = bool(cs["bomb"])
	var mat := reticle_node.material_override as StandardMaterial3D
	var target_col := Color(0.25, 0.9, 1.0).lerp(Color(1.0, 0.5, 0.1) if is_bomb else Color(1.0, 0.85, 0.2), cr)
	if mat != null:
		mat.emission = target_col
		mat.albedo_color = target_col
	var pulse := 1.0
	if cr > 0.98:
		pulse = 1.0 + sin(Time.get_ticks_msec() * 0.02) * 0.08
	reticle_node.scale = Vector3.ONE * (1.0 + cr * 1.4) * pulse

func enter_menu():
	state = State.MENU
	start_menu.show()
	pause_menu.hide()

func start_game():
	start_menu.hide()
	pause_menu.hide()
	score = 0
	score_changed.emit(score)
	state = State.PLAYING
	start_next_wave()

# 开始菜单选择初始箭袋 + 难度后进入游戏
func _on_start_requested(initial_arrows: int, infinite: bool, active: Dictionary):
	pressures = build_pressures(active)
	start_game()
	if player != null and player.has_method("setup_loadout"):
		player.setup_loadout(initial_arrows, infinite)
	# 把已开启的压力名发给 HUD 显示徽章
	var labels: Array[String] = []
	for k in pressures:
		if k == "fly":
			if pressures[k] > 0.0:
				labels.append(PRESSURE_LABELS[k])
		elif pressures[k] != 1.0:
			labels.append(PRESSURE_LABELS[k])
	pressures_applied.emit(labels)

func restart_game():
	get_tree().paused = false
	get_tree().reload_current_scene()

func is_playing() -> bool:
	return state == State.PLAYING

func is_over() -> bool:
	return state == State.OVER

# ---------------- 波次 / 难度 ----------------
func start_next_wave():
	wave += 1
	wave_changed.emit(wave)
	spawn_obstacles()
	var d := pressures
	enemies_to_spawn = int(float(BASE_WAVE_SIZE + (wave - 1) * WAVE_SIZE_STEP) * float(d["size"]))
	spawn_timer.wait_time = max(MIN_SPAWN_INTERVAL, (BASE_SPAWN_INTERVAL - (wave - 1) * SPAWN_INTERVAL_STEP) * float(d["spawn"]))
	spawn_timer.start()
	play_sfx(S_WAVE_START)

func _on_spawn_timeout():
	if state != State.PLAYING:
		return
	if enemies_to_spawn > 0 and enemies_alive < MAX_CONCURRENT:
		spawn_enemy()
		enemies_to_spawn -= 1
	if enemies_to_spawn <= 0:
		spawn_timer.stop()

func _on_between_wave_timeout():
	if state == State.PLAYING:
		start_next_wave()
	elif state == State.PAUSED:
		# 暂停期间不消耗波次间隔，恢复后继续倒计时再进下一波
		between_wave_timer.start(BETWEEN_WAVE_DELAY)

func spawn_enemy():
	# 约 30% 概率刷为飞行敌人（第 2 波起）；飞行敌人使用飞鸟样式
	var flying_spawn := (wave >= 2 and randf() < float(pressures["fly"]))
	var e
	if flying_spawn:
		e = BIRD_SCENE.instantiate()
		e.flying = true
	else:
		e = ENEMY_SCENE.instantiate()
	# 先加入场景树，再设置 global_position：节点未进树时设 global_position 会触发
	# is_inside_tree() 报错并丢弃赋值，导致敌人刷在原点
	add_child(e)
	enemies_alive += 1
	# 敌人在主角周围“沿球面”一定范围外的环形区域刷新
	var ang := randf() * TAU
	var dist := randf_range(SPAWN_RING_MIN, SPAWN_RING_MAX)
	var pdir := Vector3(0, 1, 0)
	if player != null:
		pdir = player.global_position.normalized()
	e.global_position = _sphere_point_near(pdir, dist, ang)
	var st := enemy_stats_for_wave(wave)
	e.max_health = st.health
	e.health = st.health
	e.speed = st.speed
	e.contact_damage = st.damage

# 在以 origin_dir（单位向量，指向某球面点）为基准、沿球面距离 dist、方位角 ang 处取一个球面点
func _sphere_point_near(origin_dir: Vector3, dist: float, ang: float) -> Vector3:
	var theta := dist / PLANET_RADIUS
	var up := origin_dir
	var ref := Vector3(0.0, 0.0, 1.0)
	if abs(up.dot(ref)) > 0.99:
		ref = Vector3(1.0, 0.0, 0.0)
	var t1 := (ref - up * up.dot(ref)).normalized()
	var t2 := up.cross(t1).normalized()
	var dir := (up * cos(theta) + (t1 * cos(ang) + t2 * sin(ang)) * sin(theta)).normalized()
	return dir * (PLANET_RADIUS + 1.0)

func enemy_stats_for_wave(w: int) -> Dictionary:
	var d := pressures
	var base_hp := 2 + int((w - 1) / 2)
	var base_spd: float = min(4.5, 1.9 + (w - 1) * 0.18)   # 敌人速度小幅提升，制造张力 [PLACEHOLDER]
	var base_dmg := 12.0 + (w - 1) * 2.0
	return {
		"health": int(float(base_hp) * float(d["hp"])),
		"speed": float(base_spd) * float(d["spd"]),
		"damage": float(base_dmg) * float(d["dmg"]),
	}

# ---------------- 障碍物（每波在主角周围可见环带内随机生成，全实体阻挡） ----------------
func spawn_obstacles():
	clear_obstacles()
	var count := randi_range(OBSTACLE_COUNT_MIN, OBSTACLE_COUNT_MAX)
	var pdir := Vector3(0, 1, 0)
	if player != null:
		pdir = player.global_position.normalized()
	for i in count:
		var o = OBSTACLE_SCENE.instantiate()
		var w := randf_range(1.5, 3.0)
		var h := randf_range(1.5, 3.5)
		var d := randf_range(1.5, 3.0)
		var mesh_node = o.get_node("Mesh")
		var col_node = o.get_node("Collision")
		var m := BoxMesh.new()
		m.size = Vector3(w, h, d)
		mesh_node.mesh = m
		mesh_node.position.y = h / 2.0
		var s := BoxShape3D.new()
		s.size = Vector3(w, h, d)
		col_node.shape = s
		col_node.position.y = h / 2.0
		# 在玩家周围“可见环带”内生成：距主角 [安全区, RING_MAX] 的球面位置，随机方位角
		var dist := randf_range(OBSTACLE_SAFE_RADIUS + 4.0, OBSTACLE_RING_MAX)
		var ang := randf() * TAU
		var pos := _sphere_point_near(pdir, dist, ang)   # 返回球面点（全局坐标，已贴在行星表面）
		var up := pos.normalized()                       # 球面法线（单位向量），用于直立盒子
		# 让 box 的局部 +Y（高度方向）对齐地表法线，box 直立于球面；
		# 基必须为右手系（z = x × up），否则反射变换会让盒子面绕序反转、被背面剔除而整块不可见
		var ref := Vector3(0.0, 0.0, 1.0)
		if abs(up.dot(ref)) > 0.99:
			ref = Vector3(1.0, 0.0, 0.0)
		var x_axis := (ref - up * up.dot(ref)).normalized()
		var z_axis := x_axis.cross(up).normalized()
		add_child(o)
		o.global_transform = Transform3D(Basis(x_axis, up, z_axis), pos)
		obstacles.append(o)

# 在“以原点为球心、半径 PLANET_RADIUS”的行星表面均匀随机取一个方向（面积均匀）
func clear_obstacles():
	for o in obstacles:
		if is_instance_valid(o):
			o.queue_free()
	obstacles.clear()

# ---------------- 掉落物（敌人死亡按难度概率掉落，随机两类：补血 / 炸弹） ----------------
func drop_pickup(pos: Vector3):
	var d := pressures
	if randf() < 0.7 * float(d["drop"]):
		var p = PICKUP_SCENE.instantiate()
		# 两类随机：补血偏多、炸弹偏少（让炸弹回归“救命按钮”定位）[PLACEHOLDER]
		if randf() < 0.6:
			p.kind = "health"
		else:
			p.kind = "bomb"
		add_child(p)
		# 贴地：放在 pos 对应的球面点（球心=原点）—— 必须在 add_child 之后设全局坐标
		var up := pos.normalized()
		p.global_position = up * PLANET_RADIUS

func add_score(n: int):
	score += n
	score_changed.emit(score)

func register_enemy_death():
	enemies_alive = max(0, enemies_alive - 1)
	if state == State.PLAYING and enemies_to_spawn <= 0 and enemies_alive <= 0:
		play_sfx(S_WAVE_CLEAR)
		# 清场回补箭矢（有限模式关键：避免“弹尽必败”死局）
		if player != null and player.has_method("add_arrows"):
			player.add_arrows(WAVE_ARROW_REFILL + wave)
		between_wave_timer.start(BETWEEN_WAVE_DELAY)

func damage_player(amount: float):
	if state != State.PLAYING:
		return
	if player != null and player.has_method("take_damage"):
		player.take_damage(amount)

# 受伤反馈：HUD 红色暗角 + 相机轻微震屏
func flash_damage():
	if hud != null and hud.has_method("flash_damage"):
		hud.flash_damage()
	_shake_time = 0.25

func end_game():
	if state == State.OVER:
		return
	state = State.OVER
	spawn_timer.stop()
	between_wave_timer.stop()
	play_sfx(S_GAME_OVER)
	game_over.emit()

# ---------------- 暂停 ----------------
# 说明：不调用 get_tree().paused（整树暂停会阻断 GUI 输入，导致暂停菜单按钮点不动）。
# 改用状态机：PLAYING 时各玩法节点经 is_playing() 门控冻结，PAUSED 时菜单 GUI 始终可交互。
func toggle_pause():
	if state == State.PLAYING:
		state = State.PAUSED
		pause_menu.show()
	elif state == State.PAUSED:
		state = State.PLAYING
		pause_menu.hide()

# ---------------- 音效 ----------------
func play_sfx(stream: AudioStream):
	if sfx != null and stream != null:
		sfx.stream = stream
		sfx.play()

func play_gun_sfx(stream: AudioStream):
	if gun_sfx != null and stream != null:
		gun_sfx.stream = stream
		gun_sfx.play()

func sfx_gun():   play_gun_sfx(S_GUN)
func sfx_bow():    play_gun_sfx(S_BOW)
func sfx_hit():   play_sfx(S_HIT)
func sfx_death(): play_sfx(S_DEATH)
func sfx_reload():play_sfx(S_RELOAD)
func sfx_hurt():  play_sfx(S_HURT)
func sfx_ui():    play_sfx(S_UI)

func _unhandled_input(event):
	if state == State.OVER and event.is_action_pressed("reload"):
		restart_game()
