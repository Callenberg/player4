//Copyright 2022 by Retro Audiophile Designs, all rights reserved.
//GNU General Public License v3.0 see license.txt            [Source code]
//              ~ usb handler for backend playback ~

const aux = require('./machine-auxiliary.js');
//const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synched Raspbian cmds
//const fs = require('fs');                           //for reading files
const events = require('events');                   //for creating events
const signal = new events.EventEmitter();
const usbDetect = require('usb-detection');         //to manage the USB

module.exports.signal = signal;
module.exports.usbBootPreparations = usbBootPreparations;
module.exports.usbPulledOut = usbPulledOut;
module.exports.usbFindUUID = usbFindUUID

//This is how it looks when a USB stick is used for the software system:
//First comes the boot partion and then the rest:
///dev/sda1: LABEL_FATBOOT="boot" LABEL="boot" UUID="4BBD-D3E7" TYPE="vfat" PARTUUID="738a4d67-01"
///dev/sda2: LABEL="rootfs" UUID="45e99191-771b-4e12-a526-0779148892cb" TYPE="ext4" PARTUUID="738a4d67-02"

//if a sd card is used use any "sd*" as pattern else "sda" is already in use
let UUID_PATTERN = false;   //false means sd card in use for OS

/**At boot determine if usb or sd card is used for the software system.
 * Determines the UUID pattern to look for whehn identifying attached user usb
 * @global {UUID_PATTERN}         ;sets the global variable
 * @return {string/boolean}       false if a sd card is used otherwise "sda"
 */
function setUUIDPattern() {
  let outcome = "";
  try {
    outcome =
      execSync(`sudo mount | grep mmc`,
              {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  }
  catch (err) {
    outcome = "";
  };
  if (outcome !== "") {
    UUID_PATTERN = false; //there is a mmc device mounted (sd card)
    return true;
  }
  else {
    UUID_PATTERN = "sda";//there is an USB instead
    return false;
  };
};
//avoid:  mount: /mnt/usb: /dev/sda1 already mounted on /boot.
//========================================================================= boot
/**BOOT - if a user USB is attached at boot, mount the usb here with UUID found.
* Rescan of mpd db and render will happen in machine-playback.js
 * @signal  {playback}    emits the new UUID to machine
 * @return  {?}          of no interest
 */
async function usbBootPreparations() {
  try {       //an USB might already be mounted - has to be unmounted
    execSync(`sudo umount -f /mnt/usb`,
              {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  }
  catch (err) { //often this error occurs - no problem, just ignore the OS error
  };
  await setUUIDPattern(); //check were the OS is, sd or usb?
  let uuidString =  await usbFindUUID();
  if (uuidString !== false) {
      try {
        execSync(`sudo mount -o noatime UUID=${uuidString}  /mnt/usb`,
                 {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
      }
      catch (err) {   //discard error here - it is okay
        //console.log(aux.timeStamp(),"usb: mount ERROR at boot for usb\n", err);
      };
    signal.emit("set-usbID", uuidString);
  };
  //........................................................... start monitoring
  usbDetect.startMonitoring();
  console.log(aux.timeStamp(),"usb: started to monitor USB ports 4 x []");

  //listeners.................................................. set-up listeners
  //detect returns the following device object:
  //{ locationId: integer, vendorId: integer,    productId: integer,
  //  deviceName: string,  manufacturer: string, serialNumber: string,
  //  deviceAddress: integer }
  //USB attached event............................................. USB attached
  usbDetect.on('add', function(device) {
    //console.log(aux.timeStamp(),'usb: usb inserted  <<<<--------------------------');
    usbAttached(device);
  });
  //USB pulled out event......................................... USB pulled out
  usbDetect.on('remove', function(device) {
    //console.log(aux.timeStamp(),'usb: detected usb stick removed ---------------------->>>>');
    signal.emit("usb-removed");
  });
};
//=================================================================== boot ended
/**An USB has been attached, mount the usb to /mnt/usb(/, ask for rescan mpd db
 * and render. The snag here is that the there is a long waiting time because
 * of linux execution of udev commands, waiting is set to at least 2000 msec!
 * @param   {object}     device, USB device data from usbDetect, no need here...
 * @signal  {playback}   emits the new UUID and root path to machine
 * @signal  {playback}   emits a request to update mpd
 * @return  {?}          of no interest
 */
 async function usbAttached(device = false) {
  aux.sleep(2000).then(async () => {
    //There is a need to wait a number of seconds in order for udev to do its job,
    //this will not halt other executions - just this one. (no 'await' here)
    //console.log(aux.timeStamp(),"Machine: UUID sleep is over . . . .");
    let outcome = false;
    let uuidString = await usbFindUUID();
    //console.log(aux.timeStamp(),"Machine: UUID string is", uuidString);
    //if the UUID is false -> no action here
    if (uuidString != false) {
      signal.emit("usb-inserted");                    //notify user
      signal.emit("set-usbID", uuidString);           //update machine
      signal.emit("set-usbPATH", "get root for usb"); //update machine
      try {
        execSync(`sudo mount -o noatime UUID=${uuidString}  /mnt/usb`,
                  {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
        //console.log(aux.timeStamp(),"Machine: USB is mounted =", uuidString);
        outcome = true;
      }
      catch (err) {
      signal.emit("usb-mountERROR"); //sets machine.usb to false
      outcome = false;  //if not mounted the result is false
      };
      if (outcome === true) {      //success with mounting USB stick with UUID
        signal.emit("scan-USB");   //new USB mounted -> rescan music db in mpd
      };
    }
    else {
      console.log(aux.timeStamp(),"Machine: NO mount because UUID was", uuidString);
    };
  });
};
/**The Player USB has been pulled out, need to unmount the usb, rescan mpd db,
 * stop playing. This is directly called by playback when the Player
 * was using the attached USB (used by mpd). Caught in the 'usb-remove' event.
 * @event {playback}    "usb-cleanout" to machine-playback.js
 * @return  {boolean}    true
 */
function usbPulledOut() {
  try {
      execSync(`sudo umount -f /mnt/usb`,
        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
      signal.emit("usb-cleanout");
    }
  catch (err) {
      signal.emit("usb-mountERROR");
    };
    return true;
};
/**AUX - return the UUID of the usb that is attached by user
 * Calls 'sudo blkid -s UUID' to get the uuid labels for file storage devices.
 * example:  /dev/mmcblk0p1: UUID="5203-DB74" /dev/mmcblk0p2: UUID="2ab3f8e1
 *; /dev/sda1: UUID="44D7-2AD9" - the last one is an usb, mmc are SD card
 * partitions. Which means that "sd*" is crucial for the search of an USB!
 * If a SD card is used the pattern is "sd", if an USB is used to hold the
 * the system software then "sd*" that is not "sda" since it is taken, has to
 * be used. Ex: /dev/sdc1: UUID="44D7-2AD9"
 * Note that the USB might not be mounted yet . . .
 * Note also that this function will find only the first USB inserted by user.
 * @global {UUID_PATTERN}     ; false or "sda", if SD card or USB stick is used
 * @return {string/boolean}     UUID or false when there is no inserted user usb
 */
function usbFindUUID() {
  let uuidString = "";
  try {
    uuidString = execSync('sudo blkid -s UUID | grep sd',
      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
  }
  catch (err) {
    //if error be sure to set signal machine to nollify USB data
    signal.emit("set-usbID", false);
    signal.emit("set-usbPATH", "get root for usb");
    console.log(aux.timeStamp(), "Machine: USB error when doing blkid for UUIDs");
  };
  if (uuidString !== "") {
    let stringArray = uuidString.split("\n"); //split string at line breaks
    let arrayLength = stringArray.length;
//1. the file system is on a sd card,look for any sd*
    if (UUID_PATTERN === false) {
      for (var i = 0; i < arrayLength; i++) {
        let subArray = stringArray[i].split(":"); //split substring at :
        if (subArray[0].indexOf("sd") > -1) {
          let uuidStartIndex = subArray[1].indexOf("="); //find "=" to get uuid
          if (uuidStartIndex > -1) {
            let uuid = subArray[1].slice(uuidStartIndex + 1);
            return uuid;
            break;
          };
        };
      };
    }
    else {
//2. the file system is on a USB, 'sda' is in use, look for another sd*
      if (arrayLength > 2) {
        for (var i = 2; i < arrayLength; i++) {
          let subArray = stringArray[i].split(":"); //split substring at :
          if (subArray[0].indexOf("sd") > -1) {
            let uuidStartIndex = subArray[1].indexOf("="); //find "=" to get uuid
            if (uuidStartIndex > -1) {
              let uuid = subArray[1].slice(uuidStartIndex + 1);
              return uuid;
              break;
            };
          };
        };
      };
    };
  };
  return false; //no USB could be found . . .
};
