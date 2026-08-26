extends CanvasLayer

# WSADgame — 暂停菜单（process_mode=ALWAYS，ESC 切换，按钮恢复/重开）
# 仅在本节点可见时处理 ESC，避免菜单态误触发

signal request_resume
signal request_restart
signal request_pause

@onready var resume_button: Button = $Center/VBox/ResumeButton
@onready var restart_button: Button = $Center/VBox/RestartButton

func _ready():
	resume_button.pressed.connect(_on_resume_pressed)
	restart_button.pressed.connect(_on_restart_pressed)
	hide()

func _on_resume_pressed():
	_play_click_sfx()
	request_resume.emit()

func _on_restart_pressed():
	_play_click_sfx()
	request_restart.emit()

# 在触发 restart/resume 之前（场景仍有效时）播放点击音效。
# 注意：restart 会同步 reload_current_scene() 释放本节点，若之后再用 get_tree() 会
# 报 “data.tree is null” / current_scene 为 null instance，故必须放在 emit 之前。
func _play_click_sfx():
	var sc := get_tree().current_scene
	if is_instance_valid(sc) and sc.has_method("sfx_ui"):
		sc.sfx_ui()

func _unhandled_input(event):
	if event.is_action_pressed("ui_cancel"):   # ESC 默认绑定 ui_cancel
		if visible:
			request_resume.emit()   # 已暂停 → 恢复
		else:
			request_pause.emit()    # 游戏中（菜单隐藏）→ 进入暂停
