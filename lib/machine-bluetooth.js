//Copyright 2022 by Retro Audiophile Designs, all rights reserved.
////GNU General Public License v3.0 see license.txt            [Source code]
//           ~ Bluetooth audio streamer handler for backend ~

const aux = require('./machine-auxiliary.js');      //all the utils
//const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synced Raspbian cmds
//const fs = require('fs');                         //for reading files
const pty = require('node-pty');                    //terminal emulation
const events = require('events');                   //for creating events
const btsp = require('./machine-audiosink.js');     // some bluetooth utils
const signal = new events.EventEmitter();

module.exports.getConnectedSources = getConnectedSources;

module.exports.bluetoothctlBootPreparations = bluetoothctlBootPreparations;
//module.exports.restartBluetoothService = restartBluetoothService;
module.exports.bluetoothctlAtBoot = bluetoothctlAtBoot;

module.exports.btDisconnectCtl = btDisconnectCtl;
module.exports.disconnectedDevice = disconnectedDevice;
module.exports.removeBluetoothctlListener = removeBluetoothctlListener;

module.exports.unpairAllDevices = unpairAllDevices;
module.exports.bluetoothUnblockStreaming = bluetoothUnblockStreaming;
module.exports.showBluetooth = showBluetooth;
module.exports.hideBluetooth = hideBluetooth;

module.exports.signal = signal;

module.exports.connectedDevices = connectedDevices;

//Bluetooth source streaming device management (machine is a sink to smart phones)
//==============================================================================
///PART: Bluetooth streaming for SINK, receiving audio from smart phone
//------------------------------------------------------------------------------
//Note: this library deals only with the bluetooth streaming - not the bluetooth
//service - bluetooth service aspects are handle in machine-network.js
//-----------------------------------------------------------------------------|

//Global Variables and their associated functions:
//bluetooth terminal to watch and define listeners on in bluetoothctlTerminal()
let term = pty.spawn('bash', [], {
    name: 'xterm-color',
    cols: 80,
    rows: 40,
    cwd: process.env.HOME,
    env: process.env
    });

//connected and/or trusted source devices mac addresses
var connectedSources = [];

//if needed, read the global variable outside the file
async function getConnectedSources(doFlush) {
  if (doFlush === true) {
    connectedSources = await updateConnected();
  };
  return connectedSources;
};

//............................................................ Boot Preparations
/**Called by machine BEFORE boot -  starts up the bluetoothctl terminal session,
 * that is used for the event listener.
 * Note that bluetooth service might be blocked and not up at boot. Depends if
 * it was turned off by user previously. It doesn't matter here...
 * That is checked with readBluetoothHci() in machine-network.js (network issue)
 * @return {b oolean}                    true
 */
 function bluetoothctlBootPreparations() {
   bootRoutines();  //set bluetooth le to off
   term.write('bluetoothctl\r'); //opens up the terminal session
   return true;
};
//Helper to bluetoothctlBootPreparations() see above
async function bootRoutines() {
  try { //Low Eneregy devices are of no interest.
    execSync(`sudo btmgmt le off`,
             {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000});
  }
  catch (err) {
    console.log("btctl: cannot turn off le mode - Bluetooth must be off?\n", err);
  };
};
/**Called by machine at boot. Make Player connectable with Bluetooth and start
 * to listen on the bluetoothctl terminal.
 * Note: the actual bluetooth service may be turned off here, all bluetooth
 * service aspects is managed in machine-network.js
 * @return {boolean} true
 */
 async function bluetoothctlAtBoot() {
   bluetoothctlTerminal();       //start the listener
   bluetoothUnblockStreaming();
   return true;
};

//..............................................................................
//bluetoothctl [Watch - Detect] - Identify Change - Update Change - Render
 /** Called at boot - listens for bluetoothctl events regarding connections on
  * the emulated terminal (node-pty). [Watch]
  * If bluetoothctl writes to terminal something important occured! [Detect]
  * Detects if there has been a change [CHG], check if a phone (audio source) or
  * a spkr (audio sink) is involved in a connect or disconnect.
  * Triggers are when bluetoothctl announces a change, [CHG] AND check if
  * "Connected" ("Modalias") OR "Paired" was announced. These changes deals with
  * connect and disconnect ("Connected: no" is disconnect).
  * "Modalias" is not detected anymore since the behaviour changed of bluetoothctl.
  * The messages "Connection successful" and "Successful disconnected" for outgoing
  * requests cannot be used because there is no mac address on the same line.
  * Note: the terminal uses ansi sequences and that might blur up things...
  * @global {term} an object that is a readable and writeable terminal interface
  * @import {npm module}  'strip-ansi', remove ansi effects from strings
  * @return {?}            of no interest really
  */
/* { //THIS IS THE FULL STRING WITH ANSI - a bunch of tricky strings...
  string: '\r[ENEBY30]# \r[\x01\x02CHG\x01\x02] Device FC:58:FA:ED:57:60 Connected: yes\r\n' +
    '[ENEBY30]# \r[\x01\x02CHG\x01\x02] Device FC:58:FA:ED:57:60 Paired: yes\r\n' +
    '[ENEBY30]# \r[\x01\x02CHG\x01\x02] Device FC:58:FA:ED:57:60 ServicesResolved: yes\r\n' +
    '[ENEBY30]# '
}
*/   //THIS IS THE VISIBLE STRING - string operands are assumed to work here
/*  `[CHG] Device FC:58:FA:ED:57:60 Connected: yes
[CHG] Device FC:58:FA:ED:57:60 Paired: yes
[CHG] Device FC:58:FA:ED:57:60 ServicesResolved: yes
[ENEBY30]#`*/
  async function bluetoothctlTerminal() {
    //ansi is [Module: null prototype] { default: [Function: stripAnsi] }
    const ansi = await import('strip-ansi');
  //at boot: setup listener and start the actual terminal interface...
     term.on('data', function (data) {
       let ctlResponse = ansi.default(data);
       //let objResponse = {string: `${ctlResponse}`};
       //console.log(aux.timeStamp(),"btcl:-------------[data is]??", typeof data);
       //console.log(aux.timeStamp(),"btcl:------------- ansi [ctl]\n", ctlResponse);
       //console.log(aux.timeStamp(),"btcl:-------------  obj [ctl]\n", objResponse);
       //console.log(aux.timeStamp(),"btcl:-------------[CHG]    =", ctlResponse.indexOf('CHG'));
       //console.log(aux.timeStamp(),"btcl:-------------[NEW]    =", ctlResponse.indexOf('NEW'));
       //console.log(aux.timeStamp(),"btcl:-------------[string]??", typeof ctlResponse);
       //console.log(aux.timeStamp(),"btcl:-------------[string] #", ctlResponse.length);
       if (ctlResponse.indexOf("CHG") !== -1) {
  //bluetoothctl CHANGE EVENT OCCURED: caught a "[CHG]" - check it out below:
        let isItModalias = -1;  //not in use anymore... set it to -1
        //let isItModalias = ctlResponse.indexOf("Modalias: bluetooth:");
        let isItConnected = ctlResponse.indexOf("Connected: yes");
        let isItPaired = ctlResponse.indexOf("Paired: yes");
        //console.log(aux.timeStamp(),"btcl:-------------[ctl]\n", ctlResponse);
        //console.log(aux.timeStamp(),"btcl:-------------[bluetooth Terminal]");
        if (isItModalias !== -1) {
  //A. Incomming connection - a device has connected to Player THIS IS NOW VALID
  //ex: '[CHG] Device 7C:B0:C2:09:19:96 Modalias: bluetooth:v0006p0001d0A00'
        console.log("");
        console.log(aux.timeStamp(), "btctl: Incomming Modalias =>");
        let deviceBD = ctlResponse.slice((isItModalias - 18), (isItModalias - 1));
        postBluetoothctlHandling(deviceBD);
        }
        else if (isItConnected !== -1) {
  //B. Player has connected to a device or the device is reconnected
  //ex: '[CHG] Device FC:58:FA:B8:F6:14 Connected: yes'
          console.log("");
          console.log(aux.timeStamp(), "btctl: Incomming Connected: yes =>");
          let deviceBD = ctlResponse.slice((isItConnected - 18), (isItConnected - 1));
          try {
              execSync(`sudo bluetoothctl trust ${deviceBD}  `,
                        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 25000});
            //console.log(aux.timeStamp(),"bt: trust it as well:", deviceBD);
          }
          catch (err) {
            console.log(aux.timeStamp(),"bt: btctl trust error\n", err);
            return false;
          };
          postBluetoothctlHandling(deviceBD);
        }
        else if ((isItConnected === -1) && (isItModalias === -1) &&
                 (isItPaired !== -1)) {
  //C. A 'Paired: yes' indicates an incomming pair request by sink
  //ex: '[CHG] Device 8C:DE:E6:25:C5:8C Paired: yes  '
          let deviceBD = ctlResponse.slice((isItPaired - 18), (isItPaired - 1));
          console.log("");
          console.log(aux.timeStamp(), "btctl: Incomming Paired =>", deviceBD);
          try {
              execSync(`sudo bluetoothctl trust ${deviceBD}  `,
                        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 25000});
            //console.log(aux.timeStamp(),"bt: trust this:", deviceBD);
          }
          catch (err) {
            console.log(aux.timeStamp(),"bt: btctl trust error\n", err);
            return false;
          };
          //postBluetoothctlHandling(deviceBD);
          connectedSource(deviceBD, false);     //false -> notifications
        }
        else {
          let isItDisconnected = ctlResponse.indexOf("Connected: no");
          if (isItDisconnected !== -1) {
  //D. A device got disconnected, by Player or by itself
  //ex: '[CHG] Device FC:58:FA:ED:57:60 Connected: no'
            let deviceBD = ctlResponse.slice((isItDisconnected - 18), (isItDisconnected - 1));
            console.log("");
            console.log(aux.timeStamp(), "btctl: Incomming Disconnect =>", deviceBD);
            disconnectedDevice(deviceBD, false); //false -> notifications
          };// --- disconnected actions ends
        };//   --- connected/disconnected events branch ends
      };//     --- end of [CHG] updateBluetoothConnections
    }); //     --- end of terminal event
  };
/** When a connect event triggered by Bluetoothctl is sorted out it is time to
 * check first if it is a sink and then check for source, finally call the right
 * connect procedure.
 * @param  {string}   deviceBD,  mac address
 * @return {?}  of no interest
 */
async function postBluetoothctlHandling(deviceBD) {
  //console.log(aux.timeStamp(), "btctl: btctl post handling commence for:", deviceBD);
  //if (await btsp.isDeviceAudiosource(deviceBD)) {
  if (await btsp.isDeviceAudiosink(deviceBD) === true) {
      console.log(aux.timeStamp(), "btctl: This is a speaker!", deviceBD);
      //connectedSource(deviceBD, false);     //false -> notifications
      btsp.connectedSink(deviceBD, false);  //false -> notifications
  }
  else if (await btsp.isDeviceAudiosource(deviceBD) === true) {
      console.log(aux.timeStamp(), "btctl: This is a source:", deviceBD);
      //btsp.connectedSink(deviceBD, false);  //false -> notifications
      connectedSource(deviceBD, false);     //false -> notifications
  }
  else {
    console.log(aux.timeStamp(), "btctl: ...unknown status of", deviceBD);
  };
};
/** When the Player restarts itself there is a need to stop listening to
 * Bluetoothctl - called by machine restartPlayer(), line 2900 around there.
 * @return {?}  of no interest
 */
function removeBluetoothctlListener() {
  term.removeAllListeners('data');
};

 /** Used whenever machine needs to remove all devices, sources as well as sinks.
  * 1. get all devices and 2. disconnect and remove each device (effect: unpair
  * and untrust). Note it has to be all devices, not only paired ones.
  * => bluetoothctl will be in an empty state, all devices should be disconnected.
  * @Params{boolean}  onlySources, if true only audio sources are deleted
  * @return {?}       of no interest
  */
async function unpairAllDevices(onlySources = false) {
//1: Get all the device BDs for sources and sinks --> 'sudo bluetoothctl paired-devices'
    //let pairedArray = await btsp.btPairedDevices(); //original
    let pairedArray = await btsp.btAllDevices();
    let numberOfDevices = pairedArray.length;
    if (numberOfDevices > 0) {
      //(onlySources !== true) && console.log(aux.timeStamp(), "blut: Going to remove ALL devices, #", numberOfDevices);
      //onlySources && console.log(aux.timeStamp(), "blut: Going to remove only SOURCES, #",numberOfDevices);
      //console.log(pairedArray); console.log(aux.timeStamp(),"blut: commence X-------->");
      if (numberOfDevices > 0) {
        if (onlySources === true) {
          for(let i = 0; i < numberOfDevices; i++) {
              if (await btsp.isDeviceAudiosource(pairedArray[i]) === true) {
//2a: only sources - remove, which means unpair/untrust and disconnect the device
                await removeDevice(pairedArray[i]);
                //console.log(aux.timeStamp(), "blut: Just removed SOURCE:", pairedArray[i]);
              };
          };
        }
        else {
//2b: all devices - remove, which means unpair/untrust and disconnect the device
          for(let i = 0; i < numberOfDevices; i++) {
              //console.log(aux.timeStamp(), "blut: Now remove --------", pairedArray[i]);
              await removeDevice(pairedArray[i]);
              //console.log(aux.timeStamp(), "blut: Just removed -----X", pairedArray[i]);
          };
          //there might be a spkr connected, better reset alsa as well:
          //console.log(aux.timeStamp(), "blut: Always do an ALSA reset:----");
          await btsp.resetAlsaToAmp();     //remove asound.conf and unmute amp
        };
      };  //ends loop
    };
};
 /** Helper; disconnects, unpairs, untrusts and removes a source from btctl.
  * 'sudo bluetoothctl remove' does all the above, no need for specific disconnect.
  * Connected sources are always paired and trusted.
  * Unfortunately, this seems to taka a while. 150 msecs per device
  * This is un unconditional forced remove, device better be in btctl...
  * @param {string}   bdaddr, mac address of device to be removed from btctl
  * @return {?}       of no interest
  */
function removeDevice(bdaddr) {
  //alternative   --> sudo bt-device -r 34:14:5F:48:32:F8 is an option?
  try {
        execSync(`sudo bluetoothctl remove ${bdaddr}`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
        //console.log(aux.timeStamp(), "blut: btctl removed device", bdaddr);
  }
  catch (err) {
    console.log(aux.timeStamp(), "blut: error in remove [removeDevice]\n", err);
  };
};
/** Helper; disconnects, but doesn't unpair, untrust nor remove a source is a
 * device in btctl, on the condition that the source is still trusted!
 * 'sudo bluetoothctl remove' does too much, (not used in this version))
 * Connected sources are always paired and trusted.
 * This is a conditional removeDevice() -- see the function above...
 * @param {string}   bdaddr, mac address of device to be removed from btctl
 * @param {boolean}  doDisconnect, if true do disconnect, if false = not needed
 * @return {?}       of no interest     NOT IN USE
 */                                                           //** NOT IN USE **
function removePairedDevice(bdaddr) {
 let isDevicePaired = "";
 try {
       isDevicePaired =
          execSync(`sudo bluetoothctl paired-devices`,
                        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
       console.log(aux.timeStamp(), "blut: now checking if SOURCE is a btctl paired device.");
 }
 catch (err) {
       console.log(aux.timeStamp(), "blut: error in checking paired devices [removePairedDevice]\n", err);
 };
 if (isDevicePaired.indexOf(bdaddr) !== -1) {
   try {
         execSync(`sudo bluetoothctl disconnect ${bdaddr}`,
                     {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
         console.log(aux.timeStamp(), "blut: [removePairedDevice] disconnect:", bdaddr);
   }
   catch (err) {
     console.log(aux.timeStamp(), "blut: error in remove [removeDevice]\n", err);
   };
 };
};

/** Updates the global variable for connected sources
  * This function goes to the source - it should not use btmgmt command.
  * ... used hcitool before, but it is depreciated.
  * Used by getConnectedSources().
  * @Global {connectedSources}  updated according to btctl
  * @return {array}             array of strings on format [ '<macaddr>',... ]
  */
async function updateConnected() {
//1. Find all the paired devices, they might be connected or disconnected
    let pairedArray = await btsp.btPairedDevices(); //'sudo bluetoothctl paired-devices
    //let pairedArray = await btsp.btAllDevices(); //'sudo bluetoothctl devices'
    let connectedArray = [];
    let numberOfDevices = pairedArray.length;
    if (numberOfDevices > 0) {
//2. Find out which devices are really connected
    //let connectedString = "";
//3. Find out the devices that are paired and connected and sources.
//   Note: sources are never trusted, they can be paired but not trusted.
//   Alternative: (await btsp.isDeviceAudiosource(pairedArray[i]) === true)
        for(let i = 0; i < numberOfDevices; i++) {
          if ((await btsp.btIsDeviceConnected(pairedArray[i]) === true) &&
              (await btsp.isTrusted(pairedArray[i]) === false)) {
                connectedArray.push(pairedArray[i]);
            };
        }; //End of loop
      };
  connectedSources = connectedArray;    //update of GV array
  return connectedArray;
};
 //...................................................................[boot] end

//bluetoothctl Watch - Detect - [Identify Change - Update Change] - Render
/** There a new device got paired to the Player, connect device over bluetooth.
  * Then notify the machine about the connection and if it is the first audio
  * source then 'first: false' in the object signalled.
  * If first, the bluetooth loops  should also be started by the machine-loop.
  * Update the array of connected devices.
  * The source device is already trusted by bluetoothctlTerminal() above,
  * [needed during Agnet problems Oct 2021], but trusting should be here.
  * @param  {string}    deviceBD, mac address of paired source device
  * @param  {boolean}   isSilent if true no notification just rendering by machine
  * @Global {connectedSources}    add the new mac address to the array
  * @return {string}             mac address
  */
async function connectedSource(deviceBD, isSilent) {
  let prevnumber = connectedSources.length;
  let isConnected = await btsp.btIsDeviceConnected(deviceBD);
//A. First, connect the device to Player if not connected [Identify Change]
  if (isConnected === false) {
    try {
      execSync(`sudo bluetoothctl connect ${deviceBD}`,
                {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 25000});
      console.log(aux.timeStamp(), "blut: connection attempt done...");
    }
    catch (err) {
      console.log(aux.timeStamp(), "blut: bluetoothctl connection error?\n", err);
      isConnected = false;
    };
  };
//B. Check if the device is already in Player's connectedSource, if not add device
  if (connectedSources.indexOf(deviceBD) === -1) {  // [Update Change] part
    connectedSources.push(deviceBD);
  };
  let now = connectedSources.length;
  if ((prevnumber === 0) && (now > 0)) { //set first device connected
    //ALSO START loop.btLoop() and loop.btDetect() here ------>
      signal.emit('bluetooth-connected',
                  { array: await nameAndMacPacker(connectedSources),
                    first: true, mode: isSilent }); //true -> first device
  }
  else {  //set another device connected - not the first one...
        signal.emit('bluetooth-connected',
                    { array: await nameAndMacPacker(connectedSources),
                      first: false, mode: isSilent }); //false -> more devices
  };
  return deviceBD;
};
//bluetoothctl Watch - Detect - [Identify Change - Update Change] - Render
/** A device is disconnected - if it is not paired it is a disconnect and
  * notify the machine. But is it a source or a sink?
  * This function looks for a machine registred source being disconnected.
  * If so it is found in the the connectedDevices array - delete it...
  * ... also do not remove it from bluetoothctl, it will be still trusted!
  * If the mac address is not found (not registed as a source) call the function
  * btsp.disconnectSink(), it might be a sink...
  * @param  {string}    deviceBD, mac address of disconnected device
  * @param  {boolean}   isSilent if true no notification just rendering by machine
  * @Global {connectedSources}    remove deviceBD mac address in array
  * @return {?}                   unknown
  */
async function disconnectedDevice(deviceBD, isSilent) {
  let numberOfPrev = connectedSources.length;
  let found = false;
  let isTrusted = await btsp.isTrusted(deviceBD);
    if (numberOfPrev > 0) {
//A. there is at least one source connected, check the connected sources:
      for(let i = 0; i < numberOfPrev; i++) {
        if (connectedSources[i] === deviceBD) {
          //it was a source that got disconnected
          console.log(aux.timeStamp(), "blut: disconnected source:", deviceBD);
          //POSSIBILITY TO STOP bluetooth loops here btLoop() btDetet() ----->
          //NOTE: sources are still trusted if they are disconnected
          if (isTrusted === false) {
            //this device has been removed in btctl - delete from machine
            connectedSources.splice(i, 1); //delete the device from GV
          };
          found = true;                    //set the found flag to true
//B. notify the machine that a source has been removed [Update Change]
          if ((numberOfPrev === 1) && (isTrusted === false)) {
            //last source removed from btctl... signalling 'bluetooth-disconnected'
            //console.log(aux.timeStamp(), "blut: untrusted source, last device", numberOfPrev);
            signal.emit('bluetooth-disconnected', {mode: isSilent} );
          }
          else {
//C. there are still sources connected or trusted, update source connections by sending
//   the signal 'bluetooth-connected' - not 'bluetooth-disconnected' [bad name...]
            let now = connectedSources.length;
            let isFirst = false;
            if (now === 1) {
              isFirst = true;
            };
            //updates the machine with connected and/or trusted source devices
            signal.emit('bluetooth-connected',
                        {array: await nameAndMacPacker(connectedSources),
                         first: isFirst, mode: isSilent});
            };
          break;  //break the loop - no need to continue!
        };        //end of 'if-statement' when the device is found
      };          //end of loop
//D. none of the connected sources were disconnected this time, better check sinks...
      if (found === false) {
        btsp.disconnectedSink(deviceBD);
      };
    }             //end of "at least one source connected and trusted"
//E. there were no sources connected, it has to be a sink, check out sinks
    else {
      btsp.disconnectedSink(deviceBD);
    };
};
/** Returns true if the source devices is paired.         ** NOT IN USE **
  * @return {boolean}      true if paired
  */
function isDevicePaired(deviceBD){
  let paired = "";
  let pairedIndicator = -1;
  // | grep "Paired: yes"  --- might give trouble at errors
  try {
    paired =
      execSync(`sudo bluetoothctl info ${deviceBD}  `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
    pairedIndicator = paired.indexOf("Connected: yes");
  }
  catch (err) {
    console.log(aux.timeStamp(),"blut: btctl info pair error\n", err);
  };
  if (pairedIndicator !== -1) {
    return true
  }
  else {
    return false
  };
};
//NOT IN USE ANYMORE????
/** Returns an array of currently connected devices mac address, BDaddr.
  * This function goes to the source - the bluetoothctl commands
  * All sources are paired, but not trusted. All sinks are trusted.
  * Is similar to updateConnectedAndTrusted() in machine-audiosinks.js
  * @return {array}      mac address of currently connected device
  */
async function connectedDevices() {  //NOT USED IN machine-bluetooth.js
//1: Get all paired device BDs for sources from the btctl this time:
//  btsp.btPairedDevices()  --> 'sudo bluetoothctl paired-devices'
//  alternatively:  await btsp.btAllDevices(); -->'sudo bluetoothctl devices'
    let connectedArray = [];
    let pairedArray = await btsp.btPairedDevices();
    if (pairedArray.length > 0) {
//2: check if each paired device is a connected device
      let numberOfDevices = pairedArray.length;
      for(let i = 0; i < numberOfDevices; i++) {
        //pairedArray string is on format: ['34:14:5F:48:32:F8', 'FC:58:FA:ED:57:60']
          if (await btsp.btIsDeviceConnected(pairedArray[i]) === true) {
          //if (connection !== "") {
            connectedArray.push(pairedArray[i]);
          };
        }; // --- ends the for loop
      };
    return connectedArray;
};
/**Packer - For each source address in macArray create an object on the format:
 * [ {name: "Galaxy S7", mac: "34:14:5F:48:32:F8", connected: true}, ... ]
 * The command 'sudo bluetoothctl info <mac> | grep "Name: " '
 * returns the name string.'\tName: Galaxy S7\n'  17 chars long, trim it and
 * get 'Name: Galaxy S7' -- so slice at index 6. Used by disconnectedDevice(),
 * and connectedSource().
 * @param  {array}          macArray, array of connected source mac addresses,
 * @return {array}          [ {name: string, mac: string}, ... ]
 */
async function nameAndMacPacker(macArray) {
  let numberOfDevices = macArray.length;
  let deviceObjectArray = [];
  for(let i = 0; i < numberOfDevices; i++) {
    let nameString = "";
    let isConnected = await btsp.btIsDeviceConnected(macArray[i]);
    try {
        nameString =
        aux.mpdMsgTrim(
          execSync(`sudo bluetoothctl info ${macArray[i]} | fgrep "Name: " `,
                        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000}));
        nameString = nameString.slice(6);
        //nameString = "Unknown Device"; //could not retrieve the name...
      }
      catch (err) {
        nameString = "Unknown Device"; //could not retrieve the name...
      };

    deviceObjectArray.push({name: nameString, mac:macArray[i], connected: isConnected});
  };
  return deviceObjectArray;
};
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//User request handling
/** Remove a source device, it will be disconnected and unpaired, untrusted.
 * Note: btctl [DEL] will invoke the function disconnectedDevice(), and will
 * be caught by bluetoothctlTerminal() and triggered by btctl itself [CHG, DEL].
 * Note: A disconnect can also be done with btmgmt unpair.
 * @Global {bluetoothConnection} reset all values
 * @return {?}             not of any interest
 */
function btDisconnectCtl(deviceBD) {
  //execSync(`sudo bluetoothctl remove ${deviceBD} `,
  try { //Fire off a remove..     will be caught by btctl
        execSync(`sudo bluetoothctl disconnect ${deviceBD} `,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000});
        console.log(aux.timeStamp(),"blut: [btDisconnectCtl] invoked a disconnect for", deviceBD);
    }
    catch (err) {
      console.log(aux.timeStamp(),"blut: error in remove [btDisconnectCtl]\n", err);
      //nothing to see here..
    };
};
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
/**Unblock streaming and restart bluealsa-aplay, connection capabilities are up
* again. The restart of bluealsa-aplay is crucial. NO? this requires restart of
* bluetoothDetect() - otherwise it would lose the aplay pid!!!!
 * Note: power on if bluetooth network is blocked by rfkill will have no effect
 * @return {?}             true?
 */
async function bluetoothUnblockStreaming() {
  await showBluetooth();
};
/**Allow new pairing of devices, discovery of Player, and connections being made.
 * @return {?}                  of no interest
 */
function showBluetooth() {
  try {
    execSync(`sudo bluetoothctl power on`,
             {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  }
  catch (err) {
    console.log("bluetoothctl: cannot turn onpower for bluetoothctl");
  };
  try {
    execSync(`sudo bluetoothctl pairable on && sudo bluetoothctl discoverable on `,
             {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  }
  catch (err) {
    console.log("bluetoothctl: cannot turn bluetooth connections");
  };

};
/**Prevent new pairing of devices, discovery of Player, and connections being made.
 * @return {?}                  of no interest
 */
function hideBluetooth() {
  try {
    execSync(`sudo bluetoothctl pairable off && sudo bluetoothctl discoverable off`,
             {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  }
  catch (err) {
    console.log("bluetoothctl: cannot turn bluetooth connections");
  };
};

//Essential findings for Bluetooth mangement....................................
//..............................................................................
 /*

-- btdevice list all added devices
bt-device -l
Added devices:
Galaxy S7 (34:14:5F:48:32:F8)

-- given a smart phone BD, get all information
bt-device -i 34:14:5F:48:32:F8
[34:14:5F:48:32:F8]
  Name: Galaxy S7
  Alias: Galaxy S7 [rw]
  Address: 34:14:5F:48:32:F8
  Icon: phone
  Class: 0x5a020c
  Paired: 1
  Trusted: 0 [rw]
  Blocked: 0 [rw]
  Connected: 1
  UUIDs: [OBEXObjectPush, AudioSource, AVRemoteControlTarget, AdvancedAudioDistribution, AVRemoteControl, HeadsetAudioGateway, PANU, HandsfreeAudioGateway, PhoneBookAccess, 00001132-0000-1000-8000-00805f9b34fb, PnPInformation, 00001800-0000-1000-8000-00805f9b34fb, 00001801-0000-1000-8000-00805f9b34fb, a23d00bc-217c-123b-9c00-fc44577136ee]

// -- given a speaker BD, get all information  *Not covered here, see machine-audiosink.js*
bt-device -i FC:58:FA:CC:30:A4
 [FC:58:FA:CC:30:A4]
   Name: HR Port Spkr
   Alias: HR Port Spkr [rw]
   Address: FC:58:FA:CC:30:A4
   Icon: audio-card
   Class: 0x260404
   Paired: 0
   Trusted: 0 [rw]
   Blocked: 0 [rw]
   Connected: 0
   UUIDs: [Headset, Handsfree, AudioSink, AVRemoteControl, SerialPort]

Note: a phone has AudioSource service and a speaker has AudioSink service.

-- given a BD, is the device connected?
sudo bt-device -i 34:14:5F:48:32:F8 | grep Connected
Connected: 1

sudo bt-device -l | grep "("
Galaxy S7 (34:14:5F:48:32:F8)

-- bt-adapter
sudo bt-adapter -l
Available adapters:
Player (DC:A6:32:00:32:B2)

-- bluetoothctl is not only interactive...
i) using command line
sudo echo "show" | bluetoothctl

ii) or even more strict command line style:
sudo bluetoothctl show

Agent registered
[bluetooth]# show
Controller DC:A6:32:1D:DB:52 (public)
       Name: Player
       Alias: Player
       Class: 0x0004041c
       Powered: yes
       Discoverable: yes
       Pairable: yes
       UUID: Audio Sink                (0000110b-0000-1000-8000-00805f9b34fb)
       UUID: Generic Attribute Profile (00001801-0000-1000-8000-00805f9b34fb)
       UUID: A/V Remote Control        (0000110e-0000-1000-8000-00805f9b34fb)
       UUID: PnP Information           (00001200-0000-1000-8000-00805f9b34fb)
       UUID: A/V Remote Control Target (0000110c-0000-1000-8000-00805f9b34fb)
       UUID: Generic Access Profile    (00001800-0000-1000-8000-00805f9b34fb)
       Modalias: usb:v1D6Bp0246d0532
       Discovering: no

Maybe a more correct way emulating terminal session...
sudo echo -e "connect FC:8F:90:21:12:0C \nquit" | bluetoothctl
-e	enable interpretation of for example the following backslash escapes:
    \n	new line
    \r	carriage return

Command line examples with bluetoothctl command:
sudo bluetoothctl paired-devices | cut -d' ' -f2
  --returns mac address (BD)
sudo bluetoothctl paired-devices | cut -d' ' -f3-
  --returns device name
sudo bluetoothctl info 34:14:5F:48:32:F8  | grep Connected:
  --returns connected
sudo bluetoothctl paired-devices | grep -q 34:14:5F:48:32:F8 && echo true || echo false
  --returns if a device is paired or not "true" or "false"
sudo bluetoothctl info 34:14:5F:48:32:F8 | grep '^\s*Connected:' | awk '{print $NF}'
  --detects connected or not  “yes” or “no”

File structures:
* command busctl - may be used to introspect and monitor the D-Bus bus.
--------------------------------------------------------------------------------
sudo busctl tree org.bluez
└─/org
  └─/org/bluez
    └─/org/bluez/hci0
      └─/org/bluez/hci0/dev_34_14_5F_48_32_F8
        ├─/org/bluez/hci0/dev_34_14_5F_48_32_F8/fd30
        └─/org/bluez/hci0/dev_34_14_5F_48_32_F8/player0

* Directory /var/lib/bluetooth
--------------------------------------------------------------------------------
Folders:
/var/lib/bluetooth/B8:27:EB:4F:4E:F8/   -- older hci0 controller
/var/lib/bluetooth/DC:A6:32:1D:DB:52/   -- older hci0 controller
/var/lib/bluetooth/DC:A6:32:00:32:B2/   -- current hci0 mac address
/var/lib/bluetooth/DC:A6:32:00:32:B2/34:14:5F:48:32:F8/ -- Galaxy S7
/var/lib/bluetooth/DC:A6:32:00:32:B2/cache/ -- directory holds all mac devices


* bluetoothctl terminal session messages for event handler:
--------------------------------------------------------------------------------
-- sequences; disconnect from device                              [2 messages]
[CHG] Device 34:14:5F:48:32:F8 ServicesResolved: no
[CHG] Device 34:14:5F:48:32:F8 Connected: no

-- sequence; disconnected or unpaired from device (and disconnected as well)
   or bluetooth off on device or bluetooth is blocked by machine  [1 messages]
[CHG] Device 34:14:5F:48:32:F8 Connected: no

-- sequence; connect from device when already paired, or device is unpaired
[CHG] Device 34:14:5F:48:32:F8 Connected: yes                     [1 messages]

-- sequences; connect with pairing from device (not paired on either side...)
   also if machine is unpaired, but device is paired              [4 messages]
[NEW] Device 34:14:5F:48:32:F8 Galaxy S7

[CHG] Device 34:14:5F:48:32:F8 Modalias: bluetooth:v0075p0100d0201

[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001105-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 0000110a-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 0000110c-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 0000110e-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001112-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001115-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 0000111f-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 0000112f-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001132-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001200-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001800-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001801-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: a23d00bc-217c-123b-9c00-fc44577136ee
[CHG] Device 34:14:5F:48:32:F8 ServicesResolved: yes
[CHG] Device 34:14:5F:48:32:F8 Paired: yes

[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001105-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 0000110a-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 0000110c-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 0000110d-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 0000110e-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001112-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001115-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 0000111f-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 0000112f-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001132-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001200-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001800-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: 00001801-0000-1000-8000-00805f9b34fb
[CHG] Device 34:14:5F:48:32:F8 UUIDs: a23d00bc-217c-123b-9c00-fc44577136ee


-- bluetoothctl interactive menu options: (available commands)
-------------------------------------------------------------------------------
advertise                                         Advertise Options Submenu
scan                                              Scan Options Submenu
gatt                                              Generic Attribute Submenu
list                                              List available controllers
show [ctrl]                                       Controller information
select <ctrl>                                     Select default controller
devices                                           List available devices
paired-devices                                    List paired devices
system-alias <name>                               Set controller alias
reset-alias                                       Reset controller alias
power <on/off>                                    Set controller power
pairable <on/off>                                 Set controller pairable mode
discoverable <on/off>                             Set controller discoverable mode
agent <on/off/capability>                         Enable/disable agent with given capability
default-agent                                     Set agent as the default one
advertise <on/off/type>                           Enable/disable advertising with given type
set-alias <alias>                                 Set device alias
scan <on/off>                                     Scan for devices
info [dev]                                        Device information
pair [dev]                                        Pair with device
trust [dev]                                       Trust device
untrust [dev]                                     Untrust device
block [dev]                                       Block device
unblock [dev]                                     Unblock device
remove <dev>                                      Remove device
connect <dev>                                     Connect device
disconnect [dev]                                  Disconnect device
menu <name>                                       Select submenu
version                                           Display version
quit                                              Quit program
exit                                              Quit program
help                                              Display help about this program
export                                            Print evironment variables

*/
