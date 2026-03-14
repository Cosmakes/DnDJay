from button_matrix import ButtonMatrix
import shared_states as st
from led_functions import led_off, led_on, init_leds
from serial_controls import initialize_serial, ser_write, ser_read
from menu_switching import switch_mode, end_mode, media_menu_action, turn_on_leds_media_mode, bt_pairandconnect
from media_players import Viewer, SoundMachine
from time import sleep
import subprocess

init_leds()

### initialize keys
menu_keys = {'media':18, 'bluetooth':14, 'data':19}
media_video_key = 9

### initialize communication with the Arduino
initialize_serial()
switch_mode('media')

matrix = ButtonMatrix()
st.display_on = True
view = Viewer()
view.display_init()
SM = SoundMachine()
SM.load_sounds()

sleep(2)

def DnDJayAction(current_key):
	### adjust map display 
	if st.video_mode:
		### start/stop display
		if current_key == 8 and st.display_on:
			st.display_on = False
			sleep(1)
			view.shutdown_viewer()
		elif current_key == 8 and not st.display_on:
			view.display_init()
			st.display_on = True
		### move and zoom display
		if len(st.map_path) != 0 and st.display_on:
			view.check_event()
	### Switch Mode if Mode Key was pressed
	if current_key in menu_keys.values() and st.current_mode != list(menu_keys.keys())[list(menu_keys.values()).index(current_key)]:
		end_mode(st.current_mode)
		st.current_mode = list(menu_keys.keys())[list(menu_keys.values()).index(current_key)]
		switch_mode(st.current_mode)
	if st.current_mode == 'media':
		pass
	### Connect to bluetooth device
	elif st.current_mode == 'bluetooth' and st.devices != None:
		if current_key <= 4 and current_key > 0:
			led_on(current_key-1) 
			mac = st.devices[current_key-1][0]
			bt_pairandconnect(mac)
	### Toggle video and theme switching mode
	if current_key == media_video_key:
		if st.media_video == 0:
			st.media_mode = True
			st.media_video = 1
			turn_on_leds_media_mode(st.media_video)
			led_on(4)
			sleep(0.7)
		elif st.media_video == 1:
			st.media_mode = False
			st.video_mode = True
			sleep(0.5)
			st.media_video = 2
			turn_on_leds_media_mode(st.media_video)
			counter = 0
			while counter < 4:
				led_off(4)
				sleep(0.2)
				led_on(4)
				sleep (0.2)
				counter += 1
		elif st.media_video == 2:
			st.video_mode = False
			st.media_video = 0
			turn_on_leds_media_mode(st.media_video)
			led_off(4)
			sleep(0.7)
	### Switch Channel/Theme/Video(Battlemap)
	if current_key >0 and current_key <=4:
		media_menu_action(current_key)
		if st.media_mode:
			sleep(.5)
			if len(st.themes_list) >= current_key:
				st.current_theme = current_key - 1
				for i in range(2):
					led_off(current_key-1)
					sleep(.2)
					led_on(current_key-1)
					sleep(.2)
			else: pass
		elif st.video_mode:
			sleep(.5)
			if len(st.maps_list) >= current_key:
				view.display_map()
				for i in range(2):
					led_off(current_key-1)
					sleep(.2)
					led_on(current_key-1)
					sleep(.2)
			else: pass
		else:
			st.current_chan = current_key - 1
	### play sounds
	if st.media_video == 0 and st.loaded_sounds and st.current_mode == 'media':
		st.leds[0].value = (1-(st.potentio + 1)/1030)
		# set volume
		if not st.effect:
			SM.set_channel_volume(st.current_chan)
		# play on channel
		if current_key == 5:
			if st.effect:
				SM.play_once(0)
			else: SM.play_on_channel(0, st.current_chan)
		elif current_key == 6:
			if st.effect:
				SM.play_once(1)
			else: SM.play_on_channel(1, st.current_chan)
		elif current_key == 7:
			if st.effect:
				SM.play_once(2)
			else: SM.play_on_channel(2, st.current_chan)
		elif current_key == 10:
			if st.effect:
				SM.play_once(3)
			else: SM.play_on_channel(3, st.current_chan)
		elif current_key == 11:
			if st.effect:
				SM.play_once(4)
			else: SM.play_on_channel(4, st.current_chan)
		elif current_key == 12:
			if st.effect:
				SM.play_once(5)
			else: SM.play_on_channel(5, st.current_chan)
		elif current_key == 15:
			if st.effect:
				SM.play_once(6)
			else: SM.play_on_channel(6, st.current_chan)
		elif current_key == 16:
			if st.effect:
				SM.play_once(7)
			else: SM.play_on_channel(7, st.current_chan)
		elif current_key == 17:
			if st.effect:
				SM.play_once(8)
			else: SM.play_on_channel(8, st.current_chan)
		elif current_key == 20:
			if st.effect:
				SM.play_once(9)
			else: SM.play_on_channel(0, st.current_chan, music = False)
		elif current_key == 21:
			if st.effect:
				SM.play_once(10)
			else: SM.play_on_channel(1, st.current_chan, music = False)
		elif current_key == 22:
			if st.effect:
				SM.play_once(11)
			else: SM.play_on_channel(2, st.current_chan, music = False)
	### pause/unpause playback
	if st.media_video == 0 and current_key == 8:
		SM.pause_unpause_channel(st.current_chan)
	### activate one time effect playback
	if current_key == 13 and st.effect == False and st.media_video == 0:
		st.effect = True
		for led in range(1,4,1):
			led_on(led)
	if st.effect:
		st.leds[0].value = (1-(st.potentio + 1)/1030)
		
		
led_on(0)
st.current_chan = 0	

### Running loop
while True:
	### Read the Joystick and Potentiometer
	ser_read()
	print(f"{st.joystickX},{st.joystickY},{st.joystick_pressed}, {st.potentio}")
	### Grab the currently pressed key
	current_key = matrix.find_button()
	if current_key == None:
		current_key = 0
	#print(current_key)
	DnDJayAction(current_key)
