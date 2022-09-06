#!/bin/bash
# Copyright 2022 by Retro Audiophile Designs.
#   ~ script runs every time when shairport-sync STARTS playing ~
# Set as script for: run_this_before_play_begins in shairport-sync config file
# File airplaystream.log is read by machine-loop.js

# if wrong CR characters, remove with: sed -i -e 's/\r$//' airplayon.sh
echo "airp:start" > /var/log/streamsensor.log
#echo "RAD: true written to /var/log/airplaystream.log"
sync -d /var/log/streamsensor.log
