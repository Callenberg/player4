//Copyright 2022 by Retro Audiophile Designs
//GNU General Public License v3.0 see license.txt            [Source code]
//          ~ restarts service for backend and reboots Player ~
const aux = require('./machine-auxiliary.js');    //all the utils
//const nwork = require('./machine-network.js');    //all the networks
const loop = require('./machine-loop.js');
const spot = require('./machine-spotify.js');     //all streaming services...
const air = require('./machine-airplay.js');
const upnp = require('./machine-upnp.js');
const blut = require('./machine-bluetooth.js');
const btsp = require('./machine-audiosink.js')
//const mpd = require('./machine-mpd.js');        //... and mpd?? no, not now
const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synced Raspbian cmds
const fs = require('fs');                           //for reading files
//const events = require('events');                   //for creating events
//const signal = new events.EventEmitter();

module.exports.stopAllStreaming = stopAllStreaming;
module.exports.restartAllStreaming = restartAllStreaming;
module.exports.startUpAllStreaming = startUpAllStreaming;
module.exports.startSelectiveStreaming = startSelectiveStreaming;
module.exports.removeSelectiveStreaming = removeSelectiveStreaming;

module.exports.stopSpotify = stopSpotify;
module.exports.stopAirplay = stopAirplay;
module.exports.stopUpnp = stopUpnp;
module.exports.stopBluetooth = stopBluetooth;

module.exports.restartBluealsaAplay = restartBluealsaAplay;
module.exports.restartLibrespot = restartLibrespot;
module.exports.restartShairpoint = restartShairpoint;


/** Stop all streaming services...
 * Used when reset is requested by user, not at boot time.
 * Note that for bluetooth only source devices are unpaired, not the speakers.
 * The network service Bluetooth is still in its initial state (up or down).
 * @params  {boolean} isReboot, if true more asynchronous
 * @return {?}      of no interest
 */
async function stopAllStreaming(isReboot = false) {
  await blut.hideBluetooth();  //new connections not allowed now
  if (isReboot === false) {
    //First, stop all detect loops
    await loop.stopPollingAll();
    //stop bluetooth streaming to player
    await blut.unpairAllDevices(true); //true -> unpairs only source devices
    //A. stop Spotify
    await spot.raspotifyBootPreparations(false);
    //B. stop Airplay
    await air.shairportBootPreparations(false);
    //C. stop UPnP
    upnp.upmpdcliBootPreparations(false); //might take some time, no await here
    //D. reset bluetooth - no need to turn off bluetooth service, clear streaming
  }
  else {
    //restart UPnP first
    upnp.restartUpmpdcli(); //might take some time
    //then, stop all detect loops
    await loop.stopPollingAll();
    //A. stop Spotify
    spot.raspotifyBootPreparations(false);
    //B. stop Airplay
    air.shairportBootPreparations(false);
  };

  //await blut.restartBluetoothService(); //must be in a script
};
/** Restart all streaming services (stop and then start)...
 * Used when reset is requested by user, not at boot time.
 * Is called by machine.restartStreamingServices()
 * @return {?}      of no interest
 */
async function restartAllStreaming(pauseTime = 20000) {
  await stopAllStreaming();
  await startUpAllStreaming(pauseTime);
};
/** Start up streaming services again after stop...
 * Used when reset is requested by user, not at boot time. The startup is paused
 * for a while since the network needs to discover that the Player's streaming
 * services has been disconnected. When started again they will be discovered.
 * Starting up is done as much as possible in a synchronous sequence with pauses.
 * Note that for bluetooth restart of network service is not required.
 * Note that upnp is given a much longer start time in 'upnp.upmpdcliAtBoot()',
 * it is at the moment 30 s since there have been problems with collisions of
 * stop and start using systemctl.
 * @param {integer} pauseTime, msec for the system to be still and calm
 * @return {?}      of no interest
 */
async function startUpAllStreaming(pauseTime=5000) {
  // logger.log(aux.timeStamp(),"Machine: 5. start up requested  +++, pausing for",pauseTime,"msec");
  let waitTime = pauseTime - 500 - 1500 - 400 - 200;

  await aux.sleep(waitTime).then(() => {
      //First a loooong pause - then start sequences...
      //console.log(aux.timeStamp(),"Machine: 6. waiting done .............................");
    });
  await loop.loopCtlBootPreparations(); //stops all loops and resets log files
  await aux.sleep(300).then(() => {
         //lets wait for a while...
      });
  //bluealsa-aplay needs to start before 'loopctlAtBoot()' (starts all loops)
  await btsp.restartBluealsaAplay("startUpAllStreaming");
  await aux.sleep(200).then(async() => {
       //lets wait here, bt detect loop needs bluealsa-aplay pid
       await loop.loopCtlAtBoot(); //all control loops are back
    });
  await aux.sleep(1500).then(() => {
         //wait until the loops start polling data twice...
      });
  await blut.bluetoothUnblockStreaming(); //power on, pairing and connections on
  await spot.raspotifyAtBoot();
  await aux.sleep(200).then(() => {
       //lets wait for a while...
    });
  await air.shairportsyncAtBoot();
  upnp.upmpdcliAtBoot("startUpAllStreaming"); //asynchronous, paused for 30 s
};
/** Block all service except the one that is streaming   [Block everything else]
 * Stop all streaming services, except the one that is streaming!
 * Used when a streaming service starts and then all the other services
 * needs to be blocked. Called when a streaming service is detected.
 * (Note that for bluetooth restart of network service is not required)
 * All the false arguments means that no emit of stop to machine, just as at boot.
 * Since Dec 2021 there is only one polling file, no need to stop polling.
 * Note: bluetooth source devices are NOT disconnected anymore
 * @param {string} streamingStarted, the service that is now streaming
 * @return {?}     of no interest
 */
async function startSelectiveStreaming(streamingStarted) {
  //switch (streamingStarted) {
  switch (streamingStarted) {
    //console.log(aux.timeStamp(),"restart; incomming started =", streamingStarted);
    case "spot":
    //blut.hideBluetooth();
    //blut.unpairAllDevices(true);         //true  -> remove sources
    air.shairportBootPreparations(false);//false -> no emit of STOP
    upnp.upmpdcliBootPreparations(false);//false -> no emit of STOP
    break;
    case "air":
    //blut.hideBluetooth();
    //blut.unpairAllDevices(true);         //true   -> remove sources
    spot.raspotifyBootPreparations(false);//false -> no emit of STOP
    upnp.upmpdcliBootPreparations(false); //false -> no emit of STOP
    break;
    case "upnp":
    //blut.hideBluetooth();
    //blut.unpairAllDevices(true);          //true  -> remove sources
    spot.raspotifyBootPreparations(false);//false -> no emit of STOP
    air.shairportBootPreparations(false); //false -> no emit of STOP
    break;
    case "blue":
    spot.raspotifyBootPreparations(false);//false -> no emit of STOP
    air.shairportBootPreparations(false); //false -> no emit of STOP
    upnp.upmpdcliBootPreparations(false); //false -> no emit of STOP
    break;
    case "usb":
    console.log(aux.timeStamp(),"restart: stop upmpdcli and librespot\n");
    upnp.upmpdcliBootPreparations(false); //false -> no emit of STOP
    spot.raspotifyBootPreparations(false);//false -> no emit of STOP
    //blut.hideBluetooth();
    //blut.unpairAllDevices(true);          //true  -> remove sources
    air.shairportBootPreparations(false); //false -> no emit of STOP
    break;
    default://this should not happen...
    //stopAllStreaming();       //is an option here
    return false
  };
};
/** Unblock all services again - machine is idle now.              [Unblock all]
 * Restart all streaming services again, except the one that was just streaming!
 * Used when a streaming service stops and then all the other services
 * must be started again. Called when a streaming service is detected as stopped.
 * @param {string} streamingStopped, the service that  just stopped streaming
 * @return {?}     of no interest
 */
function removeSelectiveStreaming(streamingStopped) {
  //console.log(aux.timeStamp(),"restart: remove selected streaming, who stopped?", streamingStopped);
  //switch (streamingStopped) {
  switch (streamingStopped) {
    case "spot":
    air.shairportsyncAtBoot();
    upnp.upmpdcliAtBoot("removeSelectiveStreaming");//long wait time for restart
    break;
    case "air":
    spot.raspotifyAtBoot();
    upnp.upmpdcliAtBoot("removeSelectiveStreaming");
    break;
    case "upnp":
    spot.raspotifyAtBoot();
    air.shairportsyncAtBoot();
    break;
    case "blue":
    spot.raspotifyAtBoot();
    air.shairportsyncAtBoot();
    upnp.upmpdcliAtBoot("removeSelectiveStreaming");
    break;
    case "usb":
    spot.raspotifyAtBoot();
    air.shairportsyncAtBoot();
    upnp.upmpdcliAtBoot("removeSelectiveStreaming");
    //blut.bluetoothUnblockStreaming("[X] mpd stopped");
    break;
    default: //this should not happen...
    //startUpAllStreaming();    //is an option here
    return false;
  };
};
//_______________________________________________________________ Stop and Start
//NOTE: the functions below do actually a restart as well, not only a stop!

/**User stops Spotify -  stops first, wait and then starts asynchronously.
 * User stop is done at machine listener, event: 'stop-streaming-now'
 * @param  {integer} time, msec
 * @return {boolean} true
 */
async function stopSpotify(time = 1000) {
  await spot.raspotifyBootPreparations(true); //true -> emit signal spotify stop
  aux.sleep(time).then( () => {
     spot.raspotifyAtBoot();      //finally restart spotify
  });
  return true;
};
/** User stops AirPlay - stops first, wait and then starts asynchronously
 * User stop is done at machine listener, event: 'stop-streaming-now'
 * @param  {integer} time, msec
 * @return {boolean} true
 */
async function stopAirplay(time = 1000) {
  await air.shairportBootPreparations(true); //true -> emit signal AirPlay stop
  aux.sleep(time).then( () => {
     air.shairportsyncAtBoot();  //restart AirPlay
  });
  return true;
};
/** Restart UPnP by user - stops first,  wait for long, then starts asynchronously
* User stop is done at machine listener, event: 'stop-streaming-now'
* NOTE: there has been problem when stop and start is too close. The wait time
* is set in 'upmpdcliAtBoot()', at the moment 10 sec
* @param  {integer} time, msec
 * @return {?}     of no interest
 */
async function stopUpnp() {
  //stops upmpdcli
  await upnp.upmpdcliBootPreparations(false);  //false -> no emit of 'upnp-stop'
  //starts upmpdcli again - it will be a pause for 10 s in 'upnp.upmpdcliAtBoot()'
  upnp.upmpdcliAtBoot("<stopUpnp>");
};
/** User stops Bluetooth streaming of audio (often by smart phone).
 * The stop is done by disconnecting the user's phone and all other connected
 * source devices (unfortunately). The disconnect is caught by 'loop.btLoop()'
 * @return {boolean}     true
 */
async function stopBluetooth() {
  //stop streaming by disconnect all the sources - this is the only way
  blut.unpairAllDevices(true); //true -> unpairs only source devices
  return true;
};
//===================================================================== restarts
//The reason for a restart is to reset the audio stream to pcm 'default', i.e.
//a bt speaker, or to the reset back to the amplifier, card 0.
//Called at connect/disconnect/reconnect of bt speaker, but also at boot,
//Called by 'btsp.restartMpdAndStreaming()'. To avoid any systemctl collisions
//the restart wait sequence isS: 250 - 500 - 750 msec

/**Restart the bluealsa-aplay, the function that plays bluetooth streams,
 * i.e. '/usr/bin/bluealsa-aplay 00:00:00:00:00:00'.
 * The service spec can be found at '/lib/systemd/system/bluealsa-aplay.service'
 * Alos called by 'machine.outputPreparations()'
 * @params {string}       who, if false the timer will be reset and restarted
 *                             A restart is not needed at reboot.
 * @return {boolean}      true
 */
async function restartBluealsaAplay(who = false) {
  if (who === false) {
    aux.sleep(250).then( async() => {
      await btsp.restartBluealsaAplay();
      loop.restartBluetoothDetect();
    });
  }
  else {
    await btsp.restartBluealsaAplay();
  }
  return true;
};
/**Restart librespot, the Spotify service. (used to be raspotify before)
 * The service spec can be found at '/lib/systemd/system/librespot.service'
 * @param  {integer} time, msec
 * @return {boolean} true
 */
function restartLibrespot(time = 500) {
  aux.sleep(time).then( () => {
   spot.raspotifyRestart();
 });
  return true;
};
/**Restart shairport-sync, the Airplay service.
 * The service spec can be found at '/lib/systemd/system/shairport-sync.service'
 * @param  {integer} time, msec
 * @return {boolean} true
 */
function restartShairpoint(time = 750) {
  aux.sleep(time).then( () => {
    air.restartShairportSync();
  });
  return true;
};
/**Restart upmpdcli, the UPnP service.
 * The service spec can be found at '/lib/systemd/system/upmpdcli.service'
 * @param  {integer} time, msec
 * @return {boolean} true
 */
function restartUpmpdcli(time = 1000) {
  aux.sleep(time).then( () => {
    air.restartShairportSync();
  });
  return true;
};
