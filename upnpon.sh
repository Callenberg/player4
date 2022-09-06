#!/bin/bash
# Copyright 2022 by Retro Audiophile Designs
#   ~ script runs every time when upnp/dnla STARTS streaming ~
# Set as script for: onstart= in upmpdcli config file
# File upnpstream.log is read by machine-loop.js

# if wrong CR characters, remove with: sed -i -e 's/\r$//' upnpon.sh
echo "mpd:start" > /var/log/mpddetect.log
#echo "RAD: true written to /var/log/upnpstream.log"
sync -d /var/log/streamsensor.log
