//Copyright 2022 by Retro Audiophile Designs, all rights reserved.
//GNU General Public License v3.0 see license.txt            [Source code]
//             ~ upnp/dnla handler for backend ~
const aux = require('./machine-auxiliary.js');
const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synced Raspbian cmds
const events = require('events');                   //for creating events
const signal = new events.EventEmitter();

module.exports.upmpdcliBootPreparations = upmpdcliBootPreparations;
module.exports.upmpdcliAtBoot = upmpdcliAtBoot;
module.exports.restartUpmpdcli = restartUpmpdcli
module.exports.signal = signal;

/**Called by machine at boot - start upmpdcli...
 * upmdpcli = is a UPnP Media Renderer front-end using MPD.
 * Besides boot also used by 'res.stopUpnp()' and 'res.startUpAllStreaming()'
 * uses this to start up UPnP service again.
 * Start call: '/usr/bin/upmpdcli -c /etc/upmpdcli.conf' in systemd
 * PROBLEM: stop and start again of upmpdcli systemctl service takes a long time,
 *          the start command interfers with stop sometimes. Wait . .
 * Using 'execSync()' has also been a problem here due to long startup times...
 * SOLUTION: wait for 30 s, this is normally not a problem.
 * @param {string}    who, "boot" or "<stopUpnp>", "removeSelectiveStreaming"
 *                    and "startUpAllStreaming", affects wait time.
 * @return {boolean}       true if succesful
 */
async function upmpdcliAtBoot(who = "<unknown>...") {
  let longWait = 10000; //at the moment a long wait is required
    if (who === "boot") {
      longWait = longWait / 25;   //400 ms
    };
    aux.sleep(longWait).then(() => {
      try {
        //console.log(aux.timeStamp(),"UPnP: STARTING systemctl now, called by", who);
        exec('sudo systemctl start upmpdcli',
          {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 20000});
        }
      catch (err) {
        console.log(aux.timeStamp(),"UPnP: ERROR couldn't start upmpdcli\n", err);
      };
    });
  return true;
};
//............................................................ Boot Preparations
/**Called by machine BEFORE boot - stops upmpdcli, also by restart functions
* Also used by res.stopUpnp when user wants to stop streaming. Then the
* parameter 'stopStreaming' is true and that means that UPnP has to stop, now!
* Also 'res.stopAllStreaming()' uses this.
* @param  {boolean}      stopStreaming, if true notify machine that upnp stopped
* @return {boolean}      of no interest
*/
async function upmpdcliBootPreparations(stopStreaming) {
  //console.log(aux.timeStamp(),"UPnP: stopStreaming is - - -", stopStreaming);
  if (stopStreaming === true) {
    //console.log(aux.timeStamp(),"UPnP: [signal.emit('upnp-stop')] since", stopStreaming);
    signal.emit('upnp-stop');//this will clean up after upmdcli
  };
  try {   //Stop upmpdcli during the boot phase and when requested
    exec(`sudo systemctl stop upmpdcli`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    //console.log(aux.timeStamp(),"UPnP: upmpdcli [sudo systemctl stop upmpdcli]");
      }
  catch (err){ //ERROR: If error not much to do...
    console.log(aux.timeStamp(),"UPnP: ERROR couldn't stop upmpdcli\n", err);
      };
};
/**Restarts UPnP when the output is change to bt speaker or to amplifier
 * Called by 'res.restartUpmpdcli()' - 'exec' is used instead of 'execSync' here!
 * @return {boolean}      true
 */
async function restartUpmpdcli() {
  try {
    exec(`sudo systemctl restart upmpdcli`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    //console.log(aux.timeStamp(),"UPnP: upmpdcli [sudo systemctl restart upmpdcli]");
      }
  catch (err){ //ERROR: If error not much to do...
    console.log(aux.timeStamp(),"UPnP: ERROR couldn't RESTART upmpdcli\n", err);
      };
  return true;
};
