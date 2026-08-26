extends CharacterBody3D
class_name Player

# WSADgame（弓箭版）— 固定斜视角 TPS：弓箭武器
# 移动：WASD 相机相对；朝向：鼠标地面投影；攻击：按住左键蓄力，松开发射弓箭（抛物线、有限/无限箭袋）

const SPEED := 8.0
const TURN_LERP := 12.0     # 角色转向阻尼（越大转得越快，越小越平滑）；原版每帧瞬转≈无限大
const CHARGE_SLOW := 0.45   # 蓄力时移动速度倍率（risk/reward：想打远就站定挨揍）[PLACEHOLDER]
const ArrowScene = preload("res://scenes/Arrow.tscn")
const BombScene = preload("res://scenes/Bomb.tscn")

const MAX_HEALTH := 100
var MAX_QUIVER := 20            # 箭袋容量（按开局选择覆盖：20 / 50 / 无限）
var infinite_quiver := false    # 开局选"无限"时为 true

const CHARGE_TIME := 0.9        # 蓄满所需时间（秒）
const MIN_ARROW_SPEED := 16.0
const MAX_ARROW_SPEED := 34.0
const ARROW_DAMAGE := 1

var health := MAX_HEALTH
var quiver := MAX_QUIVER
var bombs := 0
const MAX_BOMBS := 30
var charging := false
var charge := 0.0
var charging_bomb := false
var bomb_charge := 0.0

signal health_changed(hp, max_hp)
signal ammo_changed(cur, max_ammo)   # 此处表示箭袋
signal bombs_changed(cur, max_bombs) # 此处表示炸弹

func _ready():
	add_to_group("player")

func _unhandled_input(event):
	if not get_tree().current_scene.is_playing():
		return
	# 触摸设备由 TouchControl 统一处理射击/投弹。
	# Godot 默认会把屏幕触摸模拟成“鼠标左/右键按下”，若不在此拦截，
	# 左手在左屏点按移动时也会触发 release_arrow() 误发射箭（右屏则会双重射击）。
	# 桌面端（无触摸屏）仍走下面的鼠标逻辑。
	if DisplayServer.is_touchscreen_available():
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			charging = true
			charge = 0.0
		elif charging:
			release_arrow()
			charging = false
			charge = 0.0
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT:
		if event.pressed:
			if bombs > 0:
				charging_bomb = true
				bomb_charge = 0.0
		elif charging_bomb:
			throw_bomb(bomb_charge)
			charging_bomb = false
			bomb_charge = 0.0

func _physics_process(delta: float):
	if not get_tree().current_scene.is_playing():
		if has_node("AimArrow"):
			$AimArrow.visible = false
		return
	if has_node("AimArrow"):
		$AimArrow.visible = true
	var up := global_position.normalized()
	# 朝向：面向鼠标/触摸在球面的瞄准点，保持直立于球面（局部 -Z 指向瞄准方向）
	var aim: Vector3 = get_tree().current_scene.get_mouse_planet_point() as Vector3
	var fwd := aim - global_position
	fwd = fwd - up * fwd.dot(up)
	if fwd.length() < 0.001:
		fwd = -global_transform.basis.z
	fwd = fwd.normalized()
	# 移动：相机相对，投影到切平面
	var md_x := Input.get_axis("move_left", "move_right")
	var md_z := Input.get_axis("move_up", "move_down")
	if md_x != 0.0 or md_z != 0.0:
		var cam := get_viewport().get_camera_3d()
		var cam_fwd := -cam.global_transform.basis.z
		var cam_right := cam.global_transform.basis.x
		cam_fwd = (cam_fwd - up * cam_fwd.dot(up)).normalized()
		cam_right = (cam_right - up * cam_right.dot(up)).normalized()
		# get_axis("move_up") 按 W 返回 -1，故对 cam_fwd 取负，使 W 朝画面远端
		var move_dir := cam_right * md_x + cam_fwd * (-md_z)
		if move_dir.length() > 0.001:
			move_dir = move_dir.normalized()
		var spd := SPEED
		if charging or charging_bomb:
			spd *= CHARGE_SLOW   # 蓄力时降速：进攻与机动产生权衡
		velocity = move_dir * spd
	else:
		velocity = Vector3.ZERO
	# 重力指向球心（原点）
	velocity += -up * get_tree().current_scene.GRAVITY * delta
	up_direction = up
	move_and_slide()
	# 防穿星：始终把玩家约束在星球表面之上，避免沉入不透明星球内部被遮挡而“隐身”
	# （胶囊 height=2.0，半身高=1.0，故最小半径 = PLANET_RADIUS + 1.0；之前误用 1.5
	#   导致每帧把玩家抬离地面 0.5 单位，视觉上“浮空”）
	var surf_r: float = get_tree().current_scene.PLANET_RADIUS + 1.0
	if global_position.length() < surf_r:
		global_position = global_position.normalized() * surf_r
	# 落地后重新对齐球面朝向（带阻尼：指数趋近目标朝向，避免鼠标快速移动时角色猛甩）
	up = global_position.normalized()
	fwd = aim - global_position
	fwd = fwd - up * fwd.dot(up)
	if fwd.length() < 0.001:
		fwd = -global_transform.basis.z
	fwd = fwd.normalized()
	var target_quat := Basis.looking_at(fwd, up).get_rotation_quaternion()
	var cur_quat := global_transform.basis.get_rotation_quaternion()
	var tt := 1.0 - exp(-TURN_LERP * delta)   # 帧率无关阻尼系数
	global_transform = Transform3D(Basis(cur_quat.slerp(target_quat, tt)), global_position)
	# 蓄力累积（弓箭 / 炸弹 各自独立）
	if charging:
		charge = min(1.0, charge + delta / CHARGE_TIME)
	if charging_bomb:
		bomb_charge = min(1.0, bomb_charge + delta / CHARGE_TIME)

# 球面世界下“地面点”= 鼠标在行星表面的交点
func get_mouse_ground_point() -> Vector3:
	return get_tree().current_scene.get_mouse_planet_point()

func release_arrow():
	if not infinite_quiver and quiver <= 0:
		get_tree().current_scene.sfx_ui()   # 空箭袋提示音
		return
	# 先扣箭再上报：配额模式下 register_arrow_fired 靠 quiver<=0 判定“最后一箭”并启动结算宽限；
	# 原先在上报之后才扣箭，导致最后一箭射出时 quiver 仍为 1，宽限计时器永不启动，配额局无法正常结束。
	if not infinite_quiver:
		quiver -= 1
		ammo_changed.emit(quiver, MAX_QUIVER)
	# 记录箭矢消耗（用于效率评分）
	if get_tree().current_scene.has_method("register_arrow_fired"):
		get_tree().current_scene.register_arrow_fired()
	var charge_ratio: float = clamp(charge, 0.0, 1.0)   # 仰角用：不蓄力=0°平射
	var spd_ratio: float = clamp(charge, 0.15, 1.0)     # 速度用：保证最小射程
	var up := global_position.normalized()
	var forward := -global_transform.basis.z
	var muzzle := global_position + up * 0.6 + forward * 0.9
	var aim := (get_mouse_ground_point() - muzzle)
	aim = aim - up * aim.dot(up)       # 仅取切平面朝向（鼠标在球面指向）
	if aim.length() < 0.001:
		aim = forward
	aim = aim.normalized()
	# 仰角随蓄力 0°(平射) → 45°(满蓄力)；速度同步变化决定落点远近，飞行呈抛物线
	var elev := deg_to_rad(lerp(0.0, 45.0, charge_ratio))
	var spd: float = MIN_ARROW_SPEED + (MAX_ARROW_SPEED - MIN_ARROW_SPEED) * spd_ratio
	var launch := aim * cos(elev) + up * sin(elev)
	var a = ArrowScene.instantiate()
	a.direction = launch.normalized()
	a.speed = spd
	a.damage = ARROW_DAMAGE
	get_tree().current_scene.add_child(a)
	a.global_position = muzzle
	get_tree().current_scene.sfx_bow()

# 开局由开始菜单选择初始箭袋：initial=具体数 / infinite=true 表示无限
func setup_loadout(initial: int, infinite: bool):
	infinite_quiver = infinite
	if infinite:
		MAX_QUIVER = 999999
		quiver = 999999
	else:
		MAX_QUIVER = initial
		quiver = initial
	ammo_changed.emit(quiver, MAX_QUIVER)

func add_arrows(n: int):
	if infinite_quiver:
		return
	quiver = min(MAX_QUIVER, quiver + n)
	ammo_changed.emit(quiver, MAX_QUIVER)

# 敌方遗落物拾取：获得炸弹
func add_bombs(n: int):
	bombs = min(MAX_BOMBS, bombs + n)
	bombs_changed.emit(bombs, MAX_BOMBS)

# 右键投掷爆炸弹：与弓箭相同机制——蓄力决定仰角(0°→45°)与速度(16→34)，抛物线飞向鼠标方向，落地后范围爆炸
func throw_bomb(charge: float):
	if bombs <= 0:
		get_tree().current_scene.sfx_ui()   # 无炸弹提示音
		return
	var charge_ratio: float = clamp(charge, 0.0, 1.0)
	var spd_ratio: float = clamp(charge, 0.15, 1.0)
	var up := global_position.normalized()
	var forward := -global_transform.basis.z
	var muzzle := global_position + up * 0.8 + forward * 0.9
	var aim := (get_mouse_ground_point() - muzzle)
	aim = aim - up * aim.dot(up)       # 仅取切平面朝向（鼠标在球面指向）
	if aim.length() < 0.001:
		aim = forward
	aim = aim.normalized()
	var elev := deg_to_rad(lerp(0.0, 45.0, charge_ratio))   # 同弓箭：平射→45°
	var spd: float = MIN_ARROW_SPEED + (MAX_ARROW_SPEED - MIN_ARROW_SPEED) * spd_ratio
	var launch := aim * cos(elev) + up * sin(elev)
	var b = BombScene.instantiate()
	b.direction = launch.normalized()
	b.speed = spd
	get_tree().current_scene.add_child(b)
	b.global_position = muzzle
	get_tree().current_scene.sfx_bow()   # 投掷音（暂复用弓弦音）
	bombs -= 1
	bombs_changed.emit(bombs, MAX_BOMBS)

func heal(n: int):
	var h: int = min(MAX_HEALTH, health + n)
	health = h
	health_changed.emit(health, MAX_HEALTH)

func take_damage(amount: int):
	if get_tree().current_scene.is_over():
		return
	health = max(0, health - amount)
	health_changed.emit(health, MAX_HEALTH)
	get_tree().current_scene.sfx_hurt()
	get_tree().current_scene.flash_damage()   # 受伤反馈：暗角 + 震屏
	if health <= 0:
		get_tree().current_scene.end_game()

# ---------------- 触摸控制接口（由 TouchControl 调用，与鼠标逻辑一致） ----------------
func begin_charge():
	if not get_tree().current_scene.is_playing():
		return
	charging = true
	charge = 0.0

func end_charge():
	if charging:
		release_arrow()
		charging = false
		charge = 0.0

func begin_charge_bomb():
	if not get_tree().current_scene.is_playing():
		return
	if bombs > 0:
		charging_bomb = true
		bomb_charge = 0.0

func end_charge_bomb():
	if charging_bomb:
		throw_bomb(bomb_charge)
		charging_bomb = false
		bomb_charge = 0.0

# 供 Main 的准星环读取当前蓄力状态（避免跨脚本直接访问属性）
func get_charge_state() -> Dictionary:
	if charging_bomb:
		return {"ratio": bomb_charge, "bomb": true}
	if charging:
		return {"ratio": charge, "bomb": false}
	return {"ratio": 0.0, "bomb": false}
