#!/bin/bash

user=$(whoami)

cd /home/$user/Desktop

pixi init DnDJay

# Enable control over the serial port
sudo chown $user /dev/ttyS0
sudo chmod a+rw /dev/ttyS0

chmod +x /home/pi/Desktop/start_dndjay.sh

mkdir -p ~/.config/autostart
# get into ~/.config/autostart/dndjay.desktop
#[Desktop Entry]
#Type=Application
#Name=DnDJay
#Exec=/home/pi/Desktop/start_dndjay.sh
#StartupNotify=false

