extends Area3D

# WSADgame — 子弹：射线检测命中（比 Area3D 信号更稳，不会因高速瞬移漏检）
# 命中障碍物(obstacle) → 被挡消失；命中敌人(enemy) → 调用其 take_damage；方向锁定水平

var direction := Vector3.ZERO
var speed := 45.0
var life := 1.5
var _prev := Vector3.ZERO

func _ready():
	_prev = global_position

func _physics_process(delta: float):
	if get_tree().current_scene.is_over():
		return
	if not get_tree().current_scene.is_playing():
		return
	var step: Vector3 = direction * speed * delta
	var next: Vector3 = global_position + step
	var space := get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(_prev, next)
	q.collide_with_bodies = true
	q.collide_with_areas = true
	q.exclude = [self.get_rid()]   # 排除自身，否则射线会一直"命中"自己的碰撞体
	var res := space.intersect_ray(q)
	if not res.is_empty():
		var col = res["collider"]
		if col.is_in_group("obstacle"):
			queue_free()             # 被障碍物挡住，子弹消失
			return
		elif col.is_in_group("enemy"):
			get_tree().current_scene.sfx_hit()
			if col.has_method("take_damage"):
				col.take_damage(1)
			queue_free()
			return
		# 命中玩家/地面/掉落物/其他：忽略，继续飞
	global_position = next
	_prev = next
	life -= delta
	if life <= 0:
		queue_free()
