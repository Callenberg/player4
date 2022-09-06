//Copyright 2022 by Retro Audiophile Designs, all rights reserved.
//GNU General Public License v3.0 see license.txt            [Source code]
//      ~ loop control for detecting streaming and USB playback ~

const aux = require('./machine-auxiliary.js');
const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synced Raspbian cmds
const fs = require('fs');                           //for reading files
var watch = require('node-watch');                  //for checking log file
const events = require('events');                   //for creating events
const signal = new events.EventEmitter();

module.exports.signal = signal;
module.exports.loopCtlAtBoot = loopCtlAtBoot;
module.exports.stopStreamsensor = stopStreamsensor;
module.exports.stopPollingAll = stopPollingAll;

module.exports.upnpMightPlay = upnpMightPlay;

module.exports.restartBluetoothDetect = restartBluetoothDetect;

module.exports.loopCtlBootPreparations = loopCtlBootPreparations;

//______________________________________________________________________________
//File write/read solution:
// a) Spotify and Airplay use hooks that calls shell scripts, the scripts write
//    the value on file '/var/log/streamsensor.log'; 'spot:start' or 'airp:start'
// b) UPnP uses hooks that call three shell scripts, they write the value to
//    '/var/log/mpddetect.log'; 'mpd:start' | ':stop'. Then if the settings of
//    mpd 'single' is off 'upnp:start' is written to '/var/log/streamsensor.log',
//    otherwise 'usbp:start'. When UPnP stops the value 'upnp:stop' is written or
//    if USB playback halts 'usbp:stop'.
// c) Bluetooth streaming to analogue speakers (through the amp) is discovered
//    when bluealsa-aplay uses the alsa. The pid is detected and 'btsp:start' is
//    written to /var/log/streamsensor.log'. If halted 'btsp:stop' is written.
//    When bluetooth streaming and bluetooth speakers are used the discovery
//    is done by reading the file /var/log/bluetoothdetect and analyze the open
//    files of the systemd service bluealsa-aplay.

// newStreamingStatus() is the detector and notifies the machine about changes
// pollStreamingStatus() is the main loop reading '/var/log/streamsensor.log'
// pollStreamingStatus() uses the node-watch package with a short interval.

// btLoop() discovers bluetooth streaming and writes to '/var/log/streamsensor.log'.
// btLoop() also analyzes the content of the file that btDetect is writing to.
// btloop uses the timer 'btLoopTimer', timer [4]

// btDetect() writes the open file patterns of blueasalsa-aplay to figure out
// what kind of bluetooth streaming is going on (through amp - bluetooth speaker)
// btDetect uses timer btDetectTimer, timer [2]

// mpdLoop() discovers UPnP streaming and writes to '/var/log/streamsensor.log'
// mpdLoop() also analyzes the settings of mpd using 'sudo mpc status'
// mpdloop() uses the timer mpdLoopTimer, timer [5], the last one to start
// (Originally there was a third loop around for upnpdetect, refered to as [3] )

var isUPnP = false;

//Global Variables______________________________________________________________
//timer holders and their start orders in [..]
var watcher = false;          //[1] node-watch package, not used as timer
var btDetectTimer = false;    //[2] writes on file, might be reset, requires pid
                              //[3] not in use anymore...
var btLoopTimer = false;      //[4] reads from file btDetect, requires alsa pid
var mpdLoopTimer = false;     //[5] requires alsa pid

//timer interval holders and synchronization
const watcherInterval =    900;  //base interval (node-watcher uses 200 ms)   [1]
//[2] intervals write open file patterns on files...
const btDetectInterval =   watcherInterval * 1.1; //writes bluetooth patterns [2]
//[4] reads [2] patterns and analyze them, but [5] do not need an extra loop
const btLoopInterval =     btDetectInterval + (btDetectInterval * 0.27);    //[4]
const mpdLoopInterval =    watcherInterval;                                 //[5]

//----------------------------------------------------------------------- [boot]
/** Later in the boot phase the control loops of streaming can be started.
 * It has to be started after all streaming services are up.
 * @return {boolean}      true
 */
async function loopCtlAtBoot() {
//console.log(aux.timeStamp(),"loopCtl:       [START]");
// 2. only The start of the special loop has to be synchronized with [4]
  if (btDetectTimer === false) {
    await bluetoothDetect();
  };
  // 4. + 5. starts a little bit delayed
  if (btLoopTimer === false) {
    await bluetoothLoop();    //  [4]
  };
  if (mpdLoopTimer === false) {
    await mpdLoop();          //  [5]
  };
  // 1. main detection of '/var/log/streamsensor.log'
  if (watcher === false) {
       pollStreamingStatus(); //detects all streaming and Player USB playback
    };
  return true;
};
//............................................................ [detect protocol]
/** When the state has changed an event is fired to the machine. The switch
 * statement is the protocol to detect changes in specfic streaming. The changes
 * of all streaming and playback are detected by pollStreamingStatus() below.
 * The format is basically: 'idle:stop', '<service>:start', '<service>:stop'
 * One problem is that librespot starts with a pause as initiation - which make
 * sense maybe, e.g.'spot:stop paused' is written to var/log/streamsensor.log,
 * sometimes that is right, sometimes not. It happens it sends 'spot:start started'
 * as well - that is also bad if it is idle? So those two are no longer written
 * by the script '/player/spotifyevent.sh'
 * Note that idle:stop means that no streaming/playing has occured yet.
 * @return {?}            of no interest
 */
 function newStreamingStatus(newState) {
   //console.log(aux.timeStamp(),"loopCtl: incoming new state [", newState,"]");
         switch(newState) {
           case "spot:start":
           signal.emit('spotify-play');
           break;
           case "spot:stop":
           signal.emit('spotify-stop');
           break;
           //case "spot:start started":
           //signal.emit('spotify-play'); //is not signalled anymore
           //break;
           //case "spot:stop paused":
           //signal.emit('spotify-stop'); //is not signalled anymore
           //break;
           case "airp:stop":
           signal.emit('airplay-stop');
           break;
           case "airp:start":
           signal.emit('airplay-play');
           break;
           case "btst:stop":
           signal.emit('blue-stop');
           break;
           case "btst:start":
           signal.emit('blue-play');
           break;
           case "upnp:stop":
           signal.emit('upnp-stop');//loop.mpdloop() has detected UPnP
           break;
           case "upnp:pause":
           signal.emit('upnp-paused');//rare event, does it happen?
           break;
           case "upnp:start":
           signal.emit('upnp-play');//loop.mpdloop() has detected UPnP
           break;
           case "usbp:start":
           signal.emit("usb-play"); //loop.mpdloop() has detected playback
           break;
           case "usbp:stop":
           signal.emit("usb-stop"); //loop.mpdloop() has detected playback
           break;
           case "":
           //"", empty string, is not a valid value, wait for next read
           break;
           case "idle:stop":
           //wait for next read
           default:
           signal.emit('stream-error');
           break;
        };
};
//This is the main loop:............................................ [Main loop]
/** Reads the file 'var/log/streamsensor.log' for all states of streaming.
 * This function reads the file when its been updated, trims the string value
 * and checks if the state has changed. If so it calls newStreamingStatus('state')
 * The following scripts writes to the file:
 * '/player/spotifyevent.sh', '/player/airplayon.sh' and '/player/airplayoff.sh'
 * '/player/upnpon.sh', '/player/upnpoff.sh' and '/player/upnppause.sh'
 * The functions btLoop() and mpdLoop() write to the file as well.
 * The format is basically: 'idle:stop', '<service>:start', '<service>:stop'
 * Uses node-watch package because it is fast an accurate.
 * The default interval is 200 ms, which is quite often. Use format:
 * 'watch('./', { delay: nnnnn }, function(){ . . .   );
 * Original a read file loop with timer.
 * Optional: 'fs.watchFile('/var/log/streamsensor.log', (curr, prev) => {'
 *            or 'fs.watch('/var/log/streamsensor.log', (eventType) => { '
 * @param {watcher}      watcherInterval not in use anymore
 * @return {?}           of no interest
 */
function pollStreamingStatus(interval=watcherInterval) {
   let state     = "idle:stop";
   let oldState  = "idle:stop";
   //console.log(aux.timeStamp(),"loop: ctl poll is going to start reading| ==>" );
   //Start to watch the sensor file
   watcher = watch('/var/log/streamsensor.log', function (evt, name) {
     if (evt == 'update') {
       //console.log(aux.timeStamp(), "ctl: watch detected update");
       try {
         execSync( `sudo sync -d /var/log/streamsensor.log`,
                      {uid: 1000, gid: 1000, encoding: 'utf8'});
         state = aux.mpdMsgTrim(fs.readFileSync('/var/log/streamsensor.log', 'utf8'));
         //console.log(aux.timeStamp(),"poller: reading           |", state );
       }
       catch (err) {
         console.log(aux.timeStamp(),"poller: ERROR\n", err);
         state = "idle:stop";
         oldState = "idle:stop";
       };
       if (state === oldState) {
         //NO CHANGE - no action
       }
       else {
         //CHANGE - notify
         //console.log(aux.timeStamp(),"loop:[",oldState, "->", state,"]");
         oldState = state;
         newStreamingStatus(state);
       };
     };
   });
 };

/** Stop Spotify or Airplay when all streaming services are stopped by user.
 * The reason is that the hooks cannot detect a stop or restart by 'systemd'.
 * Used in machine.js at event 'socket.on('stop-streaming-now'...' also used
 * in machine caught event 'bluetooth-required-restart' -restart after bt events
 * Now it also writes "idle:stop", as well as '<service>:stop' for user stops.
 * @param {string}  service, Spotify or Airplay and idle
 * @return {string} service
 */
function stopStreamsensor(service) {
  if (service === "spot" ) {
    fs.writeFileSync( '/var/log/streamsensor.log', "spot:stop");
  }
  else if (service === "airp") {
    fs.writeFileSync( '/var/log/streamsensor.log', "airp:stop");
  }
  else {
    fs.writeFileSync( '/var/log/streamsensor.log', "idle:stop");
  };
  return service;
};
/** Stop watching all the files for changes in service states. Used when services
 *  must stop and then eventually start again. bluealsa-aplay pid is lost.
 * @global {timers}  all the timers started in loopCtlAtBoot above
 * @return {?}        of no interest
 */
async function stopPollingAll() {
  if (watcher !== false)  {
    await watcher.close();  //stop node-watcher function
    //console.log(aux.timeStamp(),"poller: ... [1]STOPPED watching, X X X X");
  };
  if (btDetectTimer !== false) {
    await clearInterval(btDetectTimer);
    //console.log(aux.timeStamp(),"bt detect:  [2]STOPPED loop, X X X X");
  };
  if (btLoopTimer !== false) {
    await clearInterval(btLoopTimer);
    //console.log(aux.timeStamp(),"bt loop:    [4]STOPPED loop, X X X X");
  };
  if (mpdLoopTimer !== false) {
    await clearInterval(mpdLoopTimer);
    //console.log(aux.timeStamp(),"mpd loop:   [5]STOPPED loop, X X X X");
  };
};
//........................................................ [bluetooth detection]
/** bluetooth streaming - watchers for patterns that indicates
 * that bluetooth is streaming to Player, the finding is written to the file:
 * '/var/log/streamsensor.log'. It can be analogous speakers or a Bluetooth speaker
 * A) Find the pid that uses the alsa: [amp and analogue speakers]
 * `sudo cat /proc/asound/card0/pcm0p/sub0/status | fgrep  owner_pid | cut -d':' -f2 `
 * B) Find if Bluetooth is streaming to analogue speakers:
 * 'sudo pmap -q -A ffff1000,ffff1100 <pid> | | cut -d'-' -f1 | cut -d':' -f2`'
 * C) Then check for 'anon_inode:[eventfd]' if alsa is not running. That is the
 * name of an open file for bluealsa-aplay that defines that sound is streamed to
 * a bt speaker, look for 'anon_inode:[eventfd]' in /var/log/bluetoothdetect.log'
 * Note: bluetoothDetect() continuously writes the names of open files.
 * If file content is "" = no action, otherwise a 390 char string is read.
 * Note: there might be timing issues
 * 'pmap -q -A ffff1000,ffff1100 <pid'                              [~35 ms]
 * 'cat /proc/asound/card0/pcm0p/sub0/status | fgrep  owner_pid...' [~22 ms]
 * @global {btLoopTimer}    holds pointer to timer
 * @return {object}         timer
 */
function bluetoothLoop(interval=btLoopInterval) {
  let alsaPid = "";
  let alsaBin = "";
  //let oldPid = "";    //old alsa PID
  let btBin = "/usr/bin/bluealsa";
  let oldBin = "";
  let btString = "idle";  //bt speaker streaming
  let oldString = "idle"; //bt speaker streaming
  //console.log(aux.timeStamp(),"bt loop:    [4]started loop, reading > > > > I:", interval);
  let pollTimer = setInterval(function() {
//Step 1: detect bt using alsa
    try {
      alsaPid = aux.mpdMsgTrim(execSync(
              `sudo cat /proc/asound/card0/pcm0p/sub0/status | fgrep  owner_pid | cut -d':' -f2 `,
               {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 1000}));
    }
    catch (err) {
      console.log(aux.timeStamp(),"alsa loop: file read ERROR ", err);
      alsaPid = "";
      oldBin = "";
    };
    if (alsaPid === "") {
//A. there is no pid running alsa, alsa is "closed" -- CHECK IT OUT
        if (btBin !== oldBin) {
//A1. NO CHANGE - STILL IDLE, alsa was already closed - no action, all well...
           //oldBin = ""; //should i be set to "" here?
          //NO ACTION!...                                         [LOOP END]----
        }
        else {
//A2. CHANGE - BECAME IDLE, alsa just closed, no pid
          //console.log(aux.timeStamp(),"alsa loop: CHANGED to NO alsa process o|", oldBin)
          oldBin = "";
          //Signal that Bluetooth has STOPPED!
          try {
           exec(`sudo echo "btst:stop" > /var/log/streamsensor.log `,
                    {uid: 1000, gid: 1000, encoding: 'utf8'});
           //console.log(aux.timeStamp(),"bt loop: btst:stop written");
          }
          catch (err) {
            console.log(aux.timeStamp(),"bt loop: write failed ERROR \n ", err);
          };
          //alsa is not used anymore                              [LOOP END]----
        };
      }
      else {
//B. there is a pid running alsa - get the bin file name
        try {
            alsaBin = aux.mpdMsgTrim(execSync(
            `sudo pmap -q -A ffff1000,ffff1100 ${aux.mpdMsgTrim(alsaPid)} | cut -d'-' -f1 | cut -d':' -f2 `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 1000}));
        }
        catch (err) {
          console.log(aux.timeStamp(),"alsa loop: pmap read ERROR ", err);
          alsaBin = "";
          oldBin = "";
        };
        if (btBin !== alsaBin) {
//B1. NO CHANGE - it was NOT /usr/bin/bluealsa-aplay pid running alsa
          oldBin = alsaBin;
          //NO ACTION!...                                         [LOOP END]----
        }
        else {
          if (btBin !== oldBin) {
//B2. CHANGE bluealsa-aplay started to use alsa
            oldBin = alsaBin;
            //console.log(aux.timeStamp(),"alsa loop:",alsaPid, "got the alsa, a|", alsaBin);
            //Signal that Bluetooth has STARTED!
            try {
             exec(`sudo echo "btst:start" > /var/log/streamsensor.log `,
                      {uid: 1000, gid: 1000, encoding: 'utf8'});
             //console.log(aux.timeStamp(),"bt loop: btst:start written");
            }
            catch (err) {
              console.log(aux.timeStamp(),"bt loop: write failed ERROR \n ", err);
            };
            //alsa is used by btPid!                              [LOOP END]----
          };        //ends when btPis is not the oldPid -> alsa started
        };          //ends when btPid = alsaPid, btPid has the alsa
      };            //ends when there is a pid running alsa
//Step 2: detect if bt speaker is used by Bluetooth - no alsa is running
    //looking for the string 'anon_inode:[eventfd]' (i.e. name of an open file)
    if (alsaPid === "") {
      //alsa is not used, read the detect file for bt speaker
      try {
        execSync( `sudo sync -d /var/log/bluetoothdetect.log`,
                     {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 1000});
        btString = aux.mpdMsgTrim(fs.readFileSync('/var/log/bluetoothdetect.log', 'utf8'));
        //console.log(aux.timeStamp(),"bt loop:, bt string length =", btString.length);
        if (btString === "") {
          //btString might be "", which is not a valid value, wait for next read
          btString = oldString  //discard read...
        }
      }
      catch (err) {
        btString = "idle";    //initial value
        oldString = "idle";
      };
      if (btString.indexOf("anon_inode:[eventfd]") === -1) {
//C. there is NO sound streaming to bt speakers
        if (oldString.indexOf("anon_inode:[eventfd]") === -1) {
//C1. NO CHANGE - bt speaker still IDLE
          //NO ACTION!...                                         [LOOP END]----
        }
        else {
//C2. CHANGE - bt speaker are NOT used anymore
          oldString = btString;
          //Signal that Bluetooth speaker has no sound now!
          try {
           exec(`sudo echo "btst:stop" > /var/log/streamsensor.log `,
                    {uid: 1000, gid: 1000, encoding: 'utf8'});
           //console.log(aux.timeStamp(),"bt loop: btst:stop written for bt speaker");
          }
          catch (err) {
            console.log(aux.timeStamp(),"bt loop: write failed ERROR \n ", err);
          };
          //bt speaker is not used anymore, STOP                  [LOOP END]----
        };
      }
      else {
//D. bt speaker is used - streaming is going on
        if (oldString.indexOf("anon_inode:[eventfd]") > -1) {
//D1. NO CHANGE - stream on...
          //bt speaker still used, it is streaming...             [LOOP END]----
        }
        else {
//D2. CHANGE bt speaker has just STARTED to be used
          oldString = btString;
          //Signal that Bluetooth speaker has STARTED!
          try {
           exec(`sudo echo "btst:start" > /var/log/streamsensor.log `,
                    {uid: 1000, gid: 1000, encoding: 'utf8'});
           //console.log(aux.timeStamp(),"bt loop: btst:start written for bt speaker");
          }
          catch (err) {
            console.log(aux.timeStamp(),"bt loop: write failed ERROR \n ", err);
          };
          //bt speaker has just started to be used - it started   [LOOP END]----
        };      //ends when btString != oldString, bt speaker just got sound
      };        //ends when btString != "", bt speaker are in use
    };          //ends when alsa is not streaming
    //console.log(aux.timeStamp(),"bt loop: bt|",btString.length,"o|",oldString.length);
  }, interval);    // execute time interval in ms, pretty tight and often
btLoopTimer = pollTimer;
};
/** bluetooth streaming - writes open file patterns that indicates
 * if bluetooth is streaming to Player and to Bluetooth speaker.
 * How to find if Bluetooth is streaming to a blutooth speaker:
 * Get the bluealsa-aplay pid, find it quickly: [under 50 ms]
 * 'sudo systemctl status aplay | fgrep  "Main PID:" | cut -d' ' -f4'
 * Note the 'btPid' is not constant - it changes at boot, it changes to/from
 * bt speaker or at restarts, all makes the btPid to change.
 * Given the btPid, write the file names of the file desriptors in
 * '/proc/<btPid>/fd', that is done by the script '/player/fdinfobluesalsa.sh',
 * The linux 'cmd readlink <fd>' is used by the script, 8 ms per fd.
 * The fd's are open files used by the service bluealsa-aplay.
 * @global {btDetectTimer}    holds pointer to timer
 * @return {object}           timer
 */
function bluetoothDetect(interval=btDetectInterval) {
  let btPid = "";
  //console.log(aux.timeStamp(),"bt detect:  [2]started loop, reading > > > > I:", interval);
  exec(`echo "idle" > /var/log/bluetoothdetect.log`,
                 {uid: 1000, gid: 1000, encoding: 'utf8'});
  try { //can now be replaced with aux.getServicePid("bluealsa-aplay");
    btPid = aux.mpdMsgTrim(execSync(`sudo systemctl status bluealsa-aplay | fgrep  "Main PID:" | cut -d' ' -f6 `,
             {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 1000}));
    execSync( `sudo sync -d /var/log/bluetoothdetect.log`,
              {uid: 1000, gid: 1000, encoding: 'utf8'});
    console.log(aux.timeStamp(),"bt detect: started [2]: aplay pid =", btPid);
  }
  catch(err) {
    console.log(aux.timeStamp(),"loopCtl: pid ERROR", err);
  };
  //Loop:
  btDetectTimer  = setInterval(function() {
    //exec(`sudo /usr/bin/lsof -POlLwnp ${btPid} | tail -n8 > /var/log/bluetoothdetect.log`,
    exec(`sudo /player/fdinfobluesalsa.sh ${btPid}`,
                   {uid: 1000, gid: 1000, encoding: 'utf8'});
  }, interval);
};
//..................................................... [mpd and UPnP detection]
/** mpd and UPNP streaming - watchers for open file patterns that indicates
 * that mpd is used and if Player USB is playing or UPnP is streaming to Player.
 * The hooks for upmpdcli also fires when mpd is used by Player USB playback!
 * The trick is to know when it is Player or UPnP using mpd.
 * This loop checks the status of mpc, there is no need för mpd pid here anymore.
 * There are also hooks that write to the file '/var/log/mpddetect.log',
 * format = 'mpd:start|stop', by the service upmpdcli, when the play/stop/pause
 * events are fired. At the moment the file is not used.
 * However, often the mpd status message is detected before the mpc status,
 * by machine-mpd.js, it calls upnpMightPlay() below.
 * Note 2: Another indication whether USB or UPnP is in use is if mpc is in
 * single mode or not: 'sudo mpc status' -> ' ... single: on ...' That is used
 * here since it is fast and simple. It is also less complicated and faster than
 * looking at open files on fd-level.
 * Note: there might be timing issues to consider in the loop part
 * 'pmap -q -A ffff1000,ffff1100 <pid>'                              [~35 ms]
 * 'cat /proc/asound/card0/pcm0p/sub0/status | fgrep  owner_pid...' [~22 ms]
 * 'mpc status'                                                     [ ~9 ms]
 * @global {timer object}   mpdLoopTimer,holds pointer to timer
 * @global {boolean}        isUPnP, true when upmpdcli is using mpc/mpd
 * @return {object}         timer
 */
 function mpdLoop(interval=mpdLoopInterval) {
   let mpcStatus = "";
   let mpcOldStatus = "";
   let isPlaying = false;
//Step 1: LOOP STARTS - get the pid using alsa or find out if alsa is idle
   //console.log(aux.timeStamp(),"mpd loop:  started [5], Interval:", interval,"ms");
   isUPnP = false;                  //true when upnp and mpd is running [GV]
   let pollTimer = setInterval(async function() {
     mpcOldStatus = mpcStatus;
     try {
       mpcStatus = aux.mpdMsgTrim(
         execSync(`sudo mpc status `,
                {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 1000}));
       //console.log(aux.timeStamp(), "mpc:", mpcStatus)
     }
     catch (err) {
       //This error might happen - reset to older value, and loop again.
       console.log(aux.timeStamp(),"mpd loop: mpc status - *GLITCH* [W]");
       //console.log(aux.timeStamp(),"mpd loop: mpc status read ERROR \n", err);
       mpcStatus = mpcOldStatus;
       //isPlaying = false;
       //isUPnP = false;
     };
    //mpc string when idle:
    // volume: 15%   repeat: off   random: off   single: on    consume: off
    //mpc string when playing:          '[playing]' is unique
    // Earth, Wind & Fire - September
    // [playing] #1/2   0:01/3:36 (0%)
    // volume: 15%   repeat: off   random: off   single: on    consume: off
     if (mpcStatus.indexOf("[playing]") === -1) {
//A. CASE - IDLE: mpc is not playing
         if (isPlaying === false) {
//A1. NO CHANGE - STILL IDLE, mpc was not playing before - no action, all well...
           //NO ACTION!...                                        [LOOP END]----
         }
         else {
//A2. CHANGE - BECAME IDLE, mpc was playing before now it is not
//console.log(aux.timeStamp(),"mpd loop: || -------- || --------- ||\n", mpcStatus);
           isPlaying = false;
           if (isUPnP === false) {
             // mpc was not used by UPnP, USB playback was stopped
             mpdUsbCtl(false);  //false --> usbp:stop is written
           }
           else {
             // UPnP streaming stopped
             isUPnP = false;
             try {
               exec(`sudo echo "upnp:stop" > /var/log/streamsensor.log `,
                 {uid: 1000, gid: 1000, encoding: 'utf8'});
               console.log(aux.timeStamp(),"mpd loop: upnp:stop written for UPnP");
             }
             catch (err) {
               console.log(aux.timeStamp(),"mpd loop: write failed UPnP ERROR \n ", err);
             };
           }
           //mpc is not used anymore                              [LOOP END]----
         };
       }
       else if (isPlaying === false) {
//B. CASE - mpc IS USED: mpc started to Play since isPlaying is false here
//console.log(aux.timeStamp(),"mpd loop: |>--------|>--------- |>\n", mpcStatus);
            if (mpcStatus.indexOf("single: on") > -1) {
 //B1. it is Player USB playback that STARTED using mpd, single is on
              mpdUsbCtl(true); //true --> usbp:start written to /var/log/streamsensor.log
              //console.log(aux.timeStamp(),"mpd loop: Player USB playback PLAY |> .....");
              isUPnP = false; //just in case
              }
              else {
 //B2. UPnP started to stream, but single is not on
 //often mpd.handleMPDStatusUpdate calls upnpMightPlay first...
                  upnpMightPlay(true);  //true -> called by this loop, not mpd
                };    //end of: analyze mpcStatus when mpd started
                //mpd has STARTED! mpc is playing!
                isPlaying = true;
              };      //end of: mpd started to play
  }, interval);    // execute time interval in ms
  mpdLoopTimer = pollTimer;
};
/** Writes the state "upnp:start" to '/var/log/streamsensor.log', status is changed.
 * It can be called from machine-mpd.js as a result of a mpd status message:
 * 'mpd state has changed from 'stop' -> 'play', mpd is playing, but is it
 * UPnP streaming that just started?  [triggered by mpd.handleMPDStatusUpdate()]
 * It has started if mpd ctl detects upmpdcli start indicators:
 * (mpdStatusInbox.options.single == "0") <-- this is a strong indication of UPnP
 * (inbox.status.state === 'stop') && (statusState === 'play')...,
 * Writing to '/var/log/streamsensor.log' directly will notify machine (see above)
 * Used to be called by machine listener mpd.signal.on('upnp-streamed',..;
 * now only kept for testing though.
 * Also called by mpdLoop() above, but often after mpd ctl.
 * @global {boolean}    isUPnP, set to true if called from machine-mpd.js
 * @return {?}         nothing
 */
function upnpMightPlay(wasLoop) {
  isUPnP = true; //Setting to true will notify mpdLoop() of UPnP streaming
  try {
   exec(`sudo echo "upnp:start" > /var/log/streamsensor.log `,
            {uid: 1000, gid: 1000, encoding: 'utf8'});
   /* if (wasLoop === true) {                   //in order to see who is first
     //console.log(aux.timeStamp(),"mpd loop: upnp:start written - by mpd loop...")
   }
   else {
     //console.log(aux.timeStamp(),"mpd loop: upnp:start written - UPnP took over mpd");
   } */
  }
  catch (err) {
    isUPnP = false;
    console.log(aux.timeStamp(),"mpd loop: write failed ERROR - UPnP \n ", err);
  };
};
/** Writes the state of USB playback to '/var/log/streamsensor.log',
 * status is changed. Only called by mpdLoop() above.
 * @param {boolean}    isStarted, true if USB playback started, otherwise false
 * @return {?}         nothing
 */
function mpdUsbCtl(isStarted) {
  if (isStarted === true) {
    try {
     exec(`sudo echo "usbp:start" > /var/log/streamsensor.log `,
              {uid: 1000, gid: 1000, encoding: 'utf8'});
     //console.log(aux.timeStamp(),"mpd loop: usbp:start written - by loop...")
    }
    catch (err) {
      console.log(aux.timeStamp(),"mpd loop: write failed ERROR - USB playback \n ", err);
    };
  }
  else {
    //USB playback has now stopped
    try {
     exec(`sudo echo "usbp:stop" > /var/log/streamsensor.log `,
              {uid: 1000, gid: 1000, encoding: 'utf8'});
     //console.log(aux.timeStamp(),"mpd loop: usbp:stop written - by loop...")
    }
    catch (err) {
      console.log(aux.timeStamp(),"mpd loop: write failed ERROR - USB playback \n ", err);
    };
  };
};

//___________________________________________________________________ [restarts]
 /**Restart the detector for bluetooth streaming to bluetooth speakers.
  * Called at connect/disconnect, reconnect, but also at boot.
  * Check out: 'btsp.restartBluealsaAplay()'
  * @return {boolean}       true
  */
 async function restartBluetoothDetect() {
   //console.log(aux.timeStamp(),'bt detect: RESTART bt detect loop by...');
   if (btDetectTimer !== false)  {
     await clearInterval(btDetectTimer);
     console.log(aux.timeStamp(),'bt detect:         [2]bt timer cleared [X]');
   };
   await bluetoothDetect();
   return true;
 };

//..................................................... preparations before BOOT
/** Called by machine BEFORE boot - clears log files
 * Note: if not boot, requires stopPollingAll() call first to clear up timers
 * @return {?}        of no interest
 */
async function loopCtlBootPreparations() {
  mpdLoopTimer = false;
  btLoopTimer = false;
  btDetectTimer = false;
  watcher = false;
  await resetLogFile("/var/log/streamsensor.log", "idle:stop");
  await resetLogFile("/var/log/bluetoothdetect.log", "idle");
  await resetLogFile("/var/log/mpddetect.log", "mpd:idle");
  //await resetLogFile("/var/log/upnpdetect.log", "idle");
}
/** Called by loopCtlBootPreparations() - clears a file
 * @param {string}    path file path
 * @return {?}        of no interest
 */
async function resetLogFile(path, initString) {
  try {   //Confirm that the log file is in place
    execSync(`sudo touch  ${path} && sudo chmod 0777 ${path} && sudo echo ${initString} >  ${path}`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch (err) { //ERROR: If error try again...
    console.log(aux.timeStamp(),'loop: log file reset ERROR:,',path,"\n", err);
    await touchError(path);
    await echoError(path, initString);
  };
};
//helper to above
function touchError(path) {
  let outcome = false;
  try {
    execSync(`sudo rm -f ${path} `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    execSync(`sudo sleep 2`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
    execSync(`sudo touch  ${path} `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    execSync(`sudo chmod 0777 ${path} `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
    outcome = true;
  }
  catch (err) {
    console.log(aux.timeStamp(),'loop: FATAL FILE ERROR [touch],',path,"\n", err);
  };
  return outcome;
};
//Helper to above
function echoError(path, initString) {
  let outcome = false;
  try {
    execSync(`sudo rm -f ${path} `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    execSync(`sudo sleep 2`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
    execSync(`sudo touch  ${path} `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    execSync(`sudo chmod 0777 ${path} `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
    execSync(`sudo echo ${initString} >  ${path}`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    outcome = true;
  }
  catch (err) {
    console.log(aux.timeStamp(),'loop: FATAL FILE ERROR [echo],',path,"\n", err);
  };
  return outcome;
};
