#!/bin/bash
#           -: restart script called from machine.js :-

# wrong CR characters, remove with: sed -i -e 's/\r$//' playersystemrestart.sh
# sudo reboot - DOESN'T WORK WELL FOR Pi 4
# sudo rfkill unblock wifi
# sudo umount -f /mnt/usb
# sudo rm -f /etc/asound.conf

sudo systemctl restart player.service