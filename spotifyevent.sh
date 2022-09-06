#!/bin/bash
# Copyright 2022 by Retro Audiophile Designs
#   ~ script runs every time when librespot fires a player event ~
# Set as option for --onevent in raspotify config file
# File streamsensor.log is read by machine-loop.js

# wrong CR characters, remove with: sed -i -e 's/\r$//' spotifyevent.sh

#echo RAD machine event fired PLAYER_EVENT: $PLAYER_EVENT


if [[ $PLAYER_EVENT == "playing" ]]; then
	echo "spot:start" > /var/log/streamsensor.log
  	sync -d /var/log/streamsensor.log
fi
#if [[ $PLAYER_EVENT == "started" ]]; then
#	echo "spot:start started" > /var/log/streamsensor.log
#  	sync -d /var/log/streamsensor.log
#fi

if [[ $PLAYER_EVENT == "paused" ]]; then
	echo "spot:stop" >  /var/log/streamsensor.log
  	sync -d /var/log/streamsensor.log
fi


if [[ $PLAYER_EVENT == "stopped" ]]; then
	echo "spot:stop" >  /var/log/streamsensor.log
  	sync -d /var/log/streamsensor.log
fi
