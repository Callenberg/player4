//Copyright 2022 by Retro Audiophile Designs, all rights reserved.
////GNU General Public License v3.0 see license.txt            [Source code]
//             ~ airplay listener for backend ~
const aux = require('./machine-auxiliary.js');
const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synced Raspbian cmds
const events = require('events');                   //for creating events
const signal = new events.EventEmitter();

module.exports.shairportBootPreparations = shairportBootPreparations;
module.exports.shairportsyncAtBoot = shairportsyncAtBoot;
module.exports.restartShairportSync = restartShairportSync;

module.exports.signal = signal;

/**Called by machine at boot - start shairport-sync, start polling status
 * Check if shairport-sync is up and running, if so Airplay services is on.
 * Pre boot conditions:  (in order to have a stable start status)
 * @return {boolean}      of no interest
 */
async function shairportsyncAtBoot() {
  try {
    execSync('sudo systemctl start shairport-sync',
      {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
    //logger.log(aux.timeStamp(),"Airplay: system service started for shairport-sync ----- *");
  }
  catch (err) {
    console.log(aux.timeStamp(),"Airplay: ERROR couldn't start shairport-sync\n", err);
  };
  let pid = await aux.getServicePid("shairport-sync");
  if (pid !== "") {
    //Good to go; shairport-sync is up - no action here
    //console.log(aux.timeStamp(),"air: system service started for shairport-sync ----- #", pid);
    return true;
  }
  else {
    //shairport-sync is not running, try again, no sync this time.
    await aux.sleep(1000).then(() => {
      try {
        exec('sudo systemctl start shairport-sync',
             {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
        return true;
      }
      catch (err) {
        //consolelog(aux.timeStamp(),"air: ERROR couldn't start shairport-sync\n", err);
        return false;
      };
    });
  };
};
//............................................................ Boot Preparations
/**Called by machine BEFORE boot - stops shairport-sync.
 * Also used by res.stopAirplay when user wants to stop streaming, then the
 * parameter 'sendSignalToo' is true.
 * Also 'res.stopAllStreaming()' uses this to start up services again.
 * @param  {boolean}      sendSignalToo, if true a airplay-stop is also emitted
 * @return {boolean}      of no interest
 */
function shairportBootPreparations(sendSignalToo) {
  if (sendSignalToo === true) {
    signal.emit('airplay-stop');
    //console.log(aux.timeStamp(),"air: emitted STOP");
  };
  try {   //Stop Airplay services during the boot phase
    execSync(`sudo systemctl stop shairport-sync`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
  }
  catch (err){
    console.log(aux.timeStamp(),"Airplay: STOP shairport-sync ERROR\n", err);
  };
};
//............................................................... restart for bt
/**Restarts Airplay when the output is change to bt speaker or to amplifier
 * Called by 'res.restartShairpoint()'
 * @param  {boolean}      sendSignalToo, if true a spotify-stop is also emitted
 * @return {boolean}      of no interest
 */
function restartShairportSync() {
  try {
     execSync(`sudo systemctl restart shairport-sync`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 15000});
          }
  catch (err) {
    console.log(aux.timeStamp(),"Airplay: RESTART shairport-sync ERROR\n", err);
  };
  return true;
};
