//Copyright 2021 by Retro Audiophile Designs, all rights reserved.
////GNU General Public License v3.0 see license.txt            [Source code]
//   ~ router logger and force router to use 2.4 GHz Wi-Fi for backend ~
const aux = require('./machine-auxiliary.js');
const execSync = require('child_process').execSync; //for synced OS cmds
const fs = require('fs');                           //for reading files

module.exports.routerBootPreparations = routerBootPreparations;
module.exports.routerExecuteLog = routerExecuteLog;
//module.exports.wifiBandBootPreparations = wifiBandBootPreparations;

//Global Variables
//var bssid5GHz = "44:e9:dd:50:25:73"   //503 5 GHz
//var bssid24GHz = "44:e9:dd:50:25:72"  //503 2.4 GHz
let logger = false;
let forcer = false;
let wantedBand = "2"           // 2.4 GHz
//var maxLogFileSize =  17700  // test of erase
let maxLogFileSize =  1058496  // about 1 MB
//var wantedBand = "5"           // 5 GHz

/** Find out if the file /boot/netgear-nighthawk.log exists.
 * If so set the Global Variable 'logger' to true
 * @global {boolean}      logger, if true logging will be done
 * @return {boolean}     true/false
 */
function setLogger() {
  let doesFileExists = 0;
  try {
    doesFileExists =
      execSync('[ -e "/boot/netgear-nighthawk.log" ] && echo 1 || echo 0 ',
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000}) * 1;
    //console.log(aux.timeStamp(),"router: shall logging be? ---:",doesFileExists );
  }
  catch (err) {
    doesFileExists = 0;
    //console.log(aux.timeStamp(),"router: file exists err---\n", err);
  };
  if (doesFileExists === 1) {
    logger = true;
  }
  else {
    logger = false
  };
  return logger;
};
/** Find out if the file /boot/netgear-nighthawk.force exists.
 * If so set the Global Variable 'forcer' to true
 * @global {boolean}      forcer, if true the 2.4 GHz will be forced
 * @return {boolean}     true/false
 */
function setForcer() {
  let doesFileExists = 0;
  try {
    doesFileExists =
      execSync('[ -e "/boot/netgear-nighthawk.force" ] && echo 1 || echo 0 ',
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000}) * 1;
    console.log(aux.timeStamp(),"router: shall 2.4 GHz be forced? ---:",doesFileExists );
  }
  catch (err) {
    doesFileExists = 0;
    //console.log(aux.timeStamp(),"router: file exists err---\n", err);
  };
  if (doesFileExists === 1) {
    forcer = true;    //setting GV to true
  }
  else {
    forcer = false    //setting GV to false
  };
  return forcer;
};
// a getter function for the Global Variable logger           //*** NOT USED
async function getLogger(doReset) {
  if (doReset === true) {
    await setLogger();
  }
  return logger
};
// a getter function for the Global Variable forcer           //*** NOT USED
async function getForcer(doReset) {
  if (doReset === true) {
    await setForcer();
  }
  return forcer;
};
// a getter function for the Global Variable bssid           //*** NOT USED
async function getForcedBssid(doReset) {
  if (doReset === true) {
    await setBssid();
  }
  return bssid;
};
/**Use to erase a log file if it is too big.
 * Maximum 1 MB is allowed for a log file - GV "maxLogFileSize"
 * CLI = 'sudo stat -c '%s' <filename>'
 * @param {string}      file, file name of log file, this param is not in use
 * @global {integer}    maxLogFileSize
 * @return {integer}    actuall file size
 */
function shouldFileBeErased(file) {
  let actualFileSize = 0;
  try {
    actualFileSize = aux.mpdMsgTrim(
     execSync(`sudo stat -c '%s' ${file}`,
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 25000})) * 1;
    //console.log(aux.timeStamp(),"router:  log file size is", actualFileSize);
  }
  catch (err) {
    actualFileSize = -1     //error value
    console.log(aux.timeStamp(),"router: file size error\n", err);
  };
  if (actualFileSize > maxLogFileSize) {
    try {
      execSync(`sudo echo "" >   /player/data/netgear-nighthawk.log`,
              {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
      //console.log(aux.timeStamp(),"router: log file erased");
    }
    catch (err) {
      console.log(aux.timeStamp(),"router: file erase error---, size:", actualFileSize, "\n", err);
    };
    try {
      execSync(`sudo cp /player/data/netgear-nighthawk.log /boot/`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 25000});
      //console.log(aux.timeStamp(),"router: erased log file at boot partition XXXXXXXXXXXXXX");
    }
    catch (err) {
      console.log(aux.timeStamp(),"router: error copying erased file\n", err);
    };
  }
  return actualFileSize;
};
// PART A: logging Part ------------------------------------------------- logger
/**Called by machine at boot - log the status of Wi-Fi at boot
 * Logging will be done if this file does exist:
 *  -- /boot/netgear-nighthawk.log.
 * An internal copy of will be found here: /player/data/netgear-nighthawk.log
 * 2.4 MHz band Wi-Fi should be explicitly enforced
 * @return {?}      of no interest
 */
async function routerBootPreparations() {
  let isLogger = await setLogger(); //isLogger is local but the same as the GV
  isLogger && console.log(aux.timeStamp(),"router: start to build router log------ [wait...]");
  isLogger && routerExecuteLog("boot started");
};
/** Call for log data on a string format, append the result of the log internally
 * and then copy it to the existing log file in the boot partion:
 * this is the retrievable file: /boot/netgear-nighthawk.log
 * The copy of log data is kept in /player/data/netgear-nighthawk.log
 * @param {string}    reason, the event that triggers a log
 * @global {boolean}  logger, if true do a loging of router data
 * @return {?}        of no interest
 */
async function routerExecuteLog(reason) {
  if (logger === true) { //check when called during operations, not boot
    let logString = await routerLogCompile(reason);
    //await routerLogWrite(logString);  //there is an append instead
    await shouldFileBeErased("/boot/netgear-nighthawk.log");
    try {
      execSync(`sudo cat /boot/netgear-nighthawk.log >> /player/data/netgear-nighthawk.log`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 25000});
      //console.log(aux.timeStamp(),"router: copied the old log file...");
    }
    catch (err) {
      //console.log(aux.timeStamp(),"router: error appending file\n", err);
    };
    try {
      execSync(`sudo echo "${logString}" >> /player/data/netgear-nighthawk.log`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 25000});
      //console.log(aux.timeStamp(),"router: appended new log file");
    }
    catch (err) {
      //console.log(aux.timeStamp(),"router: error appending file\n", err);
    };
    try {
      execSync(`sudo cp /player/data/netgear-nighthawk.log /boot/`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 25000});
      //console.log(aux.timeStamp(),"router: copied log file to boot partition");
    }
    catch (err) {
      //console.log(aux.timeStamp(),"router: error copying file\n", err);
    };
    await routerLogWrite(""); //erase the local copy in /player/data/
  };
};

/** Write to the logged data to file /player/data/netgear-nighthawk.log
 * @param {string}      logString logged data about the Wi-Fi connection
 * @return {?}      of no interest
 */
async function routerLogWrite(logString) {
  try {
    fs.writeFileSync('/player/data/netgear-nighthawk.log', logString, 'utf8');
    //console.log(aux.timeStamp(),"router: log written to file");
  }
  catch (err) {
    //console.log(aux.timeStamp(),"router: error reading status file\n", err);
  };
};

/** Compile the log information.
 * @param {string}       reason, the event that triggered the log
 * @return {string}      log data
 */
async function routerLogCompile(reason) {
  let logString = "";
  let dateString = "";
  let logHeaderString = "";
  let uptimeString = "";
  let hostString = "";
  let memString = "";
  let ipString = "";
  let iwDevString = "";
  let iwPhyString = "";
  let wpa_cliStatus = "";
  let iwScanString2 = "";
  let iwScanString5 = "";
  let iwScanSsidString = "";
  let wpaSupplicantString = "";
  let iwScanStringTotal = "";
  let rfkillListString = "";
  let logEndString = ""
  let timeStamp = aux.timeStamp();
  logHeaderString = `Router log at ${timeStamp};  Event: [${reason}] =========\n===============================================================\n`;
  try {
    dateString =
      execSync(`sudo  date`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  } catch (err) {
    dateString = "";
  };
  try {
    uptimeString =
      execSync(`sudo  uptime`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  } catch (err) {
    uptimeString = "";
  };
  try {
    hostString =
      execSync(`sudo  hostname -I`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  } catch (err) {
    hostString = "";
  };
  try {
    memString =
      execSync(`sudo  df -h --total`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  } catch (err) {
    memString = "";
  };
  try {
    ipString =
      execSync('sudo ip a',
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
  //console.log(aux.timeStamp(),"router: ip a");
  }
  catch (err) {
    ipString = "";
    //console.log(aux.timeStamp(),"router: ip a err---\n", err);
  };
  try {
    iwDevString =
      execSync('sudo iw dev',
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //console.log(aux.timeStamp(),"router: iw dev");
  }
  catch (err) {
    iwDevString = "";
    //console.log(aux.timeStamp(),"router: iw dev err---\n", err);
  };
  try {
    iwPhyString =
      execSync('sudo iw phy phy0 channels',
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //console.log(aux.timeStamp(),"router: iwPhy:");
  }
  catch (err) {
    iwPhyString = "";
    //console.log(aux.timeStamp(),"router: iwphy err---\n", err);
  };
  try {
    wpa_cliStatus =
      execSync('sudo wpa_cli status',
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //console.log(aux.timeStamp(),"router: wpa status:");
  }
  catch (err) {
    wpa_cliStatus = "";
    //console.log(aux.timeStamp(),"router: wpa status err---\n", err);
  };
  try {
    iwScanStringTotal =
      execSync('sudo iw wlan0 scan ',
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //console.log(aux.timeStamp(),"router: tot scan");
  }
  catch (err) {
    iwScanStringTotal = "";
    //console.log(aux.timeStamp(),"router: tot scan err---\n", err);
  };
  try {
    iwScanSsidString =
      execSync(`sudo echo "${iwScanStringTotal}" | grep SSID: `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //console.log(aux.timeStamp(),"router: 5 scan:");
  }
  catch (err) {
    iwScanSsidString = "";
    //console.log(aux.timeStamp(),"router: 5 scan err---\n", err);
  };
  try {
    iwScanString5 =
      execSync(`sudo echo "${iwScanStringTotal}" | grep -B3 -A5 "freq: 5" `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //console.log(aux.timeStamp(),"router: 5 scan:");
  }
  catch (err) {
    iwScanString5 = "";
    //console.log(aux.timeStamp(),"router: 5 scan err---\n", err);
  };
  try {
    iwScanString2 =
      execSync(`sudo echo "${iwScanStringTotal}" | grep -B3 -A5 "freq: 2" `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //console.log(aux.timeStamp(),"router: 2 scan");
  }
  catch (err) {
    iwScanString2 = "";
    //console.log(aux.timeStamp(),"router: 2 scan err---\n", err);
  };
  try {
    wpaSupplicantString =
      execSync('sudo cat /etc/wpa_supplicant/wpa_supplicant.conf ',
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //console.log(aux.timeStamp(),"router: wpaSupplicantString");
  }
  catch (err) {
    wpaSupplicantString = "";
    //console.log(aux.timeStamp(),"router: wpaSupplicantString err---\n", err);
  };

  try {
    rfkillListString =
      execSync('sudo rfkill list ',
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //console.log(aux.timeStamp(),"router: rfkill:");
  }
  catch (err) {
    rfkillListString = "";
    //console.log(aux.timeStamp(),"router: rfkill err---\n", err);
  };
  //${iwScanStringTotal}\n  not always in use - too much text
  logEndString = `Router log finished at ${aux.timeStamp()}; the reason was: ${reason}\n=======================================================================  END\n`;
  await aux.sleep(50).then( () => {
    //console.log(aux.timeStamp(),"router: putting together log file.");
    logString =
      `${logHeaderString}${dateString}${uptimeString}${hostString}${timeStamp} disc system -----------------------------------------------------\n
${memString}\n
${timeStamp} iface wlan0 -----------------------------------------------------\n
${ipString}\n
${timeStamp} wpa status ------------------------------------------------------\n
${wpa_cliStatus}\n
${timeStamp} ssid ------------------------------------------------------------\n
${iwScanSsidString}\n
${timeStamp} phy0 ------------------------------------------------------------\n
${iwDevString}\n
${timeStamp} channels --------------------------------------------------------\n
${iwPhyString}\n
${timeStamp} scans ----------------------------------------------------------\n
${iwScanString2}\n${iwScanString5}${wpaSupplicantString}\n
${timeStamp} block list ------------------------------------------\n
${rfkillListString}\n
${logEndString}\n`;
    });
    return logString;
};
//==============================================================================
//PART B: force Player to use 2.4 GHz -- NOT IN USE - FOR FUTURE USE!!!!
/**Called by machine at boot -
 * The Player will force the router to use the 2.4 GHz band for Wi-Fi
 * if the global variable is set to true by setForcer()
 * The 2.4 MHz band Wi-Fi will be explicitly enforced on the bssid by wpa_cli
 * by nwork.doWifiConnect(network, bssid), wheras bssid is set here.
 * @return {?}      of no interest
 */            //NOT IN USE for now...
async function wifiBandBootPreparations() {
  let forcer = await setForcer(); //forcer is local here, but is the same as the GV
  forcer && console.log(aux.timeStamp(),"router: check that Wi-Fi is using the right band ~~~~");
  forcer && await forceRouter();
};

/**Checking that the the Player is connected to the right band
 * If it is the wrong band it will be force the router to use the 2.4 GHz band.
 * It will only be done if this file does exist:
 *  -- /boot/netgear-nighthawk.force
 * This will work for meshed multi-band routers
 * The "wantedBand" (GV) Wi-Fi will be explicitly enforced on the bssid.
 * @globalvariable {string} wantedBand
 * @return         {?}      of no interest
 */           //NOT IN USE for now...
async function forceRouter() {
  let wpa_cliStatus = "";
  let freq = "";
  let ssid = "";
  let id = "";
  //let psk = "";
  try {
    wpa_cliStatus =
      execSync('sudo wpa_cli status',
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //console.log(aux.timeStamp(),"router: wpa_cli status");
  }
  catch (err) {
    wpa_cliStatus = "";
    //console.log(aux.timeStamp(),"router: wpa_cli status err---\n", err);
  };
  try {
    freq =
      execSync(`sudo ${wpa_cliStatus} | grep freq=${wantedBand}  `,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //console.log(aux.timeStamp(),"router: freq");
  }
  catch (err) {
    freq = "";
    //console.log(aux.timeStamp(),"router: freq err---\n", err);
  };
  if (freq === "") { //the player connected to the wrong band
    console.log(aux.timeStamp(),"router: wrong band! ------------");
    try {
      ssid =
        execSync(`sudo echo ${wpa_cliStatus} | grep freq=ssid -d'=' -f2 | tail -1 `,
              {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
      //console.log(aux.timeStamp(),"router: bssid");
    }
    catch (err) {
      ssid = "";
      //console.log(aux.timeStamp(),"router:bssid---\n", err);
    };
    try {
      id =
        execSync(`sudo echo ${wpa_cliStatus} | grep id= - | cut -d'=' -f2 | tail -2 | head -1 `,
              {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
      //console.log(aux.timeStamp(),"router: bssid");
    }
    catch (err) {
      id = "";
      //console.log(aux.timeStamp(),"router:bssid---\n", err);
    };
    await switchBand(ssid, id);       //** NOT DEFINED YET!!!!!!!
  };
};
