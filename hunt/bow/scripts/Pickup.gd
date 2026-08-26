extends Area3D

# WSADgame（弓箭版）— 敌方遗落物：随机两类——爆炸弹补给 / 补血
# 炸弹：拾取获得 bombs 枚炸弹；补血：拾取恢复生命
# 用 3D 距离判定（球面世界下不能只看平面 x/z）；外观按类型用不同颜色区分

var kind := "bomb"          # "bomb" | "health"
var bomb_amount := 3
var heal_amount := 20
var PICKUP_RANGE := 3.0

var player: Player

@onready var mesh_node: MeshInstance3D = $Mesh

func _ready():
	player = get_tree().get_first_node_in_group("player")
	# 贴地：让自身局部 Y 对齐球面法线（球心=原点）
	var up := global_position.normalized()
	var ref := Vector3(0.0, 0.0, 1.0)
	if abs(up.dot(ref)) > 0.99:
		ref = Vector3(1.0, 0.0, 0.0)
	var tangent := (ref - up * up.dot(ref)).normalized()
	var yc := up.cross(tangent).normalized()
	global_transform.basis = Basis(tangent, yc, up)
	# 外观按类型区分颜色（补血绿 / 炸弹红橙）
	var mat := StandardMaterial3D.new()
	if kind == "health":
		mat.albedo_color = Color(0.2, 0.9, 0.3, 1)
		mat.emission = Color(0.1, 0.6, 0.15, 1)
	else:
		mat.albedo_color = Color(0.9, 0.3, 0.1, 1)
		mat.emission = Color(0.6, 0.2, 0.05, 1)
	mat.emission_enabled = true
	mat.emission_energy_multiplier = 0.9
	mesh_node.material_override = mat
	get_tree().create_timer(20.0).timeout.connect(queue_free)

func _physics_process(_delta: float):
	if mesh_node != null:
		mesh_node.rotation.y += 2.0 * _delta
		mesh_node.position.y = 0.6 + sin(Time.get_ticks_msec() / 300.0) * 0.15
	# 3D 距离判定拾取（球面世界下正确）
	if player != null and is_instance_valid(player):
		var d := global_position.distance_to(player.global_position)
		if d <= PICKUP_RANGE:
			if kind == "health" and player.has_method("heal"):
				player.heal(heal_amount)
			elif kind == "bomb" and player.has_method("add_bombs"):
				player.add_bombs(bomb_amount)
			if get_tree().current_scene.has_method("sfx_ui"):
				get_tree().current_scene.sfx_ui()
			queue_free()
