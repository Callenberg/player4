//Copyright 2022 by Retro Audiophile Designs, all rights reserved.
////GNU General Public License v3.0 see license.txt            [Source code]
//         ~ auxiliary functions to machine - backend of RAD Player ~

const fs = require('fs');                           //for reading files
//const os = require('os');                           //for getting system data
const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synched Raspbian cmds
const btsp = require('/player/lib/machine-audiosink.js'); //for unmuting of amp

module.exports.soundBootPreparation = soundBootPreparation;
module.exports.startupSound = startupSound;

module.exports.mpdParseLsinfo = mpdParseLsinfo;
module.exports.mpdMsgTrim = mpdMsgTrim;
module.exports.stringCleaner = stringCleaner;

module.exports.patchUpTitle = patchUpTitle;
module.exports.patchUpArtistOrAlbum = patchUpArtistOrAlbum;

module.exports.shuffleFisherYates = shuffleFisherYates;
module.exports.areArraysEqual = areArraysEqual;
module.exports.findElementInArray = findElementInArray;

module.exports.readStartVolume = readStartVolume;
module.exports.writeStartVolume = writeStartVolume;

module.exports.timeStamp = timeStamp;
module.exports.timeMilliseconds = timeMilliseconds;
module.exports.formattedTime = formattedTime;
module.exports.secondsToTimeString = secondsToTimeString;
module.exports.dateStamp = dateStamp;

module.exports.sleep = sleep;
module.exports.getServicePid = getServicePid;

//module.exports.renderMachineStatus = renderMachineStatus;
module.exports.connectedBluetoothDevices = connectedBluetoothDevices;

/**BOOT - reset sound, used before boot. Unmute amp and set volume to maximum.
 * Note: this is only unmutes and resets to maximum volume since during boot
 * the start up volume will be read and set by mpd.startMPDSettings() where
 * aux.readStartVolume() does the actually reading of the file (see below).
 * @return {integer}          volume in %
 */
async function soundBootPreparation() {
   // set volume to max of alsa
  try {
    exec('sudo amixer -qc 0 set Digital 100%',
      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //console.log(timeStamp(),"aux: [amixer set to 100% as boot volume]");
  }
  catch (e) {
    console.log(timeStamp(), "aux: [volume reset ERROR at boot prep]\n", e);
  };
  return 100
};

/**BOOT - generate a sound, used after boot, it is the start-up sound...
 * @param  {integer}                 volume current volume in %
 * @return {?}                       of no interest
 */
function startupSound(volume) {
  let amixerMsg = "";
  //console.log(timeStamp(), "aux: [startup sound - volume:", volume, "]");
  if (volume < 41) {
    try {   //sourced from https://freesound.org/people/plasterbrain/sounds/273159/
      exec('sudo aplay -q /player/audio/startup.wav',
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    }      //credited: plasterbrain - "Podcast Jingle" licensed under the Creative Commons 0 License
    catch (e) {
      console.log(timeStamp(), "aux: [silence]\n", e);
    };
  }
  else if (volume < 71) {
    try {  //sourced from https://freesound.org/people/sandib/sounds/476135/
      exec('sudo aplay -q /player/audio/startuphighvol.wav ',
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    }     //credited sandib - "c minor piano 4" licensed under the Creative Commons 0 License
    catch (e) {
      console.log(timeStamp(),"aux: [silence]\n", e);
    };
  }
  else {
    //If the volume is over 80% - it is "full volume" and the start-up sound level has to be lowered
    //console.log("[try to play a lower sound]", volume,"%");
    try {
      execSync('sudo  mpc volume 35',
        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
      //console.log(timeStamp(), "aux: [mpc 35% temp. volume]");
    }
    catch (e) {
      console.log(timeStamp(),"aux: [volume lowered...]\n", e);
    };
    try {
      //sourced from https://freesound.org/people/newagesoup/sounds/339343/
      execSync('sudo /usr/bin/aplay -q -c2 -Ddefault /player/audio/startupfullvol.wav ',
        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    }     //credited newagesoup - "soft-blip-E Major" licensed under the Creative Commons Attribution License ver. 3.0;
        //(see document /player/license creative commons attribution.txt)
    catch (e) {
      console.log(timeStamp(),"aux: [silence]\n", e);
    };
    try { //bring the volume level back again...
      execSync(`sudo mpc volume ${volume} `,
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
      //console.log(timeStamp(),"aux: [mpc reset volume] =", volume);
    }
    catch (e) {
      console.log(timeStamp(),"aux: [volume back]\n", e);
    };
  };
};
//mpd parsing ======================================================= mpd parser
//------------------------------------------------------------------- the packer
/**MPD - parses the ls info string from mpd into a Machine object to be
 * rendered as a USB-list on the USB page, packing relevant data only, not all.
 * The format mpd delivers is first all track data (i.e. key is file:) and then
 * the directories, key is directory: some values are not packed for folders
 * since they are not used. Parent directory and current directory is added and
 * labelled key parent: and folder: (mpd uses capital letters, sometimes)
 * Format: (note this is the only time mpd is used to collect metadata)
 * { type: string, path: uri, Title:string, duration: string, Artist:string,
 *   Album:string }    ,besides type: all data is used by Playlist as well
 * @param  {mpd string}    string mpd status formatted string
 * @param  {mpd URI}       atFolder mpd uri string that was called
 * @return {object}        USB-list, and eventually used for Playlist
 */
function mpdParseLsinfo(string, atFolder) {
  let usbArray = [];
  let fileArray= [];
  let directoryArray = [{type: 'parent', path: getPathOnly(atFolder), Title:getNameOnly(atFolder)}];
  if (typeof string === 'string')  {
    let stringArray = string.split("\n"); //split mpd string at line breaks
    let arrayLength = stringArray.length;
    let fileIndexArray = [];      //store the file: index here
    let directoryIndexArray = []; //store the directory: file index here
    //FIRST STEP:  run trough to find file: and/or directory:
    for (let i = 0; i < arrayLength; i++) {
      let subString = stringArray[i];
      if (subString.indexOf("file:") === 0) {
        fileIndexArray.push(i);
      };
      if (subString.indexOf("directory:") === 0) {
        directoryIndexArray.push(i);
      };//save only index for keys file: or directory:
    }; //figure out where file data ends and directory data starts
    let lastFiledataIndex = 0;
    let fileIndexNumbers = fileIndexArray.length;
    let directoryIndexNumbers = directoryIndexArray.length;
    if (fileIndexNumbers > 0) {
      if (directoryIndexNumbers > 0) {
        lastFiledataIndex = directoryIndexArray[0] - 1;
      }
      else {
        lastFiledataIndex = arrayLength - 1;
      };
    }; //SECOND STEP: file: parsing begins.......
    for (let i = 0; i < fileIndexNumbers; i++) {
        let fileData = {};
        let fileIndex = fileIndexArray[i];
        let endOfFileData = (i < (fileIndexNumbers - 1)) ? (fileIndexArray[i+1]) : lastFiledataIndex + 1;
        var j; //build object{} properties for each value pair of interest
        for (j = fileIndex; j < endOfFileData; j++) {
          let valueString = stringArray[j];
          if(valueString.length > 2) {
            let valuePair = valueString.split(":");
            let key = valuePair[0]
            if (key === "file") {
              fileData['type'] = "file"; //first type the object{} to file
              fileData['path'] = mpdMsgTrim(valuePair[1]);//rename file: - path:
            } //maybe skip duration here???? - capital letters comes from mpd!!
            else if ((key === "duration") | (key === "Artist") | (key === "Album") | (key === "Title")) {
              fileData[key] = mpdMsgTrim(valuePair[1]); //pack the rest
            } else {/*key of no interest -> no action . . .*/}
          };
        };//add the complete file object{} to the array of file information
        fileArray.push(fileData);
    }; //end of file: parsing....................
    //THIRD STEP: directory: parsing begins......
    for (let l = 0; l < directoryIndexNumbers; l++) {
      let directoryData = {};
      let directoryIndex = directoryIndexArray[l];
      let valueString = stringArray[directoryIndex];
      if (valueString.length > 2) {
        let valuePair = valueString.split(":");
        if ((atFolder === "usb") && (mpdMsgTrim(valuePair[1]) === 'usb/System Volume Information')) {
          //no action here
        }
        else {
          directoryData['type'] = "folder"; //first type the object{}
          directoryData['path'] = mpdMsgTrim(valuePair[1]);
          directoryData['Title'] = getNameOnly(valuePair[1]);
          directoryArray.push(directoryData);
        };
      };
    };//end of directory: parsing................
  };//at last, concatenate the directory and file arrays into one array. Done!
  usbArray.push(...directoryArray,...fileArray);
  return usbArray;
};

/**AUX - parser utility; removes whitespace from both sides of a string
 * (since string.trim() doesn't seem to work in node.js)
 * @param  {string}                 string string to be trimmed
 * @return {string}                 trimmed string
 */
function mpdMsgTrim(string) {
  return string.replace(/^\s+|\s+$/gm,'');
};
/**AUX - parser utility; removes whitespace from both sides of a string
 * (since string.trim() doesn't seem to work in node.js)
 * Incoming: '"BELL367"'
 * @param  {string}                 string string to be trimmed
 * @return {string}                 trimmed string
 */
function stringCleaner(string) {
  return string.replace(/^\s+|\s+$/gm,'"');
};

/**AUX - parser utility; removes the file name in an uri-path
 * @param  {string}                 string string to be trimmed
 * @return {string}                 trimmed string
 */
function getPathOnly(uri) {
  if (uri === "usb") {
    return "usb";
  }
  else {
    let pathIndex = uri.lastIndexOf("/")
    let onlyUri = uri.slice(0, pathIndex);
    return onlyUri;
  };
};
/**AUX - parser utility; removes the file path and returns the name of folder
 * @param  {string}                 string string to be trimmed
 * @return {string}                 trimmed string
 */
function getNameOnly(uri) {
  if (uri === "usb") {
    return "Top folder";
  }
  else {
    let pathIndex = uri.lastIndexOf("/")
    let onlyUri = uri.slice((pathIndex + 1), uri.length);
    return onlyUri;
  };
};
//.................................................................... patch ups
/**AUX - parser utility; fixes undefined metadata, undefined title -> file name
 * @param  {string}                 title string to be checked and fixed
 * @param  {string}                 path uri for track, i.e. file name
 * @return {string}                 title or title string based on file name
 */
 //Use: path.basename(notes, path.extname(notes)) //returns file name only
function patchUpTitle(title, path) {
  if ((title == undefined) || (title == null)) {
    let pathIndex = path.lastIndexOf("/")
    let stopIndex = (path.lastIndexOf(".") > - 1) ?
      (path.lastIndexOf(".")) :
      (path.length);
    return path.slice((pathIndex + 1), (stopIndex));
  } else return title;
};
/**AUX - parser utility; fixes undefined metadata, undefined is replace by "---"
 * @param  {string}                 metadata string to be checked and fixed
 * @return {string}                 metadata or "---"
 */
function patchUpArtistOrAlbum(metadata) {
  if (metadata == undefined || (metadata == null)) {
    return "---";
  } else return metadata;
};

//................................................................. Fisher-Yates
/**The Fisher–Yates shuffle algorithm for generating a random permutation
 * of a finite sequence. E.g. randomly shuffles an array.
 * The shuffled array can be the same as the input array, check with  function
 * aux.areArraysEqual() to make sure that the array has been shuffled, see below
 * @param  {array}      array The array to shuffle
 * @return {array}      shuffled array
 */
function shuffleFisherYates(array) {
	let currentIndex = array.length;
	var temporaryValue, randomIndex;
	while (0 !== currentIndex) { // While there remain elements to shuffle...
		//...pick a remaining element...
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex -= 1; // and below swap it with the current element.
		temporaryValue = array[currentIndex];
		array[currentIndex] = array[randomIndex];
		array[randomIndex] = temporaryValue;
	};//Done!
	return array;
};

/**AUX - shuffle helper - returns false as soon two arrays are unequal
 * @param  {array} array1 primary array, shuffled
 * @param  {array} array2 ordered array to compare with
 * @return {boolean}      true if all elements are equal and in the same order
 */
function areArraysEqual(array1, array2) {
   let array1Length = array1.length;
   let compared = true;
   for (let i = 0; i < array1Length; i++) {
     compared = (array1[i] === array2[i]);
       if (compared === false) {
         return false;
         break;
       };
     };
     return compared;
};
/**AUX - array.indexOf(element) substitute for simple integer arrays
 * @param  {integer}     element a value which is an integer
 * @param  {array}       array one dimensional array with integers as values
 * @return {integer}     array index of array or -1 if not found
 */
function findElementInArray(element, array) {
  let arrayLength = array.length;
  for(let index = 0; index < arrayLength; index++) {
    if (array[index] === element ) {
      return index;
      break;
    };
  };
  return -1;
};
/**Volume - read start up value for volume from file /player/data/volume_setting
 * @return{integer}      volume %
 */
function readStartVolume() {
  let volume = 25;
  let startVolString = "";
  try { //Confirm that start up volume file is in place...
    execSync(`sudo touch  /player/data/volume_setting`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch (err) {
    console.log("aux: [Volume start up error]\n", err);
  };
  try { //...and just to be sure - set the right permissions
    execSync(`sudo chmod 0777 /player/data/volume_setting`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch (err) {
    console.log("aux: [Volume start up error]\n", err);
  };
  try {
    startVolString = mpdMsgTrim(fs.readFileSync('/player/data/volume_setting', 'utf8'));
  }
  catch (err) {
    console.log("aux: [Volume start up error]\n", err);
  };
  if (startVolString != "") {
    let numVol = startVolString * 1;
    if ((typeof(numVol) === "number") && (numVol > -1) && (numVol < 101)) {
      volume = numVol;
    };
  };
  return volume;    //returns 25% volume if error
};
/**Machine - sets new value for volume in the file /player/data/volume_setting
 * @param {integer}       volume, volume in percent
 * @return{integer}       volume %
 */
function writeStartVolume(volume) {
  try { //Confirm that start up volume file is in place...
    execSync(`sudo touch  /player/data/volume_setting`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch (err) {
    console.log("aux: [Volume write error]\n", err);
  };
  try { //...and just to be sure - set the right permissions
    execSync(`sudo chmod 0777 /player/data/volume_setting`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch (err) {
    console.log("aux: [Volume write error]\n", err);
  };
  try {
    execSync(`sudo echo ${volume} > /player/data/volume_setting`,
      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch (err) {
    console.log("aux: [Volume write error]\n", err);
  };
  return volume;
};

//...................................................................... logging
/**AUX - Logging purposes - time stamp hrs:min:sec:msec on format 00:00:00:000
 * @return {string}         time stamp string
 */
function timeStamp() {
  const d = new Date();
  return`${`0${d.getHours()}`.slice(-2)}:${`0${d.getMinutes()}`.slice(-2)}:${`0${d.getSeconds()}`.slice(-2)}:${`00${d.getMilliseconds()}`.slice(-3)}`;
};

/**AUX - Logging purposes - time stamp msec on format 000000000
 * @return {integer}           time in milliseconds
 */
function timeMilliseconds() {
  const d = new Date();
  return d.getTime();
};

/**AUX - Logging purposes - time on format hrs:min:sec:msec 00:00:00:000
 * @param {integer}         time, in msec
 * @return {string}         time on a redable format
 */
function formattedTime(time) {
  const d = new Date(time);
  let timeString = `${time}`;
  if (timeString.length < 7) {
    return`${`0${d.getMinutes()}`.slice(-2)}:${`0${d.getSeconds()}`.slice(-2)}:${`00${d.getMilliseconds()}`.slice(-3)}`;
  }
  else {
    return`${`0${d.getHours()}`.slice(-2)}:${`0${d.getMinutes()}`.slice(-2)}:${`0${d.getSeconds()}`.slice(-2)}:${`00${d.getMilliseconds()}`.slice(-3)}`;
  };
};
/**AUX - Converting purposes - time on format hrs:min:sec:msec 00:00:00:000
 * @param {integer}         time, in seconds
 * @return {string}         time on a redable format
 */
function secondsToTimeString(seconds) {
    let minutes = 0, hours = 0;
    if (seconds / 60 > 0) {
        minutes = parseInt(seconds / 60, 10);
        seconds = seconds % 60;
    }
    if (minutes / 60 > 0) {
        hours = parseInt(minutes / 60, 10);
        minutes = minutes % 60;
    }
    return ('0' + hours).slice(-2) + ':' + ('0' + minutes).slice(-2) + ':' + ('0' + seconds).slice(-2);
};

/**AUX - Logging purposes - date stamp year-month-day on format 0000-00-00
 * @return {string}         full date stamp + time 00:00:00
 */
function dateStamp() {
  const d = new Date();
  //return `${d.getFullYear()}-${`0${d.getMonth() + 1}`.slice(-2)}-${`0${d.getDate()}`.slice(-2)}`;
  return d.toLocaleString("sv-SE");
};
//...................................................................... sleeper
/**AUX - util, stop for a while...
 * Use: sleep(ms).then(() => {  ...code here... });
 * @param {integer}            ms time in msec
 * @return {?}                 ...of no value
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};
/*Alternatively an async sleep:
async function sleepX(ms) {
    await new Promise(r => setTimeout(() => r(), ms));
    return;
}*/
//........................................................................ pider
/**AUX - util, finds the main pid of a systemd service
 * Otherwise use 'sudo ps aux | fgrep <process name>'
 * This is the line:  'Main PID: 504 (bluetoothd)'  ...example bluetooth service
 * @param {string}           service systemd service name
 * @return {string}          process id
 */
function getServicePid(service) {
  let pid = "";
  try {
    pid =
     mpdMsgTrim(
      execSync(`sudo systemctl status ${service} | fgrep "Main PID:" | cut -d' ' -f6 `,
             {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 2000}));
  }
  catch(err) {
  };
  return pid;
};

/**Bluetooth streaming - return the actual connection status of bluetooth devices.
 * ConnectionStatus array format:
 * [ {name: "phone", mac: "34:14:5F:48:32:F8"}... ]
 * Used by renderMachineStatus() above, but also by machine-network.js
 * The same code is used internally in machine-bluetooth.js
 * @return {array}     connection objects as defined  above
 */
function connectedBluetoothDevices(){
  //Get all the devices' BDs and check if they are connected
  //[note: code sequence is the same found in blue.setupBluetoothctl() ]
  let bluetoothData = [];
  let pairedDevicesString = "";
  try {
    pairedDevicesString =
      execSync(`sudo bt-device -l `,
                    {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
  }
  catch (err) {
    pairedDevicesString = "";
  };
  //any paired devices is now gathered in a string... lets check it out!
  if (pairedDevicesString !== "") {
    let pairedArray = pairedDevicesString.split("\n"); //split string at line breaks
    let numberOfDevices = pairedArray.length - 1;
    for(let i = 1; i < numberOfDevices; i++) {
      //pairedArray string is on format: 'Galaxy S7 (34:14:5F:48:32:F8)'
      //BD is "(34:14:5F:48:32:F8)", 19 chars long from end, hence -19 below
      let deviceBD = pairedArray[i].slice(-19).slice(1, 18);
      //connected or not? --> sudo bt-device -i 34:14:5F:48:32:F8 | grep Connected
      let infoString = "";
      try {
        infoString =
          execSync(`sudo bt-device -i ${deviceBD} | grep Connected`,
                        {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 5000});
      }
      catch (err) {
        infoString = "";
      };// Example of returned string: "Connected: 0"
      if (infoString !== "") { //slice out the part after the : [i.e. index + 1]
        let isConnected = mpdMsgTrim(infoString.slice(infoString.indexOf(":") + 1));
        if (isConnected === "1") { //index - 20 means slice out before " "
          bluetoothData.push({name: pairedArray[i].slice(0, (pairedArray[i].length - 20)),
                              mac: deviceBD});
        };
      };
    }; // --- ends the for loop
  };   // --- ends bluetooth on - check connected or not sequence
  return bluetoothData;
};
