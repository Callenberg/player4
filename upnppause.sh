#!/bin/bash
# Copyright 2022 by Retro Audiophile Designs.
#   ~ script runs every time when upnp/dnla PAUSES streaming ~
# Set as script for: onpause= in upmpdcli config file
# File upnpstream.log is read by machine.js and machine-loop.js

# if wrong CR characters, remove with: sed -i -e 's/\r$//' upnppause.sh
echo "mpd:stop" > /var/log/mpddetect.log
# echo "RAD: pause written to /var/log/upnpstream.log"
sync -d /var/log/streamsensor.log
