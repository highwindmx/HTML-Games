extends CharacterBody3D

# WSADgame — 敌人：朝玩家走来，接触造成伤害，可被击杀
# max_health/health/speed/contact_damage 由 Main 按波次覆盖（难度缩放）

const CONTACT_RANGE := 1.6
const CONTACT_COOLDOWN := 1.0

var max_health := 3
var health := max_health
var speed := 3.0
var contact_damage := 12.0

var player: Node3D
var contact_timer := 0.0

func _ready():
	add_to_group("enemy")
	player = get_tree().get_first_node_in_group("player")

func _physics_process(delta: float):
	if get_tree().current_scene.is_over():
		return
	if not get_tree().current_scene.is_playing():
		return
	if player == null or not is_instance_valid(player):
		return
	var to_player := player.global_position - global_position
	to_player.y = 0
	var dist := to_player.length()
	if dist > 0.1:
		velocity = to_player.normalized() * speed
		velocity.y = 0
		move_and_slide()
		look_at(player.global_position)
		rotation.x = 0
		rotation.z = 0
		contact_timer -= delta
	if dist < CONTACT_RANGE and contact_timer <= 0.0:
		contact_timer = CONTACT_COOLDOWN
		get_tree().current_scene.damage_player(contact_damage)

func take_damage(amount: int):
	health -= amount
	if health <= 0:
		get_tree().current_scene.sfx_death()
		get_tree().current_scene.register_enemy_death()
		get_tree().current_scene.add_score(1)
		get_tree().current_scene.drop_pickup(global_position)
		queue_free()
