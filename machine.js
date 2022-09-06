//Copyright 2022 by Retro Audiophile Designs
//GNU General Public License v3.0 see license.txt            [Source code]
//        ~ machine - backend control of RAD Network Music Player ~
const aux = require('/player/lib/machine-auxiliary.js'); //auxiliary functions
//BOOT sequence starts ================================================= bootctl
console.log("\n");
console.log("\nPlayer is now booting: . . . . . . . . . . . . . . . . . . . . .");
const RAD_SYSTEM_VERSION ="4.051A [open source]";//official version
console.log("Version:", RAD_SYSTEM_VERSION);
console.log("Copyright 2022 by Retro Audiophile Designs, all rights reserved.");
console.log(aux.timeStamp(),"====================================");
//Required modules . . .
const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synced Raspbian cmds
const loop = require('/player/lib/machine-loop.js');//loop ctl
const expr = require('./machine-routing.js');       //web server
const mod =   require('./machine-model.js');        //view of machine
const view = require('./machine-view.js');          //view of machine
const nwork = require('./lib/machine-network.js');  //network & bluetooth mngt
const hot = require('./lib/machine-hotspot.js');    //wifi hotspot mngt
const usb = require('./lib/machine-usb.js');        //usb mngt
const mpd = require('./lib/machine-mpd.js');        //music player daemon
const play = require('./lib/machine-playback.js');  //playback service
const blut = require('./lib/machine-bluetooth.js'); //bluetooth for smart phone
const btsp = require('./lib/machine-audiosink.js'); //bluetooth for speakers
const res = require('./lib/machine-restart.js');    //restart streaming
const spot = require('./lib/machine-spotify.js');   //spotify - raspotify
const air = require('./lib/machine-airplay.js');    //airplay - shairport
const upnp = require('./lib/machine-upnp.js');      //upnp - upmpdcli (NOT USED)
//const stat = require('./lib/machine-state.js');     //show status functions

//Control functions exported to machine-view.js
//Distribute the right version for Player software
module.exports.getPlayerVersion = getPlayerVersion;
//Global Variable machine and G V mod.machineCtl in machine-model.js setters
module.exports.setMachineStatus = setMachineStatus;
//Volume control; USB Playback page
module.exports.setVolume = setVolume;
//Connections controls; Player (start page), Bluetooth and Wi-Fi pages
module.exports.clearUnknownDevices = clearUnknownDevices;
module.exports.scanForBtSpeakers = scanForBtSpeakers;
module.exports.connectBtSpeaker = connectBtSpeaker;
module.exports.disconnectBtSpeaker = disconnectBtSpeaker;
module.exports.untrustBtSpeaker = untrustBtSpeaker;
module.exports.disconnectBtDevice = disconnectBtDevice;
module.exports.connectNetwork = connectNetwork;
module.exports.disconnectNetwork = disconnectNetwork;
module.exports.scanForWiFi = scanForWiFi;
module.exports.connectWiFi = connectWiFi;
//Settings controls; Setting page
module.exports.setStartupVolume = setStartupVolume;
module.exports.restartPlayer = restartPlayer;
module.exports.restartStreamingServices = restartStreamingServices;

//[M] Model related global variables (Global Variables)
var machine;
var stream;
var restart;

//[V] View related global variables...
var io;   //will hold socket.io server object

//[C] Control - Immediately-Invoked Function Expression (IIFE) for boot control
( () => {
  bootPhaseOne();
})()

//Boot main control sequence - 'continueBoot()' called after mpd is ready
async function continueBoot() {
  //console.log(aux.timeStamp(),"Boot Continues:_____________________________");
  await bootPhaseTwo();
  await bootPhaseThree();
};

async function bootPhaseOne(){
  console.log(aux.timeStamp(),"Boot Phase: prep-----------------[1] started");
  await modelPreparations();       //(1.1) set up model

//A. stop services during boot to get a stable state for the Player pages
  await mpd.seekStopMPC(); //stop mpc, it just stops here, no other updates
  //Below; false --> indicates boot phase for each function, no notifications
  await spot.raspotifyBootPreparations(false); //stop librespot services
  await air.shairportBootPreparations(false);  //stop shairport-sync services
  //NOTE: upnp is NOT stopped, also mpd is NOT stopped.
  //await upnp.upmpdcliBootPreparations(false);  //stop upmpdcli services?????
  //await upnp.restartUpmpdcli();  //restart upmpdcli services is better!
  await loop.loopCtlBootPreparations(); //clear timers, reset log files

//B. set output (amp or bt speaker)
  await aux.soundBootPreparation();//reset alsa volume of amp to 100%
  await outputPreparations();     //(1.2) define output (amp or bt speaker)

//C. connect to mpd and prepare user USB mount and detection
  await usb.usbBootPreparations();  //mount /mnt/usb (user's usb)
  await mpd.mpdBootPreparations(); //connect to mpd sockets and does settings
//D. (1.3) Boot continues with the event 'mpd-ready' caught below, now wait...
};

async function bootPhaseTwo() {
  //...wait is over, this is called after mpd is ready (1.3 'mpd-ready')
  console.log(aux.timeStamp(),"Boot Phase: at boot--------------[2] started");
  await nwork.wifiBootPreparations();//get iface right for wi-fi + no power save
  await blut.bluetoothctlBootPreparations(); //start the btctl terminal
  await loop.loopCtlAtBoot();    //start all critical timers
  //Ready to start up user interface - the Player pages
  bootWebServer();               //(1.4)  start webserver, no await needed
  await aux.sleep(500).then( () => {
    blut.bluetoothctlAtBoot();    //start listen to bluetoothctl events
    spot.raspotifyAtBoot();       //start Spotify service
    air.shairportsyncAtBoot();    //start Airplay service
  });
};

async function bootPhaseThree(){
  console.log(aux.timeStamp(),"Boot Phase: nwork----------------[3] started");
//Update all connections
  await networkBootPreparations();//(1.5) set network
  await nwork.lanWatcher();       //start to watch for cable attached/detached
  console.log(aux.timeStamp(),"=================================[4] wrap up");
  await endBootPhase();          //(1.6) wraping up, play startup sound
  aux.sleep(2500).then(async() => {
    //too short time interval here yields minor error in 'play.mpdDbScanned()'
    renderCtl();                //(1.7) render all pages, boot almost ends here
  });
};
//BOOT sequence ends =============================================== end bootctl

//[C] BOOT functions of machine ========================= boot control functions
//    NOTE: Boot phase one ends with a wait for mpd to become ready.
//          When the event is caught boot continues with 'continueBoot()'

/**(1.1) boot control for retrieving the model of the machine. I.e. the three
 * objects 'machineCtl', 'streamCtl' and 'restartCtl' from machine-model.js
 * The naming here is because of old legacy naming in the older versions 3.xxx
 * @global {machine}  import from; machine-model.js => GV: machineCtl
 * @global {stream}   import from; machine-model.js => GV: streamCtl
 * @global {restart}  import from; machine-model.js => GV: restartCtl
 * @return {boolean}  true
 */
 async function modelPreparations() {
   await mod.setModel();
   await aux.sleep(100).then(() => {
     console.log(aux.timeStamp(),"machine: . . . setting up model  < >");
     machine =  mod.machineCtl;
     stream =   mod.streamCtl;
     restart =  mod.restartCtl;
   });
   return true;
 };
/**Helper, sets the status of the machine, i.e machine.status, it is used by
 * various functions in machine-playback.js. This function sets the
 * mod.machineCtl.status, see machine-model.js.
 * @param {string}     newStatus,
 * @global {machine}   status set to newStatus
 * @return {string}    value of newStatus
*/
function setMachineStatus(newStatus) {
    machine.status = newStatus;
    return newStatus;
};
/**(1.2) boot control for defining the output, analogue or digital.
 * i)  analogue output is the amplifier, its sound card and alsa
 * ii) digital output is connected Bluetooth speaker, wlan0 and bluealsa-aplay
 * The output will affect mute/unmute of amp and the asound.config file
 * @global {machine}  .connectedSinks; set the array (only one sink)
 * @global {machine}  .amplifier; set false or true if analogue output
 * @return {boolean}  true
 */
async function outputPreparations() {
  //below; true --> actual value in real time
  let connectedSinkArray = await btsp.getConnectedSinks(true);
  let isAmpMuted = await btsp.isAmpMuted();
  machine.connectedSinks = connectedSinkArray;
  if (connectedSinkArray.length > 0) {
    console.log(aux.timeStamp(),"machine: <| bt speaker connected:", connectedSinkArray);
    //below; true --> connect bt, i.e. mute amp and add asound.conf file, also
    //       deletes any old asound.conf
    await btsp.btAmpManagement(true, connectedSinkArray[0]);
    machine.amplifier = false;
    await res.restartBluealsaAplay(true); //true -> no restart of bt detect loop
  }
  else {
    btsp.disableAsoundConf(); //delete any asound.conf in /etc
    if (isAmpMuted === true) {
        btsp.muteUnmuteAmp(true);  //true --> unmutes amp
    };
    machine.amplifier = true;
  };
  return true;
};
/**(1.3) boot control to catch when mpd socket is set and connection is done.
 * This is an event fired of in playback that comes from 'mpdBootPreparations()'
 * at event E1 (mpd fires off).
 * Any user USB is not yet scanned here, that continues in 'mpd.rescanMPD()'.
 * Boot phase two can now begin by calling 'continueBoot()'.
 * @event  {playback}      'mpd-ready' might take 30 s sometimes
 * @return {?}              of no interest
 */
play.signal.on('mpd-ready', function(data) {
  console.log(aux.timeStamp(), "machine: mpd is ready, === == = - ~");
  continueBoot();
});
/**(1.4) boot control for setting up the view of the machine. I.e. the web user
 * interface and frontend protocol that interfaces the control part of Player.
 * @global {machine}  set .webServer to true
 * @global {io}       set/send socket.io server object; to lib file functions
 * @return {boolean}  of no interest
 */
async function bootWebServer() {
  //creates socket.io server, which also is exported, web server starts here
  let ioObject = await expr.startWebServer();
  io = ioObject;                   //set 'io' to socket.io server object
  play.playbackAtBoot(ioObject);   //send 'io' to machine-playback.js
  view.viewAtBoot(machine, restart, ioObject);//send model objects to view
  //get the machine a chance to set up status and then set up user interface
  aux.sleep(500).then(() => {
    view.setupFrontEndProtocol(ioObject);     //start listening on 'io'
  });
  return true;
};
/**(1.5) boot control for Network - check if there are any connections at boot
  * time. Set the new network values for the machine so the connections can be
  * rendered. The lanWatcher for monotoring the lan port was started first thing
  * at boot.
  *    bluetooth = true -> bluetooth network is on, there might be connections
  *    lan = true -> there is an Ethernet cable attached to Player
  *    wifi = true -> the machine is connected to a wifi network, .ssid
  *    hotspot = true -> only if machine is not connected to a wifi [wlan0]
  *    hotspot = can be true even if connected to a wifi [wlan0 + wlan1]
  *    internet = true -> there is internet access
  * Initial boot values was set when the machine object was created earlier.
  * @global {machine}     set .bluetooth .lan .wifi and .hotspot
  * @return {boolean}     true
  */
 async function networkBootPreparations() {
   let internet = await nwork.isInternet();        //return "1" or "0"
   let bluetooth = await nwork.readBluetoothHci(); //returns a boolean
   let lan = await nwork.readLanIpAddress(); //returns only ip address as string
   let wifiObject = await nwork.readSSIDandIpAddress(); //returns an object
   let isThereHotspot = await hot.isHotspotOn();   //returns a boolean value
   console.log(aux.timeStamp(),"machine: network preparations started");
//A: Internet access
   if (internet === "1") {
     machine.internet = true;
   }
   else {
     machine.internet = false;
   };
//B: Bluetooth service, sources, sinks (but connected sink already set)
   await blut.unpairAllDevices(true);//true means sources only
   //sets the .mac in machine even if bluetooth service is off
   machine.bluetooth.mac = await nwork.setBluetoothMac();
   //Bluetooth might be on at boot, there might be connected bluetooth devices
   if (bluetooth === true) {       //changes only when bluetooth service = true
     //Below; true --> no update signal emitted during boot [see below]
     let bluetoothUpdate = await nwork.updateBluetoothConnections(true);
     //Below; false => stored value is good, the value just updated, see above
     let connectedSinks = await btsp.getConnectedSinks(false);
     machine.bluetooth.bluetooth = bluetoothUpdate.bluetooth;
     machine.bluetooth.devices = bluetoothUpdate.devices;
     machine.bluetoothSpeakers.speakers = bluetoothUpdate.speakers;
     //machine.connectedSinks was set in 'outputPreparations()' - see above
   };
   //An Ethernet cable might be attached, if so add the ip address
   if (lan != "") {
     machine.lan = {lan: true, ip: lan};
   };
   //Machine might be connected to a network as well
   if (wifiObject.wifi === true) { //connected to a wifi network
       machine.wifi = wifiObject;  //and update new connection data
   };
   //check Hotspot service... and if no connections start-up hotspot
   if (isThereHotspot === true) {
       console.log(aux.timeStamp(),"machine: ...hotspot service was already on [AP]");
       machine.hotspot = await hot.readHotspotIp(); //returns a full  object
       //However, if a bt spkr is connected AP always has to be turned off
       if (machine.amplifier === false) {
         await nwork.turnOffAP();
       };
     }
     else {
       //hotspot starts always if there are no wireless connections
       //even if there is a bt spkr connected.
       if (wifiObject.wifi === false) { //hotspot starts always
           console.log(aux.timeStamp(),"machine: ...starting hotspot service at boot [AP]");
           machine.hotspot = await hot.startHotspot(); //returns a full object
         };
       };
   console.log(aux.timeStamp(),"machine: |bluetooth", bluetooth,"|internet", internet,"|ap",machine.hotspot.hotspot,"|" );
   console.log(aux.timeStamp(),"machine: |lan", lan,"|wifi", wifiObject.ssid, wifiObject.ip,"|");
   return true;
 };
 /**A little helper for network updates bluetooth services, finds mac address.
  * This is the controller mac and can get retrieved by
  * 'sudo bluetoothctl show | grep Controller | cut -d' ' -f2'
  * This function can be moved to machine-network.js or to machine-bluetooth.js
  * @global {machine}         set the bluetooth mac address
  * @return {string}          mac address
  */
 function setBluetoothMac() {
   let controllerMac = "";
   try {
     controllerMac =
       aux.mpdMsgTrim(
           execSync(`sudo bluetoothctl show | grep Controller | cut -d' ' -f2 `,
                   {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000}));
   }
   catch (err) {  //nothing can be done here, its an ERROR
     controllerMac = "";
     console.log(aux.timeStamp(),"machine: no bt controller mac found - ERROR\n", err);
   };
   machine.bluetooth.mac = controllerMac;
 };
/**(1.6) boot control for ending the phase, start control loops and play sound.
 * @global {machine}  get startup volume
 * @return {boolean}  of no interest
 */
async function endBootPhase() {
  console.log(aux.timeStamp(),"machine: amp muted?", await btsp.isAmpMuted(),"<| ) ) )");
  await aux.startupSound(machine.startVolume);
  console.log(aux.timeStamp(),"===================================|");
  console.log(aux.timeStamp(),"Player Boot Completed in:");
  await console.log(execSync(`sudo systemd-analyze time`,
      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000} ));
  console.log("Boot residue  . . . . . . . . . . . . . . . . . . . . . . . |")
  return true;
};
/**(1.7) boot control for ending the phase. Boot phase ends here...
 * Render any previously open pages, also done automatically by socket.io
 * @global {io}      socket.io server
 * @return {boolean} always true
 */
async function renderCtl() {
  view.startPageFrameData();                      //this renders full start page
  io.emit('bluetooth', await view.bluetoothFrameData());   //bt page
  io.emit('wifi', await view.wifiFrameData("page opens")); //connections
  io.emit('settings', await view.settingsFrameData());     //internet access
  play.renderAllPlayerPlaylistPages();            //renders 2 playback pages
  play.mpdDbScanned(false);   //false -> update all usb pages, usb list page
  return true;
};
/**Extra helper to distribute the current version of Player software
 * Used by 'view.stateHeaderFrameData()' for 'player.local/playerstate' page
 * @global {RAD_SYSTEM_VERSION}      - the current version
 * @return {string}                    the value of RAD_SYSTEM_VERSION
 */
function getPlayerVersion() {
  return RAD_SYSTEM_VERSION;
};
/**Extra helper to catch when the web server has called all its commands and
 * that io the socket.io server object is recieved by playback.
 * @event  {playback}      'io-set'
 * @return {?}              of no interest
 */
play.signal.on('io-set', function(data) {
  machine.webServer = true;
});
/**Extra helper to catch when mpd has scanned any connected ubs-stick
 * This is a notification. The scan is initiated in 'mpd.mpdAtBootMPC()'
 * using sudo mpc and 'mpd.rescanMPD()' when a usb is attached/detached using
 * mpd command from mpd.js.
 * @event   {mpd}      'mpd-db-scanned' might take 30 s sometimes
 * @global  {machine}  .webServer, read value and hope it is true here
 * @return  {?}         of no interest
 */
mpd.signal.on('mpd-db-scanned', async function(data) {
  if (play.playback.usb !== false) {
    console.log(aux.timeStamp(), "machine: usb stick scanned for mpd     [...]");
    aux.sleep(4000).then(() => {      //must wait here...
     //below;   io --> socket.io, render all open usb list pages
     if (machine.webServer === true) {
         play.mpdDbScanned(io);
         console.log(aux.timeStamp(), "machine: usb stick ...rendered!        [...]");
         console.log(". . . . . . . . . . . . . . . . . . . . . . . . . . . . . . X");
     }
     else {
       console.log(aux.timeStamp(), "machine: usb stick wait for webserver  [...]");
       console.log("! . . . . . . . . . . . . . . . . . . . . . . . . . . . . . !");
       aux.sleep(10000).then(() => {   //must wait even more...
         if (machine.webServer === true) {
             //below;   io --> socket.io, render all open usb list pages
             play.mpdDbScanned(io);  //...and hope for the best
           };
       });
     };
   });
  };
});
//==============================================================================
//[C.2] Control of services ============================= streaming service ctl
//Most events here are fired by 'loop.newStreamingStatus()'
// - - - - - - - -- - - - - - - - - - - - - - - - - - - - - - - - - USB Playback
/**Stream control; USB playback has the alsa and playback has started.
 * @event  {loop}  'usb-play' playback has started, loop.mpdloop()
 * @return {?}      of no interest
 */
 loop.signal.on('usb-play',function () {
   //console.log(aux.timeStamp(),"USB playback: START request |>");
   machine.status = "playback";
   res.startSelectiveStreaming("usb");
 });
/**Stream control; USB playback has stopped, unblock all streaming services
 * @event  {loop}  'usb-stop'
 * @return {?}      of no interest
 */
 loop.signal.on('usb-stop',function () {
   //console.log(aux.timeStamp(),"USB playback: STOP request ||");
    machine.status = "idle";
   res.removeSelectiveStreaming("usb");
 });
 // - - - - - - - -- - - - - - - - - - - - - - - - - - - - - Bluetooth streaming
 /**Stream control; Bluetooth is streaming audio to player. Note that If no
  * other streaming is going on - bluetooth grabs alsa and starts streaming.
  * Even if something else is streaming Bluetooth waits until alsa is free.
  * @event  {loop}  'blue-play
  * @global {io}    render notification
  * @return {?}     of no interest
  */
 loop.signal.on('blue-play', function () {
   machine.status = "bluetooth";
   //stream.bluetoothStreaming = true;  //depricated way of indicating bt
   busyStreaming();
   res.startSelectiveStreaming("blue");
   io.emit("herald", {type: "mishap", missive: `Bluetooth Streaming Started...<br>`,
                      duration: 3000});
 });
/**Stream control; Bluetooth stopped streaming for some reason.
  * @event  {loop}  'blue-stop'
  * @return {?}     of no interest
  */
 loop.signal.on('blue-stop', function () {
   machine.status = "idle";
   //stream.bluetoothStreaming = false;
   streamingStopped();
   res.removeSelectiveStreaming("blue");
 });
// - - - - - - - -- - - - - - - - - - - - - - - - - - - - - -  Airplay streaming
/**Stream control; Airplay has started streaming.
 * @event  {loop}  'airplay-play'
 * @global {io}    render notification
 * @return {?}     of no interest
 */
loop.signal.on('airplay-play', function () {
  machine.status = "airplay";
  //stream.airplay = true; //depricated way of indicating airplay
  busyStreaming();
  res.startSelectiveStreaming("air");
  io.emit("herald", {type: "mishap", missive: `AirPlay Streaming Started...<br>`,
                     duration: 3000});
});
/**Stream control; Airplay has stopped/paused.
 * @event  {loop}  'airplay-stop'
 * @return {?}      of no interest
 */
loop.signal.on('airplay-stop', function () {
  machine.status = "idle";
  //stream.airplay = false;
  streamingStopped();
  res.removeSelectiveStreaming("air");
});
// - - - - - - - -- - - - - - - - - - - - - - - - - - - - - -  Spotify streaming
/**Stream control; Spotify has started to play and stream.
 * @event  {loop}  'spotify-play'
 * @global {io}    render notification
 * @return {?}     of no interest
 */
loop.signal.on('spotify-play', function () {
  machine.status = "spotify";
  busyStreaming();
  res.startSelectiveStreaming("spot"); //Stop other streaming services
  io.emit("herald", {type: "mishap", missive: `Spotify Streaming Started...<br>`,
                     duration: 3000});
});
/**Stream control; Spotify has not only stopped streaming, it has closed the
 * connection to Player, i.e. the user has choosen another device than Player.
 * @event  {loop}  'spotify-stop'
 * @global {io}    render notification
 * @return {?}     of no interest
 */
loop.signal.on('spotify-stop', function () {
  machine.status = "idle";
  streamingStopped();
  res.removeSelectiveStreaming("spot");
});
// - - - - - - - -- - - - - - - - - - - - - - - - - - - - - - - - UPnP streaming
/**Stream control; UPnp has started to stream over mpd. Any playback playlist
 * is cleared and 'single' is set to off in mpd. upmpdcli took over.
 * @event  {loop}   'upnp-play'
 * @global {io}     render notification
 * @return {?}      of no interest
 */
loop.signal.on('upnp-play', function () {
  machine.status = "upnp";
  busyStreaming();
  res.startSelectiveStreaming("upnp");
  io.emit("herald", {type: "mishap", missive: `UPnP Streaming Started...<br>`,
                           duration: 3000});
});
/**Stream control; UPnp has stopped. Stop (and pause) of UPnP streaming is more
 * complicated for the machine and is handled in nowStopUpnp() below.
 * @event  {loop}   'upnp-stop'
 * @return {?}      of no interest
 */
loop.signal.on('upnp-stop', async function () {
  machine.status = "idle";
  let mpdStatusInbox = await mpd.getmpdStatusInbox();
  //Be sure to send any mpd error messages along:
  // 1a. Stopped without any errors - upmpdcli is idle and no problem
  // 1b. Stopped with errors - upmpdcli is stopped with a problem
  nowStopUpnp("stop",
            (typeof mpdStatusInbox.status.error === "undefined"));
});
/**Stream control; UPnp has paused. This is a more rare event. Mostly it Stops.
 * @event  {loop}   'upnp-paused'
 * @return {?}      of no interest
 */
loop.signal.on('upnp-paused', async function () {
  machine.status = "idle";
  let mpdStatusInbox = await mpd.getmpdStatusInbox();
  nowStopUpnp("pause",
              (typeof mpdStatusInbox.status.error === "undefined"));
      });

/**(2.1) - the UPnP streaming is stopped - detected in machine-loop.js.
* A stop/pause is more complicated for the machine:
* - there might be error message in mpd that needs to be cleared
* - any previous USB playback 'Playlist' needs to be restored (see further on)
 * There is a need to clear up the mpd and start all services again.
 * @params  {string}           state   , if pause order mpd to stop
 * @params  {boolean}          errorFLG, if upnp was stopped in error state
 * @return  {boolean}          of no interest
 */
async function nowStopUpnp(state, errorFLG) {
  stream.upnp = false;     //this is not done in the listener as for the others
  mpd.resetAfterUpnpMPD(state, errorFLG);
  streamingStopped(true);  //render; called from upnp = true
  res.removeSelectiveStreaming("upnp");
  return true;
};
/**(2.2) - streaming started, set state and mode, and finally render player
 * and playback pages (the latter have to be blocked by streaming services).
 * Effect of block: usb-list is shown, but playlist is hidden. The playlist is
 * still in order in  machine and current track is still there, but not shown.
 * There are two updates of playback page - maybe one can be deleted?
 * @global  {machine}                     set status streaming
 * @global  {io}                          render pages
 * @browser {player playback playlist}    render all open browsers
 * @return  {boolean}                     of no interest
 */
async function busyStreaming() {
  io.emit('status', machine.status);    //render status frame on start page
  io.emit('stream', await play.trackFrameData());    //render busy streaming
  io.emit('render', await play.playlistFrameData()); //render updated playlist
  io.emit('replace', await play.trackFrameData());   //update again
  return true;
};
/**(2.3) - streaming service stopped, Here UPnP streaming is special.
 * stream.upnpStreamed is true if upmpdcli has started during a streaming
 * session. It is set in the listener 'upnp-streamed' of machine-playback.js
 * since it effects playback. That flag has to be checked here. Since if UPnP
 * started, the mpd queue is not longer valid and has to be cleared. That call
 * is down here. Further on the current track of playback needs eventually to
 * get a new songId from mpd in order to be able to be played again.
 * There are two updates of playback page - maybe one can be deleted?
 * @params  {boolean}             calledByUPnP, upnp requires some extras
 * @Global  {machine}             .streaming .upnpStreamed, are set to false
 * @global  {io}                          render pages
 * @browser {player playback playlist}    render all open browsers
 * @return {boolean}                      of no interest
 */
async function streamingStopped(calledByUPnP) {
  machine.status =  "idle";
  io.emit('status', "idle");    //update status frame on start page
  io.emit('replace', await play.trackFrameData());   //render full playback page
  if ((calledByUPnP === true) ||
      (stream.upnpStreamed === true)) { //upnpStreamed is true if upnp started
        stream.upnpStreamed = false;    //clearing up after upmpdcli
        await play.recoverPlaylist();   //clears the mpd queue from UPnP
      };
  io.emit('render',  await play.playlistFrameData()); //render updated playlist
  io.emit('replace', await play.trackFrameData());    //render again
};
//==============================================================================
//[C.3] Control of backend for Player ===== USB Playback, Bluetooth, Wi-Fi Pages
//      NOTE: Backend functions for user button are called from machine-view.js
// A. USB Playback page buttons and sliders _______________ Backend for Playback
//NOTE: all functions except one is now to be found in machine-playback.js

/**(3.1) ...part of Playback - set volume of analogue amplifier through mpd
 * socket.io event: 'socket.on('volume', function (data) . . .'
 * Note: this is the exception, volume belongs to machine since it is noy only
 * playback oriented - it affects the whole Player audio system, also streaming.
 * Turn the volume up or down on mpd which set the volume at alsa level.
 * Another note: this has no effect when a Bluetooth speaker is connected!
 * @param  {object}       data new value for volume in percent
 * @param  {socket.io}    browser socket of a specific open web page
 * @global {machine}      set volume property values
 * @global  {io}          render notification and playback
 * @return {boolean}      true
 */
 async function setVolume(data, socket) {
   let newVolume = data.volume;
   if (typeof newVolume === "number") {
     if (await mpd.setVolumeMPC(newVolume)) {
       machine.volume = newVolume;
       io.emit('notice', {type: "info", missive:
                                        `Volume Set To ${newVolume} %`});
       socket.broadcast.emit('replace', await play.trackFrameData()); //endpoint
       io.emit('new-volume', newVolume);  //endpoint playback page
     }
     else {
       io.emit('replace', await play.trackFrameData());  //endpoint playback
       view.startPageFrameData();                  //endpoint start page
       io.emit("herald", {type: "error", missive: `Cannot set volume!<br>
                                                   Fatal error... <br>
                                                   -----------------<br>
                                                  <em>...try to restart Player</em>`,
                                                  duration: 35000});
     };
   };
   return true;
 };
 //Page B. Bluetooth page buttons ------------------------ Backend for Bluetooth
 /**(3.2) Bluetooth - scan for reachable Bluetooth audio sink devices.
  * socket.io event: 'socket.on('scan-speakers', function (data). . .'
  * Return the list as an array to the frontend Bluetooth page on the format:
  * [ { name: 'ENEBY30', mac: 'FC:58:FA:ED:57:60' }, ...]
  * @global {restart}      token on and token off
  * @global  {io}          render notification and Player page
  * @return{boolean}      false  ....of no interest
  */
  async function scanForBtSpeakers() {
    restart.token = true;  //no user interference during scanning, takes a while
    io.emit('notiz', {type: "long",
                      missive: `Scanning for Bluetooth Speakers...<br>
                                ----------------------------------<br>
                            <em>...this will take quite a while</em>`,
                      duration: 40000 });
    //Request scan . . .
    let btList = await btsp.btScan();
    if (btList.length !== 0) {
      io.emit('speakers', btList);          //end-point for now....
    }
    else {
      await io.emit("clear-dispatch", " -- scan clears");
      await io.emit('notiz', {type: "error",
                        missive: `"Could not find any Bluetooth Speakers<br>
                                   ----------------------------------<br>
                               <em>...check speaker, try again...</em>`,
                                                    duration: 18000 });
      nwork.updateBluetoothConnections();    //just in case
    };
    restart.token = false;
};
/**(3.3) Bluetooth - user wants to connect a Bluetooth audio sink device.
 * socket.io event: 'socket.on('connect-speaker', function (data) . . .'
 * Calls the btsp.btConnectCtl() and if that went well - done...
 * ... the connection will be caught by blut.bluetoothctlTerminal() and the
 * function btsp.connectedSink() will eventually emit one of two confirmations:
 *  + when connected 'bluetooth-speakerconnected' event will occur below
 *  - if it goes bad 'bluetooth-connection-failed' will happen instead
 * @param  {object}   data, {name: "", mac: ""}
 * @global {machine}  adds a connected speaker to bluetoothSpeakers
 * @global {io}       render notification and Player page
 * @return {boolean}  false  ....of no interest
 */
async function connectBtSpeaker(data) {
  restart.token = true;  //no user interference during connecting, takes a while
  let outcome = false;
  let bdaddr = data.mac;
  let spkrName = await washUnknownDevice(data.name, bdaddr); //fix name
  io.emit('notiz', {type: "long",
                    missive: `Try to connect to ${spkrName}<br>
                              --------------------------------<br>
                              <em>please wait...</em>`,
                    duration: 20000 });
  //request a connect . . .
  outcome = await btsp.btConnectCtl(bdaddr);
  //console.log(aux.timeStamp(), "machine: result of connection attempt =", outcome);
  if (outcome === true) {
    io.emit("clear-dispatch", " -- connect request clears");
    io.emit('herald', {type: "done",
                      missive: `Connected to ${spkrName}<br>
                                --------------------------------`,
                      duration: 20000 });   //-- end point
    restart.token = false;
  }
  restart.token = false;  //just in case
};
//Control of connect/disconnect events ___________________ Bluetooth speaker ctl
//bluetoothctl Watch - Detect - Identify Change - [Update Change - Render]
//The events below are fired from machine-audiosink.js

//Listener to update that the connection attempt failed in connectBtSpeaker()
btsp.signal.on('bluetooth-connection-failed', async function (data) {
  //Called by 'btsp.btConnectCtl()'
  io.emit("clear-dispatch", " -- connection fails clears");
  io.emit('herald', {type: "error",
                    missive: `Connection Failed!<br>
                              Could not connect to speaker<br>
                              -----------------------------<br>
                              <em>...check if the speaker is on</em>`,
                                                duration: 25000 });
  restart.token = false;                   //just in case...
 });
//Listener to update the succesful connection done in connectBtSpeaker() above
//Incoming data is on the format: (connected one first, trusted ones last)
//          {array: [{name: string, mac: string, connected: boolean}, ...] }
//LIMITATION: the number of bt speakers are set to one speaker here
btsp.signal.on('bluetooth-speakerconnected', async function (data) {
  //called by 'btsp.connectedSink()'
  let btArray = data.array;
  let noNotify = data.mode;
  !noNotify && io.emit('herald', {type: "done",
                    missive: `Sound is now redirected to be<br>
                              streamed with Bluetooth!<br>
                              --------------------------------<br>
                              <em>check volume of the speaker</em><br>`,
                    duration: 55000 });
  //Format for: machine.bluetoothSpeakers = {speakers: []};
  machine.bluetoothSpeakers = {speakers: data.array};
  machine.amplifier = true;
  //console.log(aux.timeStamp(), "machine: this is the incoming data =\n", data);
  if (btArray.length > 0) {
    machine.connectedSinks = [btArray[0].mac];
    io.emit('bluetooth', await view.bluetoothFrameData());
    io.emit('update-information', {type: "bt", btOn: true,
                                   spkr: btArray[0].name, mac: btArray[0].mac});
  }
  else { //Note: this is not normal, if in an error state this might happen
    machine.connectedSinks = [];
    io.emit('bluetooth', await view.bluetoothFrameData());
    io.emit('update-information', {type: "bt", btOn: true,
                                   spkr: "", mac: ""});
  };
  //console.log(aux.timeStamp(), "machine: after connect, btSpeaker =\n", machine.bluetoothSpeakers.speakers );
  //console.log(aux.timeStamp(), "machine: 2) connected sink Array     =\n", machine.connectedSinks );
});
//Listener to update after frontend has untrusted a bt speaker.
//Incoming data is on the format: (connected one first, trusted ones last)
//          {array: [{name: string, mac: string, connected: boolean}, ...] }
btsp.signal.on('bluetooth-speakeruntrusted', async function (data) {
  //Called by: 'btsp.btUntrustCtl()'
  //Format for: machine.bluetoothSpeakers = {speakers: []};
  machine.bluetoothSpeakers = {speakers: data.array};
  //console.log(aux.timeStamp(), "machine: after untrust, NOW: btSpeaker =", machine.bluetoothSpeakers.speakers );
  io.emit('bluetooth', await view.bluetoothFrameData());
});
//Listener to notify frontend that scanning is still happening.
//The event is emitted by btsp.frolicScan()
btsp.signal.on('bluetooth-scanning', function (data) {
  //Called by: 'btsp.findDevicesOn()', 'btsp.frolicScan()'
  if (data === true) {
    io.emit('notiz', {type: "long",
                    missive: `Still scanning for speakers, wait!<br>
                              ----------------------------------<br>`,
                    duration: 50000 });
  }
  else {
    io.emit('notiz', {type: "long",
                    missive: `...scanning is going on, wait!<br>
                              ----------------------------------<br>`,
                    duration: 50000 });
  };
});
/**Listener to manage the fact that some services needed to be restarted.
 * This event is fired by 'btsp.connectedSink()' after connect and by
 * 'btsp.disconnectedSink()' after disconnect. 'btsp.restartMpdAndStreaming()'
 * Bluetooth, Spotify and Airplay services have been required to restart here,
 * mpc is stopped, but upnp service is not touched since it relies on mpd.
 * Depending on what is going on the following might occur:
 * i) if current track was playing - playback is reset to no play, elapsed = 0
 * ii) if there is current track it is reloaded into mpc
 * iii) if UPnP streaming was on - 'machine.upnpStreamed' is set to false
 * Format of 'data', example:'{shouldNotify:true, who:"connectedSink"}'
 * The call 'io.emit('status', "idle")' is done here as well as setting of
 * 'machine.status' to "idle". Finally the hotspot state is updated - AP is
 * turned of for bt speaker.
 * NOTE: The 'bluetooth-speakerconnected' and 'bluetooth-speakerdisconnected'
 * events are fired [from btsp.connectedSink() or from disconnectedSink() ]
 * The call 'io.emit('bluetooth', await view.bluetoothFrameData())' is done
 * in 'bluetooth-speakerconnected' or 'bluetooth-speakerdisconnected'
 * since those are dealing with bluetooth matters, not here...
 * @global {io}       render notification and all pages
 * @event  {btsp}    'bluetooth-required-restart'
 * @param  {boolean}  data if 'shouldNotify' means notify + 'who' who called?
*/
btsp.signal.on('bluetooth-required-restart', async function (data) {
  let shouldNotify = data.shouldNotify;
  //let who = data.who;   //Not used - only for debugging
  let whichService = machine.status;
  //console.log(aux.timeStamp(), "machine: . . . status was", whichService,"before restart.");
  machine.status = "idle";
//Step 1: if there is a current track stop and it has to be reloaded again
  await play.resetPlayback(true);     //true -> no render; stops elapsing...
  await play.recoverPlaylist();//clears mpc and add current track into mpc again
//Step 2: specific actions for some services
  if (whichService !== "idle") {
      loop.stopStreamsensor("idle");
  };
  if (whichService === "upnp") {
    stream.upnpStreamed = false;
  };
  io.emit('status', "idle");
  play.renderAllPlayerPlaylistPages();
  if (whichService === "playback")  {
    shouldNotify && io.emit('herald', {type: "mishap",
                      missive: `The Bluetooth speaker required<br>
                                a reset of USB Playback.<br>
                                ----------------------------------------<br>
                                <em>...sorry...</em><br>`,
                      duration: 25000 });
  }
  else if (whichService !== "idle")  {
    shouldNotify && io.emit('herald', {type: "mishap",
                      missive: `The Bluetooth speaker required<br>
                                a reset of Player.<br>
                                ----------------------------------------<br>
                                <em>...start streaming again.</em><br>`,
                      duration: 25000 });
  };
  //if hotspot was on it has been ordered to stop, have to wait for shut down...
  aux.sleep(1000).then(async() => {
    io.emit('wifi', await view.wifiFrameData("bluetooth-speaker")); //render
    io.emit('update-information', view.connFrameData());          //render
  });
});
//disconnect _____________________________________________ Bluetooth speaker ctl
//Listener to update the disconnection done in 'disconnectBtSpeaker()' above
//Incoming data is on the format:
//            {array: [{name: string, mac: string, connected: boolean}, ...]
//The content of 'array:' is put in 'speakers:' of machine.bluetoothSpeakers
btsp.signal.on('bluetooth-speakerdisconnected', async function (data) {
  //Called by: btsp.disconnectedSink()
  //Format for: machine.bluetoothSpeakers = {speakers: [<spkr1>, <spkr2>,...]};
  let deviceArray = data.array;
  machine.bluetoothSpeakers = {speakers: deviceArray};
//LIMITATION: here the number of connected spkr is indirectly set to one
  let numberOfDevices = deviceArray.length;
  let connectedDevices = [];
  for (let i = 0; i < numberOfDevices; i++) {
    if (deviceArray[i]. connected === true) {
      connectedDevices.push(deviceArray[i].mac);
    };
  };
  machine.connectedSinks = connectedDevices;
  machine.amplifier = false;
  //console.log(aux.timeStamp(),"machine: after disconnect, btSpeaker =", deviceArray );
  //console.log(aux.timeStamp(),"machine: after disconnect, connected =", connectedDevices );
  io.emit('bluetooth', await view.bluetoothFrameData());  //render end-point
  let btObject = await view.btConnFrameData();
  io.emit('update-information', btObject);                //render end-point
});
/**(3.4) - frontend wants to disconnect a Bluetooth speaker.
 * socket.io event: 'socket.on('disconnect-speaker', function (data) {...'
 * @param  {object}   data, format: { mac: "", mode: boolean}
 * @global {io}       render notification and all pages
 * @return {boolean}  true  ....of no interest
 */
async function disconnectBtSpeaker(data) {
  //console.log("machine: btSpeaker disconnect...", data);
  let bdaddr = data.mac;
  let spkrName = await btsp.bluetoothDeviceName(bdaddr);
  //if (data.mode === false) {
  if (true) {
    io.emit('herald', {type: "long",
                    missive: `Disconnecting Bluetooth speaker:<br>
                              ${spkrName}<br>
                              any streaming or playback will be reset<br>
                              ---------------------------------------<br>
                              <em>please wait...</em>`,
                    duration: 8000 })};
  await btsp.btDisconnectCtl(bdaddr);  //actually returns true if successful
  //when disconnected 'bluetooth-speakerdisconnected' event below will occur
};
/**(3.5) - frontend wants to untrust a Bluetooth speaker from frontend, or
 * to untrust a phone. The procedure is the same.
 * socket.io event: 'socket.on('untrust-speaker', function (data) {...'
 * @param  {object}   data, format:  {mac: ""}
 * @global {io}       render notification
 * @return {?}  false  ....of no interest
 */
async function untrustBtSpeaker(data) {
  //console.log(aux.timeStamp(),"machine: untrust bt device...\n", data);
  let bdaddr = data.mac;
  let spkrName = await btsp.bluetoothDeviceName(bdaddr);
  if (false) {  //THIS IS NOT USED AT THE MOMENT
    io.emit('notiz', {type: "long",
                    missive: `Removing Bluetooth speaker:<br>
                              ${spkrName}<br>
                              -------------------------------------<br>`,
                    duration: 16000 })};
  await btsp.btUntrustCtl(bdaddr);  //actually returns true if successful
  //when disconnected 'bluetooth-speakerdisconnected' event below will occur
};
//handling of bluetooth source devices (i.e. phones)__________________ bt source
/**(3.6) - frontend wants to disconnect a Bluetooth source, a phone...
 * socket.io event: 'socket.on('disconnect-device', function (data) {'
 * @param  {object}   data, format:  {mac: ""}
 * @global {io}       render Bluetooth page
 * @return {?}  false  ....of no interest
 */
async function disconnectBtDevice(data) {
  //console.log(aux.timeStamp(),"machine: disconnect a streaming bt device [source]...", data);
  let bdaddr = data.mac;
  await blut.btDisconnectCtl(bdaddr);
  io.emit('bluetooth', await view.bluetoothFrameData());
};
//Connected here means that a bluetooth source device has connected to Player
blut.signal.on('bluetooth-connected', async function (data) {
  //data format is: {array: [], first: boolean, mode: boolean} mode = silent?
  //First update connection data to machine, render new connection information
  //console.log(aux.timeStamp(),"machine: bluetooth connect - data =\n", data);
  let devices = data.array;
  //let silently = data.mode;
  machine.bluetooth.devices = devices;
  const numberOfDevices = devices.length;
  if (numberOfDevices > 0) {
    let namestring = "";
    for (let i = 0; i < numberOfDevices; i++) {
      if (i !== 0) {
        namestring = `${namestring}, ${devices[i].name}`;
      }
      else {
        namestring = `${devices[i].name}`;
      };
    };
    io.emit('bluetooth', await view.bluetoothFrameData());
  }
});

//Catches source devices disconnected from bluetooth...
//(not a bluetooth speaker and not the bluetooth network itself)
blut.signal.on('bluetooth-disconnected', async function(data) {
  //First update connection data to machine and render new connection information
  //console.log(aux.timeStamp(),"Machine: Last Bluetooth SOURCE disconnected: [ empty ]");
  machine.bluetooth.devices = [];
  io.emit('bluetooth', await view.bluetoothFrameData());
});
/**Helper, clears the source devices objects in the machine from Unknown Device
 * that are not connected. There cannot be any unkonw devices trusted, But a
 * connected source device can have the name "Unkown Device". Used by
 * 'bluetoothFrameData()'. If an "Unknown Device" name exists it is because of
 * a mishap, it shouldn't be. The array in machine.bluetooth.devices has the
  following format:
 * Array: {devices: [{name:"phone", mac:"34:14:5F:48:32:F8"}, connected: false...] },
 * @param  {array}    devices on the format above
 * @global {machine}  read property, might result in a new value
 * @return {?}        of no interest here
 */
function clearUnknownDevices() {
  let devicesArray = machine.bluetooth.devices;
  let arrayLength = devicesArray.length;
  let isChanged = false;
  if (arrayLength > 0) {
    for (let i = 0; i < arrayLength; i++) {
      if ((devicesArray[i].name === "Unknown Device") &&
          (devicesArray[i].connected === false)) {
         btsp.btUntrustCtl(devicesArray[i].mac) //just in case, no sync here
         devicesArray.splice(i, 1);             //remove the "Unknown Device"
         isChanged = true;
       };
     };
     if (isChanged === true) {
      machine.bluetooth.devices = devicesArray; //new and cleaned array
    };
   };
 };
 /**Helper, checks the name of a sink devices, a speaker. If the name is
  * "Unknown Device" it has not been able to be retrieved. Try again by calling
  * 'btsp.bluetoothDeviceName()' - if it fails it returns "Unknown Device"
  * NOTE: This is only used for notification at reconnect of a bt speaker.
  *       Related to 'clearUnknownDevices()' above, but it deals with sources.
  * @param  {string}    spkrName, valid name or "speaker"
  * @param  {string}    bdaddr mac address
  * @return {string}    a name that can be display on a notification
  */
 async function washUnknownDevice(spkrName, bdaddr) {
   let washedName = "";
   if  ((spkrName === false)             ||
        (spkrName === "Unknown Device")  ||
        (spkrName === "unknown device")  ||
        (spkrName === ""))  {
    //try again to get the correct name
     washedName = await btsp.bluetoothDeviceName(bdaddr);
     if (washedName === "Unknown Device") {
       //oh no - the name is unknown, display "" as a notification
       washedName = "speaker";
     };
   }
   else {
     //there is a good name in place- return the name
    washedName = spkrName;
   }
   return washedName
  };
//______________________________________________________________________________
//B. Bluetooth and C. Wi-Fi page _______________________ Backend for connections
/**(3.7) Connections - startup bluetooth and hotspot network connection service
  * socket.io event: 'socket.on('connect-network', function (data) {...'
  * Note: Wi-Fi is started with connectWiFi()
  * Note: if there are two wi-fi ifaces hotspot can always start. When there is
  * one wi-Fi iface [optional] the hotspot cannot be on when connected to Wi-Fi,
  * but it is always allowed to be turn on even if there is a lan connection.
  * @param {object}       data, type of network connection
  * @global {machine}     sets network values, like ip addresses e.t.c.
  * @global {io}          render notifications and Player/Bluetooth page
  * @return{boolean}      true or false
  */
async function connectNetwork(data) {
  restart.token = true;  //no user interference during connection, takes a while
  switch(data.network) {
//Bluetooth ON - turns on the bluetooth network
    case "bluetooth":
    io.emit('notiz', {type: "info", missive:"Starting Bluetooth . . ."});
    machine.bluetooth.bluetooth = true;
    machine.bluetooth.devices = [];
    machine.bluetoothSpeakers.speakers = [];
    await nwork.startBluetooth();    //unblock rfkill
    blut.bluetoothUnblockStreaming();//enables pairing/discovery/power
    io.emit('bluetooth', await view.bluetoothFrameData()); //end-point, rendered
    let btObject = await view.btConnFrameData();
    io.emit('update-information', btObject);     //end-point, status is rendered
    restart.token = false;  //reset so user can access settings
    break;
//Hotspot ON - Access Point
    case "hotspot":
    io.emit('dispatch', {type: "info", missive:"Starting Hotspot . . ."});
    shouldHotspotStart("always");
    restart.token = false;  //reset so user can access settings
    break;
    default:
    aux.sleep(2000).then(() => { //hold it for 2 secs...
      nwork.updateConnections(); //try to rerender status and hope for the best!
      restart.token = false;  //reset just in case...
      return false;
    });
  };
};
/**(3.8) Connections - stops a network service
 * Note: Hotspot cannot be on when connected to Wi-Fi when there is only one
 * iface (wlan0). If a bt speaker is connected the AP should be off as well.
 * socket.io:  'socket.on('disconnect-network', function (data) {...'
 * @param {object}       data, type of network connection
 * @global {machine}     sets network values to false
 * @global {io}          render notifications and Player/Bluetooth page
 * @return{boolean}      false if things went wrong
 */
async function disconnectNetwork(data) {
  restart.token = true;  //no user interference during connection, takes a while
  switch(data.network) {
//Bluetooth off - turns off the bluetooth network service
    case "bluetooth":
    console.log(aux.timeStamp(),"Machine: request to STOP Bluetooth service...");
    io.emit('notiz', {type: "info", missive:"Stopping Bluetooth . . ."});
    await blut.unpairAllDevices(false);    //false -> Disconnect all bt devices
    await nwork.stopBluetooth();           //rfkill block bluetooth
    res.restartBluealsaAplay(false);       //false -> restart with new timer
    machine.bluetooth.bluetooth = false;
    machine.bluetooth.devices = [];
    machine.bluetoothSpeakers.speakers = [];
    io.emit('bluetooth', await view.bluetoothFrameData());    //render end-point
    io.emit('update-information', {type: "bt", btOn: false, spkr: "", mac: ""});
    restart.token = false;  //reset so users can use settings menu again
    break;
//Hotspot off
    case "hotspot":
    io.emit('dispatch', {type: "info", missive:"Stopping Hotspot . . ."});
    // logger.log("Machine: ...closing down Hotspot service");
    hot.stopHotspot();
    machine.hotspot = {hotspot: false, ip: "10.0.0.10"};
    io.emit('wifi', await view.wifiFrameData("STOP HOTSPOT"));//render end-point
    io.emit('update-information', view.connFrameData());
    restart.token = false;  //reset so users can use settings menu again
    break;
//Wi-fi off
    case "wifi":
    io.emit('dispatch', {type: "info", missive:"Disconnecting  Wi-Fi . . ."});
    console.log(aux.timeStamp(),"Machine: ...start to disconnect from Wi-Fi network!");
    nwork.wifiDisconnect(); //will eventually fire a disconnect event, wait
    //no explicit rendering needed here, done in event "wifi-disconnected"
    //no explicit resetting of machine.wifi needed as well, to early here ...
    // ... also restart.token is set to false at the event.
    break;
//Lan off? - pull out the cable, caught by nwork.lanWatcher
    default:
    // logger.log(aux.timeStamp(), "Machine: socket.io syntax error!");
    aux.sleep(2000).then(() => { //hold it for 2 secs...
      nwork.updateConnections(); //try to rerender status and hope for the best!
      restart.token = false;  //reset so users can use settings menu again
      return false;
    });
  };
};
//Control of Wi-Fi connect/disconnect ____________________________________ Wi-Fi
/**(3.9) Wi-Fi - scan for reachable wifi networks.
 * socket io: 'socket.on('scan-wifi', function (data) {..'
 * Return the list as an array to the frontend WiFi page on the format:
 * [ ssid ssid ...]
 * @global {io}          render notifications and Player page
 * @return{boolean}      false  ....of no interest
 */
async function scanForWiFi() {
  restart.token = true;  //no user interference during scanning, takes a while
  io.emit('dispatch', {type: "long",
                       missive: `Scanning for Wi-Fi Networks...<br>
                                 ----------------------------------<br>
                             <em>...this might take a while</em>`,
                       duration: 40000 });
 let wifiArray = await nwork.wifiScan();
 //console.log(aux.timeStamp(),"machine: wi-fi scan yielded this array:\n", wifiArray );
 if (wifiArray.length !== 0) {
       io.emit('wifi-networks', wifiArray);     //end-point for now....
     }
     else {
       await io.emit("clear-dispatch", " -- wifi scan clears");
       await io.emit('dispatch', {type: "error",
                         missive: `"Could not find any Wi-Fi networks<br>
                                    ----------------------------------<br>
                                <em>...try scanning again...</em>`,
                                                     duration: 18000 });
     };
     restart.token = false;
 };
/**(3.10) Wi-Fi - prepare wifi network connection attempt: check if there
 * already is a connection, then disconnect that and if hotspot is on,
 * stop service, unlessthere are two ifaces for wlan (wlan0 and wlan1)
 * socket.io event: 'socket.on('wifi-connect', function (data) {...'
 * Note 1: there should not be a connection to wifi network when this is called.
 * Note 2: if there are two ifaces hotspot should be on if it was on.
 * Note 3: if there are two wi-fi ifaces hotspot can always start. When there is
 * one wi-Fi iface [optional] the hotspot cannot be on when connected to Wi-Fi,
 * but it is always allowed to be turn on even if there is a lan connection.
 * @param {object}      data,  {ssid: string, password: string}
 * @global {machine}    set .hotspot if the service had to be stopped
 * @global {io}         render notifications and spinner
 * @return{boolean}    true
 */
async function connectWiFi(data) {
  restart.token = true;  //no user interference during connection, takes a while
  restart.isWifiConnecting = true;
  io.emit('wifi-connecting'); //start spinner
  io.emit('dispatch', {type: "long", missive:
                       `Connecting to  Wi-Fi...<br>
                        SSID: ${data.ssid}<br>
                        -----------------------<br>
                        <em>...this will take a while</em>`,
                        duration:15000});
  //console.log(aux.timeStamp(),"machine: incoming status for wi-fi: . . .");
  let hotspotWasOn = await hot.isHotspotOn();          //returns strict boolean
  //console.log(aux.timeStamp(),"machine:          a) hotspot?", hotspotWasOn );
  let wifiStatus = await nwork.readSSIDandIpAddress(); //returns object
  let wifiWasOn = wifiStatus.wifi;                     //returns strict boolean
  //console.log(aux.timeStamp(),"machine:          b) wi-fi?  ", wifiWasOn );
  let isWlan1 = await nwork.isWlan1();                 //returns strict boolean
  //console.log(aux.timeStamp(),"machine:          c) wlan1?  ", isWlan1 );

  //A: if wifi is on - disconnect it here and reconnect at C
  if (wifiWasOn === true) { //this should normally not be the case...
    //console.log(aux.timeStamp(),"Machine: already connected to:\n", wifiStatus.ssid,"Disconnect first before connecting.")
    await nwork.wifiDisconnect("off"); //"off" => just disconnect, right off
  };
  //B: if there is no wlan1 present - disconnect hotspot if it is on
  if ((isWlan1 === false) && (hotspotWasOn === true)) {
    //only one wi-fi iface - hotspot has to go down first
    console.log(aux.timeStamp(),"Machine: hotspot is on & must stop service");
    io.emit('dispatch', {type: "mishap", missive:
                           `The Player Hotspot shuts down.<br>
                            "10.0.0.10" will be disconnected.<br>
                            ------------------------------------<br>
                            `,
                            duration:15000});
    await hot.stopHotspot(true); //true => no check of wifi comming up needed
    machine.hotspot = {hotspot: false, ip: "10.0.0.10"};   //save hotspot down
  };
  //C: if the wi-fi was on (A above - disconnected it) and now reconnect again
  if (wifiWasOn === true)  {
    //shouldn't happen, wifi turned off above and this is a gracefully restart
    aux.sleep(8000).then(async () => { //wait for about 8 sec...
      console.log(aux.timeStamp(),"Machine: waiting is over, connecting to wifi network again");
      await connectAttemptWifi(data);
        });
  };
  if ((isWlan1 === false) && (hotspotWasOn === true))  {
    //D: if there is no wlan1 present - time to connect wifi after that hotspot
    //   is down; if hotspot was on, hopefully it was turned off above, wait...
    //   and finally connect
    aux.sleep(300).then(async () => { //wait for about 0.3 sec...  just in case
      console.log(aux.timeStamp(),"Machine: hotspot should be down - connecting to wifi network");
      await connectAttemptWifi(data);
        });
  }
  else {
    //E: hotspot was not on (wlan0 only) or it might be on if wlan0 and wlan1.
    //console.log(aux.timeStamp(),"machine: connecting to wifi network, two wlans?", isWlan1 );
    await connectAttemptWifi(data); //go for it...
  };
  return true;
};
/**Wi-Fi helper - attempt to connect to a wifi network. The result of the
 * connection is caught by listener events in the following order
 * "wifi-ssid-found" "wifi-wpa_cli", "wifi-still-connecting",
 * success "wifi-connected" or if it fails "wifi-connection-failed"
 * Error handling: "wifi-ssid-failed"
 * @param {object}       data,  {ssid: string, password: string}
 * @global {io}          render notifications
 * @global {machine}    .wifi.tentative, is set to the ssid
 * @return{boolean}      true or false
 */
async function connectAttemptWifi(data) {
  const ssidPart = data.ssid;
  if (ssidPart != false) {
    //console.log(aux.timeStamp(),"Machine: try to connect to wifi",ssidPart, "[", data.password, "]");
    machine.wifi.tentative = ssidPart;
    io.emit('wifi-connecting');
    await nwork.wifiConnect({ ssid: ssidPart, password: data.password});
    return true;
  }
  else {
    // logger.log(aux.timeStamp(),"Machine: no SSID supplied - no connection!");
    return false;
  };
};
/**Connection - check if there is Internet access
 * @return{boolean}      true or false (no Internet access)
 */
async function setInternet() {
  if (await nwork.isInternet() === "1") { //old linux legacy converting...
    return true;
  }
  else {
    return false;
  };
};
//Listeners for wifi-connection _______________________________ Wi-Fi connection
//Wifi connection listeners
nwork.signal.on("wifi-connected", async function(ipData) {
  io.emit("clear-dispatch");
  restart.isWifiConnecting = false;
  machine.wifi = {wifi: true, ip: ipData.ip, ssid: machine.wifi.tentative };
  io.emit('wifi', await view.wifiFrameData("wifi connect"));  //render
  io.emit('update-information', view.connFrameData());
  machine.wifi.tentative = "";
  io.emit('herald', {type: "done", missive:"Connected to Wi-Fi"});
  machine.internet = await setInternet();
  io.emit('update-information', await view.connFrameData());
  //rlog.routerExecuteLog("Connect");
  restart.token = false;  //reset so users can access settings again
});
//sent by 'nwork.wifiScanner()' and' nwork.doWifiConnect()'- keeps spinner alive
nwork.signal.on("wifi-wpa_cli", function() {
  restart.isWifiConnecting = true;
  io.emit('wifi-connecting');
});
//sent from 'nwork.doWifiConnect()', pretty far back in the connect sequence
nwork.signal.on("wifi-connection-failed", async function() {
  restart.isWifiConnecting = false;
  let failedSSID = machine.wifi.tentative;
  machine.wifi = {wifi: false, ip: "", ssid: "", tentative: "" };
  //console.log(aux.timeStamp(),"Machine: wifi connection failed!  xxxxxxxxxx");
  //check if hotspot should start...
  await shouldHotspotStart("always"); //this will render, end-point
  //the in-focus page update on the fronend disurbs the dispatch below;
  await aux.sleep(500).then(async() => { //have to wait 0.5 secs
    io.emit('herald', {type: "error", missive:
                       `Wi-Fi Connection Failed!<br>
                        Could not connect to Wi-Fi<br>
                        SSID: ${failedSSID}<br>
                        --------------------------<br>
                        <em>...check password?</em><br>
                        [Hotspot is restarted instead]`, duration: 35000}); });
  //rlog.routerExecuteLog("Connection failed!");
  restart.token = false;  //reset so users can access settings again
});
//sent from nwork.wifiConnect, at the beginning of connect sequence
nwork.signal.on("wifi-ssid-failed", async function() {
  restart.isWifiConnecting = false;
  let failedSSID = machine.wifi.tentative;
  machine.wifi = {wifi: false, ip: "", ssid: "", tentative: "" };
  //console.log(aux.timeStamp(),"Machine: wifi ssid not found!  xxxxxxxxxxx");
  //check if hotspot should start...
  await shouldHotspotStart("always"); //this will render, end-point
  //the in-focus page update on the fronend disurbs the dispatch below;
  await aux.sleep(500).then(async() => { //have to wait 0.5 secs
    io.emit('herald', {type: "error", missive:
                         `Wi-Fi Connection Failed!<br>
                          Could not find network:<br>
                          SSID: ${failedSSID}<br>
                          -----------------------<br>
                          <em>...check spelling?</em><br>
                          [Hotspot is restarted instead]`, duration: 35000});});
  //rlog.routerExecuteLog("SSID was not found!");
  restart.token = false;  //reset so users can access settings again
});

nwork.signal.on("wifi-still-connecting", function() {
  restart.isWifiConnecting = true;
  let wantedSSID = machine.wifi.tentative;
  io.emit('wifi-connecting');
  io.emit('dispatch', {type: "long", missive:
                       `Still trying to connect to Wi-Fi<br>
                        SSID: ${wantedSSID}<br>
                        -------------------------<br>
                        <em>please wait...</em>`,
                        duration: 25000});
});

nwork.signal.on("wifi-ssid-found", function() {
  let foundSSID = machine.wifi.tentative;
  restart.isWifiConnecting = true;
  io.emit('wifi-connecting');
  io.emit('dispatch', {type: "long", missive:
                       `Found the Wi-Fi network<br>
                        SSID: ${foundSSID}<br>
                        -----------------------<br>
                        <em>try to connect...</em>`,
                        duration: 8000});
});

//Wifi disconnect listeners____________________________________ Wi-Fi disconnect
//The disconnect is initiated by 'disconnectNetwork()'
nwork.signal.on("wifi-disconnected", async function() {
  console.log(aux.timeStamp(),"machine: wifi is now disconnected [X]");
  restart.isWifiConnecting = false;
  machine.wifi = {wifi: false, ip: "", ssid: "", tentative: "" };
  io.emit('wifi', await view.wifiFrameData("disconnect"));
  io.emit('update-information', view.connFrameData()); //1st update
  io.emit('dispatch', {type: "done", missive:"Disconnected from Wi-Fi"});
  restart.token = false;  //reset so users can access settings again
  await aux.sleep(200).then( async () => {
    await shouldHotspotStart("only without lan");//check if hotspot should start
    //console.log(aux.timeStamp(),"machine: check internet now       [X]");
    //rlog.routerExecuteLog("Disconnect was requested");
    machine.internet = await setInternet();     //this might take some time...
    io.emit('update-information', await view.connFrameData()); //2nd update
    io.emit('wifi', await view.wifiFrameData("disconnect"));  //...again
  });     //end of async sleep
});
//LAN listeners............................................................. LAN
nwork.signal.on('lan-cable-connected', async function(ip) {
  machine.lan = {lan: true, ip: ip};
  machine.internet = await setInternet();
  io.emit('wifi', await view.wifiFrameData("LAN cable"));  //render new lan connection
  io.emit('update-information', view.connFrameData()); //render conns at start page
  // logger.log(aux.timeStamp(),"Machine: lan cable attached, ip:", ip);
  io.emit('herald', {type: "long", missive:"LAN cable attached!", duration: 6000});
});

nwork.signal.on('lan-cable-disconnected', async function() {
  machine.lan = {lan: false, ip: ""};
  machine.internet = await setInternet();
  io.emit('wifi', await view.wifiFrameData("disconnect LAN cable"));  //render
  io.emit('update-information', view.connFrameData()); //render conns on start page
  // logger.log(aux.timeStamp(),"Machine: lan cable pulled out, no lan connection.");
  shouldHotspotStart("always"); //hotspot should start if no other connection...
  io.emit('herald', {type: "long", missive:"LAN cable pulled out!", duration: 6000});
});
//Internet listeners............................................ Internet access
//set Internet access status for machine
nwork.signal.on('internet', async function(internet) {
  if (internet === "1") {
    machine.internet = true;
  }
  else {
    machine.internet = false;
  };
  io.emit('settings', await view.settingsFrameData());  //render internet status
  console.log(aux.timeStamp(),"Machine: Internet now:", internet);
});
//Network update listeners................................ Network update events
//status update of ALL network connections - also render end-point
//The event is sent by 'nwork.updateConnections()' during disconnect of network,
//i.e. in 'disconnectNetwork()'.
nwork.signal.on("network-update", async function (array) {
  let bluetoothUpdate = array[0];
  //the bluetooth.polltimer might be running, so no update of that key...
  await setBluetoothMac();      //sets the .mac in machine
  machine.bluetooth.bluetooth = bluetoothUpdate.bluetooth;
  machine.bluetooth.devices = bluetoothUpdate.devices;
  machine.bluetoothSpeakers.speakers = bluetoothUpdate.speakers;
  //Below; false --> stored value
  let connectedSinks = await btsp.getConnectedSinks(false);
  machine.connectedSinks = connectedSinks;
  machine.lan = array[1];
  machine.wifi = array[2];
  machine.hotspot = array[3];
  io.emit('bluetooth', await view.bluetoothFrameData());   //bluetooth status
  io.emit('wifi', await view.wifiFrameData("network update!!!"));//Wi-Fi/LAN
  io.emit('settings', await view.settingsFrameData());     //end-point
  view.startPageFrameData();                    //end-point, full start page
});
//status update of ONLY Bluetooth states - also render end-point
//The event is sent by 'nwork.updateBluetoothConnections()' during boot
nwork.signal.on("bluetooth-update", async function (bluetoothUpdate) {
  //console.log(aux.timeStamp(), "machine: nwork updated bt states:");
  // { bluetooth: true/false,
  //   devices: [ {name: -, mac: -}...], speakers: [ {name: -, mac: -}...]  },
  await setBluetoothMac();      //sets the .mac in machine
  machine.bluetooth.bluetooth = bluetoothUpdate.bluetooth;
  machine.bluetooth.devices = bluetoothUpdate.devices;
  machine.bluetoothSpeakers.speakers = bluetoothUpdate.speakers;
  //Below; false --> stored value
  let connectedSinks = await btsp.getConnectedSinks(false);
  machine.connectedSinks = connectedSinks;
  io.emit('bluetooth', await view.bluetoothFrameData()); //end-point
  //LIMITATION of number of speakers - set to one only ( at 'spkr:' below)
  if (bluetoothUpdate.bluetooth === true) {
    let btObject = await view.btConnFrameData();
    io.emit('update-information', btObject);
  }
  else {
    io.emit('update-information', {type: "bt", btOn: false, spkr: "",
                                   mac:  ""});
  };
});

//Error listeners.................................. General Network Error Events
nwork.signal.on("wifi-ERROR", async function(errorString) {
  machine.wifi = {wifi: false, ip: "", ssid: "", tentative: "" };
  machine.internet = await setInternet();
  io.emit('wifi', await view.wifiFrameData("wifi error"));  //render
  io.emit('update-information', view.connFrameData());
  shouldHotspotStart("only without lan"); //check if hotspot should start...
  io.emit('herald', {type: "error", missive:
                       `Wi-Fi error:<br>${errorString.error}`, duration: 35000});
  //rlog.routerExecuteLog("Wi-Fi Error");
  restart.token = false;  //reset in case the error occured during restart
});
nwork.signal.on("lan-ERROR", async function(errorString) {
  machine.wifi = {lan: false, ip: ""};
  machine.internet = await setInternet();
  io.emit('wifi', await view.wifiFrameData("LAN error"));  //render
  io.emit('update-information', view.connFrameData());
  shouldHotspotStart("always"); //hotspot should start if no other connection...
  io.emit('herald', {type: "error", missive:
                       `Ethernet LAN error:<br>${errorString.error}`, duration: 35000});
  restart.token = false;  //reset in case the error occured during restart
});
hot.signal.on("hotspot-ERROR", async function(errorString) {
  machine.hotspot = {hotspot: false, ip: "10.0.0.10"};
  io.emit('wifi', await view.wifiFrameData("hotspot error"));  //render
  io.emit('update-information', view.connFrameData());
  io.emit('herald', {type: "error", missive:
                       `Hotspot failure:<br>${errorString.error}`, duration: 35000});
  restart.token = false;  //reset in case the error occured during restart
});
nwork.signal.on("bluetooth-ERROR", async function(errorString) {
  // console.log(aux.timeStamp(),"Machine: bluetooth error cause;", errorString.error);
  machine.bluetooth = {bluetooth: false, devices: [], pollTimer: false};
  io.emit('bluetooth', await view.bluetoothFrameData());  //render
  io.emit('update-information', {type: "bt", btOn: false,
                                 spkr: "", mac: ""});  //render no bluetooth
  io.emit('herald', {type: "error", missive:
                       `Bluetooth failure:<br>${errorString.error}`, duration: 35000});
  blut.unpairAllDevices();
  restart.token = false;  //reset in case the error occured during restart
});
nwork.signal.on("internet-ERROR", async function(errorString) {
  // console.log(aux.timeStamp(),"Machine: internet error cause;", errorString.error);
  machine.internet = false; //status is unknown here, Internet might work still
  io.emit('wifi', await view.wifiFrameData("internet error"));  //render
  io.emit('settings', await view.settingsFrameData());  //render settings
  io.emit('update-information', await view.connFrameData());
  // logger.log("");
  // logger.log(aux.timeStamp(),"Machine: bluetooth error cause;", errorString.error);
  io.emit('herald', {type: "error", missive:
                       `Internet failure:<br>${errorString.error}`, duration: 35000});
  restart.token = false;  //reset in case the error occured during restart
});


//==============================================================================
//[C.4] Control of backend for Player ============================ Setting Pages
//      NOTE: store startup volume set in boot: D. Settings page________________
/**(4.1) Control - set new value for start up volume. The value is read back
 * via mpdat next boot. See 'mpd-start-volume' event below in code section D.
 * @param {object}       data, { volume: newVolume }, where volume is in percent
 * @global {machine}     set value for startup volume
 * @return{integer}      volume in %
 */
 function setStartupVolume(data) {
   aux.writeStartVolume(data.volume);
   io.emit('herald', {type: "long", missive:
    `New start up volume is ${data.volume} %`, duration: 4000});
   machine.startVolume = data.volume;
 };
 /**'mpd-start-volume'event - set initial volume values.'mpd.startMPDSettings()'
  * I.e. rescan, clear, single mode and sets volume to startup volume
  * @param  {integer}    volume, start up volume in % [aux.readStartVolume()]
  * @event  {mpd}        'mpd-start-volume' in 'mpd.startMPDSettings()'
  * @global {machine}    sets the volume based on startup volume on file
  * @return {?}          nothing
  */
 mpd.signal.on('mpd-start-volume', function (volume) {
   machine.volume = volume;
   machine.startVolume = volume;
 });

//==============================================================================
//[C.5] Control of backend for Player ============================ Setting Pages
//      NOTE: restart of all streaming and restart of player software,
//            D. Settings page continued...
/**(5.1) D. Settings Page - restart all the streaming services
 * @return {?}        of no interest
 */
 async function restartStreamingServices() {
   restart.token = true;           //block user interaction during restart
   io.emit('herald', {type: "long", missive:
      `Restarting all streaming:<br>
      Airplay, Bluetooth, Spotify and UPnP<br>
      <em>...this will take a long while</em>`, duration: 45000});
  io.emit('herald', {type: "mishap", missive:
      `Note: during restart of streaming<br>
       network settings will be blocked`, duration: 45000});
  io.emit('status', "restart");    //update status frame on start page
//First set the waiting time for a calm and solid restart
   let timeSlot = restart.pause;   //now set to 28,000 msec
   if (machine.status === "idle") {
//0. No streaming going on - restart all streaming services now
//Note: Bluetooth: hideBluetooth() and unpairAllDevices() is called indirectly
//      in restartAllStreaming() below, since that function both stops and
//      starts up if bluetooth is streaming the disconnect should cause a
//      rerendering indirectly, there is no streaming going on.
//Restart again and continue to be "idle"
     await res.restartAllStreaming((timeSlot * 0.5)); //wait time reduced!!
     await aux.sleep(2000).then( async () => {
       await play.renderAllPlayerPlaylistPages();             //render
       io.emit('bluetooth', await view.bluetoothFrameData()); //render
       view.startPageFrameData();             //render full start page, await???
   });
   }
   else {
//1. The streaming services will be stopped:
//   Note: Bluetooth is stopped by res.stopAllStreaming() below
    //Below; stop ongoing streaming, stops ctl loop and then boot preps
     await res.stopAllStreaming();   //immediatley stop streaming
     await aux.sleep(2000).then(() => {
           //lets wait for some while...
         });
//Be sure that upnp is stopped and cleared out in a controlled way
     if (machine.status === "upnp") {
       let mpdStatusInbox = await mpd.getmpdStatusInbox();
       //Below; clears queue and errors, stops mpd and sets 'single' to on
       mpd.resetAfterUpnpMPD(mpdStatusInbox.status.state,
                             mpdStatusInbox.status.error);
       //Below; for upnp clear any playlist - should not recover here
       await play.emptyPlaylist(true);  // true -> no render, just empty list
       //Below; ordinary cleanup after upnp, but playlist is always [] here
       streamingStopped(true); //render; true -> called from upnp
       //Below; this is why playlist is cleared above, mpd must restart for upnp
       await aux.sleep(3500).then(async() => {
         await mpd.restartMPD("restartAllStreaming"); //no clearInterval(timer)
         //consider to place 'streamingStopped(true)' last and recover playlist?
            });
     };
//Be sure that spotify or airplay are stopped in a controlled way
     if ((machine.status === "spotify") || (machine.status === "airplay")) {
        await streamingStopped();    //should cause a rerendering indirectly
        await aux.sleep(1500).then(() => {
          //lets wait for a while service stops...
                               });
      };
//2. start all streamings services again and render:
      machine.status = "idle";
      await res.startUpAllStreaming(timeSlot);
      await aux.sleep(3000).then(() => {
         //lets wait for a little longer while services restarts...
       });
      await play.renderAllPlayerPlaylistPages();   //render player and playlist
      io.emit('bluetooth', await view.bluetoothFrameData()); //render bluetooth
      await view.startPageFrameData();             //render full start page
    };
//3. Wrap up and notify
  restart.token = false; //open up for user interaction again
  await aux.sleep(250).then(() => {
    io.emit("clear-dispatch", " -- inside restart services");
    io.emit('herald', {type: "done",
                         missive:"All Streaming Restarted!", duration: 29000});
    io.emit('status', "idle");   //finally update status frame on start page
                         });
};
/**(5.2) Restarts the Player software             ...see you on the other side
 * Updates of user interface is not needed - instead show reboot.
 * Focus on silencing the Player and stop services:
 * Mute amp, disconnect all bt devices (phone and speaker) and hide bluetooth.
 * Stop all streaming services - mpd is untouch, only cleared here.
 * UPnP is restarted in 'res.stopAllStreaming(true)'
 * WARNING: there is no return, software will restart
 * @return {?}        no one knows
 */
 async function restartPlayer() { //bye-bye..............
   io.emit('status', "reboot");
   io.emit('herald', {type: "long", missive: "...Player is shutting down!",
                       duration: 40000});
   console.log(aux.timeStamp(),"Machine: starting restart sequence... . . .  .  .  .   .");
   restart.token = true;
   await btsp.muteUnmuteAmp(false);
   await blut.removeBluetoothctlListener(); //avoid bluetoothctlterminal
   await blut.unpairAllDevices(false); //false -> unpairs all devices
   //hide bt, stops ctl loops and stops streaming services
   await res.stopAllStreaming(true); //true -> more asynchronous
   io.emit('status', "reboot");
   try {
    exec('sudo mpc clear', { uid: 1000, gid: 1000,
                                 encoding: 'utf8', timeout: 10000});
     io.emit('status', "reboot");
            }
   catch (err) {
      io.emit('status', "reboot");
     };
   //await aux.sleep(1500).then(() => {   });
   console.log(aux.timeStamp(),"Machine: ...wait 4 secs for close down of services.");
   await aux.sleep(4000).then(async() => {
     io.emit('herald', {type: "long", missive: "...still shutting down!",
                         duration: 40000});
     //false --> disconnects all bt devices
     io.emit('status', "reboot");
   });
  //lets wait for a some time again...
   await aux.sleep(3000).then(async() => {
     io.emit('status', "");    //update status frame to become empty
     io.emit("clear-dispatch", " -- inside restart services");
     console.log(aux.timeStamp(),"Machine: time to call playersystemrestart.sh");
     await aux.sleep(1000).then(() => {   }); //clear dispatch comes through
     console.log(aux.timeStamp(),"Machine:      bye-bye for now... . . .  .  .  .   .");
     //Now finally fire off the restart:
     try {
       exec(`sudo /player/playersystemrestart.sh`, {uid: 1000, gid: 1000});
     }
     catch (err) {
       await io.emit('dispatch', {type: "error",
                         missive: `"ERROR cannot restart software!<br>
                                    ------------------------------<br>
                                    <em>...turn off player...</em>`,
                                                     duration: 40000 });
     };
    });
 };

//==============================================================================
//[C.6] hotspot control in accordance with W-Fi connections ============ hotspot
//      NOTE: this is not frontend, this is why hotspot should start or not...

//Listener to catch when hotspot had to be stopped. That happens when a bt
//speaker is connected and this event is fired by 'nwork.turnOffAP()'
nwork.signal.on('hotspot-changed', async function (hotspotObject) {
  machine.hotspot = {hotspot: hotspotObject.hotspot, ip: hotspotObject.ip};
  if (hotspotObject.doRender === true) {
    io.emit('wifi', await view.wifiFrameData("hotspot-changed")); //render
    io.emit('update-information', view.connFrameData());          //render
  };
});

/**(6.1) - starts up hotspot service; if there are two wi-fi ifaces it will
* always start up. Optional: if there is only one iface the wifi must be
* disconnected in order to start. However, it always start with lan connected
* or not. Note: if a bt spkr gets connected hotspot might be turned off
* @param  {string}  startCommand, options to start with or without lan connected
* @return {?}       of no interest
*/
async function shouldHotspotStart(startCommand) {
  let isThereHotspot = await hot.isHotspotOn();//returns a boolean value
  let wifiStatus = await nwork.readSSIDandIpAddress(); //returns an object
  let isWlan1 = await nwork.isWlan1();              //returns a boolean value
  let noStartFlag = false;
  //console.log(aux.timeStamp(),"Machine: start hotspot?, is it on:",isThereHotspot, "wifi:", wifiStatus.wifi, "iface wlan1?", isWlan1);
  if (isThereHotspot === false) {
    //Option A: there are only one wi-fi iface, ==> start hotspot
      if ((isWlan1 === false) && (wifiStatus.wifi === false)) {
        switch (startCommand) {
          case "always":
          //Machine: can start hotspot service on the shared wi-fi iface
          if (wifiStatus.wifi === false) {
            machine.hotspot = await hot.startHotspot();
            if (await hot.isHotspotOn() === true) {
                io.emit("herald",{type: "done", missive: "Player's Hotspot is up!", duration: 8000});
            }
            else {
              noStartFlag = true;
            };
          };
          break;
          case "only without lan":
          let lan = await nwork.readLanIpAddress(); //returns only ip address
          if (lan == "") {
          //Machine: no lan either, start hotspot service on wi-fi iface 0
            machine.hotspot = await hot.startHotspot();
            if (await hot.isHotspotOn() === true) {
              io.emit("herald",{type: "long", missive: `Not connected to Wi-Fi network.<br>
                                                        There is no LAN cable connected either... <br>
                                                        ...Hotspot has to be up!`, duration: 6000});
            }
              else {
                noStartFlag = true;
              };
          };
          break;
          default:
          machine.hotspot = await hot.startHotspot();
          if (await hot.isHotspotOn() === true) {
              io.emit("herald",{type: "mishap", missive: "Hotspot forced to on!", duration: 16000});
          }
          else {
            {
              noStartFlag = true;
            }
          };
        };
      }
      else {
    //Option B: starts hotspot service, there are two wi-fi ifaces...
        machine.hotspot = await hot.startHotspot();
        if (await hot.isHotspotOn() === true) {
          io.emit("herald",{type: "done", missive: "Player's Hotspot is up!", duration: 8000});
        }
        else {
          noStartFlag = true;
        }
      };
  }
  else { //Option C: hopefully a very very rare case:  (this should not happen)
    //console.log(aux.timeStamp(),"Machine: hotspot is already on");
    io.emit("herald",{type: "mishap", missive: "Hotspot is still up!", duration: 9000});
  };
  //hotspot failed to start - this is bad
  if (noStartFlag === true) {
      io.emit("herald",{type: "mishap", missive: "Hotspot could not start!", duration:18000});
  };
  //what ever happens - always update pages
  io.emit('wifi', await view.wifiFrameData("should hotspot start?"));
  io.emit('update-information', view.connFrameData());
};
//End of Code ============================================================== EoC

//APPENDIX ************* Developer's Notice to Reader **************************
/*
Because of performance reasons an imperative approach using functions is
used. Function calls are expensive, but dealing with classes, objects and
methods are even worse and is regarded as overkill for this application.

Other considerations: the use integer-indexed elements arrays of the same
typeelements are preferred over objects. Objects are used when there is a need
for different kind of properties. 'for' loops are much faster than 'for..of',
'for..in', 'forEach' loops. Caching globals in inner scopes. Avoid recursive
function calls. Also avoid '.map', '.filter', '.find', e.t.c.
...among other things. (the code was first run on a Raspberry Pi 2 Model B)

Basically an Observer Design Pattern can be seen (MVC inspired), whereas;
Model:   is a set of global variables for objects defining states:
         'machine', 'restart', 'playlist' (array), 'stream', 'mpdStatusInbox',
         some of them are in machine-playback.js (the actual playback function)
         Definitions: /player/machine-model.js
View:    pages: player.html (start page)
         playerplayback.html, playlist.html, playusb.html (USB Playback pages)
         playerbluetooth.html, playerwifi.html, playersettings.html,
         in addition, the frontend control in each js-file for every page.
         Definitions: /player/machine-view.js and /player/machine-routing.js
Control:  C.1 - three boot phases
          C.2 - streaming control of bluetooth, spotify, airplay and upnp
          C.3 - Bluetooth and Wi-Fi pages with all the network event listeners
          C.4 - Settings page for startup volume and Internet access status
          C.5 - Settings page - restart of streaming and Player software
          C.6 - hotspot control

Interfacing linux is mostly done by node.js calls using 'execSync' or 'exec'.
Those calls spawn processes of their own which is expensive. Some of the linux
cli's can be grouped together with '&&' or be replaced by scripts '.sh'. The
principle is to control and execute so much as possible in Javascript (node.js)
However, concern have to be made to performance, asynchronous - synchronous
needs and what is practical. It is a balance and trade off between Javascript,
node.js and linux scripts.

Annoying things:
mpd and its CLI mpc is pretty much bullet proof when it is up and running. The
ordeal is to stop/start or just restart mpd in the right order. To synchronize
the view (pages), the model (status) and control (like elapsing track timers)
when mpd has finished playing a track is a little bit too complex. Also usb
scanning is tidious and might take a long time. The worst thing in this context
is upmpdcli - UPnP service. It takes over mpd and uses it. To catch upnp events
can be a challenge, especially when UPnP stops.

Things that runs really well:
Spotify (librespot) and Airplay (shairport-sync), fast and easy to use.
Wi-Fi with wpa_cli and wpa_config works well and also hotspot/AP services.

Slightly unstable things:
Bluetooth service and streaming using BlueZ (bluetoothctl) and Bluealsa is some-
times troublesome since there are still known errors that are bad (like agent).
It seems like every time the linux Bluetooth stack is updated there are changes
in connect/disconnect sequences, behaviours and formats of responses.
*/
