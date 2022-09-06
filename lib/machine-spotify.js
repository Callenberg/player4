//Copyright 2022 by Retro Audiophile Designs, all rights reserved.
//GNU General Public License v3.0 see license.txt            [Source code]
//             ~ spotify handler for backend ~
const aux = require('./machine-auxiliary.js');
const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synced Raspbian cmds
const events = require('events');                   //for creating events
const signal = new events.EventEmitter();

module.exports.raspotifyBootPreparations = raspotifyBootPreparations;
module.exports.raspotifyAtBoot = raspotifyAtBoot;
module.exports.raspotifyRestart = raspotifyRestart;
module.exports.signal = signal;

//Global Variable
//var watcher = false;    //for node-watcher

/**Called by machine at boot - start librespot, start polling Spotify status
 * Checks if librespot is up and running, if so Spotify Connect services is on.
 * Originally Raspotify was used Raspbian wrapper, until version 3.211E
 * Also res.startUpAllStreaming() uses this to start up service again.
 * @return {boolean}      true if succesful
 */
async function raspotifyAtBoot() {
  let pid = "";
  try {
    execSync('sudo systemctl start librespot',
      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
  }
  catch (err) {
    //console.log(aux.timeStamp(),"Spotify: librespot start ERROR\n", err)
  };
  pid = await aux.getServicePid("librespot");
  if (pid !== "") {
    //Good to go; librespot is up - no action here
    //console.log(aux.timeStamp(),"spot: system service started for librespot ----- #", pid);
    return true;
  }
  else {
    await aux.sleep(1000).then(() => {
      try {
        exec('sudo systemctl start librespot',
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
          return true
      }
      catch (err) {
        //consolelog(aux.timeStamp(),"spot: ERROR couldn't start librespot\n", err);
        return false;
      };
  });
  }
};

/** Stop watching the file /var/log/streamsensor.log for changes in states.
 * Used when Spotify is reset by user, not at boot time.
 * @return {?}        of no interest
 */                                          //NO NEED handle by machine-loop.js
async function stopPollingSpotify() {
  //await loop.stopPollingAll();
};

//............................................................ Boot Preparations
/**Called by machine BEFORE boot - stops librespot
 * Also used by res.stopSpotify when user wants to stop streaming. Then the
 * parameter 'sendSignalToo' is true.
 * @param  {boolean}      sendSignalToo, if true a spotify-stop is also emitted
 * @return {boolean}      of no interest
 */
function raspotifyBootPreparations(sendSignalToo) {
  if (sendSignalToo === true) {
    signal.emit('spotify-stop');
  };
  try {   //Stop Spotify Connect during the boot phase
    execSync(`sudo systemctl stop librespot`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
  }
  catch (err) {
    console.log(aux.timeStamp(),"Spotify: librespot stop ERROR\n", err);
  };
};
//............................................................... restart for bt
/**Restarts Spotify when the output is change to bt speaker or to amplifier
 * Called by 'res.restartLibrespot()' - 'exec' instead of 'execSync'?
 * @return {boolean}      of no interest
 */
function raspotifyRestart() {
  try {
     execSync(`sudo systemctl restart librespot`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
          }
  catch (err) {
    console.log(aux.timeStamp(),"Spotify: RESTART librespot ERROR\n", err);
  };
  return true;
};
