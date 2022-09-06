//Copyright 2022 by Retro Audiophile Designs, all rights reserved.
////GNU General Public License v3.0 see license.txt            [Source code]
//            ~ Bluetooth audio sink handler for backend ~
const aux = require('./machine-auxiliary.js');      //all the utils
//const loop = require('./machine-loop.js');
const mpd = require('./machine-mpd.js');            //restart mpd, connect socket
const blut = require('./machine-bluetooth.js');
//const play = require('./machine-playback.js');
const nwork = require('./machine-network.js');
const res = require('./machine-restart.js');        //restart streaming
const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synced Raspbian cmds
const events = require('events');                   //for creating events
const signal = new events.EventEmitter();

module.exports.btScan = btScan;
module.exports.btConnectCtl = btConnectCtl;
module.exports.btDisconnectCtl = btDisconnectCtl;
module.exports.btDisconnect = btDisconnect
module.exports.btUntrustCtl = btUntrustCtl;

module.exports.signal = signal;

module.exports.connectedSink = connectedSink;
module.exports.resetAlsaToAmp = resetAlsaToAmp;
module.exports.disconnectedSink = disconnectedSink;
module.exports.getAllSinks = getAllSinks;

module.exports.isFile = isFile;
module.exports.isAmpMuted = isAmpMuted;
module.exports.muteUnmuteAmp = muteUnmuteAmp;
module.exports.btAmpManagement = btAmpManagement;
module.exports.disableAsoundConf = disableAsoundConf;
module.exports.btIsDeviceConnected = btIsDeviceConnected;
module.exports.isTrusted = isTrusted;
module.exports.btIsDeviceAvailable = btIsDeviceAvailable;
module.exports.isDeviceAudiosink = isDeviceAudiosink;
module.exports.isDeviceAudiosource = isDeviceAudiosource;

module.exports.btPairedDevices = btPairedDevices;
module.exports.btAllDevices = btAllDevices;
module.exports.isBluetoothOn = isBluetoothOn;
module.exports.nameAndMacPacker = nameAndMacPacker;
module.exports.bluetoothDeviceName = bluetoothDeviceName;

module.exports.updateConnectedAndTrusted = updateConnectedAndTrusted;
module.exports.getConnectedSinks = getConnectedSinks;
module.exports.getTrustedSinks = getTrustedSinks;

module.exports.restartMpdAndStreaming = restartMpdAndStreaming;
module.exports.restartBluealsaAplay = restartBluealsaAplay;

//Global Variables used as cache of mac addresses:
var connectedSinks = []; //connected sink devices' mac addresses

/** Returns an array with the connected bt speaker mac address as a string. if
 * 'doFlush' is true the array will be updated first, otherwise the already
 * set vaule, i.e. stored value, will be returned.
 * The purpose is to read the global variable outside the file. Used at boot.
 * @param  {boolean}   doFlush, if true check connections first, false = stored
 * @return {array}    an array of one string or the empty array []
 */
async function getConnectedSinks(doFlush) {  //read the global variable outside the file
  if (doFlush === true) {
    //connectedSinks = await updateConnectedAndTrusted();
    await updateConnectedAndTrusted();
    //console.log(aux.timeStamp(), "bt: now UPDATED c=",connectedSinks);
  };
  return connectedSinks;  //return an empty array or an array with a bdaddr
};

var trustedSinks = []; //not connected, but trusted sink devices' mac addresses
async function getTrustedSinks(doFlush) {  //read the global variable outside the file
  if (doFlush === true) {

    trustedSinks = await updateConnectedAndTrusted();
  };
  return trustedSinks; //return an empty array or an array with bdaddr's
};
async function getAllSinks(doFlush){
  if (doFlush === true) {
    await updateConnectedAndTrusted();
  };
  return connectedSinks.concat(trustedSinks);
};
//Set in btConnectctl and reset to "" in connectedSink()
var intransitSink = ""; //soon connected, waiting for btctl confirmation


//Bluetooth sink streaming device management (machine is a source to bt speakers)
//==============================================================================
///NOTE: Bluetooth streaming from machione as a SOURCE, sending audio to bt spkr
//------------------------------------------------------------------------------
/*Bluetooth is streaming FROM the machine (source) TO Bluetooth speaker (sink).
* Only one speaker can be connected at the time. All sorts of Bluetooth scanning
* makes the player stutter! Even pairing might cause trouble.
* Speakers/headphones are always 'trusted', unlike smart phones.*/

//Scan after Bluetooth Speakers ======================================== Scan BT
/** Returns Bluetooth devices that are audio sinks, i.e. speakers or headphones,
 * and that are connectable (ON and appearantly within range). Takes about 30 s.
 * 1st: hcitool scan to get the devices as a string that are really connectable.
 * The result can not be used directly by bluetoothctl, but the findings is used
 * to confirm if a device is on or not. See 'isOnString' below
 * 2nd: btctl scan in order to enable btctl discovered devices in 'devices'.
 * Then check each device if it is of class Audio Sink (0x110b) and connectable.
 * NOTE: the result of the btctl scan is valid for only about 3 minutes.
 * WARNING: the depricated command 'hcitool' is used implicitely; findDevicesOn()
 * @return {array} [{name: "nnn", mac: "xx:yy"}, ...] list of audio sinks objects
 */
async function btScan() {
  let foundDevices = [];
  console.log("")
  console.log(aux.timeStamp(), "bt: scanning for sink devices  ___________ [wait]");
//1. try to find discoverable Bluetooth devices
  //1a. get the really connectable ones that are on and not connected
  //let isOnString = findDevicesOn(); //asynchronous hcitool scan -> string
  let isOnString = "placeholder"; //no asynchronous hcitool scan
  //1b. do a bluetoothctl scan to get them discovered so a connect can be done
  let devices = await btFindDevices();//synchronous bluetoothctl scan -> array!!
  //Note: btctl devices can hold items that are off, but paired or trusted
  if ((isOnString.length > 0) && (devices.length === 0)) {
    //if btclt didn't found any - try again...
    console.log(aux.timeStamp(), "bt: rescanning for sink devices  _________ [rescan]");
    await aux.sleep(300).then(async () => {
      //must wait here so the previous sudo scan process is killed
      devices = await btFindDevices(); //once again
    });
  };
  let numberOfDevices = devices.length;
  if (numberOfDevices > 0) {   //there are devices discovered (by bluetoothctl)
//2. For each btctl device found - check if it is an audio sink (spkr/headphone)
    for(let i = 0; i < numberOfDevices; i++) {
      let deviceBD = devices[i].mac;
      if (await isDeviceAudiosink(deviceBD) === true) {
          foundDevices.push({name: devices[i].name, mac: deviceBD});
        };
      }; // --- ends the for loop
    };
    console.log(aux.timeStamp(),"bt: sink scan result array [ {object},...] \n", foundDevices,"\n");
    return foundDevices;
};
/** Scans for Bluetooth devices that can be managed by bluetoothctl. Returns an array
 * of objects for each device found. Can by any Bluetooth device, source or sink.
 * Further it can be disconnected or even OFF if it is paired/trusted.
 * After the bluetoothctl scan is done the array is valid for 3 minutes.
 * When 3 minutes have passed only paired/trusted devices are left, not the new ones.
 * frolicScan() uses bt-device -l which returns name and mac only, but the first
 * row is "Added devices:".
 * @return {array}     [{name: "nnn", mac: "xx:yy"}, ...] list of bt devices
 */
async function btFindDevices(scanTime = 15000) {
  let devicesString = "";
  let foundDevices = [];
//1. Scan for discoverable Bluetooth devices, they might be paired/trusted
  devicesString = await frolicScan(scanTime);
//2. Extract the name and the bdaddr (mac addresses)
  if (devicesString !== "") {
    let deviceArray = devicesString.split("\n"); //split string at line breaks
    //first element is of no interest (it is "Added devices:") set i to 1 not 0.
    let numberOfDevices = deviceArray.length - 1; //reduce array length with 1
    for(let i = 1; i < numberOfDevices; i++) {
      //console.log(aux.timeStamp(),"bt: DEVICE found:", deviceArray[i]);
      //pairedArray string is on format: 'Galaxy S21 Ultra 5G (8C:DE:E6:25:C5:8C)'
      //bdaddr is "8C:DE:E6:25:C5:8C", 19 chars long from end, hence -19,
      //the name is 20 chars from end, finally 1 and 18 slice off the parentheses...
      let name = aux.mpdMsgTrim(deviceArray[i].slice(0, -20));
      let deviceBD = deviceArray[i].slice(-19).slice(1, 18);
      foundDevices.push({name: name, mac: deviceBD});
      };
    };
  //console.log("bt: found devices after call to frolicScan():/n", foundDevices);
  return foundDevices;
};
/** Scans for Bluetooth devices and calls 'sudo bt-device -l' which returns a long
 * string of findings: 'Added devices: nl\ ENEBY30 (FC:58:FA:ED:57:60)..' If the
 * 'waitTime' is too short it will not find every device (use 15 s at least)
 * NOTE: the result of the scan is valid for 3 minutes only.
 * NOTE: even worse, a device can be disconnected or even OFF if it is paired
 *       or trusted. This is quite a problem with bluetoothctl!
 * 'sudo bt-device -l' is used because it comes with the name and mac, only.
 * 'sudo bluetoothctl devices | cut -d' ' -f2 ' would give the mac addresses.
 * @param  {integer}   waitTime, scaning time in msec
 * @return {string}    string of bluetooth devices - "<bd>nl/<bd>..."
 */
async function frolicScan(waitTime=15000){
  let btDevicesString = "";
//A. clean out any uncontrolled sudo scans
  await cleanOutScanPidsSync(); //be sure that there are no other scans going on
//B. start sudo scan
  startBtSinkScan();    //fire off bluetootctl scan and wait
  aux.sleep(waitTime * 0.5).then(() => {
    //true -> 'still scanning 'message
    signal.emit('bluetooth-scanning', true);//Notify in half time of total time
  });
  await aux.sleep(waitTime).then(() => {
//C. enough scanning
    try {
      btDevicesString = execSync(`sudo bt-device -l `,
              {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000});
      //console.log(aux.timeStamp(), "btsp: bt-device -l yields this string:\n",btDevicesString );
    }
    catch (err) {
      console.log(aux.timeStamp(), "btsp: bt-device -l ERROR:\n", err );
    };
//D. stop the sudo scan process
    cleanOutScanPids(); //no need for a synch here...
  });
  return btDevicesString;
};
/** Starts the scanning for Bluetooth devices by calling:
 * 'sudo bluetoothctl scan on &'  -- spawns its own process
 * @return {string}   pid
 */
function startBtSinkScan() {
  pidString = "";
  try {
    exec(`sudo bluetoothctl scan on`,
            {uid: 1000, gid: 1000 });
    console.log(aux.timeStamp(), "bt: bluetoothctl scan STARTED >>>>>" );
  }
  catch (err) {
    console.log(aux.timeStamp(), "bt: bluetoothctl scan failed  ERROR:\n", err);
  };
};
/** Finds the PID of the sudo scan going on. There should be just one, but if
 * there are more than one that is really bad - they have to be cleared out.
 * NOTE: ther are two versions, synch or asynch - used by 'frolicScan()'
 * WARNING: if there are scans going on that are not controlled, they will
 * totally screw up the whole image, really bad error! That is why the pid is
 * handled in an array so all 'sudo scans' are cleaned out. The process is killed-
 * In order to find the pid try:
 * 'sudo pgrep -a bluetoothctl | fgrep "bluetoothctl scan on" |cut -d' ' -f1 '
 *    --> returns pid (or pids = bad...)  [option '-a' yields full command line]
 * 'sudo ps aux | fgrep bluetoothctl'  -- look for 'sudo bluetoothctl scan on'
 * Do not use: * 'sudo pidof bluetoothctl' or 'sudo pgrep bluetoothctl'
 * @return {boolean}    true
 */
//Sync version: stop of scan processes one at the time
async function cleanOutScanPidsSync() {
  let pid = "";
  try {
    pid =
      execSync(`sudo pgrep -a bluetoothctl | fgrep "bluetoothctl scan on" |cut -d' ' -f1`,
              {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    //console.log(aux.timeStamp(), "btsp:  SYNCH clean out pid - scan PID string -->", pid );
  }
  catch (err) {
    console.log(aux.timeStamp(), "btsp: CANNOT find bluetoothctl scan PID ERROR:\n", err);
  };
  if (pid !== "") {
    let pidArray = pid.split("\n"); //split string at line breaks
    //Format: [ '7642', '28426' ] -- Note: this is bad, should be only one here
    if (pidArray.length === 1) {
      await stopBtSinkScan(pidArray[0]);  //case: normal and expected outcome
    }
    else if (pidArray.length > 1)
     //clean up more than one pid - this is essential to do.
     for (var i = 0; i < pidArray.length; i++) {
       await stopBtSinkScan(pidArray[i]); //case: clean up several bad scans
     };
  };
  return true;
};
//Asynchronous version: stop of scan processes
function cleanOutScanPids() {
  let pid = "";
  try {
    pid =
     aux.mpdMsgTrim(
      execSync(`sudo pgrep -a bluetoothctl | fgrep "bluetoothctl scan on" |cut -d' ' -f1`,
              {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000}));
    //console.log(aux.timeStamp(), "btsp:        clean out pid - scan PID string -->", pid );
  }
  catch (err) {
    console.log(aux.timeStamp(), "btsp: CANNOT find bluetoothctl scan PID ERROR:\n", err);
  };
  if (pid !== "") {
    let pidArray = pid.split("\n"); //split string at line breaks
    //console.log(aux.timeStamp(), "btsp:        clean out pids - scan PID array -->", pidArray );
    //Format: [ '7642', '28426' ] -- Note: this is bad, should be only one here...
    if (pidArray.length === 1) {
      stopBtSinkScan(pidArray[0]);  //case: normal and expected outcome, kill it
    }
    else if (pidArray.length > 1)
     //clean up more than one pid - this is essential to do.
     for (var i = 0; i < pidArray.length; i++) {
       stopBtSinkScan(pidArray[i]); //case: clean up several bad ongoing scans
     };
  };
  return true;
};

/** Stops the scanning for Bluetooth devices by killing the process
 * of the spawned process 'sudo bluetoothctl scan on' in 'startBtSinkScan()' .
 * NOTE: the result of the scan is valid for only about 3 minutes.
 *  i) 'sudo kill -9 <pi>' is a sudden clean with no clean up before terminating
 *  ii) 'sudo kill <pi>'   is used here!
 * @param {string}     pid of invoked bluetoothctl pid
 * @return {boolean}   true if stopped, otherwise false (i.e. error)
 */
function stopBtSinkScan(pid){
  try {
    if (pid != "") {
      exec(`sudo kill ${pid} `, {uid: 1000, gid: 1000});
      //console.log(aux.timeStamp(),"bt: STOPPED scanning with bluetootctl - - -   [X]", pid);
      return true;
    }
    else {
      console.log(aux.timeStamp(),"bt: bluetootctl scan NOT STOPPED      - - -   [!]");
    }
  }
  catch (err) {
    console.log(aux.timeStamp(), "bt: kill <pid> commands failed  ERROR: \n", err);
    return false;
  };
};

//Connect command sequence========================================== Connect Ctl
/** Connect to a Bluetooth sink devices. If the device is not connected, but it
 * is on (i.e. discoverable/scanned) - do the connection by calling btConnect().
 *  Also the incoming Bluetooth must be disabled by turning discoverable off,
 * the machine will become source now, not a sink.
 * @param  {string}    bdaddr bd address, mac address to be connected
 * @Global {string}    intransitSink, set to bdaddr mac address or reset
 * @event  {machine}  'bluetooth-connection-failed'
 * @return {boolean}   true if connected and false if not (some error occured)
 */
async function btConnectCtl(bdaddr) {
  //console.log(aux.timeStamp(),"bt: connect control started,  ------------ [ctl]");
  //NOTE: the check if a speaker is already connected has to done by the machine
  //All other Bt devices (smart phones) has to be disconnected, by machine or here?
  //REMINDER about asound.conf - has to be set at boot as well
  let isOn = true;
  let isConnected = await btIsDeviceConnected(bdaddr); //reachable?
  let outcome = false;
//1. Is the device already connected? If NOT proceed to connection part.
  if (isConnected === false) {
    isOn = await btIsDeviceAvailable(bdaddr);   //check devices in btctl
    //console.log(aux.timeStamp(),"bt: is device still available for Bluetoothctl?", isOn);
    if (typeof isOn !== "boolean") {
      //console.log(aux.timeStamp(),"bt: FATAL ERROR cannot determine if device is on");
    }
//2. The device is not connected, but is it on? if so proceed to connect sequence.
    else if (isOn === true) {
      outcome = await btConnect(bdaddr);   //connection is done here!
      if (outcome === false) {
        intransitSink = "";
        signal.emit('bluetooth-connection-failed', false);
      }
      else {
        //intransitSink is first set in btConnect() below, and reset here??????
        intransitSink = bdaddr;   //connection requested - used in connectSink()
      };
    };
  }
  else {
//3. Device was already connected by itself while the user hesitated...
//   ...and the Connection sequence procedure has already been completed;
//   Finally terminate this function and return true, machine notifies.
    console.log(aux.timeStamp(),"bt: the device was already connected!!!!!!");
    intransitSink = ""; //just in case
    outcome = true; //used by machine to determine outcome
  };
  //console.log(aux.timeStamp(),"bt: connect sequence outcome was", outcome);
  console.log(aux.timeStamp(),"bt: hand over to btcl,  -------------------   =>");
  console.log("");
  return outcome;
};
//Connect [Bluetooth Management Part] ............................... Connect BT
/** Connect to a Bluetooth sink devices. First connect and then trust with
 * Bluetoothctl commands. Device is not paired.
 * Note: the BT speaker must be on at this stage or an error will occurr.
 * @param  {string}    bdaddr bd address, mac address to be connected
 * @global {string}    intransitSink, mac address that becamed connected
 * @return {boolean}   true if connected and false if not (error occured)
 */
async function btConnect(bdaddr) {
  let allGood = false;
  //console.log(aux.timeStamp(), "bt: Pair & Connect & Trust initiates . . .");
  let isItPaired = await isPaired(bdaddr);
    try {
        !isItPaired && execSync(`sudo bluetoothctl pair ${bdaddr} `,
                  {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
        //console.log(aux.timeStamp(), "bt: ...bluetoothctl PAIRED    <===>", bdaddr);
    }
    catch (err) {
      console.log(aux.timeStamp(),"bt: ERROR [Bluetoothctl paired failed]  ", err);
    };
    try {
        execSync(`sudo bluetoothctl connect ${bdaddr} `,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000});
        intransitSink = bdaddr;
        //console.log(aux.timeStamp(), "bt: ...bluetoothctl CONNECTED <===>", bdaddr);
        execSync(`sudo bluetoothctl trust ${bdaddr} `,
                  {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
        //console.log(aux.timeStamp(), "bt: ...bluetoothctl TRUSTED   <===>", bdaddr);
        //execSync(`sudo bluetoothctl trust ${bdaddr} `,
                    //{uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
        allGood = true;
        //console.log(aux.timeStamp(), "bt: ...connected & trusted:", bdaddr);
    }
    catch (err) {
      allGood = false;
      //console.log(aux.timeStamp(),"bt: ERROR [Bluetoothctl trust/connect failed]  ", err);
      console.log(aux.timeStamp(),"bt: ERROR [Bluetoothctl trust/connect failed]  ");
      console.log(aux.timeStamp(),"bt: the speaker did not respond, must be off!  ");
    };
  return allGood;
};

//D. Disconnect the Bluetooth Speaker............................ Disconnect ctl
/** Disconnect to a Bluetooth sink devices. If the device is connected, call
 * btDisconnect(). If the device is already disconnected it might have disconnected
 * itself. Therefore the amp has to be reset anyway. Also the discoverable
 * has to be turned on. The machine will become sink now, not a source.
 * @param  {string}    bdaddr bd address, mac address to be connected
 * @return {boolean}   true if disconnected and false if not (error occured)
 */
async function btDisconnectCtl(bdaddr) {
  //console.log("-> ...disconnect...");
  //console.log(aux.timeStamp(),"bt: disconnect control started                 [*]");
  let outcome = await btDisconnect(bdaddr);
  //console.log(aux.timeStamp(),"bt: disconnect sequence outcome was", outcome);
  //console.log(aux.timeStamp(),"bt: hand over to btcl,  ------------------------=>");
  //console.log("    ...wait........");
  //await btDiscoverySourceDevices(true);
  return outcome;
};
/** Disconnect a Bluetooth sink device by user. btctl disconnects the speaker
 * and will still be trusted. Check that the device is connected before cmd.
 * It will persistenly try to disconnect.
 * @param  {string}    bdaddr bd address, mac address to be disconnected
 * @return {boolean}   true if disconnected and false if not (error occured)
 */
async function btDisconnect(bdaddr) {
    let allGood = false;
    try {
      //console.log(aux.timeStamp(), "bt: Start to disconnect bt spkr", bdaddr);
//A. if the device is connected disconnect with 'remove' command, untrusts as well.
      if (await btIsDeviceConnected(bdaddr) === true) {
        execSync(`sudo bluetoothctl disconnect ${bdaddr} `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000});
        //console.log(aux.timeStamp(), "bt: ...it was connected - disconnect now!");
      }
      else {
//B. Not connected, but still trusted
        console.log(aux.timeStamp(), "bt: ...it was NOT connected!");
        //calls disconnected() to be sure, might have been called by btctl
        disconnectedSink(bdaddr, true); //true = no notify of user
      };
      allGood = true;
    } catch (err) {
//C. ERROR handling
      console.log("bt: ERROR [btctl disconn], trying with btmgmt disconnect", err);
      allGood = false;
      try {
        execSync(`sudo btmgmt disconnect ${bdaddr}" `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000});
      }
      catch(err) {
        console.log("bt: FATAL ERROR [btmgmt disconn] as well");
        try {
          execSync(`sudo hcitool dc ${bdaddr}" `,
                        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000});
        }
        catch(err) {
          console.log("bt: FATAL ERROR [hcitool dc] too!!!");
        };
      };
    };
    return allGood;
};
/** Remove a Bluetooth device by user. It is already disconnected.
 * The device is removed, otherwise it stays trusted and will reconnect. Just
 * doing a disconnect is not enough.
 * @param  {string}    bdaddr bd address, mac address to be untrusted
 * @event   {machine} 'bluetooth-speakeruntrusted'
 * @return {boolean}   true if untrusted and false if not (error occured)
 */
async function btUntrustCtl(bdaddr) {
  let allGood = false;
  //console.log(aux.timeStamp(), "bt: untrust this device:", bdaddr);
  if (await isDeviceAudiosink(bdaddr) === true) {
//A: Untrust a sink and update
    try {
        execSync(`sudo bluetoothctl remove ${bdaddr} `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
      allGood = true
      console.log(aux.timeStamp(), "bt: the SINK is untrusted:", bdaddr);
    }
    catch (err) {
      allGood = false;
    };
    await updateConnectedAndTrusted();     //update global variables
    let connections = await nameAndMacPacker(connectedSinks, true); //pack for frontend
    let trustees = await nameAndMacPacker(trustedSinks, false);     //pack for frontend
    //Update machine!
    signal.emit('bluetooth-speakeruntrusted', {array: connections.concat(trustees),
                                               mode: true}); //no notifications
  }
  else if (await isDeviceAudiosource(bdaddr) === true) {
//B: Untrust a source and update
    try {
        execSync(`sudo bluetoothctl remove ${bdaddr} `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
      allGood = true;
      console.log(aux.timeStamp(), "bt: the SOURCE is untrusted:", bdaddr);
    }
    catch (err) {
      allGood = false;
    };
    blut.disconnectedDevice(bdaddr, true); //true ==> no notifications
  }
  else {
//C: Untrust anyway...   this happens when the device is disconnected
    try {
        execSync(`sudo bluetoothctl remove ${bdaddr} `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
      allGood = true
      console.log(aux.timeStamp(), "bt: default - NOW untrusted:", bdaddr);
    }
    catch (err) {
      allGood = false;
    };
  };
  return allGood;
};
//E. A connection/disconnection event occured................ Connections Events
//bluetoothctl Watch - Detect - [Identify Change] - Update Change - Render
/** Called by blut.bluetoothctlTerminal(), a sink device got connected.
 * First step: Is it a connect made at frontend? or a reconnect? or a new connect?
 * i)   If frontend requires this connect it is okay and accepted. No problem!
        global variable  intransitSink === deviceBD   --> okay!!!! go, go,...
 * ii)  There is no speaker connected, but there are trusted ones
        a) If the deviceBD is trusted by frontend it is okay.
        b) There are other ones trusted; okay to connect this new connect
 *      [ ] && [ deviceBD ] --> okay(a) or [ ] && [ other devices ] --> okay(b)
 * iii) If there is no connection and no trusted device at frontend, it is okay.
 *      This happens at boot when a trusted device reconnects.
 *      [ ] && [ ] --> okay;
 * iv)  Is deviceBD actually still connected by frontend? (shouldn't happen?)
        [ deviceBD ] && [ ] --> okay, but do an update of alsa anyway to be sure
 * v)   It is a reconnect by btctl of a previously trusted device, but it is not
 *      the connected one by frontend  -> no accept!
 *      [ another device] && [ ]   --> NOT okay!
 * Second step: update if the connection is okay, accepted:
 *  Create the important asound.conf with the deviceBD in it. Mute the amp.
 *  If mpd has not been restarted with a bt spkr connected do a restart(!)...
 *  [this restart is silly; seems to be required despite existing asound.conf]
 * Second step: if the connection is not accepted:
 *  Disconnect this connection immediately, since it is not recognized by frontend
 * LIMITATION: the number of connected speakers to one speaker is set here!!!!!
 * @param  {string}    deviceBD mac address of newly connected sink
 * @param  {boolean}   isSilent if true no notification just rendering by machine
 * @Global {array}     trustedSinks, read only
 * @Global {string}    intransitSink, reset to ""
 * @global {boolean}   wasBtSpkrAtBoot, set to true if mpd was forced to restart
 * @event   {machine} 'bluetooth-speakerconnected', 'bluetooth-required-restart'
 * @return {boolean}   true if the connection was followed through
 */
async function connectedSink(deviceBD, isSilent) {
  let connectSpeaker = false; //if false the connection is not accepted...
  let doAlsaconfig = true;    //usually create asound.config and mute amp
  let isItIntransitSink = (intransitSink === deviceBD);
  //console.log(aux.timeStamp(), "bt: audio sink connect discovered:", await bluetoothDeviceName(deviceBD));
  //console.log(aux.timeStamp(), "bt:         ...is sink in transit?", (intransitSink === deviceBD));
//STEP 1: Identification phase
//        -- also restricts the number of connected spkr to only one at the time
  if (intransitSink !== deviceBD) {
    //A. the connection was not made by Player frontend, must analyze...
    let connectedLength = connectedSinks.length;
    let trustedLength = trustedSinks.length;
    if ((connectedLength === 0) && (trustedLength > 0)) {
    //A1: there is a trusted speaker present at frontend and is it deviceBD?
    //   [ ] && [device?]  -> is deviceBD reconnected? did it come back?
      if (aux.findElementInArray(deviceBD, trustedSinks) !== -1) {
    //   [ ] && [deviceBD]  -> it was deviceBD, connection is accepted, reconnect
        console.log(aux.timeStamp(), "bt: (?) the sink is the trusted one! - this is a reconnect;");
        connectSpeaker = true;
      }
      else {
    //   [ ] && [other devices]  ->  deviceBD is not trusted, but no one is connected
        console.log(aux.timeStamp(), "bt: (?) only trusted exists (but not this sink) - okay to connect\n", trustedSinks);
        connectSpeaker = true;
      };
    }
    else if ((connectedLength === 0) && (trustedLength === 0) ) {
    //A2: no connection and no one is trusted - free to connect
    //   [ ] && [ ] -> connect is okay, nothing connected; new connection at boot
      console.log(aux.timeStamp(), "bt: (-) no existing connection/trusted - okay to connect! !==");
      connectSpeaker = true;
      }
    //A3: There is a device connected, is it deviceBD?
      else if ((connectedLength > 0)) {
        if (aux.findElementInArray(deviceBD, connectedSinks) !== -1) {
    //   [deviceBD] && []  -> it was deviceBD, connection is okay, update
          console.log(aux.timeStamp(), "bt: (?) connection exists already - okay to update sink =\n", connectedSinks);
          //doAlsaconfig = false; //assume that the asound.conf is in place and amp muted
          connectSpeaker = true;
        }
        else {
//LIMIT IS SET: the number of connected speakers are limited to only ONE at the time
    //   [another device] && []  -> it was another device, connection is not accepted
          console.log(aux.timeStamp(), "bt: (-) another connection exists, no accept! !== \n", connectedSinks);
          connectSpeaker = false;
        };
      };
    }
    else {
    //B. The sink is in transit and it is supposed to be connected -> okay
      console.log(aux.timeStamp(), "bt: (!) ...the sink was connected by frontend!");
      connectSpeaker = true;
    };
  isItIntransitSink && (intransitSink = "");     //reset the in transit sink
//STEP 2a: update all, full procedure required,  this connection is valid
  if (connectSpeaker === true) {
    // mute amp and create a new asound.conf, true --> connect
    btAmpManagement(true, deviceBD);
    await updateConnectedAndTrusted();     //update global variables, wait ...
    let connections = await nameAndMacPacker(connectedSinks, true); //pack for frontend
    let trustees = await nameAndMacPacker(trustedSinks, false);     //pack for frontend
    //console.log(aux.timeStamp(), "bt: updated connected sink =", connectedSinks);
    //console.log(aux.timeStamp(), "bt: updated trusted sink   =", trustedSinks);
    signal.emit('bluetooth-speakerconnected', {array: connections.concat(trustees),
                                               mode: isSilent});
    //Finally, stop mpc, restart of
    await restartMpdAndStreaming("connectedSink");
    signal.emit('bluetooth-required-restart', {shouldNotify:true, who:"connectedSink"} );
  }
  else {
//STEP 2b: NO CONNECT - only update of machine - device must be still trusted but
//                      disconnected immediately
      console.log(aux.timeStamp(), "bt: (-) connection not accepted for ", deviceBD);
      //console.log(aux.timeStamp(), "===========disconnect==========", deviceBD);
      await btDisconnect(deviceBD); //this is not untrusting and that is okay
      console.log(aux.timeStamp(), "bt: no connection for ", deviceBD, "update machine -X-X-X-\n");
      await updateConnectedAndTrusted();     //update global variables
      let connections = await nameAndMacPacker(connectedSinks, true); //pack for frontend
      let trustees = await nameAndMacPacker(trustedSinks, false);      //pack for frontend
      //Update machine!
      signal.emit('bluetooth-speakerconnected', {array: connections.concat(trustees),
                                                 mode: true}); //no notifications
    };
  return connectSpeaker;
};

/** Resets alsa for the soundcard (amplifier).
  * btAmpManagement(false, false) -> unmutes amp and removes asound.conf file
  * @return {?}             of no interest
  */
async function resetAlsaToAmp() {
  console.log(aux.timeStamp(), "bt: do alsa update of amplifier/soundcard;");
  //console.log(aux.timeStamp(), "[check with  aplay -L ]");
  await btAmpManagement(false, false); //delete asound.conf and unmute amp
};

/** Updates the global variables for connected sinks and sinks that are trusted but
  * not connected at the moment. An audio sink device always gets trusted when
  * it got connected, as do sources (i.e. phones).
  * Note:  all devices could be used here, but that gives more devices
  * @Global {connectedSinks}  updated according to btctl
  * @Global {trustedSinks}    updated according to btctl
  * @return {boolean}         always true
  */
async function updateConnectedAndTrusted() {
//1. Find all sink devices, they might be connected or disconnected
  //let pairedArray = await btAllDevices(); //'sudo bluetoothctl devices'
  let pairedArray = await btPairedDevices(); //'sudo bluetoothctl paired-devices'
  let numberOfDevices = pairedArray.length;
  if (numberOfDevices > 0) {
//2. For each device check if it is trusted and if it is connected
    let connectedArray = [];
    let trustedArray = [];
    for(let i = 0; i < numberOfDevices; i++) {
      if (await isDeviceAudiosink(pairedArray[i]) === true) {
        if (await isTrusted(pairedArray[i]) === true) {
          if (await btIsDeviceConnected(pairedArray[i]) === true) {
            //console.log("bt: [update] connected device:", pairedArray[i]);
            connectedArray.push(pairedArray[i]);
          }
          else {
            //console.log("bt: [update] trusted device:", pairedArray[i]);
            trustedArray.push(pairedArray[i]);
          };
        };
      };
    }; //end of loop
//3a. Update GV arrays with new sink mac addresses
      connectedSinks = connectedArray;    //update of global variable
      trustedSinks = trustedArray;        //update of global variable
    }
    else {
//3b. No connected sinks at all, empty the GV arrays that holds sinks.
      while (connectedSinks.length > 0) { //Reset the GV array to be empty
        connectedSinks.pop();             //just to be sure empty the array
      };
      while (trustedSinks.length > 0) { //Reset the GV array to be empty
        trustedSinks.pop();             //just to be sure empty the array
      };
    };
  return true;
};
/** Check a device to see if it is trusted, sinks and sources are trusted
 * @param  {string}    deviceBD mac address
 * @return {boolean}   true if device is 'Trusted', otherwise false
 */
function isTrusted(deviceBD) {
  let trustString = "";
  try {
      trustString =
        execSync(`sudo bluetoothctl info ${deviceBD} | fgrep "Trusted: yes" `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000});
      if (trustString.length > 0) {
          return true;
        }
        else {
          return false;
        };
    }
    catch (err) {
      return false;
      };
};
/** Check a device to see if it is paired,
 * @param  {string}    deviceBD mac address
 * @return {boolean}   true if device is 'Paired', otherwise false
 */
function isPaired(deviceBD) {
  let trustString = "";
  try {
      trustString =
        execSync(`sudo bluetoothctl info ${deviceBD} | fgrep "Paired: yes" `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000});
      if (trustString.length > 0) {
          return true;
        }
        else {
          return false;
        };
    }
    catch (err) {
      return false;
      };
};
//bluetoothctl Watch - Detect - [Identify Change] - Update Change - Render
/** Called by blut.bluetoothctlTerminal(), a device got disconnected. It was not
 * a source since this function was called by blut.disconnectedDevice().
 * If the sink was connected at frontend (according to connectedSinks)
 *  ...then delete the asound.conf and unmute the amp. Turn on discoverable.
 * At the moment only one speaker is allowed to connect, but the function is designed
 * to handle more than one. (you never know...)
 * @param  {string}    deviceBD mac address of disconnected sink
 * @param  {boolean}   isSilent if true no notification just rendering by machine
 * @Global {connectedSinks}    array of one mac addresss as a string
 * @event  {machine} 'disconnectedSink' and 'bluetooth-speakerdisconnected'
 * @return {?}         unknown
 */
async function disconnectedSink(deviceBD, isSilent) {
  //A. here connectedSinks is not updated yet, look for disconnect sink
  let numberOfPrev = connectedSinks.length;
  let found = false;
  if (numberOfPrev > 0) {
  //A. there is a sink connected, is it deviceBD? check the connected sink:
    for(let i = 0; i < numberOfPrev; i++) {
      if (connectedSinks[i] === deviceBD) {
        //this sink got disconnected
        found = true;
        break;
      };
    };
  //B. disconnected sink was connected at frontend, must tidy up asound.conf and unmute
    if (found === true) { // clean up after the speaker...
      disableAsoundConf(); //delete the asound.conf in /etc
      muteUnmuteAmp(true);  //Now the amp gets unmuted; true = unmutes amp
      await restartMpdAndStreaming("disconnectedSink");
      //Notify machine and render
      signal.emit('bluetooth-required-restart', {shouldNotify:false, who:"disconnectedSink"} );
    };
  };
  //C. always update the global variables and notify the machine
    await updateConnectedAndTrusted();    //update global variables
    //console.log(aux.timeStamp(),"bt: just updated internal data");
    let connections = await nameAndMacPacker(connectedSinks, true); //pack for frontend
    let trustees = await nameAndMacPacker(trustedSinks, false);     //pack for frontend
    //console.log(aux.timeStamp(),"bt: packed internal data for frontend");
    //update machine
    signal.emit('bluetooth-speakerdisconnected',
                {array: connections.concat(trustees),
                 mode: isSilent});                  //sinkconnection gone...

};

/** Mutes or unmutes the alsamixer which is the analogue output. If a bt speaker
 * is connected the analogue output must be muted.
 * Well, `sudo amixer -c 0 set Digital mute ` screw things up pretty badly...
 * Use toggle instead. '[off]' or '[on]' indicates what happend.
 * This doesn't affect Spotify, Spotify is always amp muted, strange?
 * 'sudo amixer -c 0 set Digital' is the way to check mute
 *      'true' as an arg  ->  means that the amplifier gets UNMUTED.
 *      'false' as an arg ->  means that the amplifier gets MUTED.
 * @param  {string}    unmute true means unmute is requested, false means mute
 * @return {boolean}   true
 */
async function muteUnmuteAmp(unmute) {
  //Solution: use 'sudo amixer -c 0 get  Digital' - to see if it is muted or not
  //let amixerString = "";
  //let isItAlreadyMuted = await isAmpMuted();
  //A. unmuting is requested since unmute is true... [UNMUTE]
  if (unmute === true) {
    if (await isAmpMuted() === false) {
  //A1: it was already UNMUTED - no action.
      //console.log(aux.timeStamp(),"bt: amp already unmuted - status is still UNMUTED");
      //console.log(aux.timeStamp(),"    [check with   amixer -c 0 get Digital ]")
      return true;
    }
    else {
  //A2: it is in MUTED state - UNMUTE the amplifier!
      try {
        //amixerString =
          execSync(`sudo amixer -c 0 set Digital toggle `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
          //console.log(aux.timeStamp(),"bt: toggled to be unmuted - status now: UNMUTED");
          //console.log(aux.timeStamp(),"    [check with  amixer -c 0 get Digital ]");
      }
      catch(err) {
        console.log(aux.timeStamp(),"bt: ERROR doing unmute", err);
      };
    };
  }
  //B: mute is requested since unmute is false...  [MUTE]
  else {
    if (await isAmpMuted() === true) {
      //B1: it was already muted, amplifier is NOT ON - no action.
          //console.log(aux.timeStamp(),"bt: amp already muted - status is still MUTED");
          //console.log(aux.timeStamp(),"    [check with amixer -c 0 get Digital]");
          return true;
        }
        else {
    //B2: it is in a UNMUTED state - MUTE the amplifier!
      try {
        //amixerString =
        execSync(`sudo amixer -c 0 set Digital toggle `,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
        //console.log(aux.timeStamp(),"bt: toggled to be muted    - status now: MUTED");
        //console.log(aux.timeStamp(),"    [check with  amixer -c 0 get Digital]");
     }
     catch(err) {
       console.log(aux.timeStamp(),"bt: ERROR doing mute", err);
     };
   };
 };
  return true;
};
/** Checks if the amp is muted or not. Returns true even if in error state.
 * 'sudo amixer -c 0 set Digital' is the way to check mute
 * @return {boolean}   true if muted else false
 */
function isAmpMuted() {
  let outcome = false;
  let amixerString = "";
  try {
    amixerString =
     execSync(`sudo amixer -c 0 get Digital `,
                  {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch(err) {
    console.log(aux.timeStamp(),"bt: ERROR reading mute status", err);
    outcome = true; //definitely returns true when something went wrong
  };
  if (amixerString.lastIndexOf("[on]") !== -1) {
      //console.log(aux.timeStamp(),"bt: amplifier is NOT muted;  - unmute status");
      outcome = false;
    }
    else {
      //console.log(aux.timeStamp(),"bt: amplifier is MUTED; - muted status");
      outcome = true; //returns true even if something went wrong
    };
  return outcome;
};
/** Creates the configuration file for Alsa so that the stream is redirected to
 * the Bluetooth speaker. asound.conf is the global alsa config file as long as
 * it exists. The speaker is set as default instead of the sound card (amp).
 * @param  {string}    bdaddr Bluetooth mac address for the speaker
 * @return {boolean}   true is success and false is failure
 */
function enableAsoundConf(bdaddr) {
  let allGood = false;
//Below the Alsa config for Bluetooth speaker instead of sound card (i.e. amp)
  let asoundContent =
  `#reset some defaults because of any file permissions...
    defaults.bluealsa.delay 10000	                #this is actual set here
    defaults.bluealsa.service "org.bluealsa"	    #already set as default
    defaults.bluealsa.device "${bdaddr}"  #not really needed here
    defaults.bluealsa.profile "a2dp"              #not really needed here
    defaults.bluealsa.interface "hci0"	          #legacy only, not in use
pcm.btspeaker {
  type plug
  slave.pcm {
      type bluealsa
      device '"${bdaddr}"'
      profile 'a2dp'
  }
  hint {
      show on
      description 'Bluetooth speaker, ${bdaddr}'
  }
}
ctl.btspeaker {
   type bluealsa
}
pcm.!default {
type plug
slave.pcm "btspeaker"
hint {
        show on
        description 'btspeaker'
  }
}
ctl.!default {
type bluealsa
}
`;
//a. create the template file and write the config
try {
  execSync(`sudo echo "${asoundContent}" >  /player/data/asound.confNEW`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  allGood = true;
}
  catch (err) {
    console.log(aux.timeStamp(),"bt: FATAL ERROR writing asound.conf file--------------\n")
    execSync(`sudo rm -f /player/data/asound.confNEW`,
              {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    allGood = false;
};
//b. move the file to etc directory
if (allGood === true) {
    try {
      execSync(`sudo mv -f /player/data/asound.confNEW /etc/asound.conf &&
                sudo chmod 0777 /etc/asound.conf`,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    }
    catch (err){ //file system error of some sort... try again
      //exec(`sudo rm -f /etc/asound.conf`, {uid: 1000, gid: 1000});
      execSync(`sudo touch  /etc/asound.conf &&
                sudo echo "${asoundContent}" >  /etc/asound.conf`,
                  {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
      allGood = false;
    };
  }
  else {
    try { //file system error - try to write directly to /etc
      execSync(`sudo touch  /etc/asound.conf &&
                sudo echo "${asoundContent}" >  /etc/asound.conf &&
                sudo chmod 0777 /etc/asound.conf`,
                  {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
      allGood = true;
    }
    catch (err) {//something is really wrong - no more error handling
    };
  };
  return allGood
};
/** Deletes the global alsa configuration file if it exists (etc/asound.conf).
 * If there is no conf file the sound card will be default (i.e. the amp)
 * @return {boolean}   true is success and false is failure
 */
async function disableAsoundConf() {
  //console.log(aux.timeStamp(),"bt: delete any /etc/asound.conf ");
  let allGood = false;
  if (await isFile("/etc/asound.conf") === true) {
    try {
      execSync(`sudo rm -f /etc/asound.conf`,
                  {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
      allGood = true;
    }
    catch (err) {  //this is bad - must be file system error
      allGood = false;
      console.log(aux.timeStamp(),"bt: asound.conf file error !!!!", err);
    };
  }
  else { //the file asound.conf was not in place, no worries...
    allGood = true;
  };
  return allGood;
};
/** Manage the amp when connected to bt speaker or disconnected.
* a. When bt speaker is disconnected and amp reset:-
*   the asound.conf, has to be deleted, after that the amp can be unmuted
 * b. When bt speaker is connected the sound can not be routed to the amp anymore:-
 *   the amp has to be muted and then asound.conf has to created, in that order!
 * @param {boolean} connect if true connect procedures, false disconnect
 * @param {string}  bdaddr mac address required at connect [optional]
 * @return {?}      of no interest
 */
async function btAmpManagement(connect, bdaddr){
    //a. disconnect sequence:
  if (connect === false) {
    if (await isFile("/etc/asound.conf") === true) { //if there is an asound.conf delete it
      console.log(aux.timeStamp(), "bt:[disconnect] asound.conf will be deleted -xxxx-");
      await disableAsoundConf(); //delete the asound.conf in /etc
    };
    console.log(aux.timeStamp(),"bt:[disconnect] amp will be unmuted <| ~ ~ ~ ~ ~ ~ ~ ~ ~");
    await muteUnmuteAmp(true);  //true --> unmutes amp
  }
  //b. connect sequence:
  else {
    if (true) { //always add or replace asound.conf with the right mac address
      await muteUnmuteAmp(false);     //false --> mutes the analogue amp output
      //console.log(aux.timeStamp(), "bt:[connect] amp is now muted <|X      ---no sound");
      await enableAsoundConf(bdaddr); //add the asound.conf in /etc
      //console.log(aux.timeStamp(), "bt:[connect] asound.conf is now added:",bdaddr);
    };
  };
};
/** Checks if a file exists. Returns true if that is the case.
 * 'sudo find' returns "find: ‘/etc/asound.confxx’: No such file or directory"
 * when the file does not exist, otherwise it returns the path + file name.
 * @param  {string}    path path and file name
 * @return {boolean}   true if file exists, otherwise false
 */
function isFile(path) {
  let existance = "";
  let result = true;      //we assume the file exists...
  try {
    existance =
      execSync(`sudo find ${path}`,
                {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
      }
  catch (err) {
    //console.log(aux.timeStamp(),"bt: is there an /etc/asound.conf file?", false);
    //The file was not found
    return false;
  };
  //if existance is empty "", then the file doesn't exists
  if (aux.mpdMsgTrim(existance) != path) {
    console.log(aux.timeStamp(),"bt: no path to /etc/asound.conf file;", false, "[!]");
      result = false;     //the file does not exist, return false
    };
  return result;
};
/** Checks if machine is connected to bdaddr Bluetooth device
 * NOTE: hcitool is depreciated and is replaced with a btmgmt command.
 * btmgmt also used in blut.connectedDevices()
 * Depreciated: 'sudo hcitool con' -> much better 'sudo btmgmt con'
 * @param  {string}     bdaddr mac address of a Bluetooth device
 * @param  {boolean}    stdOutput if false, no console.log
 * @return {boolean}    true if connected or not false (might be an error)
 */
function btIsDeviceConnected(bdaddr, stdOutput = false){
  let connection = "" //empty string means default is connected
  let connectionIndicator = -1;
  //execSync(`sudo hcitool con`,
  //execSync(`sudo bluetoothctl info ${bdaddr} | grep "Connected: yes"`,
  //execSync(`sudo btmgmt con | cut -d' ' -f1 (| grep ${bdaddr} => error)??`,
  //Typical output from 'sudo btmgmt con' (without cut -d' ' -f1):
  //"8C:DE:E6:25:C5:8C type BR/EDR" or "" if no connections
  //Typical output from 'sudo hcitool con' is this kind of string:
  //'Connections:\n > ACL 34:14:5F:48:32:F8 handle 11 state 1 lm MASTER AUTH ENCRYPT'
  //When no connections it returns: 'Connections:' so check length of string
  //| grep "Connected: yes" --- cannot be used becasue it causes error
  try {
    connection =
      execSync(`sudo bluetoothctl info ${bdaddr}  `,
                {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 25000});
    connectionIndicator = connection.indexOf("Connected: yes");
    stdOutput &&
     console.log(aux.timeStamp(),"bt: connection indicator (index#):-", connectionIndicator);
    if (connectionIndicator === -1) {
      return false;
    }
    else {
      return true;
    };
  }
  catch (err) {
    console.log(aux.timeStamp(),"bt: btctl info connect error\n", err);
    return false;
  };
};
/** Checks if a Bluetooth device is available according to bluetoothctl (i.e. discovered
 * and can be listed by 'sudo bluetoothctl devices').
 * This function is used after scan and it is a little bit more persistent.
 * @param  {string}    bdaddr mac address of a Bluetooth device
 * @return {boolean}   true if ON or not false (might be an error)
 */
async function btIsDeviceAvailable(bdaddr) {
  let connection = "";
  let deviceIndicator = -1;
  //| grep ${bdaddr} --- might give trouble at errors
  try {
    connection =
      execSync(`sudo bluetoothctl devices `,
                {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 60000});
    deviceIndicator = connection.indexOf(bdaddr);

    //console.log(aux.timeStamp(),"bt: device in btctl (index#):-", deviceIndicator);
    if (deviceIndicator !== -1) {
      return true;
    }
    else {
      connection = await frolicScan(15000);
      //console.log(aux.timeStamp(),"bt: needed 2nd result of bluetoothctl", connection, " [Frolic]----");
      //console.log(aux.timeStamp(),"bt: check string", connection.indexOf(bdaddr) !== -1);
      if (connection.indexOf(bdaddr) !== -1) {
        return true;
      }
      else {
        return false;
      };
    };
  }
  catch (err) { //file system error - no error handling can be done here to help
    console.log(aux.timeStamp(),"bt: FATAL ERROR scanning", err);
    return "?";
  };
};

/** Check a device to see if it is an audio sink, i.e. a speaker, headphone, ...
 * NOTE: 'sudo bluetoothctl info ${deviceBD} | grep "UUID: Audio Sink"' => ERROR
 * @param  {string}    deviceBD mac address
 * @return {boolean}   true if device is an audio sink, otherwise false
 */
function isDeviceAudiosink(deviceBD) {
  //UUID: Audio Sink                (0000110b-0000-1000-8000-00805f9b34fb)
  //let outcome = false;
  //execSync(`sudo bluetoothctl info ${deviceBD} | grep "UUID: Audio Sink " `,
  let audioSink = "";
  try {
      audioSink =
        execSync(`sudo bluetoothctl info ${deviceBD} `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000});
      if (audioSink.indexOf("UUID: Audio Sink") !== -1) {
      //if (audioSink !== "") {
          //outcome = true;
          return true;
        }
        else {
          //outcome = false;
          return false;
        };
    }
    catch (err) {
      console.log(aux.timeStamp(), "bt: error at SINK test :---\n", err);
      return false;
      };
    //console.log(aux.timeStamp(), "bt: sink finding's outcome at the end:", outcome);
    //return outcome;
};
/** Check a device to see if it is an audio source, i.e. a phone, laptop,...
 * Unwise to use 'sudo bt-device -i <mac>' here since it throws an error if the
 * device is not added, that is not an error in this context.
 * NOTE: 'sudo bluetoothctl info ${deviceBD} | grep "UUID: Audio Source"' --> ERROR
 * @param  {string}    deviceBD mac address
 * @return {boolean}   true if device is an audio source, otherwise false
 */
function isDeviceAudiosource(deviceBD) {
  //UUID: Audio Source              (0000110a-0000-1000-8000-00805f9b34fb)
  let audioSource = "";
  //execSync(`sudo bluetoothctl info ${deviceBD} | grep "UUID: Audio Source" `,
  try {
      audioSource =
        execSync(`sudo bluetoothctl info ${deviceBD} `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000});
        //console.log(aux.timeStamp(), "bt: is it a SOURCE:", (audioSource.lastIndexOf("UUID: Audio Source") !== -1));
        if (audioSource.indexOf("UUID: Audio Source") !== -1) {
        //if (audioSource !== "") {
            return true;
          }
          else {
            return false;
                };
    }
    catch (err) {
      console.log(aux.timeStamp(), "bt: error at SOURCE test:---", err);
      return false;
    };
};

/**Packer - For each sink address in macArray create an object on the format:
 * [ {name: "ENEBY30", mac: "FC:58:FA:ED:57:60", connetced: true/false}, ... ]
 * The command 'sudo bluetoothctl info <mac> | grep "Name: " '
 * returns the name string.  '\tName: Galaxy S7\n'  17 chars long, trim it and
 * 'Name: Galaxy S7' -- so slice at index 6. Used by connectedSinks()
 * and disconnectedSinks() in this file.
 * @param  {array}          macArray, array of sink mac addresses
 * @param  {boolean}        isConnected, true the sinks are connected, not only
 *                          trusted. False means not connected but trusted.
 * @return {array}          [ {name: string, mac: string, connected: boolean}, ...]
 */
function nameAndMacPacker(macArray, isConnected) {
  let numberOfDevices = macArray.length;
  let deviceObjectArray = [];
  for(let i = 0; i < numberOfDevices; i++) {
    let nameString = "";
    try {
        nameString =
        aux.mpdMsgTrim(
          execSync(`sudo bluetoothctl info ${macArray[i]} | fgrep "Name: " `,
                        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000}));
        nameString = nameString.slice(6);
      }
      catch (err) {
        nameString = "Unknown Speaker"; //could not retrieve the name...
      };
//1. sinks that are connected goes here (at the moment it can be only one)
    if(isConnected === true) {
      deviceObjectArray.push({name: nameString, mac:macArray[i], connected: true});
    }
//2. sinks that are still trusted, but not connected at the moment goes here
    else {
      deviceObjectArray.push({name: nameString, mac:macArray[i], connected: false});
    }
  };
  return deviceObjectArray;
};
/**Return the name of a bluetooth device given the mac address.
* The command 'sudo bluetoothctl info <mac> | grep "Name: " '
* returns the name string.  '\tName: Galaxy S7\n'  17 chars long, trim it and
* 'Name: Galaxy S7' -- so slice at index 6.
 * @param  {string}          macAddress, bd mac address
 * @return {string}          name
 */
function bluetoothDeviceName(macAdress) {
  let nameString = "";
  try {
      nameString =
      aux.mpdMsgTrim(
        execSync(`sudo bluetoothctl info ${macAdress} | fgrep "Name: " `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000}));
      nameString = nameString.slice(6);
    }
    catch (err) {
      nameString = "Unknown Device"; //could not retrieve the name...
    };
  return nameString;
};
/**Return all bluetooth devices that are paired. Returns an array of mac address.
 * The command 'sudo bluetoothctl paired-devices | cut -d' ' -f2 ' returns
 * for example the mac string:  '34:14:5F:48:32:F8 \n FC:58:FA:ED:57:60'
 * It is split into [ <mac address>, <mac address> ...] or []
 * @return {array}          mac addresses of paired devices
 */
function btPairedDevices() {
  let pairedDevicesString = "";
  try {
    pairedDevicesString =
    aux.mpdMsgTrim(
      execSync(`sudo bluetoothctl paired-devices | cut -d' ' -f2 `,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000}));
  }
  catch (err) {
    pairedDevicesString = "";
  };
  if (pairedDevicesString !== "") {
    let pairedArray = pairedDevicesString.split("\n"); //split string at line breaks
    //Format: [ '34:14:5F:48:32:F8', 'FC:58:FA:ED:57:60' ]
    return pairedArray;
  }
  else {
    return [];
  };
};
/**Return all bluetooth devices that are currently discovered in btctl.
 * Returns an array of mac address.
 * The command 'sudo bluetoothctl devices | cut -d' ' -f2 ' returns
 * for example the mac string:  '34:14:5F:48:32:F8 \n FC:58:FA:ED:57:60'
 * It is split into [ <mac address>, <mac address> ...] or []
 * @return {array}   mac addresses of devices (this are all devices in btctl)
 */
function btAllDevices() {
  let pairedDevicesString = "";
  try {
    pairedDevicesString =
    aux.mpdMsgTrim(
      execSync(`sudo bluetoothctl devices | cut -d' ' -f2 `,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000}));
  }
  catch (err) {
    pairedDevicesString = "";
  };
  if (pairedDevicesString !== "") {
    let pairedArray = pairedDevicesString.split("\n"); //split string at line breaks
    //Format: [ '34:14:5F:48:32:F8', 'FC:58:FA:ED:57:60' ]
    //console.log(aux.timeStamp(), "bt: btctl devices #:", pairedArray.length );
    return pairedArray;
  }
  else {
    //console.log(aux.timeStamp(), "bt: btctl devices is the empty array []" );
    return [];
  };
};

/**Returns a string of connectable bluetooth devices.
 * WARNING: 'sudo hcitool scan --flush ' is used, this command is depreciated.
 * The reason for this is to see if there are any connectable devices outside of
 * bluetoothctl and use it for trigger more btctl scans. Note: The results of this
 * function cannot be used for connect command in bluetoothctl. The devices found
 * also has to be discovered by bluetoothctl to be available.
 * Connectable means they are not connected and they are ON, they might be paired
 * or trusted. Returns a pretty long string with this content:
 * 'Scanning ...\n \t 34:14:5F:48:32:F8 \t Galaxy S7\n \t FC:58:FA:ED:57:60 \t ENEBY30'
 * If nothing found hcitool returns 'Scanning ...\n', which means that 'grep'
 * is used, (ex of resulting string: '        FC:58:FA:ED:57:60       ENEBY30')
 * To check if a device is on: 'sudo l2ping <BDaddr>' at CLI.
 * Better Option: use 'sudo btmgmt find -b' for pre-scanning
 * @event   {machine} 'bluetooth-scanning'
 * @return {string}    mac address and names of connectable devices
 */
function findDevicesOn() {
  let devicesString = "";
  try {                               //NOT IN USE - but kept...
      devicesString =
        aux.mpdMsgTrim(
          execSync(`sudo hcitool scan --flush | fgrep : `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000}));
      console.log(aux.timeStamp(), "bt: hcitool finding:", devicesString );
      signal.emit('bluetooth-scanning', false); //false -> "scanning going on"
      return devicesString;
    }
    catch (err) {
      return "";
      };
};
/**Returns true if bluetooth is unblocked, i.e. up and running.
 * The command 'sudo rfkill list | tail -n +5 | grep yes '
 * returns the 5th and 6th line and then grep returns "Soft blocked: yes"
 * if Bluetooth is blocked. Otherwise "", which returns true.
 * This is the same as nwork.readBluetoothHci()
 * @return {boolean}        true if Bluetooth is not blocked, otherwise false
 */
function isBluetoothOn() {
  let statusString = "";
  try {
      statusString = aux.mpdMsgTrim(
        execSync(`sudo rfkill list | tail -n2 | fgrep yes `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000}));
  //CLI returns: "Soft blocked: yes" /nl means blocked and ends up in std output
    }
    catch (err) {
  //CLI returns: "" when NOT blocked, and ends up in std err
      statusString = ""; //makes the function return false
    };
    if (statusString !== "") {
      return false;
    }
    else {
      return true;
    }
};
/**Stop the mpc and restart the streaming systemctl services: bluealsa-aplay
 * (bluetooth streaming to bt spkr), librespot (Spotify) and shairport-sync
 * (Airplay). The /etc/asound.conf requires these restarts (add/delete the file)
 * The reason for a restart is to set the audio stream to PCM 'default', i.e.
 * a bt speaker, or to reset PCM back to the amplifier. Called at connect/-
 * disconnect of bt speaker above.
 * If the hotspot (player's AP) is up it has to be turned off here since the AP
 * is most likely to cause stuttering and 'missing RTP packages'. However, if
 * the AP is the only connection it cannot be turned off.
 * Reference: 'bluetooth-required-restart' event caught by machine (see above)
 * @params {string}       who, which btsp function is calling...
 * @return {boolean}      always true
 */
async function restartMpdAndStreaming(who = false) {
  console.log(aux.timeStamp(), "btsp: bt speaker =>", who,"required restart [:]");
  //a. stop mpc [NOTE: no restart of mpd for now - no 'mpd.restartMPD(who)']
  await mpd.seekStopMPC(); //stop mpc, it just stops here, no player updates
  //b. the hotspot will be stopped, if it is on
  nwork.turnOffAP();
  //c. required restarts of all services - they start after a short pause
  res.restartBluealsaAplay(false); //false --> restarts bt detect loop
  res.restartLibrespot();
  res.restartShairpoint();
  //res.restartUpmpdcli();  //No need to restart upnp...
  return true;
};
/**Restart the bluealsa aplay service, the function that plays bluetooth streams
 * NOTE: When called also 'loop.restartBluetoothDetect()' has to be called.
 * Called by 'res.restartBluealsaAplay()' - also restarts the bt detetct loop
 * Called by 'res.startUpAllStreaming()'  - also restarts the bt detetct loop
 * @return {boolean}      true
 */
function restartBluealsaAplay(who=false) {
  try {
    //console.log(aux.timeStamp(),"btsp: restart bluealsa-aplay -  ", who, "-:");
    execSync(`sudo systemctl restart bluealsa-aplay.service `,
              {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000});
    }
    catch (err) {
      console.log(aux.timeStamp(), "bt: ERROR, restart aplay.service failed!\n", err);
    };
  return true;
};

//============= SIMULATION =================
// Eneby 30: FC:58:FA:B8:F6:14
// Eneby 20: FC:58:FA:ED:57:60
// Hk spkr   FC:58:FA:CC:30:A4
// Galaxy    34:14:5F:48:32:F8
