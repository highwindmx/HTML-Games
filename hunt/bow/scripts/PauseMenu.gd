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
	resume_button.pressed.connect(_on_click)
	restart_button.pressed.connect(_on_click)
	hide()

func _on_resume_pressed():
	request_resume.emit()

func _on_restart_pressed():
	request_restart.emit()

func _on_click():
	if get_tree().current_scene.has_method("sfx_ui"):
		get_tree().current_scene.sfx_ui()

func _unhandled_input(event):
	if event.is_action_pressed("ui_cancel"):   # ESC 默认绑定 ui_cancel
		if visible:
			request_resume.emit()   # 已暂停 → 恢复
		else:
			request_pause.emit()    # 游戏中（菜单隐藏）→ 进入暂停
