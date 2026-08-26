extends Node3D

# WSADgame — 游戏总管（挂在 Main 根节点）
# 状态机：MENU(开始菜单) / PLAYING / PAUSED / OVER
# 职责：波次刷怪+难度、玩家受伤中转、分数、音效、菜单接线

signal score_changed(score)
signal wave_changed(wave)
signal game_over

enum State { MENU, PLAYING, PAUSED, OVER }

const ENEMY_SCENE := preload("res://scenes/Enemy.tscn")
const OBSTACLE_SCENE := preload("res://scenes/Obstacle.tscn")
const PICKUP_SCENE := preload("res://scenes/Pickup.tscn")

# ---- 音效资源 ----
const S_GUN := preload("res://audio/gun.wav")
const S_HIT := preload("res://audio/hit.wav")
const S_DEATH := preload("res://audio/enemy_death.wav")
const S_WAVE_START := preload("res://audio/wave_start.wav")
const S_WAVE_CLEAR := preload("res://audio/wave_clear.wav")
const S_GAME_OVER := preload("res://audio/game_over.wav")
const S_RELOAD := preload("res://audio/reload.wav")
const S_HURT := preload("res://audio/hurt.wav")
const S_UI := preload("res://audio/ui_click.wav")

# ---- 波次 / 难度参数 ----
const MAX_CONCURRENT := 12        # 同屏敌人上限（保护性能）
const BASE_WAVE_SIZE := 4
const WAVE_SIZE_STEP := 2
const BASE_SPAWN_INTERVAL := 1.4
const SPAWN_INTERVAL_STEP := 0.1
const MIN_SPAWN_INTERVAL := 0.4
const BETWEEN_WAVE_DELAY := 2.5

var state := State.MENU
var score := 0
var wave := 0
var enemies_alive := 0
var enemies_to_spawn := 0
var obstacles: Array = []
var player: Node3D

@onready var spawn_timer: Timer = $SpawnTimer
@onready var sfx: AudioStreamPlayer = $SFX
@onready var gun_sfx: AudioStreamPlayer = $GunSFX
@onready var start_menu = $StartMenu
@onready var pause_menu = $PauseMenu

var between_wave_timer: Timer

func _ready():
	player = get_tree().get_first_node_in_group("player")
	spawn_timer.timeout.connect(_on_spawn_timeout)
	between_wave_timer = Timer.new()
	between_wave_timer.one_shot = true
	between_wave_timer.timeout.connect(_on_between_wave_timeout)
	add_child(between_wave_timer)
	# 菜单接线
	start_menu.request_start.connect(start_game)
	pause_menu.request_resume.connect(toggle_pause)
	pause_menu.request_pause.connect(toggle_pause)
	pause_menu.request_restart.connect(restart_game)
	enter_menu()

func enter_menu():
	state = State.MENU
	start_menu.show()
	pause_menu.hide()

func start_game():
	start_menu.hide()
	pause_menu.hide()
	score = 0
	score_changed.emit(score)
	state = State.PLAYING
	start_next_wave()

func restart_game():
	get_tree().paused = false
	get_tree().reload_current_scene()

func is_playing() -> bool:
	return state == State.PLAYING

func is_over() -> bool:
	return state == State.OVER

# ---------------- 波次 / 难度 ----------------
func start_next_wave():
	wave += 1
	wave_changed.emit(wave)
	spawn_obstacles()
	enemies_to_spawn = BASE_WAVE_SIZE + (wave - 1) * WAVE_SIZE_STEP
	spawn_timer.wait_time = max(MIN_SPAWN_INTERVAL, BASE_SPAWN_INTERVAL - (wave - 1) * SPAWN_INTERVAL_STEP)
	spawn_timer.start()
	play_sfx(S_WAVE_START)

func _on_spawn_timeout():
	if state != State.PLAYING:
		return
	if enemies_to_spawn > 0 and enemies_alive < MAX_CONCURRENT:
		spawn_enemy()
		enemies_to_spawn -= 1
	if enemies_to_spawn <= 0:
		spawn_timer.stop()

func _on_between_wave_timeout():
	if state == State.PLAYING:
		start_next_wave()
	elif state == State.PAUSED:
		# 暂停期间不消耗波次间隔，恢复后继续倒计时再进下一波
		between_wave_timer.start(BETWEEN_WAVE_DELAY)

func spawn_enemy():
	var e = ENEMY_SCENE.instantiate()
	var ang := randf() * TAU
	var r := 18.0
	e.global_position = Vector3(cos(ang) * r, 1.0, sin(ang) * r)
	var st := enemy_stats_for_wave(wave)
	e.max_health = st.health
	e.health = st.health
	e.speed = st.speed
	e.contact_damage = st.damage
	add_child(e)
	enemies_alive += 1

func enemy_stats_for_wave(w: int) -> Dictionary:
	return {
		"health": 3 + int((w - 1) / 2),
		"speed": min(6.5, 3.0 + (w - 1) * 0.25),
		"damage": 12.0 + (w - 1) * 2.0,
	}

# ---------------- 障碍物（每波随机生成，全实体阻挡） ----------------
func spawn_obstacles():
	clear_obstacles()
	var count := randi_range(4, 7)
	for i in count:
		var o = OBSTACLE_SCENE.instantiate()
		var ang := randf() * TAU
		var rad := randf_range(5.0, 16.0)
		var x := cos(ang) * rad
		var z := sin(ang) * rad
		var w := randf_range(1.5, 3.0)
		var h := randf_range(1.5, 3.5)
		var d := randf_range(1.5, 3.0)
		var mesh_node = o.get_node("Mesh")
		var col_node = o.get_node("Collision")
		var m := BoxMesh.new()
		m.size = Vector3(w, h, d)
		mesh_node.mesh = m
		mesh_node.position.y = h / 2.0
		var s := BoxShape3D.new()
		s.size = Vector3(w, h, d)
		col_node.shape = s
		col_node.position.y = h / 2.0
		o.position = Vector3(x, 0.0, z)
		add_child(o)
		obstacles.append(o)

func clear_obstacles():
	for o in obstacles:
		if is_instance_valid(o):
			o.queue_free()
	obstacles.clear()

# ---------------- 掉落物（敌人死亡概率掉落弹药补给） ----------------
func drop_pickup(pos: Vector3):
	if randf() < 0.7:
		var p = PICKUP_SCENE.instantiate()
		p.position = Vector3(pos.x, 0.6, pos.z)
		add_child(p)

func add_score(n: int):
	score += n
	score_changed.emit(score)

func register_enemy_death():
	enemies_alive = max(0, enemies_alive - 1)
	if state == State.PLAYING and enemies_to_spawn <= 0 and enemies_alive <= 0:
		play_sfx(S_WAVE_CLEAR)
		between_wave_timer.start(BETWEEN_WAVE_DELAY)

func damage_player(amount: float):
	if state != State.PLAYING:
		return
	if player != null and player.has_method("take_damage"):
		player.take_damage(amount)

func end_game():
	if state == State.OVER:
		return
	state = State.OVER
	spawn_timer.stop()
	between_wave_timer.stop()
	play_sfx(S_GAME_OVER)
	game_over.emit()

# ---------------- 暂停 ----------------
# 说明：不调用 get_tree().paused（整树暂停会阻断 GUI 输入，导致暂停菜单按钮点不动）。
# 改用状态机：PLAYING 时各玩法节点经 is_playing() 门控冻结，PAUSED 时菜单 GUI 始终可交互。
func toggle_pause():
	if state == State.PLAYING:
		state = State.PAUSED
		pause_menu.show()
	elif state == State.PAUSED:
		state = State.PLAYING
		pause_menu.hide()

# ---------------- 音效 ----------------
func play_sfx(stream: AudioStream):
	if sfx != null and stream != null:
		sfx.stream = stream
		sfx.play()

func play_gun_sfx(stream: AudioStream):
	if gun_sfx != null and stream != null:
		gun_sfx.stream = stream
		gun_sfx.play()

func sfx_gun():   play_gun_sfx(S_GUN)
func sfx_hit():   play_sfx(S_HIT)
func sfx_death(): play_sfx(S_DEATH)
func sfx_reload():play_sfx(S_RELOAD)
func sfx_hurt():  play_sfx(S_HURT)
func sfx_ui():    play_sfx(S_UI)

func _unhandled_input(event):
	if state == State.OVER and event.is_action_pressed("reload"):
		restart_game()
