import serial
import shared_states as st
from time import sleep

def initialize_serial():
	st.ser = serial.Serial('/dev/ttyS0', 115200, timeout = 1)
	st.ser.flush()

def ser_write(command):
	st.ser.write(str(command).encode('utf-8'))
	
def ser_read():
	sleep(.01)
	predecode = st.ser.readline()
	if str(predecode)[-2] == "n" and str(predecode) != "" and str(predecode)[2:5] == "JOY":
		string = predecode.decode('utf-8')
		sleep(.01)
		values = []
		if string != "":
			values = string.split()
			st.joystickX = int(values[1].split(":")[1].split(".")[0])
			st.joystickY = int(values[2].split(":")[1].split(".")[0])
			st.joystick_pressed = int(values[4].split(":")[1])
			st.potentio = int(values[3].split(":")[1].split(".")[0])
		else:
			pass
		
