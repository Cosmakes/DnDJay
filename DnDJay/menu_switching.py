import asyncio
from serial_controls import ser_write, ser_read
import shared_states as st
from os import listdir, unlink, walk
from os.path import isfile, isdir, join
import shutil
from led_functions import led_off, led_on
import subprocess
import socket
from time import sleep

### Helper functions for data extraction/changing
def file_exchange(target_directory, usb_directory):
	for filename, dirs, files in walk(target_directory):
		for f in files:
			unlink(join(filename,f))
		for d in dirs:
			shutil.rmtree(join(filename,d))
	shutil.copytree(usb_directory, target_directory, dirs_exist_ok = True)

def get_ip():
	s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
	try:
		s.connect(("10.255.255.255",1))
		ip = s.getsockname()[0]
	finally:
		s.close()
	return ip

### Samba functions
def _run_service(action):
	"""
	Helper that runs '' sudo service smbd <action>''.
	Returns (success, combined_output).
	"""
	cmd = ["sudo", "service", "smbd", action]
	try:
		result = subprocess.run(
			cmd, 
			capture_output = True,
			text = True,
			check = False,
		)
		ok = result.returncode == 0
		out =result.stdout.strip()
		err = result.stderr.strip()
		combined = f"{out}\n{err}".strip()
		return ok, combined
	except Exception as e:
		return False, str(e)
	

def start_samba():
	""" Start the Samba server and report success/failure."""
	ok, msg = _run_service("start")
	return "Samba started successfully." if ok else f"Samba failed to start: {msg}"

def stop_samba():
	""" Stop the Samba server and report success/failure."""
	subprocess.run(["nmcli", "radio", "wifi", "off"])
	ok, msg = _run_service("stop")
	return "Samba stopped successfully." if ok else f"Samba failed to stop: {msg}"

### Main function for switching between media/bluetooth/data

def switch_mode(current_mode):
	for led in range(len(st.leds)):
			led_off(led)
	if current_mode == 'media':
		themes_string = ""
		maps_string = ""
		for item in listdir(st.themes_directory):
			if isdir(join(st.themes_directory, item)):
				st.themes_list.append(item)
				themes_string += item
				themes_string += ","
		for item in listdir(st.maps_directory):
			if isfile(join(st.maps_directory, item)) and item != "":
				st.maps_list.append(item)
				maps_string += item[3:13]
				maps_string += ","
		ser_write(f"Switch Media, Themes:{themes_string} Battlemaps:{maps_string}")
		turn_on_leds_media_mode(st.media_video)
		if st.media_video >= 1:
			led_on(4)
	elif current_mode == 'bluetooth':
		st.devices = bt_scan()
		device_list = ""
		for item in st.devices:
			device_list += (str(item[1]))
			device_list += ("|")
		ser_write(f'Switch Bluetooth, Devices: {device_list}')
	elif current_mode == 'data':
		subprocess.run(["nmcli", "radio", "wifi", "on"])
		sleep(10)
		usb_loc = "/media/pi"
		temp_ip = ""
		counter = 0
		while True:
			try:
				counter += 1
				ip = get_ip()
				if ip:
					temp_ip = ip
					break
			except:
				sleep(2)
				if counter == 3:
					temp_ip = "No connection..."
					break
				else: pass
		if len(listdir(usb_loc)) > 0:
			usb_dir = f"{usb_loc}/{[p for p in listdir(usb_loc) if isdir(join(usb_loc, p))][0]}"
			try: 
				file_exchange(st.music_directory, f"{usb_dir}/DnDJay/Music")
				file_exchange(st.maps_directory, f"{usb_dir}/DnDJay/Battlemaps")
				ser_write(f'Switch Data, {temp_ip}, Success')
			except:
				ser_write(f'Switch Data, {temp_ip}, Failed')
		else:
			ser_write(f'Switch Data, {temp_ip}, Failed')
		start_samba()
		
def turn_on_leds_media_mode(media_submenu):
	st.leds[0].value = (1-(st.potentio + 1)/1030)
	for i in range(4):
			if st.menu_dict[media_submenu][i] == 1:
				led_on(i)
			else:
				led_off(i)
				
def adjust_active_leds(media_submenu, pressed_button):
	pressed = pressed_button-1
	for i in range(4):
		if i != (pressed):
			st.menu_dict[media_submenu][i] = 0
		else:
			st.menu_dict[media_submenu][i] = 1
		

def end_mode(current_mode):
	if current_mode == 'media':
		pass
	elif current_mode == 'bluetooth':
		pass
	elif current_mode == 'data':
		stop_samba()

### Media submenu controls

def media_menu_action(pressed_button):
	if st.media_mode == False and st.video_mode == False:
		st.current_chan = pressed_button
		adjust_active_leds(0,pressed_button)
		turn_on_leds_media_mode(0)
	elif st.media_mode == True and st.video_mode == False:
		if len(st.themes_list) >= pressed_button:
			st.theme_path = st.music_directory + "/" + st.themes_list[pressed_button-1] + "/"
			adjust_active_leds(1,pressed_button)
			turn_on_leds_media_mode(1)
			#ser_write(f"Select theme: {pressed_button}")
		else: pass
	elif st.media_mode == False and st.video_mode == True:
		if len(st.maps_list) >= pressed_button:
			st.map_path = st.maps_directory + "/" + st.maps_list[pressed_button-1]
			adjust_active_leds(2, pressed_button)
			turn_on_leds_media_mode(2)
			#ser_write(f"Select map: {pressed_button}")
		else: pass
		
		
### Bluetooth controls

def bt_scan():
    """
    Executes the Expect script above and returns a list of (mac, name) tuples.
    """
    result = subprocess.run(
        ["bash", "/home/pi/Desktop/DnDJay/bt_scan.sh"],
        capture_output=True,
        text=True,
        check=True,
    )
    devices = []
    for line in result.stdout.strip().splitlines():
        mac, name = line.split(" ", 1)
        devices.append((mac, name))
    return devices

def bt_pairandconnect(mac):
    """
    Calls `bluetoothctl pair <mac>` and returns the stdout text.
    """
    result = subprocess.run(
    ["sudo", "bash", "/home/pi/Desktop/DnDJay/bluetooth_pairing.sh", mac],
    capture_output = True,
    text = True
    )
    
    if result.returncode != 0:
        raise RuntimeError(result.stdout + result.stderr)
    #switch_mode('media')
    return result.stdout

