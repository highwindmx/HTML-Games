extends CharacterBody3D

# WSADgame（弓箭版）— 敌人：朝玩家走来，接触造成伤害，可被击杀
# max_health/health/speed/contact_damage 由 Main 按波次覆盖（难度缩放）
# 弓箭机制：爆头(enemy_head)一箭死；身体(enemy)两箭，命中带击退

const CONTACT_RANGE := 1.6
const CONTACT_COOLDOWN := 1.0
const KNOCKBACK_SPEED := 7.0     # 被箭命中后的击退速度
const KNOCKBACK_TIME := 0.22     # 击退持续时间（秒）
const FLY_ALT := 5.0             # 空中单位巡航高度（相对玩家）
const DIVE_RANGE := 3.5          # 靠近玩家多近开始俯冲

var max_health := 2
var health := max_health
var speed := 2.0
var contact_damage := 12.0
var flying := false              # 空中单位开关（由 Main 按概率设置）
@export var is_bird := false     # 飞鸟样式（由 Bird.tscn 设置为 true）

var player: Node3D
var _wing_l: Node3D = null       # 飞鸟左翼（仅 Bird 场景有，无则跳过扑翼）
var _wing_r: Node3D = null       # 飞鸟右翼
var _mat: StandardMaterial3D = null   # 受击闪烁用的专属材质（飞鸟为 null，仅做缩放弹）
var _base_emission := Color(0, 0, 0, 1)   # 受击闪烁后回退到的发光色
var contact_timer := 0.0
var knockback := Vector3.ZERO
var knockback_timer := 0.0
var dead := false

func _ready():
	add_to_group("enemy")
	player = get_tree().get_first_node_in_group("player")
	_wing_l = get_node_or_null("WingL")
	_wing_r = get_node_or_null("WingR")
	if flying and not is_bird:
		# 空中单位（胶囊敌人）：橙色发光便于区分；飞鸟用自身配色，不覆盖
		var m := StandardMaterial3D.new()
		m.albedo_color = Color(0.9, 0.45, 0.15, 1)
		m.emission_enabled = true
		m.emission = Color(0.5, 0.2, 0.0, 1)
		m.emission_energy_multiplier = 0.6
		_mat = m
		_base_emission = m.emission
		var mesh_node = get_node_or_null("Mesh")
		if mesh_node != null:
			mesh_node.material_override = m
	else:
		# 地面胶囊敌人：建一个可发光的基础材质，供受击闪烁使用
		var mesh_node = get_node_or_null("Mesh")
		if mesh_node != null:
			_mat = StandardMaterial3D.new()
			_mat.albedo_color = Color(0.8, 0.25, 0.25, 1)
			_mat.emission_enabled = true
			_mat.emission = Color(0.0, 0.0, 0.0, 1)
			_mat.emission_energy_multiplier = 1.0
			_base_emission = _mat.emission
			mesh_node.material_override = _mat

func _physics_process(delta: float):
	if get_tree().current_scene.is_over():
		return
	if not get_tree().current_scene.is_playing():
		return
	if player == null or not is_instance_valid(player):
		return
	# 空中单位：保持高度 + 靠近俯冲，3D 距离接触伤害
	if flying:
		_fly_step(delta)
		return
	var up := global_position.normalized()
	# 击退阶段：短暂被推离玩家（仅切平面分量），覆盖普通追击
	if knockback_timer > 0.0:
		knockback_timer -= delta
		var k := knockback - up * knockback.dot(up)
		velocity = k
		velocity += -up * get_tree().current_scene.GRAVITY * delta
		up_direction = up
		move_and_slide()
		_orient(up)
		return
	# 地面追击：在切平面朝玩家走，重力指向球心
	var to_player := player.global_position - global_position
	var tan := to_player - up * to_player.dot(up)
	var dist := tan.length()
	if dist > 0.1:
		velocity = tan.normalized() * speed
	else:
		velocity = Vector3.ZERO
	velocity += -up * get_tree().current_scene.GRAVITY * delta
	up_direction = up
	move_and_slide()
	_orient(up)
	contact_timer -= delta
	if dist < CONTACT_RANGE and contact_timer <= 0.0:
		contact_timer = CONTACT_COOLDOWN
		get_tree().current_scene.damage_player(contact_damage)

# 朝向：面朝玩家、直立于球面（局部 -Z = 朝向）
func _orient(up: Vector3):
	var fwd := player.global_position - global_position
	fwd = fwd - up * fwd.dot(up)
	if fwd.length() < 0.001:
		fwd = -global_transform.basis.z
	fwd = fwd.normalized()
	look_at(global_position + fwd, up)

# 空中单位移动：沿球面切平面靠近，保持巡航高度，靠近俯冲到地表
func _fly_step(delta: float):
	var up := global_position.normalized()
	var to_p := player.global_position - global_position
	var tan := to_p - up * to_p.dot(up)
	var hd := tan.length()
	var move := Vector3.ZERO
	if hd > 0.1:
		move = tan.normalized() * speed
	var surface_r := global_position.length()
	var cur_alt: float = surface_r - get_tree().current_scene.PLANET_RADIUS
	var target_alt := FLY_ALT
	if hd < DIVE_RANGE:
		target_alt = 0.0                    # 俯冲到玩家高度（贴地）
	var alt_vel: float = (target_alt - cur_alt) * 4.0
	velocity = move + up * alt_vel
	up_direction = up
	move_and_slide()
	_orient(up)
	# 飞鸟扑翼动画（仅 Bird 场景带 Wing 节点）
	if _wing_l != null and _wing_r != null:
		var f := sin(Time.get_ticks_msec() * 0.012) * 0.5
		_wing_l.rotation.z = 0.3 + f
		_wing_r.rotation.z = -0.3 - f
	contact_timer -= delta
	var dist3 := to_p.length()
	if dist3 < CONTACT_RANGE and contact_timer <= 0.0:
		contact_timer = CONTACT_COOLDOWN
		get_tree().current_scene.damage_player(contact_damage)

# 身体中箭：扣血；默认两箭致死（health=2，配合 ARROW_DAMAGE=1）
func take_damage(amount: int):
	health -= amount
	if health <= 0:
		die()

# 爆头：一箭直接死亡（无视血量）
func headshot():
	die()

# 被箭命中后的击退（方向由箭矢来袭方向决定，仅水平分量）
func apply_knockback(dir: Vector3):
	knockback = dir * KNOCKBACK_SPEED
	knockback_timer = KNOCKBACK_TIME

# 受击反馈：网格缩放弹一下（所有敌人）；有专属材质时额外发光闪烁
func hit_flash(intensity: float = 1.0):
	var mesh_node = get_node_or_null("Mesh")
	if mesh_node != null:
		var base: Vector3 = mesh_node.scale
		var tw := get_tree().create_tween()
		tw.tween_property(mesh_node, "scale", base * (1.0 + 0.25 * intensity), 0.06)
		tw.tween_property(mesh_node, "scale", base, 0.12)
	if _mat != null:
		_mat.emission = Color(1.0, 1.0, 1.0) * intensity
		var tw2 := get_tree().create_tween()
		tw2.tween_property(_mat, "emission", _base_emission, 0.18)

func die():
	if dead:
		return
	dead = true
	get_tree().current_scene.sfx_death()
	get_tree().current_scene.register_enemy_death()
	get_tree().current_scene.add_score(1)
	get_tree().current_scene.drop_pickup(global_position)
	queue_free()
