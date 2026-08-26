extends Area3D

# WSADgame（弓箭版）— 箭矢抛射物：受重力抛物线飞行，射线检测命中
# 命中头部(enemy_head) → 一箭死；命中身体(enemy) → 扣血+击退；命中障碍/地面 → 消失（插地）

var direction := Vector3.ZERO   # 发射方向（含仰角，已归一）
var speed := 30.0
var damage := 1
var arrow_gravity := 22.0
var life := 4.0
var velocity := Vector3.ZERO
var _prev := Vector3.ZERO

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
	velocity += gdir * arrow_gravity * delta
	var next: Vector3 = global_position + velocity * delta
	var space := get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(_prev, next)
	q.collide_with_bodies = true
	q.collide_with_areas = true
	q.exclude = [self.get_rid()]   # 排除自身
	var res := space.intersect_ray(q)
	if not res.is_empty():
		var col = res["collider"]
		var hit_pos: Vector3 = res.get("position", global_position)
		# 声响惊动（规则开启时）：中箭/落点的声响惊走附近鹿
		get_tree().current_scene.alert_deer(hit_pos)
		if col.is_in_group("enemy_head"):
			# 爆头：一箭死，分数×2
			var enemy = col.get_parent()
			if enemy != null and enemy.has_method("hit_flash"):
				enemy.hit_flash(2.0)
			if enemy != null and enemy.has_method("headshot"):
				enemy.headshot()
			get_tree().current_scene.sfx_hit()
			get_tree().current_scene.hit_confirmed(true)
			queue_free()
			return
		elif col.is_in_group("enemy"):
			# 打身体：扣血 + 沿来袭方向击退
			get_tree().current_scene.sfx_hit()
			get_tree().current_scene.hit_confirmed(false)
			if col.has_method("hit_flash"):
				col.hit_flash(1.0)
			var hdir := direction
			hdir.y = 0
			if hdir.length() > 0.001:
				hdir = hdir.normalized()
				if col.has_method("apply_knockback"):
					col.apply_knockback(hdir)
			if col.has_method("take_damage"):
				col.take_damage(damage)
			queue_free()
			return
		else:
			# 障碍物 / 地面等：插地消失
			queue_free()
			return
	global_position = next
	_prev = next
	# 视觉：箭头沿速度方向（长轴默认 +Z）
	var vd := velocity.normalized()
	rotation.y = atan2(vd.x, vd.z)
	rotation.x = -asin(clamp(vd.y, -1.0, 1.0))
	life -= delta
	# 落地：到球心距离 <= 行星半径+0.5（命中行星表面即插地消失）
	if life <= 0.0 or global_position.length() <= get_tree().current_scene.PLANET_RADIUS + 0.5:
		# 脱靶落地的声响同样惊走附近鹿
		get_tree().current_scene.alert_deer(global_position)
		queue_free()
