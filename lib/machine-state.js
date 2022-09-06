//Copyright 2022 by Retro Audiophile Designs, all rights reserved.
//GNU General Public License v3.0 see license.txt            [Source code]
//         ~ gather state & status - backend of RAD Player ~

//Render object formats:
//renderSystemHeader() ->
//[0]: {time: "", system: version, card: "", default: "", muted: ""}
//renderBluetooth() ->
//[1]: {devices: "", paired: "", connected: "", speakers: "", mac: "", btOn: "",
//      discoverable: ""};
//renderNetwork() ->
//[2]: {ip: "", wifi: "", mac: "", internet: "", rfkill: ""}
//renderSystem() ->
//[3]: { used: "", free: "", tot: "", left: "", missing: "", running: "",
//       size: "", inUse: "", avail: "", usePercent: "" };
//renderStreaming() ->
//[4]: {sensor: "no read",  mpdDetect: "no read", bluetooth: "no read", upnp: "no read",
//      alsablu: "no read", mpdPid: "no read",    alsacurrent: "no read", alsaUser: "no read"};
//renderUsbPlayback() ->
//[5]: {songs: "no read", mpc: "no read", mpdDB: "no read",
//      uspRsp: "no read", userUSB: "no read", mountUSB: "no read"}

const aux =   require('./machine-auxiliary.js');
const btsp =  require('./machine-audiosink.js');
const blut =  require('./machine-bluetooth.js');
const nwork = require('./machine-network.js');
const usb = require('./machine-usb.js');
const play = require('./machine-playback.js');
const fs = require('fs');                           //for reading files
const os = require('os');                           //for getting system data
//const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synched Raspbian cmds

module.exports.renderSystemHeader = renderSystemHeader;
module.exports.renderBluetooth = renderBluetooth;
module.exports.renderNetwork = renderNetwork;
module.exports.renderSystem = renderSystem;
module.exports.renderStreaming = renderStreaming;
module.exports.renderUsbPlayback = renderUsbPlayback;

module.exports.renderMachinePlayback = renderMachinePlayback;
module.exports.renderMachineConnections = renderMachineConnections;
module.exports.renderStream = renderStream;
module.exports.renderRestart = renderRestart;
module.exports.renderPlaylist = renderPlaylist;

module.exports.renderBtSinks = renderBtSinks;
module.exports.renderBtSources = renderBtSources;



/**System header. Information about time data, system version and sound system.
 * {time: "", system: version, card: "", default: "", muted: ""};
 * @param {string}            version Player version
 * @return {object}           frame object for rerendering
 */
function renderSystemHeader(version) {
  let frameData = {time: "", system: version,
                   card: "", default: "", muted: ""};
  //let pairedDevices = "";
  //let connectedDevices = "";
  //let speakerDevices = "";    //limited to only one
  try {
    //'09:31:26 up 20:29,  1 user,  load average: 0.00, 0.00, 0.00'
    frameData.time =
      execSync(`sudo  uptime | cut -d',' -f1 `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  } catch (err) {
    frameData.time = "---"
  };
  try {
    //'card 0: IQaudIODAC [IQaudIODAC], device 0: IQaudIO DAC HiFi pcm512x'
    frameData.card =
      execSync(`sudo  aplay -l | grep "card 0" | cut -d' ' -f3`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  } catch (err) {
    frameData.card = "---"
  };
  try {
    //'btspeaker \n Bluetooth speaker, FC:58:FA:ED:57:60'
    let isBtSpeaker =
      execSync(`sudo aplay -L | grep btspeaker `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
      if (isBtSpeaker === "") {
        frameData.default = "amplifier";
      }
      else {
        frameData.default = "Bluetooth speaker";
      };
  } catch (err) {
    frameData.default = "amplifier";
  };
  try {
    //'Front Left: Playback 207 [100%] [0.00dB] [on]'
    //doesn't work `sudo amixer -c 0 get Digital | grep [on] `
    let isUnmuted =
     execSync(`sudo amixer -c 0 get Digital`,
                  {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
    //if (isUnmuted !== "") {
    if (isUnmuted.lastIndexOf("[on]") !== -1) {
      frameData.muted = "unmuted";
    }
    else {
      frameData.muted = "muted";
    };
  }
  catch(err) {
    frameData.muted = "---";
  };
  return frameData;
};
/**Bluetooth data.
 * {devices: "", paired: "", connected: "", speakers: "", mac: "", btOn: "",
 *  discoverable: ""};
 * @return {object}           frame object for rerendering
 */
async function renderBluetooth() {
  let frameData = {devices: "", paired: "", connected: "",
                   speakers: "", mac: "", btOn: "", discoverable: ""};
  let macString = "";
  let macStringPaired = "";
  let macArray = [];
  try {
    //'Device FC:58:FA:ED:57:60 ENEBY30 \n Device 34:14:5F:48:32:F8 Galaxy S7 '
    macString =
      execSync(`sudo  bluetoothctl devices | cut -d' ' -f2 `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //console.log(aux.timeStamp(),"state: found total devices [string]:\n", macString);
    frameData.devices = getBluetoothDevices(macString);
  } catch (err) {
    //console.log(aux.timeStamp(),"state: Did not find total devices [string]:\n", err);
    frameData.devices = "---"
  };
  try {
    //'Device FC:58:FA:ED:57:60 ENEBY30 \n Device 34:14:5F:48:32:F8 Galaxy S7 '
    macStringPaired =
      execSync(`sudo  bluetoothctl paired-devices | cut -d' ' -f2 `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    frameData.paired = getBluetoothDevices(macStringPaired);
  } catch (err) {
    frameData.paired = "---"
  };
  macArray = await connectedBluetoothDevices(macString);
  frameData.connected = macArray[0];
  frameData.speakers =  macArray[1];
  try {
    //'Controller DC:A6:32:1D:DB:52 (public)'
    frameData.mac =
      execSync(`sudo bluetoothctl show | grep Controller | cut -d' ' -f2 `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
  } catch (err) {
    frameData.mac = "---"
  };
  try {
    //'Powered: yes'
    frameData.btOn =
      execSync(`sudo bluetoothctl show | grep Powered: | cut -d' ' -f2 `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  } catch (err) {
    frameData.btOn = "---"
  };
  try {
    //'Discoverable: yes'
    frameData.discoverable =
      execSync(`sudo bluetoothctl show | grep Discoverable: | cut -d' ' -f2 `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  } catch (err) {
    frameData.discoverable = "---"
  };
  return frameData;
};
/**Network connection data.
 * {ip: "", wifi: "", mac: "", internet: "", rfkill: ""}
 * @return {object}           frame object for rerendering
 */
async function renderNetwork() {
  let frameData = {ip: "", wifi: "", mac: "", internet: "", rfkill: ""};
  try {
    //'192.168.2.191'
    frameData.ip =
      execSync(`sudo hostname -I `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  } catch (err) {
    frameData.ip = "---"
  };
  /*
  try {
     //' inet 192.168.2.133/24 brd 192.168.2.255 scope global dynamic...'
     frameData.wifi =
       execSync(`sudo ip addr list wlan0 |grep "inet " | cut -d' ' -f6 | cut -d/ -f1`,
             {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
   } catch (err) {
     frameData.wifi = "---";
   };*/
  frameData.wifi = await nwork.ifaceWifi();

  try {
    //'dc:a6:32:1d:db:51' for eth0, wlan0 might vary
    frameData.mac =
      execSync(`sudo cat /sys/class/net/eth0/address `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  } catch (err) {
    frameData.mac = "---"
  };
  if (await nwork.isInternet() === "1") {
    frameData.internet = "access confirmed"
  }
  else {
    frameData.internet = "disconnected"
  };
  try {
    frameData.rfkill =
      execSync(`sudo rfkill list`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  } catch (err) {
    frameData.rfkill = "---"
  };
return frameData;
};
/**System information.
 * { used: "", free: "", tot: "", left: "",
 *   missing: "", running: "",
 *   size: "", inUse: "", avail: "", usePercent: "" };
 * @return {object}           frame object for rerendering
 */
async function renderSystem() {
  let freeMem = Math.round(os.freemem()/(1000 * 1000));
  let totMem = Math.round(os.totalmem()/(1000 * 1000));
  let usedMem = totMem - freeMem;
  let spaceMem = Math.round((freeMem / totMem) * 100);
  let frameData = { used: String(usedMem), free: String(freeMem),
                    tot: String(totMem), left: String(spaceMem),
                    missing: "", running: "",
                    size: "", inUse: "", avail: "", usePercent: "" };
  //'...bash bluetoothctl shairport-sync librespot upmpdcli kworker/0:2...'
  try { // `sudo ps -eo comm,pid` - yields pids as well
    let procs = execSync(`sudo ps -eo comm`,
                         {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    let wantedProcs = ["wpa_supplicant", "alsactl", "bluealsa-aplay", "bluetoothd",
                         "bt-agent", "bluealsa", "dhcpcd", "mpd", "bluetoothctl",
                         "librespot", "shairport-sync", "upmpdcli",
                         "dnsmasq", "hostapd" ];
    let notRunning = "";
    let running = "";
    let procsLength = wantedProcs.length;
    if (procs !== "") {
      for (let i =0; i < procsLength; i++) {
        if (procs.search(wantedProcs[i]) === -1) {
          notRunning = notRunning + wantedProcs[i] + " ";
        }
        else {
          running = running + wantedProcs[i] + " ";
        };
      };
      if (notRunning) {
        frameData.missing = `${notRunning}`;
      };
      if (running) {
        frameData.running = `${running}`
      };
    }
    else {
      frameData.running = "No processes could be found";
    };
  } catch (err) {
    frameData.missing = "---"
  };
  //'total           8.1G  3.7G  4.4G  46% - '
  try {
    frameData.size =
      aux.mpdMsgTrim(
        execSync(`sudo df -h --total | grep total | cut -d'G' -f1 | cut -dl -f2`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000}));
  } catch (err) {
    frameData.size = "---"
  };
  try {
    frameData.inUse =
      aux.mpdMsgTrim(
        execSync(`sudo df -h --total | grep total | cut -d'G' -f2`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000}));
  } catch (err) {
    frameData.inUse = "---"
  };
  try {
    frameData.avail =
      aux.mpdMsgTrim(
        execSync(`sudo df -h --total | grep total | cut -d'G' -f3 `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000}));
  } catch (err) {
    frameData.avail = "---"
  };
  try {
    frameData.usePercent =
      aux.mpdMsgTrim(
        execSync(`sudo df -h --total | grep total | cut -d'G' -f4`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000}));
  } catch (err) {
    frameData.usePercent = "---"
  };
  return frameData;
};
/**Internal blockers and hooks
 * {
 * @return {object}           frame object for rerendering
 */

/**Player Streaming information
 * {
 * @param {object}            stream, machine stream object
 * @return {object}           frame object for rerendering
 */
async function renderStreaming(stream) {
  let btString = aux.mpdMsgTrim(fs.readFileSync('/var/log/bluetoothdetect.log', 'utf8'));
  //let upnpString = aux.mpdMsgTrim(fs.readFileSync('/var/log/upnpdetect.log', 'utf8'));
  //let alsaBin = "";
  let frameData = {sensor: "no read",  mpdDetect: "no read", bluetooth: "no read", upnp: "no read",
                   alsablu: "no read", mpdPid: "no read",    alsacurrent: "---", alsaUser: "no read"};
  //1. sensor - value on file
  frameData.sensor = aux.mpdMsgTrim(fs.readFileSync('/var/log/streamsensor.log', 'utf8'));
  //2. mpdDetect - mpd detect value on file
  frameData.mpdDetect = aux.mpdMsgTrim(fs.readFileSync('/var/log/mpddetect.log', 'utf8'));
  //3. bluetooth - is bluetooth speaker used now?
  if (btString.indexOf("anon_inode:[eventfd]") !== -1) {
    frameData.bluetooth = "btsp!";
  }
  else {
    frameData.bluetooth = "amp";
  };
  //4. upnp - check out mpc
  frameData.upnp = "check mpc";
  //5. alsablu - get pid for bluealsa-aplay
  frameData.alsablu = await aux.getServicePid("bluealsa-aplay");
  //6. mpdPid - get mpd pid
  frameData.mpdPid = await aux.getServicePid("mpd");
  //7. alsacurrent - is there a pid using alsa?
  try {
       let alsaPid = aux.mpdMsgTrim(execSync(
               `sudo cat /proc/asound/card0/pcm0p/sub0/status | fgrep  owner_pid | cut -d':' -f2 `,
                {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 1000}));
        if (alsaPid !== "") {
           frameData.alsacurrent = alsaPid;
        }
        else {
          frameData.alsacurrent = "---";
        }
     }
     catch (err) { //if no 'owner_pid' it will end up here
       frameData.alsacurrent = "---";
     };
  //8. alsaUser - which bin is using the alsa now?
  if (frameData.alsacurrent !== "---") {
    try {
          frameData.alsaUser = aux.mpdMsgTrim(execSync(
            `sudo pmap -q -A ffff1000,ffff1100 ${aux.mpdMsgTrim(frameData.alsacurrent)} | cut -d'-' -f1 | cut -d':' -f2 `,
              {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 1000}));

         }
         catch (err) {
           frameData.alsaUser = "unknown"
         };
  }
  else {
    frameData.alsaUser = "alsa is idle";
  };
  return frameData;
};


/**USB playback information - usb, playback and mpd/mpc
 * {
 * @return {object}           frame object for rerendering
 */
async function renderUsbPlayback() {
  let frameData = {songs: "no read", mpc: "no read", mpdDB: "no read",
                   uspRsp: "no read", userUSB: "no read", mountUSB: "no read"}
  //1. songs - get number of songs in mpd db
  try {
    frameData.songs =
      aux.mpdMsgTrim(
        execSync(`sudo mpc stats | grep Songs | cut -d':' -f2 `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000}));
  } catch (err) {
    frameData.songs = "---";
  };
  //2. mpc - get full status of mpc (1 - 3 lines)
  try {
    frameData.mpc =
      aux.mpdMsgTrim(
        execSync(`sudo mpc`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000}));
  } catch (err) {
    frameData.mpc = "ERROR missing";
  };
  //3. mpdDB - get mpd db statistics
  try {
    frameData.mpdDB =
      aux.mpdMsgTrim(
        execSync(`sudo mpc stats | grep DB `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000}));
  } catch (err) {
    frameData.mpdDB = "ERROR missing";
  };
  //4. usbRsp - get the all attached usb and their partitions (incl. OS)
  try {
    frameData.usbRsp = aux.mpdMsgTrim(
        execSync(`sudo blkid -s UUID | grep sd`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000}));
  } catch (err) {
    frameData.usbRsp = "---";
  };
  //5. userUSB - get the UUID for the user's attached usb or false
  frameData.userUSB = await usb.usbFindUUID();
  //6. mountUSB - get the mount info for any mounted user usb
  try {
    frameData.mountUSB = aux.mpdMsgTrim(
        execSync(`sudo mount | grep usb | cut -d'(' -f1 `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000}));
  } catch (err) {
    frameData.mountUSB = "---";
  };

  return frameData;
};

//AUX - helper functions for State page
//------------------------------------------------------------------------- AUX
/**Get the mac addresses from a Bluetoothctl generated device string, where
 * "| cut -d' ' -f2" first has been applied to the original string...
 * Device string format: "34:14:5F:48:32:F8 \n FC:58:FA:ED:57:60"
 * @param {string}            devicesString, string with mac addr sep with \n
 * @return {string}           string with mac addr separated with ' '
 */
function getBluetoothDevices(devicesString) {
  if (devicesString !== "") {
    let macString = "";
    let deviceArray = devicesString.split("\n"); //split string at line breaks
    //console.log(aux.timeStamp(),"state: mac array =", deviceArray);
    let numberOfDevices = deviceArray.length;
    for(let i = 0; i < numberOfDevices; i++) {
      //macString = macString + deviceArray[i];
      macString = `${macString}   ${deviceArray[i]} &nbsp;`;
    };
    return macString;
  }
  else {
    return "";
  };
};
/**Get connected device from a  Bluetoothctl generated device string, where
 * "| cut -d' ' -f2" first has been applied to the original string...
 * Device string format: "34:14:5F:48:32:F8 \n FC:58:FA:ED:57:60 \n"
 * The last \n is problematic since ths split generates this array:
 * [ '34:14:5F:48:32:F8', 'FC:58:FA:ED:57:60', '' ] - discard last element
 * @param {string} devicesString, string with mac address
 * @return {array} array of strings; [0] are connected, [1] is connected speaker
 */
async function connectedBluetoothDevices(devicesString) {
  //console.log(aux.timeStamp(),"state: incoming devices for check:", devicesString);
  if (devicesString !== "") {
    //console.log(aux.timeStamp(),"state: total devices:\n", devicesString);
    let connectedDevices = "";
    let speakerDevices = "";
    let deviceArray = devicesString.split("\n");
    //console.log(aux.timeStamp(),"state: array:\n", deviceArray);
    let numberOfDevices = deviceArray.length - 1; //last is ' '
    for(let i = 0; i < numberOfDevices; i++) {
      if (await btsp.btIsDeviceConnected(deviceArray[i]) === true) {
          //connectedDevices = connectedDevices + deviceArray[i] + " ";
          //console.log(aux.timeStamp(),"state: connected =", deviceArray[i]);
          connectedDevices = `${connectedDevices}   ${deviceArray[i]} &nbsp;`;
        if (await btsp.isDeviceAudiosink(deviceArray[i]) === true) {
          //console.log(aux.timeStamp(),"state: speaker is", deviceArray[i]);
          speakerDevices = `${speakerDevices}  ${deviceArray[i]} &nbsp;`;
        };
      };
    };
    return [connectedDevices, speakerDevices]
  }
  else {
    return ["", ""]
  };
};
//================================================================= machine page
//Functions below are for generating rendering formats for global variables:
//machine, stream, restart, playlist and shuffledPlaylist.
async function renderMachinePlayback(machine) {
  let playState = play.playback;
  let frameData = {playing: playState.playing, current: playState.current, mpdPaused:
                  playState.mpdPaused, elapsed: "", timer: "", mpdBusy: playState.mpdBusy,
                  volume: machine.volume, startVolume: machine.startVolume, repeat:
                  playState.repeat, shuffle: playState.shuffle, streaming:
                  machine.streaming, playback: machine.playback };
  frameData.elapsed = aux.secondsToTimeString(playState.elapsed);
  if (playState.timer === false) {
    frameData.timer = false;
  }
  else {
    frameData.timer = true;
  };
  return frameData;
};

function renderMachineConnections(machine) {
  let frameData = {bluetooth: "",
                  bluetoothSpeakers: JSON.stringify(machine.bluetoothSpeakers.speakers),
                  connectedSinks: String(machine.connectedSinks),
                  wifi: JSON.stringify(machine.wifi),
                  hotspot: JSON.stringify(machine.hotspot),
                  lan: JSON.stringify(machine.lan),
                  internet: String(machine.internet),
                  usb: String(play.playback.usb), usbPath: String(play.playback.usbPath),
                  webServer: ""};
  frameData.bluetooth =
      `${machine.bluetooth.bluetooth} &nbsp; ${machine.bluetooth.mac}<br>Devices = <br>
       ${JSON.stringify(machine.bluetooth.devices)} `;
  if (machine.webServer === false){
    frameData.webServer = "false"
  }
  else {
    frameData.webServer = "true"
  };
  return frameData;
};

function renderStream(machine) {
  let essentials = {status: machine.status}
  return JSON.stringify(essentials);
};

function renderRestart(restart) {
  return JSON.stringify(restart);
};

async function renderPlaylist() {
  //let playlist = play.playlist;
  let playlist = await play.getPlaylist();
  //let shuffledPlaylist = play.shuffledPlaylist;
  let shuffledPlaylist = await play.getShuffledPlaylist();
  let frameData = {listLength: playlist.length, firstTrack: "{&nbsp; &nbsp;}", shuffle: "[&nbsp;] [&nbsp;]"};
  if (playlist.length > 0) {
    frameData.firstTrack = JSON.stringify(playlist[0]);
  };
  let played = shuffledPlaylist.played.length;
  let notPlayed = shuffledPlaylist.notPlayed.length;
  if ((notPlayed > 0) || (played > 0)) {
    frameData.shuffle = `<b>[${played} tracks]  &nbsp; - &nbsp; [${notPlayed} tracks] </b><br>To be played: ${shuffledPlaylist.notPlayed} `
  };
  return frameData;
};

async function renderBtSinks() {
  let connected = await btsp.getConnectedSinks(false); //false = stored value
  let trusted = await btsp.getTrustedSinks(false);   //false = stored value
  return {connectedSinks: String(connected), trustedSinks: String(trusted)};
};

async function renderBtSources() {
  let sources = await blut.getConnectedSources(false); //false = stored value
  return {connectedSources: String(sources)};
};
