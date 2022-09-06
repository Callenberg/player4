///Copyright 2022 by Retro Audiophile Designs
//see license.txt
//  ~ Front end code for the hidden Machine internal data Page of RAD Player ~

//Render object formats:
//renderMachinePlayback() ->
//[0]: {playing:  machine.playing, current: machine.current, mpdPaused:
//                machine.mpdPaused, elapsed: "", timer: "", mpdBusy: machine.mpdBusy,
//                volume: machine.volume, startVolume: machine.startVolume, repeat:
//                machine.repeat, shuffle: machine.shuffle, streaming:
//                machine.streaming };
//renderMachineConnections() ->
//[1]: {bluetooth: "", bluetoothSpeakers: String(machine.speakers),
//                connectedSinks: String(machine.connectedSinks),
//                wifi: String(machine.wifi), hotspot: String(machine.hotspot),
//                lan: String(machine.lan), internet: machine.internet,
//                usb: machine.usb, usbPath: machine.usbPath,
//                webServer: machine.webServer};
//renderStream() -> GV stream as a string
//[2]: string
//renderRestart() -> GV restart as a string
//[3]: string
//renderPlaylist() ->
//[4]: {listLength: playlist.length, firstTrack: "{ }", shuffle: "[] []"}

//renderBtSinks() ->
//[0]: {connectedSinks: String(connected), trustedSinks: String(trusted)};
//renderBtSources() ->
//[1]: {connectedSources: String(sources)};

//Global variables
var socket = io.connect();
var disconnection = false;
var notyf = new Notyf();    //the dispatcher for toasts

//Render on page show events=====================================================
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === 'visible') {
    //console.log("Internal: ++++ tab is visible again ++++");
    socket.emit('page-opens',{ page: "state" });
  };
});
window.addEventListener('focus', function(){
  // console.log(timeStamp(), "Internal: ==== window is in focus again ====");
  socket.emit('page-opens',{ page: "state" });  //  presence call to backend!
});
//Setting page on load ====================================
$(document).ready(function() {
  // iOS web app full screen hacks.
  if(window.navigator.standalone == true) {
   // make all links remain in web app mode.
   $('a').click(function() { window.location = $(this).attr('href');
               return false;
                   });
                 };
//Set up socket.io listener events at start up .................................

  // console.log("To backend: connect with (page-opens'), on socket", socket);
  socket.emit('page-opens',{ page: "machine" });
  socket.on("clear-dispatch", function () {
    notyf.dismissAll();
  });
//A. Main listener for rerendering of page
  socket.on('machine-data', function (data) {
    //console.log("From backend: render machine GV's ", data);
    renderSettings('machine-data', data); //<------------entry point for backend
    disconnection = false; /*connection established */
          });
  socket.on('machine-bt', function (data) {
    //console.log("From backend: render state bt page", data);
    renderSettings('machine-bt', data); //<----------------entry point for backend
    disconnection = false; /*connection established */
          });
//B. Listeners for specific or general messages (toasts) same as for settings
socket.on('dispatch', function (data) {
  // console.log("From backend: settings announcement", data);
  renderDispatch(data);   //<----------------------------entry point for backend
  disconnection = false; /*connection established */
        });
socket.on('herald', function (data) {
  // console.log("From backend: general announcement", data);
  renderDispatch(data);   //<----------------------------entry point for backend
  disconnection = false; /*connection established */
                });
//C. Listener for disconnection from Player
  socket.on('connect_error', (error) => {
    if (error && (disconnection === false)) {
      disconnection = true;   /*disconnected */
      disconnect(); //render disconnect frame once <-----entry point for backend
      // console.log("Internal: disconnected");
      socket.emit('page-opens',{ page: "state" });
    };
    // else the socket will automatically try to reconnect
    //no action here
  });

}); /* ready function done */
//=============================================================================
// Functions called by backend ================================================
// render all the system state frames
//=============================================================================
/**HTML and DOM - render all the states - called from backend     entry point
 * Render the states
 * @param  {string} frameType type of infoirmation
 * @param  {object} data frame object to be rendered
 * @return {boolean}  true
 */
 function renderSettings(frameType, data) {
   //fixes after reconnection
   //console.log("Inside renderSettings")
   disconnection && $('#connection-text').show() //&& $('#volume-frame').show() &&
   switch(frameType) {
     case 'machine-data':
     buildMachine(data);
     break;
     case 'machine-bt':
     buildBluetooth(data);
     break;
     default:
     //this shouldn't happen..., when it does - do nothing.
   };
   return true;
 };
 /**HTML and DOM - disconnect from backend
  * Render a disconnected message
  * @return {boolean}  true
  */
 function disconnect() {
   $('#connection-text').hide(); //$('#volume-frame').hide();
   //$('#system-text').hide(); $('#restart-list').hide();
   let message = `<li id="disconnected" class="error-list">
   <div class="disconnect-text"> <br> <br>ERROR: disconnected from the Player<br> <br> <br> </div>
   </li>
    `;
   $("#connection-list").html(message);
   notyf.error({
       message: "Disconnected from Player",
       duration: lastingDuration,
       background: errorColor,
       position: {x:'center',y:'center'},
       dismissible: true
     });
   return true;
 };
 function buildMachine(data) {
   let streamHTML =   buildStream(data[2]);
   let connHTML =     buildConnections(data[1]);
   let restartHTML =  buildRestart(data[3]);
   let playbackHTML = buildPlayback(data[0]);
   let playlistHTML = buildPlaylist(data[4]);
   let frameHTML =  `${streamHTML} ${connHTML}
                     ${playbackHTML} ${playlistHTML} ${restartHTML} `;
   document.getElementById("machine").innerHTML = frameHTML;
};
//[0]: {playing: machine.playing, current: machine.current, mpdPaused:
//      machine.mpdPaused, elapsed: "", timer: "", mpdBusy: machine.mpdBusy,
//      volume: machine.volume, startVolume: machine.startVolume, repeat:
//      machine.repeat, shuffle: machine.shuffle, streaming:
//      machine.streaming };
function buildPlayback(data) {
  let htmlreturn = `<li class= "list-group-item d-flex justify-content-between align-items-center player-list">
  <div class="col pl-0">
    <p class="settings-text-small pl-1 my-1">
      playing = <b>${data.playing}</b> | current = <b> ${data.current}</b> | mpdPaused = <b> ${data.mpdPaused}</b> <br>
      elapsed = ${data.elapsed} | e-timer = <b>${data.timer}</b> | mpdBusy = <b>${data.mpdBusy}</b> <br>
      volume =  ${data.volume} | startVolume = ${data.startVolume}<br>
      repeat =  <b> ${data.repeat}</b> | shuffle = <b>${data.shuffle}</b><br>
      playback = <b>${data.playback}</b> | streaming = <b>${data.streaming}</b> <br> &nbsp;
    </p>
  </div>
 </li>`
 return htmlreturn;
};
//[1]: {bluetooth: "", bluetoothSpeakers: String(machine.speakers),
//      connectedSinks: String(machine.connectedSinks),
//      wifi: String(machine.wifi), hotspot: String(machine.hotspot),
//      lan: String(machine.lan), internet: machine.internet,
//      usb: machine.usb, usbPath: machine.usbPath,
//      webServer: machine.webServer};
function buildConnections(data){
  return `<li class= "list-group-item d-flex justify-content-between align-items-center player-list">
  <div class="col pl-0">
    <p class="settings-text-small pl-1 my-1">
      bluetooth = ${data.bluetooth} <br>
    </p>
    <p class="settings-text-small pl-1 my-1">
      bluetoothSpeakers = ${data.bluetoothSpeakers} <br>
    </p>
    <p class="settings-text-small pl-1 my-1">
      connectedSinks = ${data.connectedSinks} <br> <br>
    </p>
    <p class="settings-text-small pl-1 my-1">
      wifi = ${data.wifi} <br>
    </p>
    <p class="settings-text-small pl-1 my-1">
      hotspot = ${data.hotspot} <br> <br>
      lan = ${data.lan} | internet = <b>${data.internet}</b>  <br> <br>
    </p>
    <p class="settings-text-small pl-1 my-1">
      usb = ${data.usb} | usbPath = ${data.usbPath} <br> &nbsp;
    </p>
  </div>
 </li>`
};
//[2] stream GV as a string
function buildStream(data) {
  return `<li class= "list-group-item d-flex justify-content-between align-items-center player-list">
  <div class="col pl-0">
    <p class="settings-text-small pl-1 my-1">
      GV stream is ${data}<br> &nbsp;

    </p>
  </div>
 </li>`
};
//[3] restart GV as a string
function buildRestart(data) {
  return `<li class= "list-group-item d-flex justify-content-between align-items-center player-list">
  <div class="col pl-0">
    <p class="settings-text-small pl-1 my-1">
      GV restart is ${data}<br> &nbsp;
    </p>
  </div>
 </li>`
};

//[4] {listLength: playlist.length, firstTrack: "{ }", shuffle: "[] []"}
function buildPlaylist(data) {
  return `<li class= "list-group-item d-flex justify-content-between align-items-center player-list">
  <div class="col pl-0">
    <p class="settings-text-small pl-1 my-1">
      Playlist length = <b>${data.listLength}</b>
    </p>
    <p class="settings-text-small pl-1 my-1">
      This is the first track of ${data.listLength} track(s): ------------ <br> <b>[ &nbsp; </b>${data.firstTrack} &nbsp;<b>]</b><br>
    </p>
    <p class="settings-text-small pl-1 my-1">
      Shuffled track numbers [played] | [not played] : ------------- <br> ${data.shuffle}
    </p>
  </div>
 </li>`
};

function buildBluetooth(data) {
  //[0]: {connectedSinks: String(connected), trustedSinks: String(trusted)};
  //[1]: {connectedSources: String(sources)};
  let frameHTML =
  `<li class= "list-group-item d-flex justify-content-between align-items-center player-list">
  <div class="col pl-0">
    <p class="settings-text-small pl-1 my-1">
      Bt source devices = ${data[1].connectedSources}
    </p>
    <p class="settings-text-small pl-1 my-1">
      Connected bt speaker = ${data[0].connectedSinks}
    </p>
    <p class="settings-text-small pl-1 my-1">
      Trusted bt speakers = ${data[0].trustedSinks} <br>
    </p>
  </div>
 </li>`;
 document.getElementById("bluetooth").innerHTML = frameHTML;
};

//================================================================ toast handler
//{type: error|info|done|long, missive: "text", duration: msec [optional]]}
 function renderDispatch(data) {
   switch(data.type) {
     case "error":
     errorDispatch(data.missive);
     break;
     case "done":
     doneDispatch(data.missive);
     break;
     case "info":
     infoDispatch(data.missive);
     break;
     case "mishap":
     mishapDispatch(data.missive, data.duration);
     break;
     case "long":
     infoDispatch(data.missive, data.duration);
     break;
     default:
     infoDispatch(data.missive);
     return true;
   };
 };

 const infoColor = "#AF5828";  //player-orange
 const errorColor = "#4C1C1A"; //player-red
 const okayColor = "#1B3E33";  //player-green
 const oopsColor = "#5578A0";  //player-blue
 const quickDuration = 1000;
 const normalDuration = 2000;
 const longDuration = 5000;
 const lastingDuration = (60000 * 5);
 const threeSpaces = "&nbsp; &nbsp; &nbsp;";
 const fourSpaces = "&nbsp; &nbsp; &nbsp; &nbsp;";
 const sixSpaces = "&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;";

 function errorDispatch(missive, duration) {
   duration = duration || longDuration;
   notyf.error({
       message: missive,
       duration: duration,
       background: errorColor,
       position: {x:'center',y:'top'},
       dismissible: true
     });
 };

 function infoDispatch(missive, duration) {
   duration = duration || quickDuration;
   notyf.success({
       message: missive,
       duration: duration,
       background: infoColor,
       position: {x:'center',y:'top'},
       dismissible: true,
       icon: false

     });
 };

 function doneDispatch(missive, duration) {
   duration = duration || normalDuration;
   notyf.success({
     message: missive,
     duration: normalDuration,
     background: okayColor,
     position: {x:'center',y:'top'},
     dismissible: true
   });
 };

 function mishapDispatch(missive, duration) {
   duration = duration || longDuration;
   notyf.success({
     message: missive,
     duration: duration,
     background: oopsColor,
     position: {x:'center',y:'top'},
     dismissible: true,
     icon: false
   });
 };
