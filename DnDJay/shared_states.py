### serial communication

ser = None
joystickX = 0
joystickY = 0
joystick_pressed = 0
potentio = 0 

### LEDs
leds = []
music_leds = [0,0,0,0]
theme_leds = [0,0,0,0]
video_leds = [0,0,0,0]
menu_dict = {0:music_leds, 1: theme_leds, 2: video_leds}

### Directories
themes_directory = "/media/Data/Music/Themes"
music_directory = "/media/Data/Music/Music"
effects_directory = "/media/Data/Music/Effects"
themes_list = []
theme_path = ""
current_theme = 0
maps_directory = "/media/Data/Battlemaps"
maps_list = []
map_path = ""


### Samba
ip = "Test"

### Menu Stuff
current_mode = None
# Bluetooth
devices = None
media_video = 0
media_mode = False
video_mode = False

### Music
current_chan = 0
loaded_sounds = False
current_chan_playing = [False,False,False,False]
current_channel_volumes = [0,0,0,0]
effect = False

### ImageViewer
display_on = False
reset_zoom_range = False
