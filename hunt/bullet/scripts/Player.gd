extends CharacterBody3D

# WSADgame — 固定斜视角 TPS 原型（玩家）
# 移动：WASD 世界 XZ 平面；朝向：转向鼠标地面投影；射击：无限弹药自动发射（朝鼠标方向）；R 在结束后重开

const SPEED := 8.0
const BulletScene = preload("res://scenes/Bullet.tscn")

const MAX_HEALTH := 100
const FIRE_INTERVAL := 0.15   # 自动发射间隔（秒）

var health := MAX_HEALTH
var muzzle_flash: OmniLight3D
var _fire_cooldown := 0.0

signal health_changed(hp, max_hp)

func _ready():
	add_to_group("player")
	muzzle_flash = $MuzzleFlash

func _physics_process(delta: float):
	if not get_tree().current_scene.is_playing():
		return
	var tp := get_mouse_ground_point()
	tp.y = position.y
	if tp.distance_to(position) > 0.05:
		look_at(tp)
		rotation.x = 0
		rotation.z = 0
	var md_x := Input.get_axis("move_left", "move_right")
	var md_z := Input.get_axis("move_up", "move_down")
	if md_x != 0.0 or md_z != 0.0:
		# 相机相对移动：用相机真实基向量投影到地面，保证任意视角下 W=画面远端、S=近端、A/D=画面左右
		var cam := get_viewport().get_camera_3d()
		var cam_fwd := -cam.global_transform.basis.z   # 相机朝向（看向场景内部）
		cam_fwd.y = 0
		cam_fwd = cam_fwd.normalized()
		var cam_right := cam.global_transform.basis.x  # 相机右轴（画面右方）
		cam_right.y = 0
		cam_right = cam_right.normalized()
		# get_axis("move_up") 按 W 时返回 -1，故对 cam_fwd 取负，使 W 朝画面远端
		var move_dir := cam_right * md_x + cam_fwd * (-md_z)
		if move_dir.length() > 0.001:
			move_dir = move_dir.normalized()
		velocity = move_dir * SPEED
		velocity.y = 0
	else:
		velocity = Vector3.ZERO
	move_and_slide()
	# 无限弹药自动发射（朝鼠标方向）
	_fire_cooldown -= delta
	if _fire_cooldown <= 0.0:
		_fire_cooldown = FIRE_INTERVAL
		shoot()

func get_mouse_ground_point() -> Vector3:
	var cam := get_viewport().get_camera_3d()
	var origin := cam.project_ray_origin(get_viewport().get_mouse_position())
	var normal := cam.project_ray_normal(get_viewport().get_mouse_position())
	var t := -origin.y / normal.y
	return origin + normal * t

func shoot():
	var forward := -global_transform.basis.z
	var muzzle := global_position + Vector3(0, 0.4, 0) + forward * 0.9
	var dir := (get_mouse_ground_point() - muzzle)
	dir.y = 0                      # 锁定水平，避免子弹打飞/打偏
	if dir.length() < 0.001:
		dir = forward
	dir = dir.normalized()
	var b = BulletScene.instantiate()
	b.global_position = muzzle
	b.direction = dir
	get_tree().current_scene.add_child(b)
	get_tree().current_scene.sfx_gun()
	if muzzle_flash != null:
		muzzle_flash.light_energy = 6.0
		await get_tree().create_timer(0.05).timeout
		muzzle_flash.light_energy = 0.0

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
	if health <= 0:
		get_tree().current_scene.end_game()
