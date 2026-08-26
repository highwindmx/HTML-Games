extends Area3D

# 弓猎 — 敌方遗落物（按猎物种类决定）：熊→血包 / 鹿→箭袋 / 鸟→炸蛋
# 血包：拾取恢复生命；炸蛋：拾取获得 bombs 枚炸蛋；箭袋：拾取补充箭支（配额模式核心补给）
# 用 3D 距离判定（球面世界下不能只看平面 x/z）；外观按类型用不同颜色区分

var kind := "bomb"          # "bomb" | "health" | "arrow"
var bomb_amount := 3
var arrow_amount := 5       # 鹿死亡掉落的箭袋补给数量 [PLACEHOLDER]
var heal_amount := 20
var PICKUP_RANGE := 3.0

var player: Player
var _oriented := false   # 是否已完成球面贴地对齐

@onready var mesh_node: MeshInstance3D = $Mesh

func _ready():
	player = get_tree().get_first_node_in_group("player")
	# 注意：球面朝向对齐不能放在 _ready —— Main 在 add_child() 之后才设置
	# global_position，_ready 时它仍是 (0,0,0)，拿零向量当 up 会构造出
	# 退化基（det==0），正是 "invert: Condition det == 0" 报错的来源。
	# 外观按类型区分颜色（补血绿 / 炸蛋红橙）
	var mat := StandardMaterial3D.new()
	if kind == "health":
		mat.albedo_color = Color(0.2, 0.9, 0.3, 1)
		mat.emission = Color(0.1, 0.6, 0.15, 1)
	elif kind == "arrow":
		mat.albedo_color = Color(1.0, 0.82, 0.2, 1)
		mat.emission = Color(0.7, 0.55, 0.1, 1)
	else:
		mat.albedo_color = Color(0.9, 0.3, 0.1, 1)
		mat.emission = Color(0.6, 0.2, 0.05, 1)
	mat.emission_enabled = true
	mat.emission_energy_multiplier = 0.9
	mesh_node.material_override = mat
	get_tree().create_timer(20.0).timeout.connect(queue_free)

func _physics_process(_delta):
	# 首帧（此时 Main 已设好位置）再对齐球面：局部 Y 对齐球面法线（球心=原点）
	if not _oriented and global_position.length() > 0.01:
		_oriented = true
		var up := global_position.normalized()
		var ref := Vector3(0.0, 0.0, 1.0)
		if abs(up.dot(ref)) > 0.99:
			ref = Vector3(1.0, 0.0, 0.0)
		var tangent := (ref - up * up.dot(ref)).normalized()
		var yc := up.cross(tangent).normalized()
		global_transform.basis = Basis(tangent, yc, up)
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
			elif kind == "arrow" and player.has_method("add_arrows"):
				player.add_arrows(arrow_amount)
			if get_tree().current_scene.has_method("sfx_ui"):
				get_tree().current_scene.sfx_ui()
			queue_free()
