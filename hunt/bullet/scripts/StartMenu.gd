extends CanvasLayer

# WSADgame — 开始菜单（process_mode=ALWAYS，开场显示，点开始进入游戏）

signal request_start

@onready var start_button: Button = $Center/VBox/StartButton

func _ready():
	start_button.pressed.connect(_on_start_pressed)
	# 按钮点击音效
	start_button.pressed.connect(_on_click)

func _on_start_pressed():
	request_start.emit()

func _on_click():
	if get_tree().current_scene.has_method("sfx_ui"):
		get_tree().current_scene.sfx_ui()
