extends Node3D

# WSADgame — 游戏总管（挂在 Main 根节点）
# 状态机：MENU(开始菜单) / PLAYING / PAUSED / OVER
# 职责：持续刷怪+狩猎难度、玩家受伤中转、分数、音效、菜单接线

signal score_changed(score)
signal arrows_fired_changed(fired)
signal time_left_changed(t: float)
signal game_over
signal pressures_applied(labels: Array)

enum State { MENU, PLAYING, PAUSED, OVER }

const BEAR_SCENE := preload("res://scenes/Bear.tscn")
const DEER_SCENE := preload("res://scenes/Deer.tscn")
const BIRD_SCENE := preload("res://scenes/Bird.tscn")
const OBSTACLE_SCENE := preload("res://scenes/Obstacle.tscn")
const PICKUP_SCENE := preload("res://scenes/Pickup.tscn")

# ---- 猎物生成比例（熊/鹿/鸟）----
const SPAWN_BEAR_RATIO := 0.30
const SPAWN_DEER_RATIO := 0.45
# 鸟 = 1.0 - 熊 - 鹿 = 0.35（稍高比例，保证空中猎物足够显眼）

# ---- 音效资源 ----
const S_GUN := preload("res://audio/gun.wav")
const S_HIT := preload("res://audio/hit.wav")
const S_DEATH := preload("res://audio/enemy_death.wav")
const S_GAME_OVER := preload("res://audio/game_over.wav")
const S_RELOAD := preload("res://audio/reload.wav")
const S_HURT := preload("res://audio/hurt.wav")
const S_UI := preload("res://audio/ui_click.wav")
const S_BOW := preload("res://audio/bow.wav")

# ---- 刷怪参数（持续刷怪，无波次）----
const MAX_CONCURRENT := 40        # 同屏猎物上限（保护性能）；须接近 INITIAL_PREY_COUNT，否则开局撒的猎物被杀后长期不补刷、越打越空
const BASE_SPAWN_INTERVAL := 1.4  # 猎物刷新间隔（秒），"密集"徽章缩短
const MIN_SPAWN_INTERVAL := 0.4

# ---- 单局结构（开始菜单选择：无限波次 / 计时狩猎 / 配额狩猎）----
const HUNT_TIME := 240.0          # 计时狩猎单局时长（秒）[PLACEHOLDER：按单局4分钟假设，playtest 后调]
const QUOTA_ARROWS := 30          # 配额狩猎单局总箭数 [PLACEHOLDER]
const QUOTA_END_DELAY := 2.5      # 配额模式最后一箭后的结算宽限（等抛物线落地/命中）
const NOISE_RADIUS := 12.0        # 箭落点/中箭声响的惊动半径（沿3D距离近似）[PLACEHOLDER]

# ---- 狩猎难度徽章（开始菜单多选，叠加难度）----
# 每个徽章开启时套用对应倍率：hp/spd/dmg 缩放猎物属性；dense 缩短刷新间隔并提高同屏上限；
# drop 缩放掉落率；fly 增加飞鸟的生成比例
const PRESSURE_MULT := {
	"hp": 1.25, "spd": 1.2, "dmg": 1.3, "dense": 0.8,
	"drop": 0.8, "fly": 0.4,
}
const PRESSURE_LABELS := {
	"hp":"厚皮", "spd":"迅捷", "dmg":"蛮力", "dense":"密集",
	"drop":"贫瘠", "fly":"群鸟",
}
# 玩法变体标签（noise/timed/quota 进 HUD 徽章——它们叠加了难度或改变结束条件；popup 纯显示，不上徽章）
const RULE_LABELS := {"noise":"惊弓之声", "popup":"积分飘字", "timed":"计时狩猎", "quota":"配额狩猎"}

# 由开始菜单传来的“难度开关”字典，合成实际倍率；默认全关=基线(普通)
func build_pressures(active: Dictionary) -> Dictionary:
	var d := {"hp":1.0, "spd":1.0, "dmg":1.0, "dense":1.0, "drop":1.0, "fly":0.0}
	if active.get("hp", false):    d["hp"] = PRESSURE_MULT["hp"]
	if active.get("spd", false):   d["spd"] = PRESSURE_MULT["spd"]
	if active.get("dmg", false):   d["dmg"] = PRESSURE_MULT["dmg"]
	if active.get("dense", false): d["dense"] = PRESSURE_MULT["dense"]
	if active.get("drop", false):  d["drop"] = PRESSURE_MULT["drop"]
	if active.get("fly", false):   d["fly"] = PRESSURE_MULT["fly"]
	return d

# ---- 行星级球面行走 / 相机跟随 / 环形刷怪 ----
const PLANET_RADIUS := 200.0           # 行星半径（球心固定在世界原点）
const GRAVITY := 30.0                   # 指向球心的重力（玩家/猎物共用）
const CAM_OFFSET := Vector3(0.0, 26.0, 30.0)  # 玩家局部坐标系下的相机偏移（上方+后方），随球面一起旋转；降低高度贴近地面
const CAM_LERP := 0.08                   # 相机位置平滑跟随系数（越小越柔、镜头越“懒”）
const CAM_BACK_LERP := 0.03              # 相机“后退方向”阻尼：抑制移动转向时镜头大幅转头（越小越稳，建议 0.03~0.08）
const INITIAL_PREY_COUNT := 80           # 开局撒布在整颗行星表面的猎物数量（全球均匀分布，走过才遇到）；半径 200 的行星可视帽仅约 8%，太少会显得空，故取较大值
# ---- 障碍物（树木）：随玩家“流式”生成，保证行星任意位置都有掩体，不再堆积在出生点 ----
const OBSTACLE_TARGET := 64           # 围绕玩家的常驻树木总数（流式维持，恒定不增长；抬到 64 让地平线更密）
const OBSTACLE_CLUSTER_MIN := 3       # 单簇树木数量下限（成簇组合）
const OBSTACLE_CLUSTER_MAX := 5       # 单簇树木数量上限
const OBSTACLE_CLUSTER_SPREAD := 9.0  # 簇内成员距簇中心的球面距离上限（小 → 成簇紧凑）
const OBSTACLE_SAFE_RADIUS := 14.0    # 玩家周围安全区（球面距离），树木不在此内生成，避免一出生就卡住玩家
const OBSTACLE_STREAM_NEAR := 22.0    # 新树生成距玩家的近界（球面距离），> 安全区避免贴脸
const OBSTACLE_STREAM_FAR := 155.0    # 新树生成远界（球面距离），留余量越过地平线(~134)，走近时前方已铺好、无空带
const OBSTACLE_DESPAWN := 200.0       # 树木距玩家超过此 3D 距离即回收（须>STREAM_FAR，避免刚生成就被回收）
const OBSTACLE_STREAM_STEP := 24.0    # 玩家移动超过此距即触发一次流式补树（更频繁→边缘过渡顺、减少突现）

var state := State.MENU
var score := 0
var arrows_fired := 0
var enemies_alive := 0
var max_concurrent := MAX_CONCURRENT   # 同屏猎物上限（"密集"徽章提升）
var obstacles: Array = []
var player: Player
var pressures: Dictionary = {"hp":1.0, "spd":1.0, "dmg":1.0, "dense":1.0, "drop":1.0, "fly":0.0}   # 当前各难度倍率（开始菜单徽章合成）

# 单局结构由 rules 中的 timed/quota 徽章决定，两者可同时开=双重约束
var rules := {"noise": false, "popup": true, "timed": false, "quota": false}   # 狩猎徽章 rule 类开关
var hunt_time_left := 0.0         # 计时模式剩余时间
var end_reason := ""              # 非空=结构性结束（时间到/箭射尽），空=被击倒结束（HUD 区分文案）

var _cam_back := Vector3.ZERO       # 缓存的相机后退切向；每帧由玩家朝向刷新，避免世界偏移累积漂移
var _last_aim_point := Vector3.ZERO  # 鼠标最近一次命中地表的瞄准点（避免指示环乱跳）
var _aim_screen := Vector2.ZERO      # 当前瞄准的屏幕坐标（鼠标移动 / 触摸瞄准共用，供射线-球求交）
var _shake_time := 0.0            # 受伤震屏剩余时间
var _tree_stream_center := Vector3.ZERO  # 树木流式生成的参考中心；玩家移动超过 OBSTACLE_STREAM_STEP 即以此为中心补树

@onready var spawn_timer: Timer = $SpawnTimer
@onready var sfx: AudioStreamPlayer = $SFX
@onready var gun_sfx: AudioStreamPlayer = $GunSFX
@onready var start_menu = $StartMenu
@onready var pause_menu = $PauseMenu
@onready var reticle_node: MeshInstance3D = $Reticle
@onready var hud = $HUD

var _quota_timer: Timer           # 配额模式最后一箭的结算宽限计时
var _hit_pulse := 0.0             # 命中反馈：准星脉冲剩余时间
var _hit_pulse_big := false       # 命中反馈：是否爆头（脉冲更大更亮）

func _ready():
	# 强制窗口标题为「弓猎」——覆盖 Godot 调试构建自动追加的 "[Debug]" 后缀
	# （尤其网页版会反映到浏览器标签页）。发布时仍以 Release 导出为准。
	get_window().title = "弓猎"
	player = get_tree().get_first_node_in_group("player")
	if reticle_node != null:
		reticle_node.mesh = _build_reticle_arc()
	_aim_screen = get_viewport().get_visible_rect().get_center()
	spawn_timer.timeout.connect(_on_spawn_timeout)
	_quota_timer = Timer.new()
	_quota_timer.one_shot = true
	_quota_timer.timeout.connect(_on_quota_end_check)
	add_child(_quota_timer)
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
	# 计时徽章：倒计时，时间到即结算（结构式收尾，不是死亡）
	# 直接用 rules["timed"]——两者同时开时倒计时也要跑
	if state == State.PLAYING and rules["timed"]:
		hunt_time_left -= _delta
		time_left_changed.emit(max(0.0, hunt_time_left))
		if hunt_time_left <= 0.0:
			end_round("时间到")
	# 树木随玩家流式生成/回收（保证行星任意位置都有掩体，不再堆在出生点）
	_stream_obstacles()
	var up := player.global_position.normalized()
	# 在玩家局部坐标系【每帧重新计算】相机偏移，而非把世界空间偏移按 up 变化增量旋转。
	# 旧的增量旋转会累积球面完整角(holonomy)漂移：走过一段后偏移径向分量翻负，
	# 镜头钻到球面下方、且像“平面跟随”。改为每帧基于 up + 玩家朝向切向重建，彻底消除漂移。
	# 相机后退方向只跟随【移动方向】，不跟随【瞄准/朝向】，避免瞄准时视角乱晃。
	# 玩家模型仍会转向鼠标（视觉上弓指向瞄准点），但相机纹丝不动，直到玩家真正移动。
	var vel := player.velocity
	var move_tan := vel - up * vel.dot(up)        # 速度切向分量（去掉指向球心的重力分量）
	if move_tan.length_squared() > 1e-6:
		var target_back := (-move_tan).normalized()   # 相机退到移动方向正后方
		# 阻尼：相机后退方向平滑趋近目标，移动转向时相机柔和跟随
		_cam_back = _cam_back.lerp(target_back, CAM_BACK_LERP)
		_cam_back = _cam_back - up * _cam_back.dot(up)  # 重新投影到当前切平面，避免沿球面移动时径向漂移
		if _cam_back.length_squared() < 1e-6:
			_cam_back = target_back
		else:
			_cam_back = _cam_back.normalized()
	elif _cam_back.length_squared() < 1e-6:
		# 尚未初始化（开局静止）：用玩家当前朝向兜底，避免相机一开始落在正上方
		var fwd0 := -player.global_transform.basis.z
		fwd0 = fwd0 - up * fwd0.dot(up)
		if fwd0.length_squared() > 1e-6:
			_cam_back = (-fwd0).normalized()
	var cam: Camera3D = $Camera3D
	if cam != null:
		# 期望位置 = 玩家位置 + 沿球面法线抬高 CAM_OFFSET.y + 沿后退切向后拉 CAM_OFFSET.z
		var desired := player.global_position + up * CAM_OFFSET.y + _cam_back * CAM_OFFSET.z
		cam.global_position = cam.global_position.lerp(desired, CAM_LERP)
		# look_at 保护：视线方向与 up 平行会构造退化基（invert det==0 报错），该帧跳过
		var view := cam.global_position - player.global_position
		if view.length_squared() > 1e-6 and up.cross(view).length_squared() > 1e-4:
			cam.look_at(player.global_position, up)
		# 受伤震屏：在跟随结果上叠加随机抖动
		if _shake_time > 0.0:
			_shake_time -= _delta
			var s := 0.6
			cam.global_position += Vector3(randf_range(-s, s), randf_range(-s, s), randf_range(-s, s))
	# 瞄准指示环：贴在地表鼠标指向处（_delta 用于命中脉冲衰减）
	_update_reticle(_delta)

# 鼠标移动时同步更新瞄准屏幕坐标（桌面路径）；触摸路径由 TouchControl.set_aim_screen 写入。
# 触屏设备忽略模拟鼠标：Godot 把触摸模拟成鼠标移动，若不拦截，左手在左屏点按时
# 会把 3D 准星环拽到左屏位置（用户反馈“左触屏看到准星”）。触摸瞄准由右手摇杆驱动。
func _input(event):
	if event is InputEventMouseMotion and not DisplayServer.is_touchscreen_available():
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
func _update_reticle(delta: float):
	if reticle_node == null:
		return
	# 触屏设备不显示 3D 准星环：右手摇杆已有瞄准圈指示，且避免左屏误触显示准星
	if DisplayServer.is_touchscreen_available():
		reticle_node.visible = false
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
	# 命中反馈脉冲：命中后准星瞬间放大+提亮再衰减（爆头更大更亮）
	if _hit_pulse > 0.0:
		_hit_pulse = max(0.0, _hit_pulse - delta)
		var k := _hit_pulse / 0.25
		reticle_node.scale *= 1.0 + (0.8 if _hit_pulse_big else 0.35) * k
		if mat != null:
			mat.emission = mat.emission.lerp(Color(1, 1, 1), k * 0.8)
			mat.albedo_color = mat.albedo_color.lerp(Color(1, 1, 1), k * 0.5)

func enter_menu():
	state = State.MENU
	start_menu.show()
	pause_menu.hide()

func start_game():
	start_menu.hide()
	pause_menu.hide()
	score = 0
	arrows_fired = 0
	end_reason = ""
	hunt_time_left = 0.0
	score_changed.emit(score)
	arrows_fired_changed.emit(arrows_fired)
	state = State.PLAYING
	seed_obstacles()
	spawn_initial_prey()          # 开局把猎物撒满整颗行星（全球均匀，而非围绕玩家气泡）
	# "密集"徽章：缩短刷新间隔 + 提高同屏上限（dense=1.0 关 → 基线；0.8 开 → 更密更多）
	max_concurrent = int(float(MAX_CONCURRENT) * (2.0 - float(pressures["dense"])))
	spawn_timer.wait_time = max(MIN_SPAWN_INTERVAL, BASE_SPAWN_INTERVAL * float(pressures["dense"]))
	spawn_timer.start()

# 开始菜单选择狩猎徽章后进入游戏
func _on_start_requested(active: Dictionary, options: Dictionary):
	pressures = build_pressures(active)
	rules = {
		"noise": bool(options.get("noise", false)),
		"popup": bool(options.get("popup", true)),
		"timed": bool(options.get("timed", false)),
		"quota": bool(options.get("quota", false)),
	}
	start_game()
	# 箭袋：配额徽章→有限(QUOTA_ARROWS)；其余→无限（不再有菜单箭矢选择）
	if rules["quota"]:
		player.setup_loadout(QUOTA_ARROWS, false)
	else:
		player.setup_loadout(999999, true)
	# 计时徽章：启动倒计时
	if rules["timed"]:
		hunt_time_left = HUNT_TIME
		time_left_changed.emit(hunt_time_left)
	# 把已开启的徽章名发给 HUD 显示角标
	var labels: Array[String] = []
	for k in pressures:
		if k == "fly":
			if pressures[k] > 0.0:
				labels.append(PRESSURE_LABELS[k])
		elif pressures[k] != 1.0:
			labels.append(PRESSURE_LABELS[k])
	# 玩法变体/单局结构：惊弓之声、计时狩猎、配额狩猎作为活跃徽章显示；积分飘字为纯显示，不上徽章
	if rules["noise"]:
		labels.append(RULE_LABELS["noise"])
	if rules["timed"]:
		labels.append(RULE_LABELS["timed"])
	if rules["quota"]:
		labels.append(RULE_LABELS["quota"])
	pressures_applied.emit(labels)

func restart_game():
	get_tree().paused = false
	get_tree().reload_current_scene()

func is_playing() -> bool:
	return state == State.PLAYING

func is_over() -> bool:
	return state == State.OVER

# ---------------- 持续刷怪（无波次） ----------------
func _on_spawn_timeout():
	if state != State.PLAYING:
		return
	# 持续刷怪：只要同屏数未达上限就补一只，无波次无清场
	if enemies_alive < max_concurrent:
		spawn_enemy()

func spawn_enemy():
	# 按比例随机选择猎物类型：熊 / 鹿 / 鸟
	# "群鸟"徽章开启时增加飞鸟的比例
	var bear_r := SPAWN_BEAR_RATIO
	var deer_r := SPAWN_DEER_RATIO
	if float(pressures["fly"]) > 0.0:
		bear_r = 0.22
		deer_r = 0.28
	var bird_r := 1.0 - bear_r - deer_r
	var r := randf()
	var e
	if r < bear_r:
		e = BEAR_SCENE.instantiate()
	elif r < bear_r + deer_r:
		e = DEER_SCENE.instantiate()
	else:
		e = BIRD_SCENE.instantiate()
	# 先加入场景树，再设置 global_position：节点未进树时设 global_position 会触发
	# is_inside_tree() 报错并丢弃赋值，导致敌人刷在原点
	add_child(e)
	enemies_alive += 1
	# 敌人在【整颗行星表面】面积均匀随机点刷新：开局撒满全球、走过才遇到，
	# 不再围绕玩家生成“气泡”。位置取球面均匀随机单位向量 × (R+1)，避免卡地。
	var pdir := _random_global_dir()
	e.global_position = pdir * (PLANET_RADIUS + 1.0)
	# 压力缩放：在敌人 _ready 已设好的类型固有属性上叠压压力倍率
	var d := pressures
	e.max_health = int(float(e.max_health) * float(d["hp"]))
	e.health = e.max_health
	e.speed = float(e.speed) * float(d["spd"])
	e.contact_damage = float(e.contact_damage) * float(d["dmg"])

# 开局一次性把 INITIAL_PREY_COUNT 只猎物撒在全行星表面（全球均匀，走过才遇到）
func spawn_initial_prey():
	for i in INITIAL_PREY_COUNT:
		spawn_enemy()

# 在以 origin_dir（单位向量，指向某球面点）为基准、沿球面距离 dist、方位角 ang 处取一个球面点
# alt：离地高度偏移（猎物出生 +1 悬空防卡地；树等贴地物体用 0）
func _sphere_point_near(origin_dir: Vector3, dist: float, ang: float, alt := 1.0) -> Vector3:
	var theta := dist / PLANET_RADIUS
	var up := origin_dir
	var ref := Vector3(0.0, 0.0, 1.0)
	if abs(up.dot(ref)) > 0.99:
		ref = Vector3(1.0, 0.0, 0.0)
	var t1 := (ref - up * up.dot(ref)).normalized()
	var t2 := up.cross(t1).normalized()
	var dir := (up * cos(theta) + (t1 * cos(ang) + t2 * sin(ang)) * sin(theta)).normalized()
	return dir * (PLANET_RADIUS + alt)

# 面积均匀的球面随机单位向量（z∈[-1,1] 均匀、方位角∈[0,2π) 均匀），
# 用于把猎物撒在整颗行星表面（而非玩家周围气泡）
func _random_global_dir() -> Vector3:
	var z := randf() * 2.0 - 1.0
	var phi := randf() * TAU
	var r := sqrt(1.0 - z * z)
	return Vector3(r * cos(phi), z, r * sin(phi))

# ---------------- 障碍物（树木）：随玩家流式生成 ----------------
# 开局一次性在玩家周围铺满 OBSTACLE_TARGET 棵树；之后玩家走动时，
# _stream_obstacles() 持续回收远处树、在玩家新位置周围补树，
# 保证行星任意位置都有掩体，不再像旧版那样全堆在出生点。
func seed_obstacles():
	clear_obstacles()
	_tree_stream_center = player.global_position if player != null else Vector3.ZERO
	while obstacles.size() < OBSTACLE_TARGET:
		_spawn_cluster()

# 生成一簇树（3~5 棵）：先定簇中心（落在玩家周围 [NEAR,FAR] 环带），再在中心周围
# 小范围内随机散布其余成员，形成自然成簇的树林而非均匀单棵散布。
func _spawn_cluster():
	if player == null:
		return
	var pdir := player.global_position.normalized()
	var cdist := randf_range(OBSTACLE_STREAM_NEAR, OBSTACLE_STREAM_FAR)
	var cang := randf() * TAU
	var cpos := _sphere_point_near(pdir, cdist, cang, 0.0)   # 簇中心（树根贴地）
	var cluster_size := randi_range(OBSTACLE_CLUSTER_MIN, OBSTACLE_CLUSTER_MAX)
	for k in cluster_size:
		var pos: Vector3
		if k == 0:
			pos = cpos
		else:
			# 簇内成员：以簇中心为基准，球面距离 [2, SPREAD]、随机方位角
			var d2 := randf_range(2.0, OBSTACLE_CLUSTER_SPREAD)
			var a2 := randf() * TAU
			pos = _sphere_point_near(cpos.normalized(), d2, a2, 0.0)
		_place_tree(pos)

# 在指定球面位置放置一棵树（树根贴地，树干沿球面法线直立；整树随机缩放做高矮粗细变化）
func _place_tree(pos: Vector3):
	var o = OBSTACLE_SCENE.instantiate()
	var s := randf_range(0.7, 1.5)
	var up := pos.normalized()                           # 球面法线（单位向量），树干沿法线直立
	# 基须为右手系（z = x × up），否则面绕序反转被背面剔除整块不可见
	var ref := Vector3(0.0, 0.0, 1.0)
	if abs(up.dot(ref)) > 0.99:
		ref = Vector3(1.0, 0.0, 0.0)
	var x_axis := (ref - up * up.dot(ref)).normalized()
	var z_axis := x_axis.cross(up).normalized()
	add_child(o)
	o.global_transform = Transform3D(Basis(x_axis * s, up * s, z_axis * s), pos)
	obstacles.append(o)

# 流式维护：玩家移动超过 OBSTACLE_STREAM_STEP 即回收超出 OBSTACLE_DESPAWN 的树，
# 并在玩家周围补到 OBSTACLE_TARGET 棵，数量恒定不增长（性能可控）
func _stream_obstacles():
	if player == null or state != State.PLAYING:
		return
	if player.global_position.distance_to(_tree_stream_center) < OBSTACLE_STREAM_STEP:
		return
	_tree_stream_center = player.global_position
	# 回收远处树
	var kept: Array = []
	for o in obstacles:
		if is_instance_valid(o):
			if o.global_position.distance_to(player.global_position) <= OBSTACLE_DESPAWN:
				kept.append(o)
			else:
				o.queue_free()
	obstacles = kept
	# 补足到目标数量（以簇为单位补，保持成簇结构）
	while obstacles.size() < OBSTACLE_TARGET:
		_spawn_cluster()

func clear_obstacles():
	for o in obstacles:
		if is_instance_valid(o):
			o.queue_free()
	obstacles.clear()

# ---------------- 掉落物（猎物死亡按难度概率掉落，类型由猎物种类决定：血包 / 箭袋 / 炸蛋） ----------------
# 掉落物按猎物种类决定类型：熊→血包 / 鹿→箭袋 / 鸟→炸蛋
# 杀鹿掉箭是配额模式的核心补箭来源；掉落概率基线 0.8，受“贫瘠”压力倍率缩放（0.8）
func drop_pickup(pos: Vector3, enemy_type := "bear"):
	var d := pressures
	if randf() < 0.8 * float(d["drop"]):
		var p = PICKUP_SCENE.instantiate()
		match enemy_type:
			"deer":  p.kind = "arrow"
			"bird":  p.kind = "bomb"
			_:       p.kind = "health"   # 熊（默认）掉血包
		add_child(p)
		# 贴地：放在 pos 对应的球面点（球心=原点）—— 必须在 add_child 之后设全局坐标
		var up := pos.normalized()
		p.global_position = up * PLANET_RADIUS

func add_score(n: int):
	score += n
	score_changed.emit(score)

# 玩家每射出一支箭时调用（由 Player.release_arrow 上报）
func register_arrow_fired():
	arrows_fired += 1
	arrows_fired_changed.emit(arrows_fired)
	# 配额徽章：最后一箭射出后短暂宽限（等抛物线落地/命中），随后结算
	if rules["quota"] and state == State.PLAYING:
		if player != null and not player.infinite_quiver and player.quiver <= 0:
			_quota_timer.start(QUOTA_END_DELAY)

func _on_quota_end_check():
	if state == State.PLAYING and rules["quota"]:
		if player != null and player.quiver <= 0:
			end_round("箭已射尽")

# 效率 = 积分 / 射出箭数（1.0=零失误体射；爆头>1.0；脱靶<1.0）
func get_efficiency() -> float:
	if arrows_fired <= 0:
		return 1.0
	return float(score) / float(arrows_fired)

# 按效率 + 积分综合评级（S~D）
func get_rating() -> String:
	var eff := get_efficiency()
	if eff >= 1.2 and score >= 18:
		return "S"
	elif eff >= 0.9:
		return "A"
	elif eff >= 0.6:
		return "B"
	elif eff >= 0.3:
		return "C"
	else:
		return "D"

func register_enemy_death():
	enemies_alive = max(0, enemies_alive - 1)

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
	_quota_timer.stop()
	play_sfx(S_GAME_OVER)
	game_over.emit()

# 结构性结束（时间到 / 配额射尽）：与被击倒结束区分文案，HUD 显示"狩猎结束"
func end_round(reason: String):
	if state == State.OVER:
		return
	end_reason = reason
	end_game()

# ---------------- 声响惊动（规则选项）----------------
# 噪声源（箭落点/中箭/爆炸）附近 radius 内的鹿立即逃离声源；规则关闭时为 no-op
func alert_deer(pos: Vector3, radius := NOISE_RADIUS):
	if not rules["noise"]:
		return
	for e in get_tree().get_nodes_in_group("enemy"):
		if e == null or not is_instance_valid(e):
			continue
		if e is Node3D and e.global_position.distance_to(pos) <= radius and e.has_method("alert_noise"):
			e.alert_noise(pos)

# ---------------- 积分飘字（规则选项）----------------
# 击杀点飘字：普通白色 / 爆头金色带"爆头"前缀 / 炸蛋灰色半分。
# 用 2D ImageText 覆盖层（投影到屏幕坐标）代替 Label3D，
# 文字来自烘焙图集，绕开 Web 动态字体方块。
func spawn_score_popup(pos: Vector3, pts: int, headshot: bool, by_bomb: bool):
	if not rules["popup"]:
		return
	var cam := get_viewport().get_camera_3d()
	if cam == null:
		return
	var sp := cam.unproject_position(pos + pos.normalized() * 2.0)
	var it := preload("res://scripts/ImageText.gd").new()
	if headshot:
		it.text = "爆头 +%d" % pts
		it.color = Color(1.0, 0.82, 0.15, 1.0)
	elif by_bomb:
		it.text = "+%d" % pts
		it.color = Color(0.65, 0.65, 0.65, 1.0)
	else:
		it.text = "+%d" % pts
		it.color = Color(1.0, 1.0, 1.0, 1.0)
	it.font_size = 40
	it.center_origin = true
	$PopupLayer.add_child(it)
	it.position = sp
	var tw := create_tween().set_parallel(true)
	tw.tween_property(it, "position", sp + Vector2(0, -60), 0.85)
	tw.tween_property(it, "modulate:a", 0.0, 0.6).set_delay(0.25)
	tw.chain().tween_callback(it.queue_free)

# ---------------- 命中反馈 ----------------
# 命中确认：准星环快速脉冲（爆头更大更亮），由 Arrow 命中时调用
func hit_confirmed(headshot: bool):
	_hit_pulse = 0.25
	_hit_pulse_big = headshot

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
