extends Area3D

# WSADgame — 掉落物（治疗血包）：玩家接触即拾取，恢复生命
# 自带 20s 存活上限，避免满地都是；旋转+上下浮动提升可见性

var amount := 25

@onready var mesh_node: MeshInstance3D = $Mesh

func _ready():
	body_entered.connect(_on_body_entered)
	get_tree().create_timer(20.0).timeout.connect(queue_free)

func _physics_process(_delta: float):
	if mesh_node != null:
		mesh_node.rotation.y += 2.0 * _delta
		mesh_node.position.y = 0.6 + sin(Time.get_ticks_msec() / 300.0) * 0.15

func _on_body_entered(body: Node):
	if body.is_in_group("player"):
		if body.has_method("heal"):
			body.heal(amount)
		if get_tree().current_scene.has_method("sfx_ui"):
			get_tree().current_scene.sfx_ui()
		queue_free()
