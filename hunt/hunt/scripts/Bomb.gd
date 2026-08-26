extends Area3D

# WSADgame（弓箭版）— 爆炸弹：抛物线飞行，落地/命中即爆炸，范围内伤害敌人
# 中心半径(内) → 等同爆头（一击死）；外圈半径 → 等同箭矢扎身体（BODY_DAMAGE 伤害）
# 仅伤害敌人（不伤玩家）；附带一次扩散爆炸视觉

const BODY_DAMAGE := 1
const OUTER_RADIUS := 4.5
const INNER_RADIUS := 1.6
const BOMB_GRAVITY := 22.0
const NOISE_RADIUS_BOMB := 16.0   # 爆炸惊动半径（比箭落点更大）[PLACEHOLDER]

var direction := Vector3.ZERO   # 发射方向（含仰角，已归一）
var speed := 26.0
var velocity := Vector3.ZERO
var _prev := Vector3.ZERO
var life := 5.0
var exploded := false

func _ready():
	_prev = global_position
	velocity = direction * speed

func _physics_process(delta: float):
	if get_tree().current_scene.is_over():
		return
	if not get_tree().current_scene.is_playing():
		return
	# 重力指向球心（原点）
	var gdir := -global_position.normalized()
	velocity += gdir * BOMB_GRAVITY * delta
	var next: Vector3 = global_position + velocity * delta
	var space := get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(_prev, next)
	q.collide_with_bodies = true
	q.collide_with_areas = true
	q.exclude = [self.get_rid()]   # 排除自身
	var res := space.intersect_ray(q)
	if not res.is_empty():
		explode()                  # 命中地面/障碍/敌人 → 落地爆炸
		return
	global_position = next
	_prev = next
	life -= delta
	# 落地 / 超时爆炸（命中行星表面：到球心距离 <= 半径+0.5）
	if life <= 0.0 or global_position.length() <= get_tree().current_scene.PLANET_RADIUS + 0.5:
		explode()

func explode():
	if exploded:
		return
	exploded = true
	if get_tree().current_scene.has_method("sfx_hit"):
		get_tree().current_scene.sfx_hit()
	var center := global_position
	# 爆炸巨响：比箭落点更大的惊动半径
	get_tree().current_scene.alert_deer(center, NOISE_RADIUS_BOMB)
	for e: Node3D in get_tree().get_nodes_in_group("enemy"):
		if e == null or not is_instance_valid(e):
			continue
		var d := center.distance_to(e.global_position)   # 球面世界下用 3D 距离
		if d <= INNER_RADIUS:
			if e.has_method("kill_by_bomb"):
				e.kill_by_bomb()      # 中心：一击死，但按炸弹半分计（不占爆头翻倍）
		elif d <= OUTER_RADIUS:
			if e.has_method("take_damage"):
				e.take_damage(BODY_DAMAGE, true)   # 外圈：等同箭矢扎身体，击杀按炸弹半分计
	_spawn_blast(center)
	queue_free()

# 扩散爆炸视觉（无碰撞，纯表现）
func _spawn_blast(center: Vector3):
	var blast := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 1.0
	sm.height = 2.0
	blast.mesh = sm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.6, 0.1, 1)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.55, 0.1, 1)
	mat.emission_energy_multiplier = 2.5
	blast.material_override = mat
	blast.scale = Vector3(0.3, 0.3, 0.3)
	get_tree().current_scene.add_child(blast)
	blast.global_position = center
	var tw := get_tree().create_tween()
	tw.tween_property(blast, "scale", Vector3(OUTER_RADIUS, OUTER_RADIUS, OUTER_RADIUS), 0.3)
	tw.tween_callback(blast.queue_free)
