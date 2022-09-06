#!/bin/bash
# Copyright 2021 by Retro Audiophile Designs
#   ~ script runs every time when shairport-sync STOPS playing ~
# Set as script for: run_this_after_play_ends in shairport-sync config file
# File airplaystream.log is read by machine-loop.js

# if wrong CR characters, remove with: sed -i -e 's/\r$//' airplayon.sh
echo "airp:stop" > /var/log/streamsensor.log
#echo "RAD: false written to /var/log/streamsensor.log"
sync -d /var/log/streamsensor.log
