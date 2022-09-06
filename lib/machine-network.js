//Copyright 2022 by Retro Audiophile Designs, all rights reserved.
////GNU General Public License v3.0 see license.txt            [Source code]
//                        ~ general network handler for backend ~
//NOTE: this file cannot be minimized. NOT BE MINIMIZED!!

const aux = require('./machine-auxiliary.js');    //all the utils
const blut = require('./machine-bluetooth.js');   //handle bluetooth sources
const btsp = require('./machine-audiosink.js');   //handle bluetooth sinks
const hot = require('./machine-hotspot.js');      //handle wi-fi hotspot (ap)
const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synced Raspbian cmds
const fs = require('fs');                           //for reading files
const events = require('events');                   //for creating events
const signal = new events.EventEmitter();

module.exports.updateConnections = updateConnections;
module.exports.updateBluetoothConnections = updateBluetoothConnections;

module.exports.readBluetoothHci = readBluetoothHci;
module.exports.setBluetoothMac = setBluetoothMac;
module.exports.stopBluetooth = stopBluetooth;
module.exports.startBluetooth = startBluetooth;

module.exports.turnOffAP = turnOffAP;

module.exports.readLanIpAddress = readLanIpAddress;
module.exports.lanWatcher = lanWatcher;
module.exports.isInternet = isInternet;

module.exports.wifiBootPreparations = wifiBootPreparations;
module.exports.readSSIDandIpAddress = readSSIDandIpAddress;
module.exports.readWifiIpAddress = readWifiIpAddress;
module.exports.wifiScan = wifiScan;
module.exports.wifiConnect = wifiConnect;
module.exports.wifiDisconnect = wifiDisconnect;

module.exports.ifaceWifi = ifaceWifi; //dual ifaces function
module.exports.isWlan1 = isWlan1;     //dual ifaces function
module.exports.clearHotspotIface = clearHotspotIface; //as above...

module.exports.signal = signal;

//Note: hotspot ip address is always: "10.0.0.10"
//______________________________________________________________________________
/**All networks - check the actual status of ALL connections. Returns an array.
 * ConnectionStatus array format: [
 * [ {bluetooth: -, devices:  [ {name: -, mac: -}... ],
                    speakers: [ {name: -, mac: -}... ]},
 *   {lan: -, ip: -},
 *   {wifi: -, ssid: -, ip: -, tentative: -},
 *   {hotspot: -, ip: "10.0.0.10"}    ]
 * The array is sent to the machine with the "network-update" event.
 * If any of the networks is in an error state, the network will just
 * be marked as disconnected. Error-handling occur in the read-functions.
 * @return {array}     connection defined as above
 */
async function updateConnections() {
  let connectionStatus = [];
  let bluetoothSources = [];
  //let lanData = "";
  //let wifiData = "";
  let bluetoothIndicator = readBluetoothHci(); //true or false
  let lanIndicator = readLanIpAddress();       //ip string or ""
  let wifiIndicator = readSSIDandIpAddress();  //wifi object
  let hotspotIndicator = hot.readHotspotIp();  //hotspot object
//A. Check status of Bluetooth and push the state in the returning array
  if (bluetoothIndicator === true) { //bluetooth is up -> bluetooth ...
    //Get all the devices' BDs and names;
    bluetoothSources = await btsp.nameAndMacPacker(
                                            await blut.getConnectedSources(true));
    await btsp.updateConnectedAndTrusted();
    let connections = await btsp.nameAndMacPacker(
                                            await btsp.getConnectedSinks(false),
                                            true); //true means connected
    let trustees = await btsp.nameAndMacPacker(
                                            await btsp.getTrustedSinks(false),
                                            false); //false means trusted only
    connectionStatus.push({bluetooth: true, devices: bluetoothSources,
                           speakers: connections.concat(trustees) });
  }
  else { //bluetooth is down, blocked -> no bluetooth,  also if error
    connectionStatus.push({bluetooth: false, devices: [], speakers: []});
  };
//B. Check status of lan and push the state in the returning array
  if (lanIndicator != "") {
    connectionStatus.push({lan: true, ip: lanIndicator});
  }
  else { //no ip address -> no connection, also run if a fatal error occured
    connectionStatus.push({lan: false, ip: ""});
  };
//C. Check status of wifi and push the state in the returning array
  if (wifiIndicator) {
    connectionStatus.push(wifiIndicator);
  } else {  //--> only runs when a fatal error occured...
    connectionStatus.push({wifi: false, ip: "", ssid: "", tentative: ""});
  };
//D. Check status of hotspot and push the state in the returning array
  if (hotspotIndicator) {
    connectionStatus.push(hotspotIndicator);
  } else { //--> only runs when a fatal error occured...
      connectionStatus.push({hotspot: false, ip:"10.0.0.10"});
    };
  signal.emit("network-update",connectionStatus); //notify the machine
  return connectionStatus;
};
/**Bluetooth - gets the actual status of Bluetooth and reads the latest stored
 * device connections. Status object format: { bluetooth: true/false,
 *       devices: [ {name: -, mac: -}...], speakers: [ {name: -, mac: -}...]  },
 * Used by 'machine.networkBootPreparations()' at boot time.
 * @params {boolean} noEmit, if true no event emitted to machine, just return
 * @return {object}  an object with connections defined as above
 */
async function updateBluetoothConnections(noEmit) {
  let connectionStatus = [];
  let bluetoothSources = [];
  //let bluetoothSinks = [];
  let bluetoothIndicator = await readBluetoothHci(); //true or false
//Check status of Bluetooth service and push the state in the returning array
  if (bluetoothIndicator === true) {
    //bluetooth service is up, get all the devices' BDs and names;
    //Below; true --> update connected sources
    bluetoothSources = await btsp.nameAndMacPacker(
                                await blut.getConnectedSources(true));
    //update trusted sinsk and connected sink
    await btsp.updateConnectedAndTrusted();
    //Below; false -> stored value (just updated here, previous line)
    let connections = await btsp.nameAndMacPacker(
                                await btsp.getConnectedSinks(false),
                                            true); //true --> connected
    //Below; false --> stored value (just updated here)
    let trustees = await btsp.nameAndMacPacker(
                                await btsp.getTrustedSinks(false),
                                            false); //false --> trusted only
    //Finally, build return object
    connectionStatus = {bluetooth: true, devices: bluetoothSources,
                        speakers: connections.concat(trustees) };
  }
  else {
    //bluetooth service is down, blocked means no bluetooth,  also if error
    connectionStatus = {bluetooth: false, devices: [], speakers: []};
  };
  if (noEmit === false ) {
    signal.emit("bluetooth-update",connectionStatus); //notify the machine
  };
  return connectionStatus;
};
//Bluetooth =============================================================== hci0
/**Bluetooth - check if bluetooth is up and running. Bluetooth is turned on/off
 * with 'sudo rfkill block bluetooth' or 'sudo rfkill unblock bluetooth
 * Called by the machine networkBootPreparations().
 * Note: btsp.isBluetoothOn() is the same function as this one... uhm..
 * The name is not good either, used to call hci, but not anymore.
 * @return {boolean}     unblocked -> true, otherwise false
 */
async function readBluetoothHci() {
  //await btsp.isBluetoothOn();   //better choice...
  let bluetoothIndicator = "";
  try {
    bluetoothIndicator = aux.mpdMsgTrim(
          execSync(`sudo rfkill list | tail -n2 | fgrep yes `,
                  {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 65000}));
  //CLI returns: "Soft blocked: yes" /nl means blocked and ends up in std output
  }
    catch (err){
  //CLI returns: "" when NOT blocked, and ends up in std err
      bluetoothIndicator = "";
      //signal.emit("bluetooth-ERROR", {error: "cannot check status of Bluetooth"});
    };
  if (bluetoothIndicator !== "") {
    return false;
  }
  else {
    return true;
  };
};
/**A little helper for Bluetooth services - finds the mac address.
  * This is the controller mac. hcitools are depreciated and 'sudo bluetoothctl show'
  * should be used instead, to be done in the future...
  * 'sudo bluetoothctl show | grep Controller | cut -d' ' -f2' is now used
  * This function should be moved to machine-network.js or to machine-bluetooth.js
  * @return {string}     bluetooth mac address
  */
 function setBluetoothMac() {
   let controllerMac = "";
   try {
     controllerMac =
       aux.mpdMsgTrim(
           execSync(`sudo bluetoothctl show | grep Controller | cut -d' ' -f2 `,
                   {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000}));
   }
   catch (error) {  //nothing can be done here, its an ERROR, "" is returned
   };
   return controllerMac;
 };

/**Bluetooth - stop the bluetooth service, disconnects any connected device
 * as well, but doesn't unpair. rfkill works best as a stopper.
 * Called by machine disconnectNetwork()
 * Note: sudo systemctl status bluetooth && sudo systemctl status bluealsa
 * && sudo systemctl status aplay && sudo systemctl status bt-agent - check out!
 * Note: sudo killall -9 bluetooth   nor   sudo systemctl stop bluetooth - no!
 * @return {boolean}     true
 */
function stopBluetooth() {
  try {
    execSync("sudo rfkill block bluetooth",
             {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    //POSSIBILITY TO STOP bluetooth loops since alla devices are disconnected,
    //but maybe better to let btctl manage this with disconnects
  }
  catch (err) {
    signal.emit("bluetooth-ERROR", {error: "cannot stop Bluetooth"});
  };
  return true;
};
/**Bluetooth - start the bluetooth service, i.e. unblock bluetooth
 * Called by machine connectNetwork()
 * Full heck: sudo systemctl status bluetooth && sudo systemctl status bluealsa
 * && sudo systemctl status aplay && sudo systemctl status bt-agent - check out!
 * @return {boolean}     true
 */
function startBluetooth() {
  try {
    execSync("sudo rfkill unblock bluetooth",
             {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
  }
  catch (err) {
    signal.emit("bluetooth-ERROR", {error: "cannot startup Bluetooth"});
  };
  return true;
};
//Hotspot ================================================================ wlan0
/**Hotspot - turn off the hotspot, required for stuttering free bt stream to
 * a connected bt speaker. Called by 'btsp.restartMpdAndStreaming'. It notifies
 * the machine that hotspot was turned off so the change might be rendered.
 * Similar to 'machine.shouldHotspotStart()'
 * Note: this function could have been placed in 'machine-hotspot.js'
 * @event {machine}     'hotspot-changed', set hotspot object, might render
 * @return {boolean}     true if hotspot got stopped, else false
 */
async function turnOffAP() {
  let isHotspotOn = await hot.isHotspotOn();     //returns a boolean value
  let stopFlag = false;
  if (isHotspotOn === true) {
    let wifiStatus = await readSSIDandIpAddress(); //returns an object
    let lan = await readLanIpAddress();            //returns ip addr or ""
    if ((wifiStatus.wifi === true) || (lan !== "")) {
      hot.stopHotspot();
      //doRender = false, since all is rendered in 'bluetooth-required-restart'
      signal.emit('hotspot-changed', {hotspot: false, ip: "10.0.0.10", doRender: false} );
      stopFlag = true;
    }
    else {
      stopFlag = false;
    };
  };
  return stopFlag;
};

//Ethernet LAN =========================================================== eth0
/**LAN - get the ip address, if not connected return ""
 * Called by networkBootPreparations() and shouldHotspotStart() at machine
 * Note: an IP in the 169.254.xxx.xx range is a bad IP, auto generated
 * @params {integer}    timeoutDefined, if set to 500 the address is polled
 * @return {string}     ip address or empty string
 */
function readLanIpAddress(timeoutDefined) {
  let lan = "";
  let timeout = timeoutDefined ? timeoutDefined : 5000;
  try {
    lan = aux.mpdMsgTrim(
    execSync(`sudo ip addr list eth0 |grep "inet " | cut -d' ' -f6 | cut -d/ -f1`,
    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: timeout}));
    if (lan.indexOf("169.254") !== -1) {
      lan = ""; //no real IP address
    };
  }
  catch (err) {
    if (timeoutDefined === false) {
      signal.emit("lan-ERROR", {error: "reading LAN ip address failed"});
    };
  };
  return lan;
};
/**LAN - Purpose: A. monitor the LAN port for cable attach or detach
 *                B. monitor Internet access (access - no access)
 * This is one of the first function called at machine - on top (row 74)
 * Polls the file /sys/class/net/eth0/carrier for state of the lan port.
 * If "1" the cable is physically connected, if "0" no cable in lan port.
 * This function reads that file when modified, trims the string value and checks if
 * the state has changed. If so wait for the ip address to change.
 * Reads the file every 8.8 second. Always on as long as machine is running.
 * In addition the Internet access is checked and changes are sent to the machine.
 * This function checks if one of the worlds most visited website is accessable.
 * Source: 'https://en.wikipedia.org/wiki/List_of_most_visited_websites'
 * The order is shuffled and hence kind of "orderly" randomized
 * The file /sys/class/net/lo/carrier cannot be used to check Internet access.
 * @return {?}      of no interest
 */
async function lanWatcher() {
  let state = aux.mpdMsgTrim(fs.readFileSync('/sys/class/net/eth0/carrier', 'utf8'));
  let internet = await isInternet();
  let oldState = state;
  let previousInternet = internet;
  let timeslot = 0;
  let checkslot = Math.floor(Math.random() * 60) + 8;  //first Internet check
  let urlArray = ["www.google.com", "www.youtube.com", "www.facebook.com",
                   "www.twitter.com", "www.instagram.com" ];
  let indexArray = [0, 1, 2, 3, 4];
  //console.log(aux.timeStamp(),"lan: started to watch /sys/class/net/eth0/carrier ---------");
  let timer = setInterval(async function() {
    timeslot = timeslot + 1;
// LAN access is checked every 8.8 second
    try {
      state = aux.mpdMsgTrim(fs.readFileSync('/sys/class/net/eth0/carrier', 'utf8'));
    }
    catch (err) {
      signal.emit("lan-ERROR", {error: "LAN cable detection failed"});
      state = "error";
    };
    if (state != oldState) {
      oldState = state;
      switch(state) {
        case "0":
        waitForlanIp(state);
        break;
        case "1":
        waitForlanIp(state);
        break;
        default:
        state = "error"
        signal.emit("lan-ERROR", {error: "unknown status of LAN port"});
        break;
      };
    };
// Internet access is checked between  8 x 8800 msec, ~61 seconds
// to 60 x 8800 msec, ~9 minutes using Math.floor(Math.random() * 60) + 8
// when Internet access is down, it is checked much more often
    if (checkslot < timeslot) {
    //if (true) {
      checkslot = Math.floor(Math.random() * 60) + 8;
      if (indexArray.length === 0) {
        indexArray = aux.shuffleFisherYates([0, 1, 2, 3, 4]);
        //console.log(aux.timeStamp(),"nwork: shuffled url's", indexArray );
      };
      let url = urlArray[indexArray.shift()]
      let internet = await isInternet(url); //facebook or google...
      if (internet !== previousInternet) {
        previousInternet = internet;
        signal.emit("internet", internet);
      };
      if (internet === "0") { //if Internet is down, check every time slot
        timeslot = 68;
      }
      else {
        timeslot = 0;
      };
    };
  }, 8800);
};
/**Internet access -  It does a DNS lookup.
 * @param {integer}      url, if false then google.com will be used
 * @return {string}      "1" if there is Internet access, "0" means no Internet
 */
function isInternet(url = "www.google.com") {
  //Option: use; execSync(`sudo  wget  --spider http://google.com`,
  //Option: use; 'sudo curl -Is  http://www.google.com | head -n 1'
  //Option: use; 'sudo  curl -I -s https://www.google.com'
  //Chosen: use; 'sudo host www.google.com' head does not work with all urls!!!
  let outcome = "1" //we assume Internet access
    try {
      outcome =
       execSync(`sudo host ${url}`,
                {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
      //console.log(aux.timeStamp(),"nwork: just checked url:", url );
       if (outcome.indexOf("has address") !== -1) {
         return "1";
       }
       else {
         return "0";
       };
    }
    catch (err) {
      return "0";
    };
};

/**LAN - if the new state is "0" it polls until the disconnect is confirmed by
 * no ip address associated anymore to the lan port. If the new state is "1" it
 *is polling for the new ip address. It tries 64 times with a second in between.
 * On average 4 to 6 polls for ip address, disconnect detected after 1 poll.
 * Used by lanWatcher() above.
 * @return {?}      of no interest
 */
function waitForlanIp(newState) {
  let attempts = 65; //needs to be 65 since 1 i substracted at top of loop
  let timer = setInterval(function () {
    if (attempts > 0) {
      attempts = attempts - 1;
      let ip = readLanIpAddress(500);
      if ((newState === "1") && (ip !== "")) {
        // logger.log(aux.timeStamp(),"lan: after", (65 - attempts), "polls, got new ip:", ip);
        signal.emit('lan-cable-connected', ip);
        attempts = 0;
        clearInterval(timer);
      }
      else if ((newState === "0") && (ip === "")) {
        // logger.log(aux.timeStamp(),"lan: after", (65 - attempts), "polls, disconnect confirmed");
        signal.emit('lan-cable-disconnected');
        attempts = 0;
        clearInterval(timer);
      };
    }
    else {
      signal.emit("lan-ERROR", {error: "LAN port status changed, but no ip address"});
      attempts = 0;
      clearInterval(timer);
    };
  }, 1000);
};

//wifi network =========================================================== wlan0
//Global Variables
var wifiStatus = {
  iface: "wlan1",
  id: false,
  ip: "",
  hotspotIp: "10.0.0.10"
};

/**wifi - Called by machine to set ssid and ip for wifi connection
 * The source is the WPA_cli itself, no fake IPs here since the array has more
 * than 10 elements, the fake 169.254.xxx.xx has only four array elements
 * Used by updateConnections() above ; connectWiFi(), networkBootPreparations()
 * and shouldHotspotStart() at machine
 * @global {wifiStatus} set .ip and .id
 * @return {wifiObject} object = {wifi: boolean, ssid: "", ip: "", tentative: ""}
 */
function readSSIDandIpAddress() {
  let statusString = "";
  let wifiObject = {wifi: false, ssid: "", ip: "", tentative: ""};
  try {
      statusString =
      aux.mpdMsgTrim(execSync(`sudo wpa_cli status`,
      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000}));
    }
  catch (err) {
      signal.emit("wifi-ERROR", {error: "Wi-Fi ip address not confirmed"});
    };
  let stringArray = statusString.split("\n");
  if (stringArray.length > 10) {
    let ssidPair = stringArray[3].split("=");
    let idPair = stringArray[4].split("=");
    let ipPair = stringArray[11].split("=");  //an error occured here......
    if (ipPair != false) {
      wifiStatus.id = idPair[1]; //also update local global object
      wifiStatus.ip = ipPair[1]; //and update this local global object as well
      wifiObject = {wifi: true, ssid: ssidPair[1], ip: ipPair[1], tentative: ""};
    };
  };
  return wifiObject;
};

/**Wifi - get the ip address, if not connected return ""
 * Used for polling ip address - the the execSync timeout is short: 1000 msec.
 * Used by doWifiConnect() and wifiDisconnect()
 * Note: an IP in the 169.254.xxx.xx range is a bad IP, auto generated
 * @params {integer}    timeoutDefined, if set to 1000 the address is polled
 * @return {string}     ip address or empty string = no ip address
 */ //Have to check if it is a wifi address with wpa_cli status as well, to do!
function readWifiIpAddress(timeoutDefined) {
  let ipString = "";
  let timeout = timeoutDefined ? timeoutDefined : 5000;
  try {
    ipString =
    execSync(`sudo ip addr list ${wifiStatus.iface} |grep "inet " | cut -d' ' -f6 | cut -d/ -f1`,
    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: timeout});
    //if ip adress is an auto IP in the 169.254.xxx.xx range: no connection
    if (ipString.indexOf("169.254") !== -1) {
      ipString = ""; //no real IP address
    };
  }
  catch (err) {
    if (timeoutDefined === false) {
      signal.emit("wifi-ERROR", {error: "reading Wi-Fi ip address failed"});
    };
  };
  return ipString;
};

/**wifi - returns the wpa_supplicant network id for the wifi connection
 * Used by wifiDisconnect()
 * @global {wifiStatus} set .id
 * @return {string}     wifi network id
 */
function readNetworkId() {
  let statusString = "";
  let networkId = "";
  try {
      statusString =
      aux.mpdMsgTrim(execSync(`sudo wpa_cli status`,
      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000}));
    }
  catch (err) {
      signal.emit("wifi-ERROR", {error: "Wi-Fi network id unknown"});
    };
  let stringArray = statusString.split("\n");
  if (stringArray.length > 10) {
    let idPair = stringArray[4].split("=");
    if (idPair != false) {
      wifiStatus.id = idPair[1]; //also update local global object
      networkId = idPair[1];
    };
  };
  return networkId;
};

//............................................................ Boot Preparations
/**wifi - Called by machine BEFORE boot - figures out the iface of the
 * wifi interface 'wlan0' or 'wlan1', if there are two. In that case often
 * wifi is using 'wlan1' then AP will be 'wlan1'.
 * Unblocks wifi and turns off the power save function.
 * @return {?}      of no interest
 */
async function wifiBootPreparations() {
  let ifaceforWifi = await ifaceWifi();
  let isWlan1Present = await isWlan1();
  //check of how many wifi ifaces and where "wlan0" and "wlan1" is used
  if (isWlan1Present === true) {
    if (ifaceforWifi === "wlan1") {
      wifiStatus.iface = "wlan1";
      await hot.setWlanInterface("wlan0");
      await clearHotspotIface("wlan0");  //no wi-fi on wlan0 interface
    }
    else {
      wifiStatus.iface = "wlan0";
      await hot.setWlanInterface("wlan1");
      //NOTE: also conf files has to be copied into the right places
      await clearHotspotIface("wlan1"); //no wi-fi on wlan1 interface
    };
  }
  else {
      wifiStatus.iface = "wlan0";
      await hot.setWlanInterface("wlan0");
  };
  console.log(aux.timeStamp(),"network: wi-fi iface for connection is", wifiStatus.iface );
  try {
    execSync(`sudo rfkill unblock wifi`,
    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
  }
  catch (err) {
    signal.emit("wifi-ERROR", {error: "unable to unblock Wi-Fi"});
  };
  exec("sudo iw wlan0 set power_save off",
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
  if (isWlan1Present === true) {
    exec("sudo iw wlan1 set power_save off",
              {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
  };
};
/**wifi - a small helper function to wifiBootPreparations() above.
 * A wpa_supplicant process is started for each wi-fi interface. It forces
 * wi-fi connections to be set up at boot and will override the hotspot.
 * Therefore the iface used by hotspot needs to be disconnected at boot.
 * reconnect or reassociate - enables wpa_supplicant if it was disconnected
 * @param  {string} iface, iface for hotspot
 * @return {?} unknown
 */
async function clearHotspotIface(iface) {
  let ifaceforWifi = await ifaceWifi();
  if (iface !== ifaceforWifi) {
    try {
      execSync(`sudo  wpa_cli -i${iface} disconnect`,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
      //console.log(aux.timeStamp(),"network: cleared iface:", iface );
    }
    catch(err) {
    };
  };
};
/**wifi - Purpose: keep the wifi connection alive.  NOT IN USE ANYMORE
 * A wpa_supplicant scan is done for the wi-fi interface.
 * 'sudo wpa_cli -i wlan0 scan', yields 'OK'
 * Does the cmd every 48 second. Always on as log as machine is running.
 * A ping could also been made so see if it is up:
 * sudo ping -c2 -W1 -Iwlan0 192.168.2.125 | grep 'received' | cut -d ',' -f 2 |
 *      cut -d ' ' -f 2   -- but this takes a few secondsPassed
 * A more desperate approach: sudo ping -c 1 <somedomain.com> > /dev/null
 * or just ping the router? 'sudo ping -c2 192.168.2.1 '
 * @return {?} unknown
 */
function wifiStayAlive() {  //NOT IN USE - NOT REQUIRED FOR NOW, keep it as is
  let timer = setInterval(async function() {
    let resultString = "";
    try {
      resultString =
      execSync(`sudo ip addr list ${wifiStatus.iface} |grep "inet " `,
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
      if (resultString !== "") {
        execSync(`sudo ping -c1 -I${wifiStatus.iface} 8.8.8.8 > /dev/null `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
        //execSync(`sudo wpa_cli -i${wifiStatus.iface} scan`,
        //{uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
        console.log(aux.timeStamp(),"network: pinga-ling" );
      };
    }
    catch (err) { };
  }, (1000 * 48));
};
/**wifi - scan for wifi networks and return an array of ssid's to frontend.
 * The user wants to connect to a Wi-Fi network and will soon get a list of
 * ssids to choose from.
 * If there is only one wlan iface (i.e. wlan0) the scan will find both 2.4 GHz
 * and 5 GHz ssid with the same names. Since 2022 there are always two wlan
 * ifaces and it is the wlan1 that should do the scanning (on the 2.4 GHz band).
 * Function 'wifiScanner()' looks for a specific ssid - this one returns all!
 * Note 1: the ssid '\x00\x00\x00\x00\x00\x0...' is a hidden AP (removed) and
 *         also watch out for Player's AP "Player" - the hotspot!
 * CLI: 'iwlist wlan1 scan | fgrep ESSID | cut -d':' -f2 '
 *      Scan result: "BELL503"\n' + '"BELL503x"\n' ...
 * Array: [ '"BELL503"', '"BELL503x"', ... ]
 * Note 2:'sudo iw dev wlan1 scan' is also an option but returns even more data
 * Note 3: 'iwlist' is deprecated and should be replaced.
 * @return{array}       an array of ssid strings or empty
 */
async function wifiScan() {
  let isWlan1Present = await isWlan1(); //returns strict boolean
  let ssidString = "";
  let networkArray = [];
  let wifiArray = [];
  let iface = "wlan1";
  if (isWlan1Present === false) {
    iface = "wlan0";
  };
  //step 0: just in case... set iface to state DOWN and then UP!
  try {
    execSync(`sudo ip link set dev ${iface} down`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
    console.log(aux.timeStamp(), "network: iface reset:", iface );
  }
  catch(err) {
  console.log(aux.timeStamp(), "network: reset iface  => down error", err );
  return "";
  };
  try {
    execSync(`sudo ip link set dev ${iface} up`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
    //console.log(aux.timeStamp(), "network: iface up again:", iface );
  }
  catch(err) {
  console.log(aux.timeStamp(), "network: reset iface => up error", err );
  return "";
  };
  //step 1: scan for wifi networks
  //console.log(aux.timeStamp(),"nwork: wi-fi scan will now commence on ->", iface);
  try {
    ssidString = aux.mpdMsgTrim(
         execSync( `sudo iwlist ${iface} scan | fgrep ESSID | cut -d':' -f2 `,
                      {uid: 1000, gid: 1000, encoding: 'utf8'}));
    //console.log(aux.timeStamp(),"nwork: wi-fi scan results:\n", ssidString );
  }
  catch (err) {
    console.log(aux.timeStamp(),"nwork: wi-fi scan ERROR:\n", err );
  };
  //step 2: clean up ssid strings and return the wifi array
  if (ssidString.length !== 0) {
    networkArray = ssidString.split("\n");
    //console.log(aux.timeStamp(),"nwork: wi-fi scan array:\n", networkArray );
    let numberOfNetworks = networkArray.length;
    //use the reverse other so the best ssid becomes the first element
    for (let i = 0; i < numberOfNetworks; i++) {
    //for (let i = numberOfNetworks - 1; i > -1; i--) {
      //console.log(aux.timeStamp(),"nwork: wifi loop i =",i," is", networkArray[i] );
      //clean up the ssid string, e.g '"BELL503"' becomes 'BELL503'
      let ssid = networkArray[i].slice(1, (networkArray[i].length - 1));
      //let ssid = aux.stringCleaner(networkArray[i]);
      if ((ssid.indexOf("\x00") === -1) &&
          (ssid.indexOf("Player") === -1)) {
        wifiArray.push(ssid);
      };   // -- end push an ssid into wifiArray
    };     // -- end loop over array
  };       // -- end if there were any wifi networks in the array
  return wifiArray;
};
/**wifi - Called before trying to connect and checking if the SSID is there.
 * Notice: this function will really try to connect, even if the ssid was not
 * found by scanning. Scanning takes a long time and does not get all ssids.
 * Called by machine connectAttemptWiFi() - entry to wifi connection procedure
 * @param  {object} network, ssid + password, the ssid string is used here
 * @global {wifiStatus} iface:
 * @return {?}      of no interest
 */
async function wifiConnect(network) {
  let scanned = "";
  let ssid = network.ssid;
//A. First three scanning attempts ...
  scanned = await wifiScanner(true, ssid); //true means scan three times
  //console.log(aux.timeStamp(),"network: scan result:", scanned );
//B: ssid found - connect
  if (scanned.search(ssid) !== -1) {
    console.log(aux.timeStamp(),"network: ssid found - try to connect.........");
      signal.emit("wifi-ssid-found");
      doWifiConnect(network);
    }
    else if (scanned === "") {
//C: No results, there might be no wi-fi's out there or iface is still down
    console.log(aux.timeStamp(),"network: no scan result .....................");
     try { //try again to set iface to state UP
       execSync(`sudo ip link set dev ${wifiStatus.iface} up`,
                       {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
     }
     catch(err) { };
     await aux.sleep(200).then(() => {
       doWifiConnect(network); //wait for a while and then take a chance
     });
   }
   else if (scanned.search(ssid) === -1) {
//D: There might be SSID's, but not the one enclosed in the 'network' parameter
    console.log(aux.timeStamp(),"network: no ssid found .....................");
    //preform a second scan attempt
     scanned = await wifiScanner(false, ssid); //false means to scan two times
     console.log(aux.timeStamp(),"network: .................new scan was done.");
     //console.log(aux.timeStamp(),"network: new scan, result:", scanned);
     //check the new 'scanned' string for the wanted ssid
     if (scanned.search(ssid) === -1) {
         //most likely ssid not found = failure - abort connection attempt
         //this also catches when scanning cannot be done (errors)
         //...try to connect here? - something is wrong!
         await signal.emit("wifi-ssid-failed");
       }
       else {
      //success after all: ssid eventually found by scanning - connect!!!
         //console.log(aux.timeStamp(),"network: ssid found - try to connect.........");
         signal.emit("wifi-ssid-found");
         doWifiConnect(network); //try to connect
       };
    }
    else {
//E: this cannot happen, but at least it tries to connect
    //console.log(aux.timeStamp(),"network: [default in switch] do connect.........");
       doWifiConnect(network);
     };
 };
  /**wifi - helper function to wifiConnect() above. Which means that the user
   * has selected the 'ssid' and now it is time to see if it is there.
   * This function scans for a specifi8v wi-fi network (ssid).
   * iwlist is depricated; it used to return the string below:
   * Returns a string: 'ESSID:"BELL503x" n/ ESSID:"BELL503" n/
   *                    ESSID:"BELL503x5" n/ ESSID:"BELL503" '  Note the 'ESSID'
   * Use: 'sudo iw dev wlan1 scan ssid "<ssid name>" | grep SSID:'
   * Returns a string: 'SSID: BELL503x n/ SSID: BELL503 n/
   *                    SSID: BELL503x5 n/ SSID: BELL503 '
   * The function 'wifiScan()' above scans for all ssid's, they are not the same
   * That function returns a list of ssids to frontend in an array.
   * @param  {boolean} threeTimes, true = three scans otherwise only two scans
   * @param  {string}  ssid, name of wi-fi network
   * @global {wifiStatus} iface:
   * @return {string}     a string of ssid's with n/ for each
   */
async function wifiScanner(threeTimes, ssid) {
  let scanned = "";
  let iface = wifiStatus.iface;
  //step 1: just in case... set iface to state DOWN and UP again, as a reset
  try {
    execSync(`sudo ip link set dev ${iface} down`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
    //console.log(aux.timeStamp(), "network: iface reset:", iface );
  }
  catch(err) {
  console.log(aux.timeStamp(), "network: reset iface  => DOWN error", err );
  return "";
  };
  try {
    execSync(`sudo ip link set dev ${iface} up`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
    //console.log(aux.timeStamp(), "network: iface up:", iface );
  }
  catch(err) {
  console.log(aux.timeStamp(), "network: reset iface  => UP error", err );
  return "";
  };
  // step 2: scan...
  if (threeTimes === true) {
    try { //three consecutive speedy scans
      scanned = execSync(`sudo iw dev ${iface} scan ssid "${ssid}" | grep SSID:`,
                          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 30000});
      scanned = `${scanned}  ${execSync(`sudo iw dev ${iface} scan ssid "${ssid}" | grep SSID:`,
                          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 30000}) }`;
      scanned = `${scanned}  ${execSync(`sudo iw dev ${iface} scan ssid "${ssid}" | grep SSID:`,
                          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 30000}) }`;
    }
    catch (err) { //most likely scanning did not work; iface down?...
      // If scanned contains this it is bad; "wlan1     No scan results"   or
      //"wlan0  Interface doesn't support scanning."  <- this is caught above
      console.log(aux.timeStamp(), "network: wifi scan error", err );
      return "";
    };
  }
  else {
    try { //two scans with some waiting between and longer timeouts
      console.log(aux.timeStamp(), "network:  start scanning procedure -");
      scanned = execSync(`sudo iw dev ${iface} scan ssid "${ssid}" | grep SSID:`,
                          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 60000});
                          console.log(aux.timeStamp(), "network:  ...scan one");
      signal.emit("wifi-wpa_cli");
      await aux.sleep(100).then(async() => {
        scanned = `${scanned}  ${execSync(`sudo iw dev ${iface} scan ssid "${ssid}" | grep SSID: `,
                          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 60000}) }`;
                        });
                          console.log(aux.timeStamp(), "network:  ...scan two");
    }
    catch (err) { //most likely scanning did not work; iface down?...
      console.log(aux.timeStamp(), "network: wifi scan error scan", err );
      return "";
    };
  };
  return aux.mpdMsgTrim(scanned);  //trim away blanks at the beginning
};



/**Do Wifi Connect - Called by machine to connect to a wireless wifi network.
* Called by wifiConnect() and is the main function for connecting
 * Supports WEP and WPS (open), but not WEP!
 * Uses the commands for wpi_cli to manage wpa_supplicant and its conf file.
 * step 1. call: wpa_cli -i<iface> add_network       # returns <id>
 * step 2. call: wpa_cli set_network <id> ssid '"<ssid>"'
 * step 3a. call: wpa_cli set_network <id> psk '"<password>"'  WPA
 * step 3b. call: wpa_cli set_network <id> key_mgmt NONE       WPS - open...
 * step 4. call: wpa_cli enable_network <id>          # <id> from step 1
 * step 5. call: wpa_cli -i<iface> save_config
 * The result will be a connection attempt to the network given as a parameter.
 * The machine will not be connected yet at this point. Check with ip adr
 * command to confirm the ip address of the wifi - checked 64 times at 2 seconds
 * intervals. Notify machine after step 5 and when ip address is returned.
 * {ssid: ssid string, password: password string}
 * @param  {object} network, ssid + password
 * @param  {string} bssid, wanted bssid, the 2.4 GHz one [Optional]
 * @global {wifiStatus} network, iface, ip
 * @return {?}      of no interest
 */
function doWifiConnect(network, bssid) {
  let cliResult = false;
  let iface = wifiStatus.iface;
  let networkId = false;
  // logger.log(aux.timeStamp(),"wifi: starting connection attempt-----------------------");
  //First part - attempt to make a wifi connection
  try { //step 1: add network and get an id
    cliResult = execSync(`sudo wpa_cli -i${iface} add_network`,
    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 8000});
    networkId = aux.mpdMsgTrim(cliResult) * 1;
    wifiStatus.id = networkId;
  }
  catch (err) {
    signal.emit("wifi-ERROR", {error: "cannot add Wi-Fi network"});
  };

  //console.log(aux.timeStamp(), "network: wpa_cli network string", cliResult);
  if (Number.isInteger(networkId) === true)  {
    //The bssid part==================================
    //var bssid5GHz = "44:e9:dd:50:25:73"   //503 5 GHz -- for testing purposes
    //  cliResult = execSync(`sudo wpa_cli bssid ${networkId} ${bssid5GHz}`,
    // NOTE: works only for wlan0!!!!!!!!!!!!!!!!!!!!
    //-----------------------------------------------
    try {
      cliResult = execSync(`sudo wpa_cli bssid ${networkId} }`,
      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 8000});
        }
    catch (err) {
      signal.emit("wifi-ERROR", {error: "setting SSID failed"});
      resetWPAerror(networkId);
      cliResult = false;
    };
    //console.log(aux.timeStamp(), "network: wpa_cli set bssid", cliResult);
    /*try {
      cliResult = execSync(`sudo wpa_cli list_network`,
      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
      console.log(aux.timeStamp(), "network: wpa_cli FIRST network list: --\n", cliResult);
    }
    catch (err) {
      cliResult = false;
    };*/
    //End of the bssid part ==========================
    try { //step 2: set ssid
      cliResult = execSync(`sudo wpa_cli set_network ${networkId} ssid '"${network.ssid}"'`,
      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 8000});
      //HAVE TO CHECK THE RESULTING STRING - "FAIL" is not good
        }
    catch (err) {
      signal.emit("wifi-ERROR", {error: "setting SSID failed"});
      resetWPAerror(networkId);
      cliResult = false;
    };
    //signal.emit("wifi-wpa_cli");
    //console.log(aux.timeStamp(), "network: wpa_cli set_network ssid", cliResult);
    if (cliResult !== false)  {
      if (network.password) {
        try { //step 3: set password
          cliResult = execSync(`sudo wpa_cli set_network ${networkId} psk '"${network.password}"'`,
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 8000});
        }
        catch (err) {
          signal.emit("wifi-ERROR", {error: "setting password failed"});
          resetWPAerror(networkId);
          cliResult = false;
        };
      //console.log(aux.timeStamp(), "network: wpa_cli set_network psk", cliResult);
      /*try {
        cliResult = execSync(`sudo wpa_cli list_network`,
        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
        console.log(aux.timeStamp(), "network: wpa_cli SECOND network list: ==\n", cliResult);
      }
      catch (err) {
        cliResult = false;
      };*/
      }
      else {
        try { //step 3: no password required - open wifi network
          cliResult = execSync(`sudo wpa_cli set_network ${networkId} key_mgmt NONE`,
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 8000});
        }
        catch (err) {
          signal.emit("wifi-ERROR", {error: "ignoring password failed"});
          resetWPAerror(networkId);
          cliResult = false;
        };
      };
      if (cliResult !== false) {
        try {//step 4: enable, i.e. try to establish connection
          cliResult = execSync(`sudo wpa_cli -i${iface} enable_network ${networkId}`,
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
        }
        catch (err) {
          signal.emit("wifi-ERROR", {error: "Wi-Fi connection attempt failed"});
          resetWPAerror(networkId);
          cliResult = false;
        };
        console.log(aux.timeStamp(), "network: wpa_cli enable_network:", cliResult);
        if (cliResult !== false) {
          try { //step 5: save the config for ssid and password
            cliResult = execSync(`sudo wpa_cli -i${iface} save_config`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
          }
          catch (err) {
            signal.emit("wifi-ERROR", {error: "Wi-Fi configuration file error"});
            resetWPAerror(networkId);
            cliResult = false;
          };
          //console.log(aux.timeStamp(), "network: wpa_cli save_config:", cliResult);
          if (cliResult !== false) {
            // logger.log(aux.timeStamp(),"wifi: connect sequences fired, waiting...");
    //Second part - confirm connection with wifi ip address
            let attempts = 64; //on average address shows up after 6 - 8 polls
            let addressString = ""; //initial value
            let timer = setInterval(function() {
              if (attempts > 0) {
                if ((attempts === 54) || (attempts === 48) || (attempts === 16)) {
                  signal.emit("wifi-wpa_cli");
                  console.log(aux.timeStamp(), "network: ...still checking IP-address, #", attempts);
                  if (attempts === 54) {
                    try {
                      cliResult = execSync(`sudo wpa_cli list_network`,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
                      console.log(aux.timeStamp(), "network: wpa_cli THIRD network list **\n", cliResult);
                    }
                    catch (err) {

                    };
                  };
                };
                if (attempts === 32) {
                  signal.emit("wifi-still-connecting");
                };
                addressString = aux.mpdMsgTrim(readWifiIpAddress(1000));
                if (addressString === "") {
                  attempts = attempts - 1;
                }
                else if (addressString.length > 1) {
                  //FINALLY: send confirmation of wifi connection to machine
                  signal.emit("wifi-connected", {ip: addressString});
                  wifiStatus.ip = addressString;
                  // logger.log(aux.timeStamp(),"wifi: after", (64 - attempts - 1), "polls, got wifi ip:",addressString,"-------\n");
                  attempts = 0;
                  clearInterval(timer);
                };
              }
              else {
                signal.emit("wifi-connection-failed");
                console.log(aux.timeStamp(),"wifi: no wifi IP address - no connection -------------------\n");
                resetWPAerror(networkId);
                clearInterval(timer);
              };
            },
              1000);
          };
        };
      };
    };
  };
};

/**Wifi - Helper function that executes the actual disconnect and cleans up
 * Uses two commands for wpi_cli to remove network set up and change the config
 * file wpa_supplicant.conf so that there will be a clear disconnect and
 * no reconnect. It is used by wifiDisconnetc() and if an error has occured.
 * during wifiConnect() call. It also cleans up networks not in use (step 3)
 * If called by wifiDisconnect() in an explicit error state it tries to clean up.
 * @params {string}         networkid, wpa_supplicant network id
 * @params {boolean}        errorState, used only by disconnectWifi()
 * @Global {wifiStatus}     set .id to false
 * @return {boolean}        true
 */
function resetWPAerror(networkId, errorState) {
  networkId = networkId * 1;
  wifiStatus.id = false;
  if(!errorState) {
    try { //step 1: remove network set up which disconnects machine from wifi
      execSync(`sudo wpa_cli -i ${wifiStatus.iface} remove_network ${networkId}`,
      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    }
    catch (err) {
      console.log(aux.timeStamp(),"wifi: remove_network ERROR", err);
      signal.emit("wifi-ERROR", {error: "reset Wi-Fi failed"});
    };
    try { //step 2: save the new config where any ssid and password are removed
      execSync(`sudo wpa_cli -i ${wifiStatus.iface} save_config`,
      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    }
    catch (err) {
      console.log(aux.timeStamp(),"wifi: save_config ERROR", err);
      signal.emit("wifi-ERROR", {error: "reset Wi-Fi configuration file failed"});
    };
    //step 3: clean up any old networks hanging around in the conf file
    let networksList = "";
    let networkArray = [];
    let arrayLength = 1;
    try { //Expected string returned from wpa_cli:
          //"Selected interface 'wlan0
          // network id / ssid / bssid / flags"     ...when no networks left
      networksList = aux.mpdMsgTrim(
        execSync(`sudo wpa_cli list_networks`,
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000})  );
      networkArray = networksList.split("\n");
      arrayLength = networkArray.length;
    }
    catch (err) {
      console.log(aux.timeStamp(),"wifi: wpa_cli list ERROR", err);
    };
    if (arrayLength > 2) {
      //found other networks - remove them from wpa_supplicant.conf
      for (let i = 2; i < arrayLength; i++) { //note: 1st and 2nd elements skipped
        let networkNum = aux.mpdMsgTrim(networkArray[i]).slice(0, 3); //upp to 999
        try {
          execSync(`sudo wpa_cli remove_network ${networkNum}`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
        }
        catch (err) {
          console.log(aux.timeStamp(),"wifi: remove_network ERROR", err);
        };
      };
      execSync(`sudo wpa_cli -i ${wifiStatus.iface} save_config`,
        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    };
  }
  else { //disconnect is in an error state: try to clean up....
    for(let i = networkId; i < 5;i++) {
      try {
        execSync(`sudo wpa_cli remove_network ${i}`,
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
      }
      catch (err) {
        console.log(aux.timeStamp(),"wifi: CLEAN remove_network ERROR", err);
      };
    };
    execSync(`sudo wpa_cli -i ${wifiStatus.iface} save_config`,
    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
  }
  //step 4: take down the iface
  try {
    execSync(`sudo ip link set dev ${wifiStatus.iface} down`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch(err) {
    console.log(aux.timeStamp(),"wifi: det dev down ERROR", err);
   };
  return true;
};

/** Wifi Disconnect - Machine request disconnect to wifi connection.
 * Reset the wpa_supplicant service so its disconnects by calling resetWPAerror()
 * Check the inet field of ip adr list, when the ip address is "" - it is done!
 * The polling is done by the synchronous function readWifiIpAddress() with a
 * short time out set (1 second).
 * Used by disconnectNetwork() and actually connectWiFi as a special case
 * @param  {boolean}        noRenderFlag, just disconnect, no fuss...
 * @Global {wifiStatus}     read/set new values
 * @return {boolean}        true
 */
async function wifiDisconnect() {
  // console.log(aux.timeStamp(),"wifi:  ...now disconnecting from wifi network...");
  let networkIdString = await readNetworkId(); //ask the network, not using wifiStatus.id
  if (networkIdString.length > 0) {
    await resetWPAerror(networkIdString);
  }
  else {
    await resetWPAerror(0, true); //unknown state of network, taking a chance...
  };
  let attempts = 64; //on average address shows up after 1 - 2 polls
  let addressString = "x"; //initial value cannot be ""
  let timer = setInterval(function() {
    if (attempts > 0) {
      addressString = aux.mpdMsgTrim(readWifiIpAddress(1000)); //polling ip
      if (addressString === "") {
        wifiStatus.ip = "";
        //  console.log(aux.timeStamp(),"wifi: after", (64 - attempts + 1), "polls, wifi disconnected xxxxx");
        signal.emit("wifi-disconnected");
        attempts = 0;
        clearInterval(timer);
      }
      else if (addressString.length > 0) {
        attempts = attempts - 1;
      };
    }
    else {
      wifiStatus.ip = "";
      console.log(aux.timeStamp(),"wifi: no confirmation of disconnect");
      signal.emit("wifi-ERROR", {error: "disconnect failed - unknown state of Wi-Fi"});
      clearInterval(timer);
    };
  },
    1000);
  return true;
};
/**Called at boot of machine - figure out how the wi-fi ifaces are used.
 * There might be two wlan, but sometimes only the onboard wifi.
 * Usually wlan1 is used by wpa_cli, but it might be wlan0 - better check!
 * It is wpa_cli that determines how the ifaces are used. It selects an iface.
 * The other unselected iface is then used for AP (hotspot).
 * Possible cmds:
 * [option] sudo ip -o link | awk '$2 != "lo:" {print $2, $(NF-2)}'
 * resultString is : "eth0: dc:a6:32:c8:3c:21 \n wlan0: dc:a6:32:c8:3c:22 \n
 *                    wlan1: 00:13:ef:71:16:71"    or use
 * [used for now] sudo ip addr show wlan1
 * resultstring is: "4: wlan1: <NO-CARRIER,BROADCAST,MULTICAST,UP,LOWER_UP>..."
 * sudo wpa_cli interface returns Selected interface 'wlan1' \n
 *                                Available interfaces: \n wlan1"
 * @return {string}    the wlan iface for wi-fi used by wpa-cli
 */
function ifaceWifi() {
     let resultString = "";
     try {
       resultString =
        execSync(`sudo ip addr show wlan1 `,
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
        //execSync(`sudo ip -o link | awk '$2 != "lo:" {print $2, $(NF-2)}' `,
        //    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
     }
     catch (err) {
       //Prints to console: 'Device "wlan1" does not exist.'
       console.log(aux.timeStamp(), "network: ip says --> no wlan1 iface!\n", err);
      return "wlan0";
     };
     if (resultString.indexOf(": wlan1: <") !== -1) {
       //A: there are two interfaces for wifi;
       let wpa_cliString = "";
       try {
         wpa_cliString =
          execSync(`sudo wpa_cli interface`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
          //execSync(`sudo ip -o link | awk '$2 != "lo:" {print $2, $(NF-2)}' `,
          //    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
       }
       catch (err) {
        return "wlan0";
       };
       if (wpa_cliString.indexOf("Selected interface 'wlan1'") !== -1) {
         //A1: the wpa_cli selected interface is wlan1
         return "wlan1"
       }
       else if (wpa_cliString.indexOf("Selected interface 'wlan0'") !== -1) {
         //A2: the  wpa_cli selected interface is wlan0
         return "wlan0"
       }
       else {
         return "wlan0" //shouldn't happen, but just in case
       };
      }
      else {
      //B: there is only one interface - wlan0;
        return "wlan0";
      };
    };
/**There might be two ifaces for the wi-fi functionality. This function is
 * built for the case where there might be one or two ifaces.
 * If 'ip addr list' returns a 'wlan1:'-string, then there are two wi-fi interface.
 * names.
 * NOTE: this function is used in machine.js by wifiFrameData() about line 612
 * @return {boolean}    true if there is a wlan1, otherwise false
 */
 function isWlan1() {
   let resultString = "";
   try {
     resultString =
     execSync(`sudo ip addr list | grep wlan1:`,
       {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
   }
   catch (err) {
     //console.log(aux.timeStamp(), "network: ip says --> no wlan1!");
     return false;
   };
   if (resultString !== "") {
     return true
   }
   else {
     return false;
   };
 };

//..............................................................................
//General: basic low level network detection for lan and wifi
//cat /sys/class/net/<iface>/carrier               "1"    means cable, "0" not.
//cat /sys/class/net/<iface>/operstate             "up", "unknown" and...
//   <iface> = et0 | wlan0                         "down" means not powered up.
//..............................................................................
//Documentation of wifi findings:
//killall wpa_supplicant
//wpa_supplicant -B -c/etc/wpa_supplicant/wpa_supplicant.conf -iwlan0 -Dnl80211,wext
//wpa_cli -i wlan0 status
//'nl80211', 'wext' are drivers
// update_config=1 in conf file enables wpa_cli to save changes.
//Some useful commands of wpa client:
/*
--- connect
sudo wpa_cli -i wlan0 add_network
0
sudo wpa_cli set_network 0 ssid '"BELL503"'
Selected interface 'wlan0'
OK
sudo wpa_cli set_network 0 psk '"F42543AF"'
Selected interface 'wlan0'
OK
sudo wpa_cli enable_network 0
Selected interface 'wlan0'
OK
sudo wpa_cli -i wlan0 save_config
OK
sudo hostname -I
192.168.2.137 192.168.2.147
--- file config empty
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
p2p_disabled=1
country=CA
--- find out ip address
get wifi ip address: (works for inet6 as well, and for eth0)
 ip addr list wlan0 |grep "inet " | cut -d' ' -f6 | cut -d/ -f1
--- disconnect
sudo wpa_cli remove_network 0
Selected interface 'wlan0'
OK
sudo wpa_cli -i wlan0 save_config
OK
sudo hostname -I
192.168.2.137
--- required for 5GHz wifi network
var countryCodes5GHz = ['AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ',
'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG',
'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW',
'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO',
'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM',
'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM',
'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR',
'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE',
'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY',
'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA',
'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP',
'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE',
'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF',
'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE',
'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ',
'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC',
'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR',
'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE',
'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW']
--- typical status message when Connected to a wifi network, length 13
Selected interface 'wlan0'
bssid=44:e9:dd:50:25:72
freq=2412
ssid=BELL503                          [3]
id=0                                  [4]
mode=station
pairwise_cipher=CCMP
group_cipher=CCMP
key_mgmt=WPA2-PSK
wpa_state=COMPLETED
ip_address=192.168.2.147              [10]
address=dc:a6:32:1d:db:51
uuid=2088c067-9afe-52eb-a584-d4f4cf0c576b

--- typical status message when machine is a wifi hotspot, length 5
Selected interface 'wlan0'
wpa_state=INACTIVE
ip_address=10.0.0.10                  [2]
address=dc:a6:32:1d:db:51
uuid=2088c067-9afe-52eb-a584-d4f4cf0c576b

--- typical status message when no wifi service in use, length 3
wpa_state=DISCONNECTED
address=dc:a6:32:1d:db:51
uuid=2088c067-9afe-52eb-a584-d4f4cf0c576b

--- typical status message when connected to ??? what is this?, length 4
wpa_state=SCANNING                   [0]
ip_address=169.254.143.166           [1]
address=dc:a6:32:1d:db:51
uuid=2088c067-9afe-52eb-a584-d4f4cf0c576b
Note: this is an auto IP in the 169.254.xxx.xx range, it is a bad IP

--- connecting to other kinds of wifi networks:
wep wi-fi network...
i)  connect to wep:   sudo iwconfig wlan0 essid ":ESSID" key :PASSWORD,
ii) connect to wep:   using wpa-supplicant.conf, add:
network={
  ssid=":ESSID"
  key_mgmt=NONE
  wep_key=0123456789abcdef0123456789        #Note:unqouted = hexadecimal password
}
iii) sudo wpa_cli set_network 0 wep_key0 "key"

open wi-fi network...
i)  connect to open:  sudo iwconfig wlan0 essid ":ESSID"
ii) connect to open:  using wpa-supplicant.conf, add:
network={
    ssid=":ESSID"
    key_mgmt=NONE
}
iii) If the SSID does not have password authentication, one must explicitly configure
the network as keyless by:
sudo set_network 0 key_mgmt NONE   --- not sudo set_network 0 psk "passphrase"

--- find a wifi network
Scan all wifi-networks around:
1)
sudo iwlist wlan0 scan -- results in a massive format...
2)
sudo wpa_cli scan
sudo wpa_cli scan_results
---results in this format:
44:e9:dd:50:25:73       5220    -39     [WPA2-PSK-CCMP][WPS][ESS]       BELL503
44:e9:dd:50:25:72       2462    -28     [WPA2-PSK-CCMP][WPS][ESS]       BELL503
00:26:5a:c4:b6:17       2462    -30     [WPA-PSK-CCMP+TKIP][WPA2-PSK-CCMP+TKIP][WPS][ESS]       Bell 305

--- more on disconnect, there might be more than one network!!!
Note: there might be more than one network added, which is not really good.
sudo wpa_cli list_networks
"Selected interface 'wlan0'
network id / ssid / bssid / flags
1       dlink   any
2       BELL503 any     [CURRENT]"

In this case an old wi-fi is still there, dlink.


-- scanning procedures
sudo iwlist wlan0 scan | grep ESSID:
                    ESSID:"BELL211"
                    ESSID:"BELL503"
                    ESSID:"BELL503"
                    ESSID:"Tara "
                    ESSID:"DIRECT-C0-HP OfficeJet 4650"
                    ESSID:"OnyxDove"
                    ESSID:"BELL123"
Note that scanning has to be done at least twice in order to get as many wifi
networks as possible.

sudo cat /etc/wpa_supplicant/wpa_supplicant.conf | grep ssid=
        ssid="BELL503"
*/
//.............................................................................
//Documentation of Bluetooth findings,
/*
sudo hcitool dev     -- when bluetooth is up, (otherwise just " Devices:")
Devices:
        hci0    DC:A6:32:1D:DB:52

-- get mac address of bluetooth
hciconfig -a | grep BD | cut -d' ' -f3

Below deals with bluetooth streaming - not network...
-- btdevice and bt-adapter
bt-device -l
Added devices:
Galaxy S7 (34:14:5F:48:32:F8)

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

sudo bt-device -i 34:14:5F:48:32:F8 | grep Connected
Connected: 1

sudo bt-device -l | grep "("
Galaxy S7 (34:14:5F:48:32:F8)

sudo bt-adapter -l
Available adapters:
Player (DC:A6:32:00:32:B2)

-- bluetoothctl is not only interactive...
sudo echo "show" | bluetoothctl
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

Maybe a more correct way ...
sudo echo -e "connect FC:8F:90:21:12:0C \nquit" | bluetoothctl
-e	enable interpretation of for example the following backslash escapes:
    \n	new line
    \r	carriage return

*/
//.............................................................................
//Documentation of Hotspot findings
/*
--- create hotspot command sequence, with sudo...
systemctl unmask hostapd
ip link set dev wlan0 down
ip a add 10.0.0.10/24 brd + dev wlan0
ip link set dev wlan0 up
dhcpcd -k wlan0 > /dev/null 2>&1
systemctl start dnsmasq
systemctl start hostapd

--- shut down hotspot command, with sudo...
ip link set dev wlan0 down
systemctl stop hostapd
systemctl stop dnsmasq
systemctl mask hostapd
ip addr flush dev wlan0
ip link set dev wlan0 up
dhcpcd  -n wlan0 > /dev/null 2>&1

--- check if ip is set for wireless service
wpa_cli -i wlan0 status | grep 'ip_address'

-- show all connected devices to hotspot (two options)
sudo iw wlan0 station dump
ip neigh show dev wlan0



*/
