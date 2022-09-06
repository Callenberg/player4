//Copyright 2022 by Retro Audiophile Designs, all rights reserved.
////GNU General Public License v3.0 see license.txt            [Source code]
//                    ~ mpd handler for backend ~

const aux = require('./machine-auxiliary.js');      //all the utils
const mpd = require('./mpd.js');                    //mpd object and commands
const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synced Raspbian cmds
//const fs = require('fs');                           //for reading files
const events = require('events');                   //for creating events
const signal = new events.EventEmitter();

module.exports.signal = signal;

module.exports.getSocketMPD = getSocketMPD;
module.exports.getmpdStatusInbox = getmpdStatusInbox;
module.exports.mpdBootPreparations = mpdBootPreparations;

module.exports.getMPDElapsed = getMPDElapsed;

module.exports.restartMPD = restartMPD;
module.exports.connectToMPD = connectToMPD;
module.exports.mpdAtBootMPC = mpdAtBootMPC;
module.exports.setSingleModeMPC = setSingleModeMPC;

module.exports.isUPnPinCtl=isUPnPinCtl;

module.exports.rescanMPD = rescanMPD;

module.exports.mpdBrutalClear = mpdBrutalClear;
module.exports.mpdBrutalStop = mpdBrutalStop;

module.exports.playCurrentNotInMPD = playCurrentNotInMPD;
module.exports.playCurrentUseMPC = playCurrentUseMPC;
module.exports.pauseCurrentMPC = pauseCurrentMPC;
module.exports.mpdEmergencyBrakeMPC = mpdEmergencyBrakeMPC;
module.exports.singleNextOrPreviousMPC = singleNextOrPreviousMPC;
module.exports.seekDurationMPC = seekDurationMPC;
module.exports.seekStopMPC = seekStopMPC;
module.exports.setVolumeMPC = setVolumeMPC;
module.exports.clearPlaylistMPC = clearPlaylistMPC;
module.exports.resetAfterUpnpMPD = resetAfterUpnpMPD;

const MPD_PORT = 6600;        //predefined port for mpd socket communication
const cmd = mpd.cmd;          //for mpd.js functions: command call
let client = false;           //socket for mpd

function getSocketMPD() {     //get function for global variable client
  //console.log(aux.timeStamp(), "mpd: this is the mpd socket\n?", client);
  return client;
};
/* Notes on mpd:
    The biggest problem is that upmpdcli (UPnP) uses mpd as well. The upmpdcli
    takes over the mpd by clearing the queue and setting all options (repeat,
    random, single and consume to 'off'), and add its playlist (tracks). There
    is a lot of efforts to catch this event; by upmpdcli hooks that unfortunately
    also are triggered by any use of mpd, not only UPnP events. Further mpd status
    messages are checked for sudden changes in the states of mpd (paused - play
    for example). In machine-mpd.js the status is used as triggers. The previously
    mentioned hooks are dealt with in machine-loop.js.
    Playback uses only the add, play, pause, stop, seek and clear functions of
    mpd and mpc. mpc is preffered over mpd commands. The mpd queue (playlist) is
    not used. Every track is added, play (pause/seek/stop). The option 'single'
    is set to 'on' - important because that distinguish Playback from UPnP!! When
    'single' is changed to 'off' UPnP is taking over. The mpd status events that
    machine-mpd.js sets up listens for are triggers, they come in bursts and they
    are not always reliable, so mpc is also used to check for states. This is
    little bit of a mess. mpd and mpc are quite messy. Still we are thankfull
    to Mark Kellerman because what is the alternative? and when mpd is running
    it is pretty bullet proof, no derailing, many audio formats and it
    accomodates bluetooth as a sink. It is updated frequently and well kept.
*/


//---------------------------------------------------------------- mpd js object
// MPD object; the latest player related statuses, singleton and persistent
function MPDStatusObject() {
  this.status = {state: "stop"}; //parsed player status message
  this.options = {single: "1"};  //parsed options message
  this.timeStamp = 0;            //when the player status message was received
};
//Create an "inbox" to store the latest player status messages from mpd
var mpdStatusInbox = new MPDStatusObject();

function getmpdStatusInbox(){
  return mpdStatusInbox;
};
//.......................................................... [boot preparations]
/**BOOT - Initialize mpd for player (mpd is up and running at boot of system)
 * Connect to the mpd daemon socket. Listen to /usr/bin/mpd events.
 * E1: After mpd is ready - emit event to machine-playback.js that mpd
 *     is connected. This is only done at boot and confirms step B0.
 * E2: When mpd settings are changed - call newMPDOptions() to detect UPnP
 *     streaming. upmpdcli sets single mode to 0 (false)
 * E3: When ever mpd/mpc playing status changes - call newMPDOptions()
 *     Catching start/stop/pause and when upmpdcli clears the mpd queue.
 * E4: After scan of mpd db of user USB - emit event to machine directly. This
 *     happens at boot (B2.) and whenever there is a new user USB attached.
 * This function is a core function for boot, boot sequence order [B0. - B4.]:
 *   First connect to mpd, secondly scan any user USB for mpd, thirdly get all
 *   network connections and then start web server - render.
 * @global {client}    store mpd socket
 * @global {MPD_PORT}  read preset port value for mpd socket
 * @mpd    {events}    'ready' 'system-options' 'system-player' 'system-database'
 * @signal {playback}  emits; 'mpd-ready'      (Boot [1] done)
 * @signal {machine}   emits; 'mpd-db-scanned' (Boot [3] done or USB scanned)
 * @return {?}         not of interest
 */
async function mpdBootPreparations() {
  console.log(aux.timeStamp(), "mpd: preparations are just going to commence;");
  //let pid = await aux.getServicePid("mpd"); //obsolete check?
  //if (pid !== "") {
  if (true) {
//1. Good to go; mpd is up - call connect and get a socket
    await connectToMPD();
    await startMPDSettings();
    signal.emit('mpd-ready', client);
//2. Set up all the mpd listeners needed;
    //E1: mpd ready event.................................... this is not used
    /*client.on('XXXready', function() {
            startMPDSettings();  //clean-up mpd and set initial volume
            //console.log(aux.timeStamp(), "mpd: . . . fires of mpd-ready event[!]");
            signal.emit('mpd-ready', client);
          });*/
    //E2: mpd mode change event (looking for single mode)......................
    //is crucial to catch when upnpn are going to start streaming
    client.on('system-options', function() {
            newMPDOptions();   //used to figure out if single mode is on or not
          });
    //E3: mpd player events (play, stop, pause)...............................
    //to catch when mpd player stopped/paused
    client.on('system-player', function() {
            newMPDStatus();    //used to detect when mpd stopped/paused
          });
    //E4: mpd database rescan event (USB content).............................
    client.on('system-database',function() {
            signal.emit('mpd-db-scanned') //used to detect usb ready
            //console.log(aux.timeStamp(), "mpd: . . . fired of scan done event [...]");
          });
      } //      -- ends the boot preparations
      else {
        //     -- Error: no PID found, no service running, try to restart once
        let outcome = false;
        outcome = await restartMPD();
        !outcome && signal.emit('mpd-error', "service-failure"); //failure!!!
      };
};
/**BOOT - preparation, connect to mpd socket. GV client is used for explicit
 * mpd commands. Also called when machine needs to reconenct to mpd again,
 * after restart of mpd. GV client gets reset then
 * @mpd    {socket}   mpd socket
 * @mpd    {cmd}      mpd.js connect request to mpd socket
 * @global {client}   sets the global variable to the socket
 * @global {MPD_PORT} reads the preset port number
 * @return {socket}  mpd socket is returned
 */
function connectToMPD() {
  //console.log(aux.timeStamp(), "mpd: try to connect mpd socket - mpd.js call:");
  try { //  connect to socket for mpd service, calls 'connect' in mpd.js
    client = mpd.connect({
      port: MPD_PORT,
      host: 'localhost',
    });
    //console.log(aux.timeStamp(), "mpd: connected socket - 'client' is\n", client);
    return client;
  }
  catch (err) { //     -- Error: cannot connect to mpd socket
    console.log(aux.timeStamp(), "mpd: connection ERROR\n", err);
    signal.emit('mpd-error', "socket-failure");
    client = false;
    return false;
  };
};
/**BOOT - called in B2. around line 225, mpd is up and USB detection is on and
 * any USB is mounted. This function request a mpc scan and the boot continues
 * at the mpd event listener:  client.on('system-database',...       just above.
 * Note: called by 'sudo mpc rescan --wait' will be an 'await'
 * @mpc     {rescan}   rescan command with wait option, makes it async
 * @return {?}   not of interest
 */
function mpdAtBootMPC() {
  //console.log(aux.timeStamp(), "mpd: ... scanning started");
  try {
    exec(`sudo mpc rescan`,
              {uid: 1000, gid: 1000, encoding: 'utf8'});
    //console.log(aux.timeStamp(), "mpd: --- scanning of USB was requested [...]");
  }
  catch(err) {
    console.log(aux.timeStamp(), "mpd: rescan ERROR\n", err)
    signal.emit('mpd-error', "rescan-failure");
  };
  //remove the event that listens to mpd is now ready = connected trough socket
  client.removeAllListeners('ready'); //no more use of this one, why is this here?
};

//.................................................................... [restart]
/**Restart - resets listeners to new ones, it is called at mpd service restart.
 * When the mpd service is restarted it needs new listeners...
 * The 'ready' event is not needed since mpd is already conencted through socket.
 * @return {?}  don't know
 */
function setListenersMPD(){
  //Create the new listeners for the new socket object in client
  //E2: might be used to catch upnpn streaming events.......................
  client.on('system-options', function() {
      newMPDOptions();    //not really needed anymore...
    });
  //E3: mpd player event....................................................
  //to catch when mpd player stopped/paused
  client.on('system-player', function() {
      newMPDStatus();             //used to detect when mpd stopped/paused
    });
  //E4: mpd database rescan event...........................................
  client.on('system-database',function() {
      signal.emit('mpd-db-scanned');
    });
};
/**Restart - remove previous listeners, it is called at mpd service restart.
 * Also called when machine needs to reconenct to mpd again, after restart of mpd.
 * @return {?}  don't know
 */
function removeListenersMPD() {
  //Remove existing listeners in use  - before disconnecting mpd sockets
  //Note: the 'ready' listener is removed for good in mpdAtBootMPC()
  client.removeAllListeners('system-options');    //E2
  client.removeAllListeners('system-player');     //E3
  client.removeAllListeners('system-database');   //E4
};
/**Restart mpd service. First stop the mpd socket, then stop mpd. Start socket,
 * connect to socket again and finally startup the systemd mpd service.
 * Stop of mpd socket will close the socket in the global variable client, but
 * connectToMP() will reconnect and update the global variable
 * Often call when a bt speaker got connected or if UpnP got stuck.
 * @params  {string}  Which function called for restart
 * @linux  {systemd}  request a restart of mpd socket and mpd service
 * @return {boolean}  true if successful
 */
async function restartMPD(who="?") {
//0. Remove all existing listeners in use, the 'ready' is not used anymore
  await removeListenersMPD();
  await aux.sleep(100).then(() => {
  //console.log(aux.timeStamp(), "mpd restart: [listeners gone, wait is over now, 100 msec later.]\n");
    });
  try {
//1. Stop the socket
    execSync(`sudo systemctl stop mpd.socket`,
                {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 40000});
    try {
//2. Stop mpd service
      execSync(`sudo systemctl stop mpd.service`,
                  {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 40000});
      await aux.sleep(200).then(() => {
      //console.log(aux.timeStamp(), "mpd: [wait is over now, 200 msec later.]\n");
    });//wait for mpd to get up again*/
//3. start socket again and reconnect to socket
        try {
          execSync(`sudo systemctl start mpd.socket`,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 40000});
          //console.log(aux.timeStamp(), "mpd: ... socket restarted +++");
          await connectToMPD("restartMPD");
          await setListenersMPD()
//4. start mpd service again and return true if 1 - 3 was successful.
          try {
            execSync(`sudo systemctl start mpd.service`,
                        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 40000});
            //console.log(aux.timeStamp(), "mpd: [RESTARTED] by -", who, "- [***]");
            await setSingleModeMPC("on")
            return true;
//   below all the error handling............................
          }
          catch (err)
          {
            signal.emit('mpd-error', "start service-failure");
            return false; //--error handling of mpd start
          };
        }
        catch (err)
        {
          signal.emit('mpd-error', "start socket service-failure");
          return false;
        };              //-- error handling of socket start, connect to socket
    }
    catch (err)
    {
      signal.emit('mpd-error', "stop service-failure");
      return false;
    };                  //--error handling of mpd stop
  }
  catch (err)
  {
    signal.emit('mpd-error', "stop socket service-failure");
    return false;
  };                  //--error handling of socket stop
};
//______________________________________________________________________________
//Music Player Daemon Controls - handling the mpd
//==============================================================================
/**mpd ctl - there is a status update, turn the new mpd status message into an
 * object, then call a handling function to check if mpd playing stopped.
 * MPDStatusObject is on format: {key: "value", ...},...
 * Triggered by 'system-player' listener above
 * @mpd    {cmd}             ask for status update
 * @return {nothing?}        mpd calls returns undefined, too bad.
 */
function newMPDStatus() {
  client.sendCommand(cmd("status", []), function(err, msg) {
    if (err) {
      signal.emit("mpd-error", "status-failure");
    }
    else {
      //mpd bursts two status msg when state is change to play, (why?)
      //often 2 msec in between (at least during 2020 and 2021)
      //the two message an the time aspect is no longer used, but kept....
      if (aux.timeMilliseconds() - mpdStatusInbox.timeStamp > 10) {
        handleMPDStatusUpdate(mpd.parseKeyValueMessage(msg), aux.timeMilliseconds());
      };
    };
  });
};
/* a typical mpd status object converted from a mpd status string when playing
{
 volume: '15',
 repeat: '0',
 random: '0',
 single: '1',
 consume: '0',
 playlist: '136',
 playlistlength: '1',
 mixrampdb: '0.000000',
 state: 'play',
 song: '0',
 songid: '51',
 time: '2:223',
 elapsed: '1.885',
 bitrate: '128',
 duration: '223.381',
 audio: '44100:24:2'
}*/

/**mpd ctl - get a status update, turn the new mpd status string message into an
 * object, return the mpd value of 'elapsed' to machine-playback,js
 * Called frequently by playback.startElapsing() during playback
 * Find % - `sudo mpc status | fgrep '(' | cut -d'(' -f2 | cut -d'%' -f1 `
 * Find mm:ss - `sudo mpc status | fgrep '(' | cut -d'/' -f2 `
 * @mpd    {cmd}        ask for status update
 * @signal  {playback}   'mpd-elapsed' caught nearby startElapser()
 * @return {nothing!}   ... and that is a problem, have to fire an event...
 */
function getMPDElapsed() {
  let mpdStatus = 0;
  client.sendCommand(cmd("status", []), async function(err, msg) {
    if (err) {
      signal.emit("mpd-error", "status-failure");
    }
    else {
      //console.log(aux.timeStamp(), "mpd: read status message: \n", msg);
      mpdStatus = await mpd.parseKeyValueMessage(msg);
      //console.log(aux.timeStamp(), "mpd: made status message: \n", mpdStatus);
      signal.emit('mpd-elapsed', mpdStatus.elapsed );
    };
  });
};
/**mpd ctl for mpc status - is mpc playing or not?
 * into an object, then call a handling function to check if upnpn caused the
 * change MPDStatusObject is on format: {key: "value", ...},...
 * Triggered by 'system-options' listener above
 * Option: use  'sudo mpc current' is "" when mpc stopped
 * @mpc    {cmd}        ask for status
 * @return {boolean}    true if mpc status is 'playing', otherwise false
 */
 function isMpcPlaying() {
   let mpcStatusString = "";
   try {
     mpcStatusString =
      execSync(`sudo mpc status | fgrep [playing] `,
                       {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
     //console.log(aux.timeStamp(), "mpd: mpc status = playing? >", mpcStatusString.length );
     if (mpcStatusString.length > 1 )  {
       return true;
     };
   }
   catch(err) {
     //console.log(aux.timeStamp(), "mpd: mpc status = NOT playing? >", mpcStatusString.length, "= 0?" );
     return false
   }
 };

/**mpd ctl for upnp - there is an option update, turn the new mpd option message
 * into an object, then call a handling function to check if upnpn caused the
 * change MPDStatusObject is on format: {key: "value", ...},...
 * Triggered by 'system-options' listener above
 * @mpd    {cmd}             ask for options update
 * @return {nothing?}        mpd calls returns undefined, too bad.
 */
function newMPDOptions() {
  client.sendCommand(cmd("status", []), function(err, msg) {
    if (err) {
      signal.emit("mpd-error", "status-failure");
    }
    else {
      handleMPDOptionUpdate(mpd.parseKeyValueMessage(msg));
    };
  });
};
/**mpd ctl - at boot set initial mpd status to Player start status
 * I.e. stop, clear out, sets single mode and volume to startup volume
 * @mpd    {many cmds} cmd; stop, clear queue/errors, single mode on, set volume
 * @signal {machine}   send the read start volume to machine
 * @return {?}
 */
async function startMPDSettings() {
  let vol =  await aux.readStartVolume(); //read start volume from file
  signal.emit("mpd-start-volume", vol);   //notify machine at boot and at reset
  //console.log(aux.timeStamp(), "mpd: will now do settings - got volume", vol);
  //console.log(aux.timeStamp(), "mpd: will now do settings; clear, single, volume...");
  try {
    execSync(`sudo mpc clear `,
                     {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 2000});
    /*client.sendCommand(cmd("clearerror", []), function(err, msg) {
      if (err) { signal.emit("mpd-error", "reset-settings-failure"); };
    });*/
    execSync(`sudo mpc single on `,
                     {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 2000});
    execSync(`sudo mpc volume ${vol} `,
                     {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 2000});
  }
  catch (err) {
    console.log(aux.timeStamp(), "mpd: setting ERROR:\n", err);
    signal.emit("mpd-error", "fatal-failure");
  };
};
/**mpd ctl - at mpd restart or when UPnP has stopped single mode must be set.
 * @param   {string}  mode, "on" or "off" - not used, only "on" is of interest
 * @mpc     {single}  set to 'mode'; i.e. "on"
 * @return  {?}
 */
function setSingleModeMPC(mode) {
  try {
    execSync(`sudo mpc single ${mode}`,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  }
  catch (err) {
  };
};
/**mpd ctl - rescan the USB stick
 * @mpd     {rescan}  scan the USB content for music files
 * @return  {?}
 */
 function rescanMPD() {
   client.sendCommand(cmd("rescan", []), function(err, msg) {
     if (err) {
       signal.emit('mpd-error', "usb-scan-failure");
                    };
   }); //end of rescan request
 };
/**mpd ctl - Catch a state change of mpd player status (play, stop, play)
 * A change from 1. play to stop/pause or 2. stop to play are of interest.
 * mpd fires of states in a bursts of two sometimes and these might to be
 * filtered out first, hence the timestamp.
 * 1. If mpd has stopped playback is notify, was it track end?
 * 2. If mpd starts upmpdcli might have started to stream, notify machine
 * Note: mpd single mode doesn't work all the times!
 * Another note: sometimes there seems to be two listeners despite remove
 * @params {object}         parsed mpd message, values are strings
 * @params {integer}        time, time in msec since 1970-01-01
 * @global {mpdStatusInbox} reads values and sets a new status and time stamp
 * @signal {playback}       emits, 1 'mpd-playToStop' and  2 'upnp-streamed';
 *                          1) mpd track is at end. 2) UPnP has taken over.
 * @return {object}         returns status of mpd defined by MPDStatusObject
 */
async function handleMPDStatusUpdate(status, time) {
  let inbox = mpdStatusInbox;   //old status
  let statusState = status.state; //new state to check out
//Check 1: if mpd has changed from play -> to stop, is it at track end?
//         Better check if mpc has stopped too!
  if ((inbox.status.state === 'play') && (statusState === 'stop')) {
    //notify playback so 'play.trackEnd()' can be called if track is at end
    //console.log(aux.timeStamp(), "mpd: handleMPDStatusUpdate [STOP], mpc playing?", await isMpcPlaying());
    if (await isMpcPlaying() === false) {
      signal.emit('mpd-playToStop');
    };
  };
//Check 2: if mpd has started playing a track and
//         if single mode is off  -> upmpdcli might have started?
//'status.songid' only defined when a track is played in mpd, e.g. value = "11"
  if ( (mpdStatusInbox.options.single == "0") &&
       (inbox.status.state === 'stop') &&
       (statusState === 'play') ) {
         //notify playback and so 'loop.upnpMightPlay()' can be called
         signal.emit('upnp-streamed', status.songid );
  };
  //register the new status in the inbox
  mpdStatusInbox.status = status;
  mpdStatusInbox.timeStamp = time;
  return status;
};
/**mpd ctl - Updates option change of mpd single state. Important trigger!
 * Happens when upmpdcli takes over and resets mpd from single being 1 to 0.
 * This is the first indication that UPnP has started... but nothing done here.
 * @params {object}           statusUpdate, new mpdStatusObject
 * @global {mpdStatusInbox}   reads values and sets the new options
 * @return {object}           options of mpd defined by MPDStatusObject
 */
function handleMPDOptionUpdate(statusUpdate) {
  if ((mpdStatusInbox.options.single === "1") &&
      (statusUpdate.single === "0")) {
  };
  mpdStatusInbox.options = statusUpdate;
};
/**mpd ctl - if mpd is not in single mode then UPnP is in control of mpd.
 * When upmpdcli takes over it resets mpd from single being 1 to 0.
 * This function checks the single mode status, true means UPnP is in ctl.
 * Note: at this point we do not know if UPnP is really streaming...
 * @global {mpdStatusInbox}   reads values and sets the new options
 * @return {boolean}          returns true if UPnP is controling mpd
 */
function isUPnPinCtl() {                            //NOT IN USE
  if (mpdStatusInbox.options.single == "0") {
    return true;
  }
  else {
    return false;
  };
};
/**mpd ctl - if mpd is not in single mode then UPnP is in control of mpd.
 * When upmpdcli takes over it resets mpd from single being 1 to 0.
 * This function checks the single mode status, true means UPnP is in ctl.
 * Note: at this point we do not know if UPnP is really streaming...
 * @global {mpdStatusInbox}   reads values and sets the new options
 * @return {boolean}          returns true if UPnP is controling mpd
 */                                                 //experimental
function isTrackEnd() {                            //NOT IN USE
  // sudo mpc status | fgrep %\) | cut -d'(' -f2 | cut -d'%' -f1
  if (mpdStatusInbox.options.single == "0") {
    return true;
  }
  else {
    return false;
  };
};

//Music Player Daemon Clean up & Clear out - clears up when in fail states
//==============================================================================
/**MPD - clear the mpd queue, used only in mpd error state ..... emergency clear
 */
async function mpdBrutalClear() {
  let wait = wait || 100;
  await aux.sleep(wait).then(() => {  //try to clear mpd
    client.sendCommand(cmd("clear", []), function(error) {
      if (error)  {
        return false;
      } else {
        return true;
      };
    });
  });
};
/**MPD - force mpd to stop playing, ................................. quick stop
* Used when in mpd error state. Note: ompare with mpdEmergencyBrakeMPC()
* @param {integer}   wait, wait time in ms before signalling to mpd
*                    if wait is false stop immediately
 */
async function mpdBrutalStop(wait=100) {
  if (wait !== false) {
    await aux.sleep(wait).then(() => {  //try to stop mpd
      client.sendCommand(cmd("stop", []), function(error) {
        if (error)  {
          return false;
        } else {
          return true;
        };
      });
    });
  }
  else {
    client.sendCommand(cmd("stop", []), function(error) {
      if (error)  {
        return false;
      } else {
        return true;
      };
    });
  };
};
//______________________________________________________________________________
//Music Player Daemon Playback support functions for frontend;       user events
//==============================================================================
//Supports USB Playback page buttons and sliders __________ Backend for Playback

/**Play current track preparations, it hasn't been played yet, it is not in mpd.
 * This function only puts the track in mpd, part of this general flow:
 * ------------- starts here
 * A1. current track hasn't been played yet, it is not in mpd.
 * Note: track might have elapsed 0 or more (frontend duration slider was moved.)
 * B.  First clear the mpd queue and then add track in mpd
 *-------------- ends here and call playCurrentUseMPC(), see next function below
 * C1. If elapsed is 0 track can be played without a seek
 * C2. if elasped > 0, first play and then seek since mpc is used (this is silly)
 * C3. However, elapsed is too close to duration (min. is at least 2 sec)
 * Param 'track' is an object defined in machine, format of each key:
 * songId [integer], duration [float], Title [string], Artist [string]
 * Album [string], albumart [string], path [string] - mpd uri for audio file
 * in /mnt/usb/... (i.e. the attached USB stick)
 * @param {object}           track, machine track object
 * @param {integer}          elapsed, elapsed time in seconds
 * @return {boolean}         true if mpd succesfully started to play
 */
async function playCurrentNotInMPD(track, elapsed) {
//A1. Play a current track, track is not in mpd = it has not been played yet
//B. Clear mpc queue and add the new track..................clear and add track
  //console.log(aux.timeStamp(),"mpc: try to add track into mpc, elap is", elapsed,"\n", track.path);
  let outcome = false;
  try {
    execSync(`sudo mpc clear && sudo mpc add "${track.path}" `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    outcome = true;
    //console.log(aux.timeStamp(), "mpc: . . . cleared mpc, adding path\n", track.path);
  }
  catch (err) {
    console.log(aux.timeStamp(), "mpc: ERROR clearing or adding mpc\n", err);
    signal.emit('mpd-playFail', "addid-failure")
    return false;
  };
  //C1. C2. and C3. happens in playMPC() below
  outcome = await playCurrentUseMPC(track, elapsed);
  return outcome;
};
/**Play current track with mpc commands, plays added track (in single mode)
 * This function starts to play a track that was added in mpd with mpc commands,
 * it is a part of this general flow:
 * A1. current track hasn't been played yet, it is not in mpd.
 * Note: track might have elapsed 0 or more (frontend duration slider was moved.)
 * B.  First clear the mpd queue and then add track in mpd
 * ------------- starts here, and deals with these three cases below:
 * C1. If elapsed is 0 track can be played without a mpc 'seek'
 * C2. if elasped > 0, first 'play' and then 'seek' since mpc is used (this is silly)
 * C3. However, elapsed is too close to duration (min. is at least 2 sec)
 *-------------- ends here and notifies machine
 * In order to get mpd id, mpc must play and the use 'sudo mpc -f %id%'
 * @param {object}           track, track object
 * @param {integer}          elapsed, elapsed time in seconds
 * @return{boolean}          true if mpd eventually started playing succesfully
 */
async function playCurrentUseMPC(track, elapsed) {
  let noPlay = false;
  let outcome = true;
  let duration = track.duration;
  let mpdId = false; //mpdId might be false, then it is likely known by playback
//C2. elapsed is not 0 and not too close too duration, start playing - seek
  if ((elapsed !== 0) && (Math.trunc(duration) - elapsed > 2)) {
  //the mpd needs at least 2 seconds in order to do play and seek
    elapsed = elapsed + 1; //jump forward one second
    //console.log(aux.timeStamp(), "mpd: C2. elapsed + 1:", elapsed);
    try {
      execSync(`sudo mpc play && sudo mpc seek ${elapsed}`,
                        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
      mpdId = await getMpdId(); //mpc must play before the id can be retrieved
      //console.log(aux.timeStamp(), "mpc: continue playing [e, d, id, noPlay]:\n", [elapsed, duration, mpdId, noPlay]);
      signal.emit('mpd-playing', [elapsed, duration, mpdId, noPlay]);

    }
    catch (err) {
      signal.emit('mpd-playFail', "play-seek-failure")
      outcome = false;
    };
    return outcome;
  }
  else if (elapsed === 0 ) {
//C1. Elapsed is 0 here, start playing from the beginning - no seek needed
    try {
      execSync(`sudo mpc play`,
                 {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
      mpdId = await getMpdId(); //mpc must play before the id can be retrieved
    }
    catch (err) {
      signal.emit('mpd-playFail', "play-failure");
      outcome = false;
    };
    outcome && signal.emit('mpd-playing', [0, duration, mpdId, noPlay]);
    //outcome && console.log(aux.timeStamp(), "mpc: SIGNAL to playback [0, d, id, noPlay]:\n", [elapsed, duration, mpdId, noPlay]);
    return outcome;
  }
  else {
//C3. Elapsed is too close to duration - no play is true here
    if (outcome === true) {
      //true --> noPlay is set to true; no play, no render
      mpdId = await getMpdId(); //mpc must play before the id can be retrieved
      signal.emit('mpd-playing', [Math.trunc(duration), duration, mpdId, true]);
    };
    return outcome;
  };//  --- end of C3. mpd will NOT play since elasped = duration here
};

/**PAUSE track, pauses current track in mpd
 * @return {boolean}      true or false if mpc and mpd failed
 */
function pauseCurrentMPC() {
  try {
    execSync(`sudo mpc pause`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
            return true;
  }
  catch (err) {
    return false;
  };
};
/**Get the unique mpd id. mpc will return the id only if the track is playing.
 * 'sudo mpc -f %id%' returns three lines, the first line is the id as a string.
 * ---
 * "11  \n
 * [playing] #1/1   1:07/3:36 (31%) \n
 * volume: 10%   repeat: off   random: off   single: on    consume: off"
 * ---
 * If mpc is not playing only the 3rd line shows. That is a string of length 68.
 * @return {string/false}    numeric string, e.g. "11", or false
 */
 function getMpdId() {
   let mpdIdString = "";
   let mpdId = "";
   try {
     mpdIdString = aux.mpdMsgTrim(
      execSync(`sudo mpc -f %id% | head -n1`,
                {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000}));
      if (mpdIdString.length > 50) {
        mpdId = false;  //the string has to be the 3rd line, too many characters
      }
      else {
        mpdId = mpdIdString;  //numeric string, e.g. "11"
      };
   }
   catch (err) {
     console.log(aux.timeStamp(),"mpc: mpd ERROR cannot get mpd id/n", err);
     mpdId = false;
   };
   return mpdId;
 };

/**Stop mpd now!  . . .
 * @return {boolean}    true or false when in error state
 */
function mpdEmergencyBrakeMPC() {
  try {
    execSync(`sudo mpc stop`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    return true;
  }
  catch(err) {
    return false;
  };
};
/**When there is only one track, and it is playing - just do a seek to start
 * (called by nextTrack or previousTrack for single play) NOT IN USE - delete
 * @browser {player playlist} render all open browsers
 * @return  {boolean}         true   //CAN BE REMOVED - didn't work as intended
 */
function singleNextOrPreviousMPC() {
  try {
    execSync(`sudo mpc seek 0`,
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    return true;
        }
 catch (err) {
   //console.log(aux.timeStamp(), "mpd: throw this error ---------:\n", err);
   return false;
  };
};
/**Do mpc seek. mpc seek only works for a track being played. So it mpc fails
 * try with an explicit mpd command, in this case "seekcur.
 * mpd error message to console: 'MPD error: Not playing'
 * @param  {integer}      newElapsed value in seconds
 * @return {boolean}      true if mpc was successful
 */
function seekDurationMPC(newElapsed) {
  try {
    execSync(`sudo mpc seek ${newElapsed}`,
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    return true;
        }
  catch (err) {
   //mpc failed to set new elapsed time, try with mpd...
   client.sendCommand(cmd("seekcur", [newElapsed]), function(err) {
     if (err)  {
       //console.log(aux.timeStamp(), "mpd: seekcur FAILED:\n", err);
       console.log(aux.timeStamp(), "mpd: seekcur FAILED, elapsed not set!");
       return false;
     }
     else {
       console.log(aux.timeStamp(), "mpd: seekcur set the elapsed, this time!");
       return true
     };
   });
  };
};
/**Used when USB playback has to be stopped immediately. Called at boot phase 1,
 * used by 'btsp.restartMpdAndStreaming()', 'play.clearPlaylist()' and
 * of course 'play.seekStop()' - which was the origin to this function.
 * @return {boolean}      true if successful
 */
function seekStopMPC() {
  try {
    execSync(`sudo mpc stop`,
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    return true;
        }
 catch (err) {
    return false;
  };
};
/**Machine - set volume in mpd
 * Turn the volume up or down on mpd with mpc command.
 * @param  {integer}      volume new value for volume in percent
 * @return {boolean}      true if successful
 */
 function setVolumeMPC(volume) {
   try {
     execSync(`sudo mpc volume ${volume}`,
           {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
     return true;
         }
  catch (err) {
     return false;
   };
 };
 // Playlist page buttons and sliders ______________________Backend for Playlist
 /**CLEAR the mpd Playlist with mpc and it stops playing as well
  * @return {boolean}    true if successful
  */
function clearPlaylistMPC() {
  try {
    execSync(`sudo mpc clear`,
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    return true;
        }
 catch (err) {
    return false;
  };
};
// UPnP streaming stopped - mpd needs to be reset
/**CLEAR the mpd Playlist with mpc and it stops playing as well
* @param {string}       state, 'pause' needs to be put to mpd stop
* @param {boolean}      errorFLG, if true clear mpd for errors
 * @return {boolean}    true if successful
 */
function resetAfterUpnpMPD(state, errorFLG) {
  client.sendCommand(cmd("clear", []), function(err, msg) {
  });
  //mpd cannot be paused, it has to be put to stop
  (state == "pause") && client.sendCommand(cmd("stop", []), function(err, msg) {
  });
  errorFLG && client.sendCommand(cmd("clearerror", []), function(err, msg) {
  });
  client.sendCommand(cmd("single", [1]), function(err) {
  });
}
