from gpiozero import LED, PWMLED
import shared_states as st
import time

def init_leds():
	led1 = PWMLED(12)
	led2 = LED(13)
	led3 = LED(19)
	led4 = LED(20)
	led5 = LED(27)
	st.leds = [led1, led2, led3, led4, led5]

def led_on(lednum):
	led = st.leds[int(lednum)]
	led.on()

def led_off(lednum):
	led = st.leds[int(lednum)]
	led.off()
	
	
def run_test():
	init_leds()
	while True:
		for i in range(len(st.leds)):
			led_on(i)
			time.sleep(1)
		for i in range(len(st.leds)):
			led_off(i)
			time.sleep(1)

