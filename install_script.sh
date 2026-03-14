#!/bin/bash

user=$(whoami)

# Update apt

sudo apt update
sudo apt upgrade

# Add GPIO Shutdown

sudo sed -i -e '$adtoverlay gpio-shutdown' /boot/firmware/config.txt

# Install Pixi

curl -fsSL https://pixi.sh/install.sh | sh
sleep 3
source ~/.bashrc

# Create Folders for Data
sudo mkdir /media/Data/
sudo chown $user /media/Data/

# Install Samba for network filesharing
sudo apt install samba samba-common-bin

echo "Creating a User for Samba Network Share"

sudo smbpasswd -a DnDJay

sudo sed -i -e '$a\[DnDJay]\npath = /media/Data\nwriteable = yes\nbrowseable = yes\npublic = yes' /etc/samba/smb.conf

sudo systemctl restart smbd

# Enable bluetooth

sudo rfkill unblock bluetooth

{
	echo "power on"
	sleep 5
	echo "quit"
} | bluetoothctl


#Enable UART only serial not console
sudo raspi-config


