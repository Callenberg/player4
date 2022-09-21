# player4
Player Software Version 4 --- backend and frontend for a Raspberry Pi based music network player

This is the software that comes with the network music players/streamers sold by Retro Audiophile Designs. The products are old vintage radios or sometimes cassette decks where new electronics have been retrofitted. To learn more about the products visit our web site: www.retroaudiophiledesigns.com

The software makes it possible to stream music using Bluetooth, Spotify, Airplay or UPnP. In addition, it can play music files from an attached USB flash memory stick. It connects the hardware to Bluetooth (as a sink) and it is also possible to connect to home networks with cable or Wi-Fi. It is even possible to connect to Bluetooth speaker systems or Bluetooth headphones (as a renderer) and in addition also the designated hardware set up can be connected to old fashioned wired passive Hi-Fi speakers. The system and its connections are managed by a web interface. There is also a playback web interface for playing music files.



Hardware requirements:
=====================
Raspberry Pi 4 Model B, 1 GB or more RAM, works probably with Raspberry Pi 3 too.

Optional: additional Wi-Fi dongle (will make the set up easier and better signal coverage).

Class D amplifier IQaudio Pi-DigiAMP+ HAT for Raspberry pi (other HATs works too like JustBoom or HiFiBerry).

12-24V power source.

Software requirements:
=====================

 - Raspberry Pi OS based on Debian Bullseye https://www.raspberrypi.com/documentation/computers/os.html

- librespot https://github.com/librespot-org/librespot

- Shairport Sync https://github.com/mikebrady/shairport-sync

- Bluetooth Audio ALSA Backend https://github.com/Arkq/bluez-alsa

- Music Player Daemon https://github.com/MusicPlayerDaemon/MPD

- upmpdcli https://www.lesbonscomptes.com/upmpdcli/

- Node.js https://nodejs.org/en/download/

- socket.io https://socket.io/

- Express https://expressjs.com/

Usage
=====
This is only a plain software depository. There is no package to install. The best usage is probably to look at the source code of the topics that interests you and maybe the code can inspire you. 

Topics that might be of interest
================================
Bluetooth connections
---------------------
Connecting a device via Bluetooth is mainly managed in the file /lib/machine-bluetooth.js (Case: audio sink). If you are curious how the connection to a bluetooth speaker is made check out /lib/machine-audiosink.js (Case: audio source). It might also be of interest to check out status and any information about current connections as well as starting and stoping the Bluetooth service, then look at the file /lib/machine-network.js (Case: status of the Bluetooth connection).

Bluetooth streaming
------------------- 
One challenge is how to detect when Bluetooth is used to stream audio to the Player and to a Bluetooth speaker. Since the alsa and the audio card is not used in this case so no need to monitor those things. Instead file descriptors are scanned to find the open file that represents the bluetooth streaming. Look further in the script fdinfobluealsa.sh that writes to the file bluetoothdetect.log that has to be present in the /var/log/ directory of the Raspberry Pi. An example of the file can be found in /data/. The streaming is detected in the file /lib/machine-loop.js.

Configuration
-------------
Various config files can be found in /config/.  However, the config files for Wi-Fi can be found in /data/.

mpd 
---
mpd and its client mpc are the backbone software used to play/stream music files (note: only files, not Spotify streams or any audio streams). The use of mpc is prefered over mpd calls. Look at /lib/machine-mpd.js. The actual Javascript client for mpd can be found in /lib/mpd.js (based on Andrew Kelley's work - https://github.com/andrewrk/mpd.js ).

Playback
--------
The software can play music files of all the formats that is supported by mpd. The Player functions like play, forward, shuffle e.t.c are implemented in the file /lib/machine-player.js.

Streaming
---------
One of the most frequent events is when streaming starts and stops. In order to detect those different hooks are used. Librespot (Spotify) provides a nice set of hooks that are used, see the script spotifyevent.sh. Shairport-sync (AirPlay) provides hooks as well and those are used in the scripts airplayoff.sh and airplayon.sh. upmpdcli provides some rudimentary hooks and they are used in the scripts upnpoff.sh, upnpon.sh and upnpnpause.sh. All these hooks write their status in a file that has to exist in /var/log/ directory of the Raspberry Pi and it is named streamsensor.log. The actual detection of various streaming is done in the file /lib/machine-loop.js reading the value of the streamsensor.log. An example of the streamsensor.log file can be found in /data/

User interface
--------------
The user interface is used for managing the Player system itself (i.e. do settings and managing connections, show status of the Player and in addition do playback of music files on an inserted USB stick. It is not used for streaming - then you use your streaming apps like the Spotify app. The front end consists of the following main files: /pages/playerplayback.html, /pages/playerplayback.js, /pages/playerplaylist.html, /pages/playerplaylist.js, /pages/playerusb.html, /pages/playerusb.js [used for playback of a USB stick], /pages/playerbluetooth.html and /pages/playerbluetooth.js, /pages/playermachine.html and /pages/playermachine.js [start page], /pages/playersettings.html and /pages/playersettings.js, /pages/playerwifi.html and /pages/playerwifi.js. All CSS code can be found in /pages/player.css.

Wi-Fi
-----
In order to manage all aspects of Wi-Fi calls to the WPA command line client are used and also the management of the wpa_supplicant service. Open the file /lib/machine-network and have a look.

