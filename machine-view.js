//Copyright 2022 by Retro Audiophile Designs
//GNU General Public License v3.0 see license.txt            [Source code]
//                      ~ view of player ~
const aux =   require('/player/lib/machine-auxiliary.js'); //auxiliary functions
const mod =   require('/player/machine-model.js');
const play =  require('./lib/machine-playback.js');
const btsp =  require('./lib/machine-audiosink.js');
const ctl =   require('/player/machine.js');
const nwork = require('./lib/machine-network.js');
const stat = require('./lib/machine-state.js');
const loop = require('/player/lib/machine-loop.js');
const res = require('./lib/machine-restart.js');

module.exports.viewAtBoot = viewAtBoot;

module.exports.bluetoothFrameData = bluetoothFrameData;
module.exports.wifiFrameData = wifiFrameData;
module.exports.settingsFrameData = settingsFrameData;
module.exports.startPageFrameData = startPageFrameData;

module.exports.stateHeaderFrameData=stateHeaderFrameData;
module.exports.stateBtFrameData = stateBtFrameData;
module.exports.stateNworkFrameData = stateNworkFrameData;
module.exports.stateSysFrameData = stateSysFrameData;
module.exports.stateStreamFrameData = stateStreamFrameData;
module.exports.stateUsbFrameData = stateUsbFrameData;

module.exports.machineFrameData = machineFrameData;
module.exports.machineBtFrameData = machineBtFrameData;
module.exports.btConnFrameData = btConnFrameData;
module.exports.connFrameData = connFrameData;

module.exports.setupFrontEndProtocol = setupFrontEndProtocol;

//[V] VIEW definition ===================================== packers for frontend
//Packing frame data for frontend render functions------------------------------
//The frontend is a state-based UI - states defines the rendering. Each page has
//a function that creates a data frame based on the state of the machine.
//  [In file '/player/lib/machine-playback.js':]
//  A. Playback page   - trackFrameData()       -- parsed in playerplayback.js
//  B. Playlist page   - playlistFrameData()    -- parsed in playerplaylist.js
//  C. USB-list page   - usblistFrameData()     -- parsed in playerusb.js
//  [In file '/player/lib/machine.js':] + volume on A. page
//  D. Bluetooth page  - bluetoothFrameData()   -- parsed in playerbluetooth.js
//  E. Wi-Fi pages     - wifiFramedata()        -- parsed in playerwifi.js
//  F. Settings page   - settingsFrameData()    -- parsed in playersettings.js
//  a.1 Start page      - startPageFrameData()  -- parsed in player.js
//  a.2 State page      - stateFrameData()      -- parsed in playerstate.js
/* NOTE: A. Playback page, B. Playlist page and C. USB-list page are all
   managed in '/player/lib/machine-playback.js' (since Dec 2021)              */

//[M] MODEL definition ================================ imported from machine.js
let machine;          //will hold the machine object for Player
//let stream;         //is this needed? No, it can be removed    *NOT IN USE
let restart;          //blocker during events that takes time

//Global variable
let io;  //holder for socket.io server object, is set below

function viewAtBoot(m, r, i) {
  machine = m;          //require the machine object
  restart = r;          //require the restart object
  io = i;               //require socket.io server object
};
//==============================================================================
//............................................................... Bluetooth page
/**D. Bluetooth page - create an object with bluetooth content needed in order
 * to render a correct frame on the Bluetooth page.
 * The data structure is an ordered array - this order is important:
 * [0] {bluetooth:false, mac:""} --> or the array will look like:
 * [0] {bluetooth:true, mac:"DC:A6:32:00:32:B2"}  NOTE: must be replaced with btctl!!!!
 * [1] {devices: [{name:"phone", mac:"34:14:5F:48:32:F8"}, connected: false...] },
 * [2] {speakers: [{name:"bt spkr", mac:"FC:58:FA:ED:57:60",connected: true}, ...] }
 * [3] {isConnected: false}, or {isConnected: true}; if there is a spkr connected
 * @global {machine}     reading property values, and setting in some cases
 * @return {array}       array of data for Bluetooth page frame
 */
async function bluetoothFrameData() {
  let statusArray = [];
  let bluetoothState = machine.bluetooth;
  if (bluetoothState.bluetooth === false) {
     statusArray = [{bluetooth: false, mac: ""},
                    {devices: [] },
                    {speakers: [] },
                    {isConnected: false}];
   }
   else { //compare with btConnFrameData() below; here the stored value is used
     let isThereSpkr = false;
     if (machine.connectedSinks.length > 0) { //connectedSinks is an array
       isThereSpkr = true;
     };
     await ctl.clearUnknownDevices(); //remove unknown devices from machine.bluetooth.devices
     statusArray = [ {bluetooth: true, mac: bluetoothState.mac},
                     {devices: machine.bluetooth.devices},
                     {speakers: machine.bluetoothSpeakers.speakers},
                     {isConnected: isThereSpkr }];
   };
   //console.log(aux.timeStamp(), "machine: array for Bt page", statusArray);
   return statusArray;
 };
 /**E. Wi-Fi page - create an object with settings content needed in order
  * to render a correct frame on the Wi-Fi page
  * The data structure is an ordered array - this order is important:
  * [0] {wifi:false, ip:""} - {wifi:true, ip:"192.168.2.147", ssid:"BELL503"}
  *     {wifi:true, ip:"192.168.2.147", ssid:"BELL503", connecting: true/false}
  * [1] {hotspot:false, ip:"10.0.0.10", ifaces: true/false} -
  *     {hotspot:true, ip:"10.0.0.10", ifaces: true/false}
  * [2] {lan:false, ip:""} - {lan:true, ip:"192.168.2.136"}
  * @global {machine}     reading property values
  * @return {array}       array of data for Wi-Fi page frame
  */
 async function wifiFrameData(who) {
  //console.log(aux.timeStamp(),"machine: construct wifiFrameData", who);
  let statusArray = [];
  let wifiState = machine.wifi;
  let wifi = (wifiState.wifi === false) ?
              {wifi: false, ip: "", connecting: restart.isWifiConnecting} :
              {wifi: true, ssid: wifiState.ssid,
               ip: wifiState.ip, connecting: restart.isWifiConnecting};
  let hotspotState = machine.hotspot;
  let hotspot = {hotspot: hotspotState.hotspot, ip: hotspotState.ip,
                 ifaces: await nwork.isWlan1()};
  statusArray.push(wifi);                             //  [0]
  statusArray.push(hotspot);                          //  [1]
  statusArray.push(machine.lan);                      //  [2]
  return statusArray;
 };
//................................................................ Settings page
/**F. Settings page - create an object with settings content needed in order
 * to render a correct frame on the Settings page.
 * The data structure is an ordered array - this order is important:
 * [0] {volume: integer}
 * [1] {internet: boolean}
 * @global {machine}     reading property values
 * @return {array}       array of data for Settings page frame
 */
function settingsFrameData() {
  let statusArray = [];
  //populate the status array...
  statusArray.push({volume: machine.startVolume});    //  [0]
  statusArray.push({internet: machine.internet});     //  [1]
  return statusArray;
};
//...................................................................Player page
/**G. Player page - create objects with settings content needed in order
 * to render correct information frames on the start page - Player page.
 * The data structure is array - the order is important:
 * This object is always created:
 *  [0] {status: "<status>" or "", volume; integer (0 - 100)};
 * If Bluetooth is on this object is created
 *  [1] {type: "bt", btOn: boolean, spkr: "<spkr name>" or "",
 *       mac: "<mac>" or ""}; Note: this one is optional
 * This object is always created, frontend will always render atleast one subframe
 *  [2] {type: "conn", wifiOn: boolean, hotOn: boolean, ip: "<ip>", ssid: string,
 *       ssid: string or "",lanIp: "<ip>" or "", internet: boolean};
 * @global {machine}     reading property values
 * @return {array}       array of data for start page frame, Player page
 */
async function startPageFrameData() {
  let statusArray = [];
  // [0] object always created, push into array
  statusArray.push(await statusFrameData());
  if (machine.bluetooth.bluetooth === true) {
  // [1] this object created if there is Bluetooth, push into array
    statusArray.push (await btConnFrameData());
  // [2]  object always created, push into array
    statusArray.push (connFrameData());
    io.emit("startpage", statusArray );
    return statusArray;
  }
  else {
  // [1] object always created, push into array
    statusArray.push (connFrameData());
    io.emit("startpage", statusArray );
    return statusArray;
  };
};

/**Helper for  Player page - create an object with settings content in order
 * to render a correct status sub frame on the start page - Player page.
 * The data structure is an object: '{status: "<status>" volume: integer}'
 * Status string can be: "idle", "bluetooth", "spotify", "playback",
 *                       "airplay","upnp"
 * @global {mod.machineCtl}     reading various property values
 * @return {object}             object for start page status subframe
 */
async function statusFrameData() {
  return {status: mod.machineCtl.status, volume: mod.machineCtl.volume};
};

/**Helper for Player page - create objects with bluetooth content needed in order
 * to render correct information sub frames on the start page - Player page.
 * The data structure is an object:
 *  [1] {type: "bt", btOn: boolean, spkr: "<spkr name>" or "",
 *       mac:  "<mac>" or ""};
 * LIMITATION: the number of connected speakers to one speaker is expected here!
 * @global {mod.machineCtl}     reading many property values
 * @return {object}      object of data for start page info frame, Player page
 */
async function btConnFrameData() {
  if (mod.machineCtl.bluetooth.bluetooth === true) { //this test is needed for direct calls
    let isSpeaker = await btsp.getConnectedSinks(false); //false means used stored value
    let spkr = "";
    let mac = "";
    if (isSpeaker.length > 0) { //isSpeaker is an array with one mac address
      spkr = await btsp.bluetoothDeviceName(isSpeaker[0]); //only one speaker here
      mac = isSpeaker[0];
    };
    return {type: "bt", btOn: true, spkr: spkr, mac: mac};
  }
  else {
    return {type: "bt", btOn: false, spkr: "", mac: ""};
  };
};
/**Helper for Player page - create objects with connection content needed in order
 * to render correct information sub frames on the start page - Player page.
 * The data structure is an object:
 *  [2] {type: "conn", wifiOn: boolean, hotOn: boolean, ip: "<ip>", ssid: string,
 *       ssid: string or "",lanIp: "<ip>" or "", internet: boolean};
 * @global {mod.machineCtl}     reading many property values
 * @return {object}      object of data for start page info frame, Player page
 */
function connFrameData() {
  let wifiState = machine.wifi;
  let ip = "";
  let ssid = "";
  let wifiOn = wifiState.wifi;
  let hotspotState =  machine.hotspot;
  let hotOn = hotspotState.hotspot;
  if (wifiOn === true) {
    ip = wifiState.ip;
    ssid = wifiState.ssid;
  }
  else if (hotOn === true) {
    ip = hotspotState.ip;
  };
  return {type: "conn", wifiOn: wifiOn, hotOn: hotOn, ip: ip, ssid: ssid,
          lanIp: machine.lan.ip, internet: machine.internet };
};

/**a.1 State page - create an object with state content.........................
 * Functions needed in order to render a correct frame of the machine state
 * based on linux commands (mostly).
 * Note: State page is a "hidden" page and has to be explicitely called as the
 * url: 'player.local/playerstate' -- there are no nav buttons present.
 * @global {RAD_SYSTEM_VERSION} - it resides in the machine, call machine
 * @return {object}               objects for State page frame
 */
 //Render object formats:
 //stat.renderSystemHeader() ->
 //[0]: {time: "", system: version, card: "", default: "", muted: ""}
 //stat.renderBluetooth() ->
 //[1]: {devices: "", paired: "", connected: "", speakers: "", mac: "", btOn: "",
 //      discoverable: ""};
 //stat.renderNetwork() ->
 //[2]: {ip: "", wifi: "", mac: "", internet: "", rfkill: ""}
 //stat.renderSystem() ->
 //[3]: { used: "", free: "", tot: "", left: "", missing: "", running: "",
 //       size: "", inUse: "", avail: "", usePercent: "" };
 //stat.renderStreaming() ->
 //[4]: {sensor: "no read",  mpdDetect: "no read", bluetooth: "no read", upnp: "no read",
//      alsablu: "no read", mpdPid: "no read",    alsacurrent: "no read", alsaUser: "no read"};
 //stat.renderUsbPlayback() ->
 //[5]: {songs: "no read", mpc: "no read", mpdDB: "no read",
//      uspRsp: "no read", userUSB: "no read", mountUSB: "no read"}
      //[0]
async function stateHeaderFrameData() {
  let version = await ctl.getPlayerVersion(); //get the GV RAD_SYSTEM_VERSION
  let frame = await stat.renderSystemHeader(version);
  return frame;
};    //[1]
async function stateBtFrameData() {
  let frame = await stat.renderBluetooth();
  return frame;
};    //[2]
async function stateNworkFrameData() {
  let frame = await stat.renderNetwork();
  return frame;
};    //[3]
async function stateSysFrameData() {
  let frame = await stat.renderSystem();
  return frame;
};    //[4]
async function stateStreamFrameData() {
  let frame = await stat.renderStreaming();
  return frame;
};   //[5]
async function stateUsbFrameData() {
  let frame = await stat.renderUsbPlayback();
  return frame;
};
/** a.2 Machine page - create an object with machine content.........................
 * Function needed in order to render a correct frame of the machine GV's,
 * i.e. how the machine has internally registred states.
 * Note: Machine page is a "hidden" page and has to be explicitely called as
 * the url: player.local/playermachine -- there are no nav buttons present.
 * @global {machine stream restart playlist shufflePlaylist}
 * @return {object}       objects for machine page frame
 */
async function machineFrameData() {
  let machineGV = machine;
  let playback = await stat.renderMachinePlayback(machineGV);
  let connections = await stat.renderMachineConnections(machineGV);
  let streaming = await stat.renderStream(machineGV);
  let restartData = await stat.renderRestart(restart);
  let lists = await stat.renderPlaylist();
  let marray = [ playback, connections, streaming, restartData, lists ];
  return marray;
};
/**Machine page - create an object with all bluetooth content...................
 * Function needed in order to render a correct frame of the state of bluetooth.
 * i.e. how the machine has internally registred bluetooth data.
 * @return {object}       objects for bluetooth page frame to be rendered
 */
async function machineBtFrameData() {
  let sinks = await stat.renderBtSinks();
  let sources = await stat.renderBtSources();
  return [ sinks, sources ];
};
// socket.io listeners for frontend events =====================================
/**Manage events from the frontend through socket.io --- socket
 * Event handling of all user interaction of player (buttons and sliders).
 * Updates every open browser of every change, often also the calling one.
 * There are two parts:
 *  A. Incoming request when web page opens or ask for updates
 *  B. User events on web pages
 * @param     {object}        ioServer, socket.io object, also GV 'io',
 *                            Note: 'socket' is a connected web page
 * @listener  {socket.io}     'connection'
 * @return    {boolean}          true
 */
function setupFrontEndProtocol(ioServer) {
 ioServer.on('connection', function (socket) {
   incomingPageRequests(socket);
   incomingUserRequests(socket);
 });
};
/** A. Sets up listener for incoming render request from socket page that has
 * opened or wants an update, i.e. rerendering. This set of listeners causes
 * rerendering of Player web pages. All actions are end points.
 * @param     {object}        socket, socket.io object, i.e. a connected web page
 * @listener  {socket.io}     sets up listeners for page rendering events
 * @return    {boolean}          true
 */
 function incomingPageRequests(socket) {
//Listener for render request from socket connected web page that has opened...
   socket.on('page-opens',  async function (data) {
    //console.log(aux.timeStamp(), "Frontend: data recieved on page opens", data);
    switch(data.page) {
       case "startpage":
       //console.log(aux.timeStamp(), "machine: start page request    =>[ ]");
       startPageFrameData(); //end-point in function - render full page
       break;
       case "player":
       socket.emit('replace', await play.trackFrameData());
       break;
       case "playlist":
       socket.emit('render', await play.playlistFrameData());
       break;
       case "usb":
       play.mpdDbScanned(socket); //endpoint is in fn called
       break;
       case "bluetooth":
       //await is a better pattern - usbListFrameData above should be replaced
       let bltframe = await bluetoothFrameData();
       socket.emit('bluetooth', bltframe);
       break;
       case "wifi":
       let wifiFrame = await wifiFrameData("page opens");
       socket.emit('wifi', wifiFrame);
       break;
       case "settings":
       socket.emit('settings', settingsFrameData());
       break;
       case "state":
       let header = await stateHeaderFrameData();
       socket.emit('state-header', header );      //endpoint [0]
       let btframe = await stateBtFrameData();
       socket.emit('state-bt', btframe );         //endpoint [1]
       let nworkframe = await stateNworkFrameData();
       socket.emit('state-nwork', nworkframe );   //endpoint [2]
       let sysframe = await stateSysFrameData();
       socket.emit('state-sys', sysframe );       //endpoint [3]
       let streamframe = await stateStreamFrameData();
       socket.emit('state-stream', streamframe ); //endpoint [4]
       let usbframe = await stateUsbFrameData();
       socket.emit('state-usb', usbframe );       //endpoint [5]
       break;
       case "machine":
       let machineFrame = await machineFrameData(); //endpoint [0]
       socket.emit('machine-data', machineFrame);
       let btDevices = await machineBtFrameData(); //endpoint [1]
       socket.emit('machine-bt', btDevices);
       break;
       default: //this should not happen...  but when it happens, render!!
       startPageFrameData(); //end-point in function, full page rendered
       socket.emit('replace', await play.trackFrameData());
       socket.emit('render', await play.playlistFrameData());
       socket.emit('bluetooth', await bluetoothFrameData());
       socket.emit('wifi', await wifiFrameData("ERROR -< full rendeR"));
       socket.emit('settings', settingsFrameData());
       play.mpdDbScanned(socket); //endpoint
     };
     aux.sleep(100).then(() => {    //wait and then clear any old messages
        socket.emit("clear-dispatch", " -- inside page-opens");});
   });
   return true;
 };
 /** B. Sets up listener for incoming user request from socket page that is
  * opened. This function defines the frontend protocol of user requests.
  * This set of listeners causes different kind of control actions to be done
  * by machine.js and specialized library function in the folder lib. The
  * end point is not in this function - it occurs at completion of the request.
  * @param     {socket.io}     socket, socket.io object, i.e. a connected web page
  * @listener  {socket.io}     page generated user events
  * @return    {boolean}       true
  */
   // |> PLAY button - state changes; player page and playlist page
function incomingUserRequests(socket)  {
   socket.on('play', async function (data) {
     await play.stopElapsing();
     play.playCurrent(socket);  //endpoint is in playCurrent
   });
   // || PAUSE button - state changes; player page and playlist page
   socket.on('pause', async function (data) {
     await play.pauseCurrent(data);     //endpoint is in pauseCurrent
   });
   // < PREVIOUS button - state changes; player page and playlist pages
   socket.on('previous', async function (data) {
     await play.stopElapsing();
     play.previousTrack();
   });
   // > NEXT button - state changes; player page and playlist pages
   socket.on('next', async function (data) {
     //console.log(aux.timeStamp(), "Frontend: next track requested >", data);
     await play.stopElapsing();
     play.nextTrack(); //endpoint in called fn and in playCurrent() when playing
   });
   // <=> REPEAT button - state changes; player pages only
   socket.on('repeat', async function (data) {
     await play.setRepeat(data, socket);  //mpd not affected
     socket.broadcast.emit('replace', await play.trackFrameData());
   });
   // ~ SHUFFLE button - state changes; player pages only
   socket.on('shuffle', async function (data) {
     await play.setShuffle(data);  //mpd not affected
     socket.broadcast.emit('replace', await play.trackFrameData());
   });
   //--|-- DURATION slider
   //CASE a. seek within duration - state changes; player pages only
   socket.on('seek', async function (data) {
     await play.stopElapsing();
     play.seekDuration(data, socket); //endpoint is in seekDuration
   });
   //CASE b. elapsed is duration => track end, changes; player/playlist pages
   socket.on('track-end', async function (data) {
     await play.stopElapsing();
     play.seekStop();  //endpoint is further down at trackEnd()
   });
   //--|-- VOLUME slider - state changes; player pages only
   socket.on('volume', function (data) {
     ctl.setVolume(data, socket);  //endpoint is in setVolume
   });
   //Events from Playlist page ................................. Playlist Events
   // [X] CLEAR button - Playlist page,  affect Player page if in Playback mode
   socket.on('clear', async function (data) {
     // logger.log(aux.timeStamp(), "Frontend: empty playlist  []", data);
     await play.stopElapsing();
     await play.clearPlaylist();
     //Player page rendering, if not streaming.
     if (machine.status === "idle") {
       socket.broadcast.emit('replace', await play.trackFrameData());
     };
     //Playlist rendering of empty playlist
     socket.broadcast.emit('render', await play.playlistFrameData());  //endpoint
   });
   // [*] REMOVE button - Playlist page, might affect Player page if in Playback
   // mode and the track to be removed is the current one
   socket.on('remove', async function (data) {
     //console.log(aux.timeStamp(), "Frontend: remove this track from playlist  [X]", data);
     await play.checkCurrentRemoved(data);
     play.removeTrackInPlaylist(data);
   });
   // |> PLAY button - Playlist page,  affects Player page
   socket.on('play-track', async function (data) {
     //console.log(aux.timeStamp(), "Frontend: play this track from playlist >", data);
     await play.stopElapsing();
     play.playTrack(data);  //endpoint in playTrack(), all pages rendered
   });
   //Events from USBlist page .................................. USB list Events
   // [] Folder button - open USBlist page and show folder content
   socket.on('usb', async function (data) {
     // logger.log(aux.timeStamp(), "Frontend: usb +", data);
     await play.usblistFrameData(data.folder, socket); //endpoint in called function
   });
   // [+] Add Track button - add ONE track to playlist
   //require rendering for all playlist pages and player pages if first track
   socket.on('add-track', function (data) {
     // console.log(aux.timeStamp(), "Frontend: add a track from USB +", data);
     play.addUSBFile(data); //endpoint in called function
   });
   // +[] Add Folder button - add all content of folder(s) to playlist
   //require rendering for playlist pages
   socket.on('add-folder', function (data) {
     // logger.log(aux.timeStamp(), "Frontend: add tracks in folder +", data);
     play.addUSBFolders(data.folder, 1); //endpoint is in addUSBFile(), 1 -> not in use
   });
   // |> Play Track Button - add the track to playlist and start playing
   //require rendering for all player and playlist pages
   socket.on('play-usb', async function (data) {
     //console.log(aux.timeStamp(), "Frontend: play/add track from USB:\n", data);
     await play.stopElapsing();
     play.playUSB(data);  //endpoint is in in playTrack()
 });
 //______________________________________________________ End of Playback Events
   //Events from Bluetooth, Wi-Fi and Settings pages ........... Settings Events
   //Scan for Bluetooth audio sink devices (bt speakers)
   socket.on('scan-speakers', function (data) {
     if (restart.token === false) { ctl.scanForBtSpeakers(); };
   });
   //Connect a Bluetooth audio sink device (a bt speakers)
   socket.on('connect-speaker', function (data) {
     if (restart.token === false) {ctl.connectBtSpeaker(data); };
   });
   //Disconnect a Bluetooth audio sink device (a bt speakers)
   socket.on('disconnect-speaker', function (data) {
     //console.log(aux.timeStamp(), "Frontend: disconnect request for bt speaker", data);
     if (restart.token === false) { ctl.disconnectBtSpeaker(data); };
   });
   //Remove a disconnected bluetooth audio sink from frontend (untrust)
   socket.on('untrust-speaker', function (data) {
     //console.log(aux.timeStamp(), "Frontend: untrust request for bt speaker", data);
     if (restart.token === false) { ctl.untrustBtSpeaker(data); };
   });
   //Disconnect a Bluetooth audio source device (a smart phone...)
   socket.on('disconnect-device', function (data) {
     //console.log(aux.timeStamp(), "Frontend: disconnect request for bt device (phone)", data);
     ctl.disconnectBtDevice(data);
   });
   //Enable Bluetooth service or start Hotspot (Wi-Fi Access Point)
   socket.on('connect-network', function (data) {
     // logger.log(aux.timeStamp(), "Frontend: connect request", data);
     if (restart.token === false) { ctl.connectNetwork(data); };
   });
   //Disable Bluetooth service or disconnect Wi-Fi or stop Hotspot
   socket.on('disconnect-network', function (data) {
     //console.log(aux.timeStamp(), "Frontend: disconnect request", data);
     if (restart.token === false) { ctl.disconnectNetwork(data); };
   });
   //Scan for Wi-Fi networks
   socket.on('scan-wifi', function (data) {
     //console.log(aux.timeStamp(), "Frontend: Wi-Fi scan request.........");
     if (restart.token === false) { ctl.scanForWiFi(); };
   });
   //Connect to Wi-Fi
   socket.on('wifi-connect', function (data) {
     //console.log(aux.timeStamp(), "Frontend: Wi-Fi connection request", data);
     if (restart.token === false) { ctl.connectWiFi(data); };
   });
   //Settings set startup volume
   socket.on('startup-volume', function (data) {
     // logger.log(aux.timeStamp(), "Frontend: new value for startup volume", data);
     ctl.setStartupVolume(data); //allowed even during restart
     io.emit('settings', settingsFrameData());
   });
   //Settings restart functions - 1. streaming or 2. reboot the Player
   socket.on('restart', function (data) {
     // logger.log(aux.timeStamp(), "Frontend: restart request", data);
     if (restart.token === false) {
       if(data.system === "player") {
         // logger.log(aux.timeStamp(), "machine: reboot of system requested");
         ctl.restartPlayer(); //bye-bye.........
       }
       else { //system: is supposed to be  "streaming" here
         // logger.log(aux.timeStamp(), "machine: restart of streaming services requested");
         ctl.restartStreamingServices();
       };
     };
   });
   //Stop on-going streaming service and then restart all streaming services again
   socket.on('stop-streaming-now', function (data) {
     console.log(aux.timeStamp(), "view: user STOPPED service:", data);
     if (data === "blut") {
       //this means that all bt source devices are disconnetec, the only way to
       //stop bluetooth streaming
       res.stopBluetooth(); //this stop is detected by btLoop();
     }
     else if (data === "spot") {
       //this is not detected by the librespot hook when Spotify stopped
       res.stopSpotify();
       loop.stopStreamsensor("spot"); //writes "spot:stop stopped"
     }
     else if (data === "air") {
       res.stopAirplay();
       //this is not detected by the shairport-sync hooks when AirPlay stopped
       loop.stopStreamsensor("airp"); //writes "airp:stop"
     }
     else if (data === "upnp") {
       res.stopUpnp();  //this stop is detected by mpdLoop();
     };
   });
 };
