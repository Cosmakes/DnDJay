#!/bin/bash
sleep 2
while true; do
	echo "Starting DnDJay..."
	dbus-launch /usr/bin/python /home/pi/Desktop/DnDJay/on_launch.py >> /home/pi/Desktop/startup.log 2>&1
	echo "Program exited. Restarting in 5 seconds..."
	sleep 5
done
