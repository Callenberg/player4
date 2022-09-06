#!/bin/bash
# wrong CR characters, remove with: sed -i -e 's/\r$//' player.sh
sleep 1 
sudo rfkill unblock wifi > /dev/null 2>&1 
sudo umount -f /mnt/usb > /dev/null 2>&1 
sudo rm -f /etc/asound.conf > /dev/null 2>&1 
sleep 1 
cd /player
node /player/machine.js &

