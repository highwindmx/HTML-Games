extends CharacterBody3D

# WSADgame（弓箭版）— 猎物系统：熊 / 鹿 / 鸟
# 熊：缓慢游荡；玩家靠近（或被射中）即主动冲撞；冲撞造成接触伤害；3箭击杀；玩家拉远超过脱战距离则放弃追击；冲撞撞树会眩晕卡住（可被反制）
# 鹿：平时静止，玩家靠近时逃跑；被射中后移速下降且立即逃跑；2箭击杀；不攻击；可被声响惊走
# 鸟：空中自由盘旋，路径不依赖玩家；1箭击杀；不攻击
# 计分：熊=3分，鹿=2分，鸟=2分（鸟命中最难，分值对齐难度）；
#       箭爆头一击死且分数×2；炸弹击杀一击死但分数减半向上取整（炸弹换生存不换积分）

# ---- 通用常量 ----
const CONTACT_RANGE := 1.8
const CONTACT_COOLDOWN := 1.0
const KNOCKBACK_SPEED := 7.0
const KNOCKBACK_TIME := 0.22
const FLY_ALT := 5.0             # 鸟巡航高度（相对地表）

# ---- 熊参数 ----
const BEAR_SPEED := 1.2
const BEAR_CHARGE_MULT := 3.3   # 冲撞速度 = 基础速度 × 此倍率
const BEAR_HEALTH := 3
const BEAR_DAMAGE := 15.0
const BEAR_SCORE := 3
const ROAM_CHANGE_INTERVAL := 3.5   # 游荡方向切换间隔（秒）
const BEAR_STUN_TIME := 1.5         # 冲撞撞树后的眩晕时长（秒）[PLACEHOLDER]
const BEAR_AGGRO_RANGE := 12.0      # 玩家进入此距离 → 熊主动冲撞（无需被射中）
const BEAR_STANDOFF := 1.3          # 冲撞时与玩家保持的最小中心距（≈双方碰撞半径和）；>此值才前压，< CONTACT_RANGE 故仍可造成接触伤害，且不穿模
const BEAR_LEASH_RANGE := 20.0      # 脱战距离：冲撞中玩家拉远到此距离 → 熊放弃追击回到 ROAM（> AGGRO_RANGE 形成回滞，避免在边界反复横跳）

# ---- 鹿参数 ----
const DEER_SPEED := 6.0
const DEER_HEALTH := 2
const DEER_SCORE := 2
const DEER_FLEE_RANGE := 14.0       # 玩家进入此距离 → 逃跑
const DEER_SAFE_RANGE := 22.0       # 玩家拉远到此距离 → 停下
const DEER_HIT_SLOWDOWN := 0.5     # 被射中后速度乘以此值
const NOISE_FLEE_LOCK := 3.0       # 被声响惊动后强制逃离声源的时长（秒）[PLACEHOLDER]

# ---- 鸟参数 ----
const BIRD_SPEED := 4.0
const BIRD_HEALTH := 1
const BIRD_SCORE := 2
const BIRD_TURN_INTERVAL := 2.0    # 转向间隔（秒）
const BIRD_TURN_AMOUNT := 0.9      # 每次转向最大弧度

@export var enemy_type := "bear"   # "bear" | "deer" | "bird"

var max_health := 3
var health := max_health
var speed := 1.2
var contact_damage := 0.0
var score_value := 3

var player: Node3D
var is_bird := false
var _initialized := false

# AI 状态
enum AIState { ROAM, CHARGE, IDLE, FLEE, CIRCLE, STUN }
var ai_state: int = AIState.ROAM

# 视觉节点
var _wing_l: Node3D = null
var _wing_r: Node3D = null
var _mat: StandardMaterial3D = null
var _base_emission := Color(0, 0, 0, 1)

# 通用计时
var contact_timer := 0.0
var knockback := Vector3.ZERO
var knockback_timer := 0.0
var dead := false

# 熊游荡
var _roam_timer := 0.0
var _roam_dir := Vector3.ZERO

# 鹿惊逃（被声响惊动时锁定远离声源的方向）
var _flee_lock := 0.0
var _flee_dir := Vector3.ZERO

# 熊眩晕
var _stun_timer := 0.0

# 鸟盘旋
var _bird_dir := Vector3.ZERO
var _bird_turn_timer := 0.0

func _ready():
	add_to_group("enemy")
	player = get_tree().get_first_node_in_group("player")
	_wing_l = get_node_or_null("WingL")
	_wing_r = get_node_or_null("WingR")
	is_bird = (enemy_type == "bird")

	match enemy_type:
		"bear":
			max_health = BEAR_HEALTH
			health = BEAR_HEALTH
			speed = BEAR_SPEED
			contact_damage = BEAR_DAMAGE
			score_value = BEAR_SCORE
			ai_state = AIState.ROAM
			_setup_material(Color(0.35, 0.22, 0.12, 1))   # 深棕
		"deer":
			max_health = DEER_HEALTH
			health = DEER_HEALTH
			speed = DEER_SPEED
			contact_damage = 0.0
			score_value = DEER_SCORE
			ai_state = AIState.IDLE
			_setup_material(Color(0.65, 0.48, 0.25, 1))   # 棕黄
		"bird":
			max_health = BIRD_HEALTH
			health = BIRD_HEALTH
			speed = BIRD_SPEED
			contact_damage = 0.0
			score_value = BIRD_SCORE
			ai_state = AIState.CIRCLE
			# 鸟用场景自带配色，不覆盖材质
		_:
			max_health = BEAR_HEALTH
			health = BEAR_HEALTH
			speed = BEAR_SPEED
			contact_damage = BEAR_DAMAGE
			score_value = BEAR_SCORE
			ai_state = AIState.ROAM
			_setup_material(Color(0.35, 0.22, 0.12, 1))

func _physics_process(delta: float):
	if get_tree().current_scene.is_over():
		return
	if not get_tree().current_scene.is_playing():
		return
	if player == null or not is_instance_valid(player):
		return

	# 首帧初始化方向（此时 global_position 已由 Main 设好）
	if not _initialized:
		_initialized = true
		var up0 := global_position.normalized()
		_roam_dir = _random_tangent(up0)
		_bird_dir = _random_tangent(up0)
		# 首帧即把身体对齐球面法线（直立于球面）：否则出生瞬间以世界 +Y 为“上”，
		# 在球面法线≠世界 +Y 的位置会相对球面倾斜（鹿静态 IDLE 时不调用朝向，尤其明显）。
		_orient_to_dir(_roam_dir, up0)

	match enemy_type:
		"bird":
			_bird_step(delta)
		"bear":
			_bear_step(delta)
		"deer":
			_deer_step(delta)
		_:
			_bear_step(delta)

# ============================================================
#  熊：游荡 / 冲撞
# ============================================================
func _bear_step(delta: float):
	var up := global_position.normalized()
	var to_p := player.global_position - global_position
	var tan := to_p - up * to_p.dot(up)
	var dist := tan.length()

	# 击退阶段（被箭命中后短暂被推离，覆盖其他行为）
	if knockback_timer > 0.0:
		knockback_timer -= delta
		var k := knockback - up * knockback.dot(up)
		velocity = k
		velocity += -up * get_tree().current_scene.GRAVITY * delta
		up_direction = up
		move_and_slide()
		_orient_to_player(up)
		return

	match ai_state:
		AIState.ROAM:
			# 玩家靠近 → 主动冲撞（无需被射中）
			if dist < BEAR_AGGRO_RANGE:
				ai_state = AIState.CHARGE
				return
			# 缓慢游荡：定时换方向
			_roam_timer -= delta
			if _roam_timer <= 0.0:
				_roam_timer = ROAM_CHANGE_INTERVAL
				_roam_dir = _random_tangent(up)
			velocity = _roam_dir * speed
			velocity += -up * get_tree().current_scene.GRAVITY * delta
			up_direction = up
			move_and_slide()
			_orient_to_dir(_roam_dir, up)

		AIState.CHARGE:
			# 脱战：玩家拉远超过 LEASH → 放弃追击回到游荡（被射中触发的冲撞同样适用）
			if dist > BEAR_LEASH_RANGE:
				ai_state = AIState.ROAM
				return
			# 冲向玩家（被射中或被靠近都会触发）
			if dist > BEAR_STANDOFF:
				# 仅在大于停步间距时才前压，避免冲到玩家中心造成穿模重叠
				velocity = tan.normalized() * (speed * BEAR_CHARGE_MULT)
			else:
				# 已贴近：停步不再前压（仍保持朝向玩家），消除穿模；仍在 CONTACT_RANGE 内可造成接触伤害
				velocity = Vector3.ZERO
			velocity += -up * get_tree().current_scene.GRAVITY * delta
			up_direction = up
			move_and_slide()
			_orient_to_player(up)
			# 冲撞撞到树木 → 眩晕卡住（玩家可引熊撞树反制）
			for i in get_slide_collision_count():
				var sc := get_slide_collision(i)
				var col = sc.get_collider()
				if col != null and col.is_in_group("obstacle"):
					ai_state = AIState.STUN
					_stun_timer = BEAR_STUN_TIME
					hit_flash(1.5)
					break
			# 接触伤害（仅冲撞状态）：已在 STANDOFF 外缘之内即触发
			contact_timer -= delta
			if dist < CONTACT_RANGE and contact_timer <= 0.0:
				contact_timer = CONTACT_COOLDOWN
				get_tree().current_scene.damage_player(contact_damage)

		AIState.STUN:
			# 撞树眩晕：原地发呆，结束后恢复冲撞
			velocity = Vector3.ZERO
			velocity += -up * get_tree().current_scene.GRAVITY * delta
			up_direction = up
			move_and_slide()
			_stun_timer -= delta
			if _stun_timer <= 0.0:
				ai_state = AIState.CHARGE

# ============================================================
#  鹿：静止 / 逃跑
# ============================================================
func _deer_step(delta: float):
	var up := global_position.normalized()
	var to_p := player.global_position - global_position
	var tan := to_p - up * to_p.dot(up)
	var dist := tan.length()

	match ai_state:
		AIState.IDLE:
			velocity = Vector3.ZERO
			if dist < DEER_FLEE_RANGE:
				ai_state = AIState.FLEE

		AIState.FLEE:
			_flee_lock = max(0.0, _flee_lock - delta)
			# 惊弓锁定期内无视玩家距离持续逃；平时玩家拉远到安全距离即停
			if _flee_lock <= 0.0 and dist > DEER_SAFE_RANGE:
				ai_state = AIState.IDLE
				velocity = Vector3.ZERO
			elif dist > 0.1:
				# 逃跑方向：惊弓锁定用远离声源方向，否则远离玩家方向
				var flee_dir := -tan.normalized()
				if _flee_lock > 0.0 and _flee_dir.length_squared() > 0.25:
					flee_dir = _flee_dir
				velocity = flee_dir * speed
			else:
				velocity = Vector3.ZERO

	velocity += -up * get_tree().current_scene.GRAVITY * delta
	up_direction = up
	move_and_slide()

	# 朝向：逃跑时背对玩家（惊弓锁定时朝逃离声源方向），静止时保持原朝向
	if ai_state == AIState.FLEE and dist > 0.1:
		if _flee_lock > 0.0 and _flee_dir.length_squared() > 0.25:
			_orient_to_dir(_flee_dir, up)
		else:
			_orient_to_dir(-tan.normalized(), up)

# ============================================================
#  鸟：空中自由盘旋（路径不依赖玩家）
# ============================================================
func _bird_step(delta: float):
	var up := global_position.normalized()

	# 定时转向（在切平面内随机偏转）
	_bird_turn_timer -= delta
	if _bird_turn_timer <= 0.0:
		_bird_turn_timer = BIRD_TURN_INTERVAL
		var turn := randf_range(-1.0, 1.0) * BIRD_TURN_AMOUNT
		_bird_dir = _bird_dir.rotated(up, turn)
		# 重新投影到切平面，防漂移
		_bird_dir = (_bird_dir - up * _bird_dir.dot(up)).normalized()

	# 沿当前方向移动 + 保持巡航高度
	var move := _bird_dir * speed
	var surface_r := global_position.length()
	var cur_alt: float = surface_r - get_tree().current_scene.PLANET_RADIUS
	var target_alt := FLY_ALT
	var alt_vel: float = (target_alt - cur_alt) * 4.0
	velocity = move + up * alt_vel
	up_direction = up
	move_and_slide()

	# 扑翼动画
	if _wing_l != null and _wing_r != null:
		var f := sin(Time.get_ticks_msec() * 0.012) * 0.5
		_wing_l.rotation.z = 0.3 + f
		_wing_r.rotation.z = -0.3 - f

	# 朝向飞行方向
	_orient_to_dir(_bird_dir, up)
	# 鸟不造成接触伤害

# ============================================================
#  受击 / 死亡
# ============================================================

# 身体中箭：扣血；熊→进入冲撞；鹿→减速并立即逃跑
func take_damage(amount: int, by_bomb := false):
	if enemy_type == "bear" and ai_state != AIState.CHARGE and ai_state != AIState.STUN:
		ai_state = AIState.CHARGE
	elif enemy_type == "deer":
		speed *= DEER_HIT_SLOWDOWN
		# 中箭剧痛 → 逃跑（惊弓锁定期内的既有方向保持不变）
		ai_state = AIState.FLEE
	health -= amount
	if health <= 0:
		die(by_bomb, false)

# 爆头（箭）：一箭直接死亡（无视血量），分数×2
func headshot():
	die(false, true)

# 炸弹击杀：一击死，但分数减半向上取整
func kill_by_bomb():
	die(true, false)

# 声响惊动（规则选项开启时由 Main 调用）：鹿听到声响立即远离声源逃跑
func alert_noise(source: Vector3):
	if enemy_type != "deer" or dead:
		return
	var up := global_position.normalized()
	var away := global_position - source
	away = away - up * away.dot(up)
	if away.length_squared() > 1e-4:
		_flee_dir = away.normalized()
	else:
		_flee_dir = _random_tangent(up)
	_flee_lock = NOISE_FLEE_LOCK
	ai_state = AIState.FLEE

# 被箭命中后的击退（仅熊有效）
func apply_knockback(dir: Vector3):
	if enemy_type != "bear":
		return
	knockback = dir * KNOCKBACK_SPEED
	knockback_timer = KNOCKBACK_TIME

# 受击反馈：网格缩放弹一下；有专属材质时额外发光闪烁
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

func die(by_bomb := false, headshot := false):
	if dead:
		return
	dead = true
	get_tree().current_scene.sfx_death()
	get_tree().current_scene.register_enemy_death()
	# 计分：箭爆头 ×2（技艺奖励）；炸弹击杀 ×0.5 向上取整（炸弹换生存不换积分）；
	# 爆头翻倍仅属于箭——炸弹中心圈虽一击死，但按炸弹半分计
	var pts := score_value
	if headshot:
		pts *= 2
	elif by_bomb:
		pts = int(ceil(pts * 0.5))
	get_tree().current_scene.add_score(pts)
	# 关键：spawn_score_popup / drop_pickup 内部会 add_child 实例化节点。
	# 当前调用链来自 Arrow._physics_process（或 Bomb._physics_process）的命中回调，
	# 若在物理步内同步改场景树会触发 physics flush，表现为击毙瞬间卡顿一帧。
	# 用 call_deferred 把这两个实例化调用推迟到本帧末尾（idle 帧），避开物理步内改树。
	# global_position 先取本地副本，queue_free 后仍可安全使用。
	var gp := global_position
	var sc = get_tree().current_scene
	if sc != null and sc.has_method("spawn_score_popup"):
		sc.call_deferred("spawn_score_popup", gp, pts, headshot, by_bomb)
	if sc != null:
		sc.call_deferred("drop_pickup", gp, enemy_type)
	queue_free()

# ============================================================
#  辅助函数
# ============================================================

# 在球面某点的切平面内取随机单位方向
func _random_tangent(up: Vector3) -> Vector3:
	var ref := Vector3(0.0, 0.0, 1.0)
	if abs(up.dot(ref)) > 0.99:
		ref = Vector3(1.0, 0.0, 0.0)
	var t1 := (ref - up * up.dot(ref)).normalized()
	var t2 := up.cross(t1).normalized()
	var ang := randf() * TAU
	return (t1 * cos(ang) + t2 * sin(ang)).normalized()

# 朝向玩家（局部 -Z 指向玩家，直立于球面）
func _orient_to_player(up: Vector3):
	var fwd := _tangent_forward(player.global_position - global_position, up)
	look_at(global_position + fwd, up)

# 朝向指定方向（局部 -Z 指向 dir，直立于球面）
func _orient_to_dir(dir: Vector3, up: Vector3):
	var fwd := _tangent_forward(dir, up)
	look_at(global_position + fwd, up)

# 把 dir 投影到球面切平面得到安全朝向；dir 与 up 平行/退化时用参考切向量兜底。
# 直接用未投影向量调 look_at 可能因 forward 与 up 平行产生退化基（invert det==0 报错）
func _tangent_forward(dir: Vector3, up: Vector3) -> Vector3:
	var fwd := dir - up * dir.dot(up)
	if not fwd.is_finite() or fwd.length_squared() < 1e-6:
		var ref := Vector3(0.0, 0.0, 1.0)
		if abs(up.dot(ref)) > 0.99:
			ref = Vector3(1.0, 0.0, 0.0)
		fwd = ref - up * up.dot(ref)
	return fwd.normalized()

# 为地面敌人（熊/鹿）建立可发光材质，供受击闪烁使用
func _setup_material(col: Color):
	var mesh_node = get_node_or_null("Mesh")
	if mesh_node == null:
		return
	_mat = StandardMaterial3D.new()
	_mat.albedo_color = col
	_mat.emission_enabled = true
	_mat.emission = Color(0.0, 0.0, 0.0, 1)
	_mat.emission_energy_multiplier = 1.0
	_base_emission = _mat.emission
	mesh_node.material_override = _mat
