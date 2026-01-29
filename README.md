# DnDJay
This is the official repository for the DnDJay, an open source soundboard/media player for TTRPGS/Boardgames. In the hopes that this project becomes useful to as many people as possible, I (the author) decided to license it under the GNU General Public License v3.0 (https://choosealicense.com/licenses/gpl-3.0/).
Be aware that this is my first build of this sort, so some things could definitely be optimized. However, it works!

# Building instructions

If you want to build the DnDJay yourself, here is a guide how I did it.

### Step 1: Gathering components

For my build of the DnDJay, I used the following components:

| Quantity      | Item          | Source        | 
| ------------- | ------------- | ------------- |
| 1x | RaspberryPi 3A+          | https://www.raspberrypi.com/products/raspberry-pi-3-model-a-plus/ |
| 1x | MicroSD card for the RaspberryPi 3A+          | Whatever works best for you, I suggest at least 32GB of storage. |
| 1x | Joy It ARD-ProMicro         | https://joy-it.net/en/products/ard_pro-micro |
| 1x | 2.9' ePaper-Display | https://www.az-delivery.de/en/products/2-9-zoll-epaper-display |
| 1x | Custom PCB | PCB Folder |
| 1x | Joystick Module |https://joy-it.net/en/products/COM-KY023JM |
| 1x | Potentiometer | (Similar to:) https://www.conrad.com/en/p/alpha-rv16af-20-15k-b10k-rv16af20kb10km-single-turn-rotary-pot-mono-200-mw-10-k-1-pc-s-1694304.html |
| 22x | Cherry MX Mechanical Keys | https://shop.cherry.de/de-de/cherry-mx-rgb-red-switch-kit.html |
| 22x | Diodes | Source |
| 6x | LED | https://www.conrad.com/en/p/tru-components-led-wired-white-circular-5-mm-12500-mcd-20-25-20-ma-1577386.html |
| 6x | 470kOhm Resistor | https://www.conrad.com/en/p/tru-components-1584345-tc-mf0w4ff4700kit203-metal-film-resistor-470-axial-lead-0207-0-25-w-1-100-pc-s-1584345.html |
| 1x | Button | Source |
| 1x | Voltcraft power source | https://www.conrad.com/en/p/voltcraft-vc-wt-k512-power-bank-10000-mah-fast-charge-lipo-black-status-display-3027882.html?searchType=SearchRedirect |



### Step 2: Soldering

In this step, solder the following pieces to the PCB:

- RaspberryPi 3A+
- Joy It ARD-ProMicro
- 2.9' ePaper-Display
- Joystick Module
- Potentiometer
- Resistors
- Diodes
- LEDs
- Button

Do not solder on the mechanical keys yet, they should first be clipped into the top piece of the build.

### Step 3: Software installation and testing
#### Arduino/Joy It ProMicro
Upload the source code found in /Arduinocode/Arduinocode.ino to the Arduino using the Arduino IDE and a microUSB cable.
#### RaspberryPi
This setup takes some time, because we need to tweak a few system settings on the Pi, implement a python environment, etc.
##### 1: Flash RaspbianOS
Use the Raspberry Pi Imager (https://www.raspberrypi.com/software/) to flash RaspbianOS (add Version) on the microSD card.
Within the Imager, feel free to already add login information for wifi, in case you are planning to use the samba data transfer feature of the DnDJay.
##### 2: First boot + system settings adjustments.
Once you have flashed the image, insert the microSD card into your Pi, connect the Pi to a keyboard via USB, to a screen via HDMI and lastly to a power supply with a sufficiently stable voltage via the microUSB port.
Time to boot up the Pi!
Once you connect the Pi to power, the red LED should turn on (Power) and the green LED should start flashing irregularly (Booting). If either of these things do not happen, you might need to reassess if you performed all steps until here correctly or if your Pi is working.

Once your Pi has booted up, type the following command into the terminal:
`sudo raspi-config`




