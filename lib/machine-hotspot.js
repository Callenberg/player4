//Copyright 2022 by Retro Audiophile Designs, all rights reserved.
////GNU General Public License v3.0 see license.txt            [Source code]
//               ~ Wi-Fi Access Point management ~

const aux = require('./machine-auxiliary.js');       //all the utils
const nwork = require('./machine-network.js');      //network & bluetooth mngt
//const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synced Raspbian cmds
//const fs = require('fs');                           //for reading files
const events = require('events');                   //for creating events
const signal = new events.EventEmitter();

//module.exports.hotspotBootPreparations = hotspotBootPreparations;
module.exports.setWlanInterface = setWlanInterface;
module.exports.readWlanInterface = readWlanInterface;
module.exports.startHotspot = startHotspot;
module.exports.stopHotspot = stopHotspot;
module.exports.isHotspotOn = isHotspotOn;
module.exports.readHotspotIp = readHotspotIp;
module.exports.updateHotspotConf = updateHotspotConf;

module.exports.signal = signal;

//Global Variables for Wi-Fi Access Point
//it will be "wlan0" for now
//the wi-fi connection part is handled in nwork.wifiBootPreparations();
var apStatus = {
  iface: "wlan0",
  hotspotIp: "10.0.0.10"
};
//helper function to set GV apStatus, called from nwork.wifiBootPreparations()
function setWlanInterface(ifaceSlot) {
  //console.log(aux.timeStamp(), "hotspot: iface for AP is set to", ifaceSlot );
  apStatus.iface = ifaceSlot;
};
//helper function to read GV apStatus, called from nwork.wifiBootPreparations()
function readWlanInterface() {
  return apStatus.iface;
};

/**hotspot - starts the local machine hotspot AP on 10.0.0.10
 * The service is started if there is no wifi network connected...
 * Note: previous connection to a wifi network has to be disconnected before
 * this function is called, other wise dnsmasq will fail. (only for one iface)
 * Called by: networkBootPreparations() and  shouldHotspotStart() - machine
 * @global {apStatus} .iface and .hotspotIp are read
 * @return {object}    {hotspot: true, ip: "10.0.0.10"}, if successful
 */
async function startHotspot() {
  let errorFlag = false;
  let iface = apStatus.iface;
  await nwork.clearHotspotIface(iface); //to be sure that wpa_cli is not there
  //console.log(aux.timeStamp(), "hotspot: starting up hotspot on iface:", iface);
  try {
    execSync(`sudo systemctl unmask hostapd`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch(err) {
    errorFlag = true;
  };
  try {
    execSync(`sudo ip link set dev ${iface} down`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch(err) {
    errorFlag = true;
  };
  try {
    execSync(`sudo ip a add ${apStatus.hotspotIp}/24 brd + dev ${iface}`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch(err) {
    errorFlag = true;
  };
  try {
    execSync(`sudo ip link set dev ${iface} up`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch(err) {
    errorFlag = true;
  };
  try {
    execSync(`sudo dhcpcd -k ${iface} > /dev/null 2>&1`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch(err) {
    errorFlag = true;
  };
  try {
    execSync(`sudo systemctl start dnsmasq`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch(err) {
    errorFlag = true;
  };
  try {
    execSync(`sudo systemctl start hostapd`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch(err) {
    errorFlag = true;
  };
  //wait for a bit to make sure that the hotspot is up or not
  //console.log(aux.timeStamp(), "hotspot: now checking iface...");
  await aux.sleep(50).then(async() => {
    if (await isHotspotOn() === false) { //this confirms hotspot up/down
      errorFlag = false;
    };
  });
  //console.log(aux.timeStamp(), "hotspot: is iface up?", !errorFlag);
  if (errorFlag === false) {
      return {hotspot: true, ip: apStatus.hotspotIp};
    }
    else {
      signal.emit("hotspot-ERROR", {error: "startup failed - unknown state of hotspot"});
      await stopHotspot();
      return {hotspot: false, ip: apStatus.hotspotIp};
    };
};
/**hotspot - stops the local machine hotspot AP on 10.0.0.10
 * The dhcpcd will also start the wpa_supplicant and the machine will connect
 * to previous wifi network, or just wifi client service.
 * Used by disconnectNetwork() and connectWiFi() both at machine.
 * @global {apStatus} .iface and .hotspotIp are read
 * @return {boolean}    error occured (false) or success (true)
 */
async function stopHotspot() {
  let errorFlag = false;
  let iface = apStatus.iface;
  console.log(aux.timeStamp(), "hotspot: turn off hotspot on iface:", iface);
  try {
    execSync(`sudo ip link set dev ${iface} down`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch(err) {
    errorFlag = true;
  };
  try {
    execSync(`sudo systemctl stop hostapd`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch(err) {
    errorFlag = true;
  };
  try {
    execSync(`sudo systemctl stop dnsmasq`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch(err) {
    errorFlag = true;
  };
  try {
    execSync(`sudo ip addr flush dev ${iface}`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch(err) {
    errorFlag = true;
  };
  if (await nwork.isWlan1() === false) {
    try {
      execSync(`sudo ip link set dev ${iface} up`,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
    }
    catch(err) {
      errorFlag = true;
    };
    try {
      execSync(`sudo dhcpcd -n ${iface} > /dev/null 2>&1`,
                      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
    }
    catch(err) {
      errorFlag = true;
    };
  };
  errorFlag && signal.emit("hotspot-ERROR", {error: "shutting down failed - unknown state of hotspot"});
  return !errorFlag;
};

/**Hotspot - check if hotspot is up and running. I.e. check if 10.0.0.10 is there.
 * Used at start of hotspot, strict boolean.
 * Option: `sudo ip addr list wlan0 |grep "inet " | cut -d' ' -f6 | cut -d/ -f1`
 * Used by machine in networkBootPreparations(), connectWiFi() and shouldHotspotStart()
 * @global {apStatus} .hotspotIp is read
 * @return {boolean}   up -> true, otherwise false
 */
function isHotspotOn() {
  let activeIp = "";
  try {
    //activeIp = aux.mpdMsgTrim(execSync(`sudo ip addr list ${apStatus.iface} |grep "inet " | cut -d' ' -f6 | cut -d/ -f1`,
    activeIp = aux.mpdMsgTrim(execSync(`sudo ip addr list ${apStatus.iface} | grep ${apStatus.hotspotIp} `,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000}));
  }
  catch(err) {
    // logger.log(aux.timeStamp(),"hotspot: cannot check if hotspot is on\n", err);
    return false;
  };
  if (activeIp !== "") {
    return true;
  }
  else {
    return false;
  };
};
/**Hotspot - check if hotspot is up and running. I.e. check if 10.0.0.10 is there.
 * Used at network updates and returns a full hotspot object that can eventually
 * be rendered. Used by networkBootPreparations() at machine. NOTE wlan0 only!
 * @global {apStatus} .hotspotIp is read
 * @return {object}   {hotspot:-, ip: "10.0.0.10"}
 */
function readHotspotIp() {
  let activeIp = "";
  //activeIp = aux.mpdMsgTrim(execSync(`sudo ip addr list ${apStatus.iface} |grep "inet " | cut -d' ' -f6 | cut -d/ -f1`
  //activeIp = execSync(`sudo ip addr list ${apStatus.iface} | grep ${apStatus.hotspotIp}`,
  try {
    activeIp = aux.mpdMsgTrim(execSync(`sudo ip addr list ${apStatus.iface} |grep "inet " | cut -d' ' -f6 | cut -d/ -f1`,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000}));
  }
  catch(err) {
    signal.emit("hotspot-ERROR", {error: "cannot read ip address - unknown state of hotspot"});
  };
  activeIp = aux.mpdMsgTrim(activeIp);
  if (activeIp === apStatus.hotspotIp) {
    return {hotspot: true, ip: apStatus.hotspotIp};
  }
  else {
    return {hotspot: false, ip: apStatus.hotspotIp};
  };
};
//OBSOLETE for now, keep it...
 /** Copies the right configuration files for hostapd and dnsmasq depending
  * on the wlan iface.     NOT NEEDED ANYMORE...
  * Doesn't work: 'sudo cp -f /player/data/wifi/dnsmasq_wlan1.conf /etc/dnsmasq.con'
  * Doesn't work: 'sudo chmod 0777 /etc/dnsmasq.conf' -- but really not needed
  * NOTE: sudo systemctl daemon-reload is probably need + restart of services!!!
  * @param  {string}    iface 'wlan0' or 'wlan1'
  * @return {?}         of no interest
  */
 function updateHotspotConf(iface) {
   console.log(aux.timeStamp(),"hot: updating conf files for iface:", iface);
   let allGood = false;
   // - - -   wlan0 - - -
   if (iface === "wlan0") {
     //A: dnsmasq part for wlan0
     try {
       execSync(`sudo cp -f ./data/wifi/dnsmasq_wlan0.conf /etc/dnsmasq.conf`,
                       {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
       allGood = true;
       console.log(aux.timeStamp(),"hot: updating dnsmasq conf DONE  + +");
     }
     catch (err){ //file system error of some sort... try again
       //exec(`sudo rm -f /etc/dnsmasq.conf`, {uid: 1000, gid: 1000});
       console.log(aux.timeStamp(),"hot: error /n", err);
       allGood = false;
     };
     //B: hostapd for wlan0
     try {
       execSync(`sudo cp -f ./data/wifi/hostapd_wlan0.conf /etc/hostapd/hostapd.conf`,
                       {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
       allGood = true;
       console.log(aux.timeStamp(),"hot: updating hostapd conf file DONE + +");
     }
     catch (err){ //file system error of some sort... try again
       //exec(`sudo rm -f /etc/hostapd.conf`, {uid: 1000, gid: 1000});
       console.log(aux.timeStamp(),"hot: error /n", err);
       allGood = false;
     };
   }
   // - - -  wlan1 - - -
   else {
     //C: dnsmasq for wlan1
     try {
       execSync(`sudo cp -f ./data/wifi/dnsmasq_wlan1.conf /etc/dnsmasq.conf`,
                       {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
       console.log(aux.timeStamp(),"hot: updated dnsmasq conf file with wlan1");
       allGood = true;
     }
     catch (err) { //file system error of some sort... try again
       //exec(`sudo rm -f /etc/dnsmasq.conf`, {uid: 1000, gid: 1000});
       console.log(aux.timeStamp(),"hot: error /n", err);
       allGood = false;
     };
     //D: hostapd for wlan1
     try {
       execSync(`sudo cp -f ./data/wifi/hostapd_wlan1.conf /etc/hostapd/hostapd.conf`,
                       {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
       console.log(aux.timeStamp(),"hot: updated hostapd conf file with wlan1");
       allGood = true;
     }
     catch (err){ //file system error of some sort... try again
       //exec(`sudo rm -f /etc/hostapd.conf`, {uid: 1000, gid: 1000});
        console.log(aux.timeStamp(),"hot: error /n", err);
       allGood = false;
     };
   };
   if (allGood === false) {
     signal.emit("hotspot-ERROR", {error: "config files failed - unknown state of hotspot"});
   };
 };
