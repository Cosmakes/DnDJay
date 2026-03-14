from gpiozero import Button, DigitalOutputDevice
import time

class ButtonMatrix():
	
	def __init__(self):
		
		self.button_IDs = [[1,5,6,7,8,9],[2,10,11,12,13,14],[3,15,16,17,18,19],[4,20,21,22]]
		column1_pin = DigitalOutputDevice(4, initial_value = False)
		column2_pin = DigitalOutputDevice(5, initial_value = False)
		column3_pin = DigitalOutputDevice(6, initial_value = False)
		column4_pin = DigitalOutputDevice(16, initial_value = False)
		column5_pin = DigitalOutputDevice(17, initial_value = False)
		column6_pin = DigitalOutputDevice(22, initial_value = False)
		self.column_items = [column1_pin,column2_pin, column3_pin, column4_pin, column5_pin, column6_pin]  
		row1_pin = Button(23, pull_up = False)
		row2_pin = Button(24, pull_up = False)
		row3_pin = Button(25, pull_up = False)
		row4_pin = Button(26, pull_up = False)
		self.row_buttons = [row1_pin, row2_pin, row3_pin, row4_pin]

	def find_button(self):
		result = None
		for j in range(len(self.column_items)):
			for k in range(len(self.row_buttons)):
				self.column_items[j].on()
				if self.row_buttons[k].is_pressed:
					result = self.button_IDs[k][j]
					self.row_buttons[k].wait_for_release()
				self.column_items[j].off()
		return result

if __name__ == "__main__":
	bm = ButtonMatrix()
	while True:
		pressed = bm.find_button()
		print(pressed)
