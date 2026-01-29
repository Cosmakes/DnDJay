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
| 6x | LED | Source |
| 1x | Button | Source |
| 1x | Voltcraft power source | https://www.conrad.com/en/p/voltcraft-vc-wt-k512-power-bank-10000-mah-fast-charge-lipo-black-status-display-3027882.html?searchType=SearchRedirect |



### Step 2: Soldering

In this step, solder the following pieces to the PCB:

- RaspberryPi 3A+
- Joy It ARD-ProMicro
- 2.9' ePaper-Display
- Joystick Module
- Potentiometer
- Diodes
- LEDs
- Button

Do not solder on the mechanical keys yet, they should first be clipped into the top piece of the build.

### Step 3: Software installation and testing
#### Arduino/Joy It ProMicro
Upload the source code found in /Arduinocode/Arduinocode.ino to the Arduino using the Arduino IDE and a microUSB cable.
#### RaspberryPi
Use the Raspberry Pi Imager (https://www.raspberrypi.com/software/) to flash Raspbian (add Version) on the microSD card.



