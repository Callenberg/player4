//Copyright 2022 by Retro Audiophile Designs
//GNU General Public License v3.0 see license.txt            [Source code]
//                      ~ machine - data model ~

module.exports.setModel = setModel;
module.exports.getStreaming = getStreaming;
module.exports.getPlayback = getPlayback;
module.exports.isService = isService;
module.exports.getService = getService;

//[M] MODEL definition =================================================== model
// There are three global variables holding objects:
//   [0] machineCtl defined in MachineObject
//       Defines status, audio output and network connections.
//   [1] streamCtl defined in StreamObject
//       Defines streaming services in detail, -- mainly old legacy version 3.xxx
//   [2] restartCtl defined in RestartAndRecoverObject
//       Defines wait times and blockers.

//Initialize model as global variables, exported in 'setModel()' below.
let machineCtl = new MachineObject();
let streamCtl = new StreamObject();
let restartCtl = new RestartAndRecoverObject();

//DEFINITIONS:
// [1] machine - main object of Player
function MachineObject() {
//a.) status of Player
  this.status = "idle";
  //"idle", "bluetooth", "spotify", "airplay", "playback", "upnp"
//b.1) audio output analogue amplifier
  this.amplifier   = true;  //strict boolean, if unmuted = true NOT IN USE
  this.volume      = 100;   //integer, current volume
  this.startVolume = 100;   //integer, changes in event "mpd-start-volume"
//b.2) audio output Bluetooth speaker
  //speakers: format is [ {name: "", mac: "",  connected: boolean},...]
  //connectedSinks: format is [ "" ] or [] - stores the connected spkr or empty
  this.bluetoothSpeakers = {speakers: []}; //speakers are sink devices
  this.connectedSinks = []; //mac address of the only connected spkr in an array,
                            //at the moment one bt spkr at the time.
//b.3) web server and pages
  //web server -- maybe not needed? related to mpd issues, needs rewrite
  this.webServer = false; //true if web server has been ordered to start
//c.) network connections
  //machine.bluetooth.bluetooth = true means bluetooth is on...
  // where devices: [] means no connected phones, they are source devices
  // devices: format is  [ {name: "", mac: "" , connected: boolean},...]
  this.bluetooth = {bluetooth:false, mac: "", devices: [] };
  //wifi = false means machine is not connected to a network, wifi service always on
  this.wifi = {wifi:false, ip: "", ssid: "", tentative: ""};
  //hotspot = false means hotspot is not on, no local machine wifi AP
  this.hotspot = {hotspot:false, ip: "10.0.0.10"};
  //lan = false means no cable attached to LAN port, no ethernet
  this.lan = {lan:false, ip: ""};
  //internet = true if the Player has Internet access
  this.internet = false;  //strict boolean
};
//helper to read values of machine - see machine.streaming above
//(a better name would have been 'isStreaming', but this is kept for legacy)
function getStreaming() {
  let result = false;
  switch (machineCtl.status) {
    case "spotify":
    result =  true;
    break;
    case "bluetooth":
    result =  true;
    break;
    case "airplay":
    result =  true;
    break;
    case "upnp":
    result =  true;
    break;
    default:
    break;
  };
  return result;
};
//helper to read values of machine - see machine.playback above
//(a better name would have been 'isPlayback', but this is kept for legacy)
function getPlayback() {
  if (machineCtl.status === "playback") {
    return true;
  }
  else {
    return false;
  };
};
// [1] streaming services js object for Player - singleton, persistent
function StreamObject() {
  //streaming service on or off
  this.bluetoothStreaming = false;
  this.spotify = false;
  this.airplay = false;
  this.upnp = false;
  this.upnpStreamed = false; //true if upnp streamed during a streaming session
};
//helper to read values of machine - see stream object above
//(a better name would have been 'whatService', but this is kept for legacy)
function isService(service) {
  if (machineCtl.status === service) {
    return true;
  }
  else {
    return false;
  };
};
//helper to read status of machine (the function name is okay)
function getService() {
  return machineCtl.status;
};
//restart js object for Player - singleton, persistent
function RestartAndRecoverObject() {
  this.isWifiConnecting = false; //true is wifi connection going on - for spinner
  this.token = false; //strict boolean, true if UI needs to be blocked during restart
  this.pause = 28000; //msec, time to wait for network events before starting again
};


//-----------------------------------------------------------------------------
function setModel() {
  //Create the machine main object for backend
  //let machineCtl = new MachineObject();
  module.exports.machineCtl = machineCtl;  //exported to machine & lib files
  //Create the streaming services object for backend
  //let streamCtl = new StreamObject();
  module.exports.streamCtl = streamCtl;     //exported to machine & lib files
  //Create the restart and recovery object for backend
  //let restartCtl = new RestartAndRecoverObject();
  module.exports.restartCtl = restartCtl;   //exported to machine & lib files
  streamCtl.bluetoothStreaming = isService("bluetooth");
  streamCtl.spotify = isService("spotify");
  streamCtl.airplay = isService("airplay");
  streamCtl.upnp = isService("upnp");
  return true;
};
