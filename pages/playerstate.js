///Copyright 2022 by Retro Audiophile Designs
//see license.txt¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨
//      ~ Front end code for the hidden State Page of RAD Player ~
//NOTE: this file cannot be minimized. NOT BE MINIMIZED!!

//Render object formats:
//renderSystemHeader() ->
//[0]: {time: "", system: version, card: "", default: "", muted: ""}
//renderBluetooth() ->
//[1]: {devices: "", paired: "", connected: "", speakers: "", mac: "", btOn: "",
//      discoverable: ""};
//renderNetwork() ->
//[2]: {ip: "", wifi: "", mac: "", internet: "", rfkill: ""}
//renderSystem() ->
//[3]: { used: "", free: "", tot: "", left: "", missing: "", running: "",
//       size: "", inUse: "", avail: "", usePercent: "" };
//renderStreaming() ->
//[4]: {sensor: "no read",  mpdDetect: "no read", bluetooth: "no read", upnp: "no read",
//      alsablu: "no read", mpdPid: "no read",    alsacurrent: "no read", alsaUser: "no read"};
//renderUsbPlayback() ->
//[5]: {songs: "", mpc: "", mpdDB: "", playing: String(machine.playing),
//      current: String(machine.current), mpdid: String(machine.mpdId), elapsed: "",
//      mpdbusy: String(machine.mpdBusy), usb: String(machine.usb),
//      usbPath: machine.usbPath, uspRsp: ""}

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

  // console.log("To backend: connect with (page-opens',{ page: settings }), on socket", socket);
  socket.emit('page-opens',{ page: "state" });
  socket.on("clear-dispatch", function () {
    notyf.dismissAll();
  });
//A. Main listener for rerendering of page
  socket.on('state-header', function (data) {
    //console.log("From backend: render state header page", data);
    renderSettings('state-header', data); //<------------entry point for backend
    disconnection = false; /*connection established */
          });
  socket.on('state-bt', function (data) {
    //console.log("From backend: render state bt page", data);
    renderSettings('state-bt', data); //<----------------entry point for backend
    disconnection = false; /*connection established */
          });
  socket.on('state-nwork', function (data) {
    //console.log("From backend: render state nwork page", data);
    renderSettings('state-nwork', data); //<-------------entry point for backend
    disconnection = false; /*connection established */
          });
  socket.on('state-sys', function (data) {
    //console.log("From backend: render state sys page", data);
    renderSettings('state-sys', data); //<---------------entry point for backend
    disconnection = false; /*connection established */
          });
  socket.on('state-stream', function (data) {
    //console.log("From backend: render state stream page", data);
    renderSettings('state-stream', data); //<------------entry point for backend
    disconnection = false; /*connection established */
          });
  socket.on('state-usb', function (data) {
    //console.log("From backend: render state usb page", data);
    renderSettings('state-usb', data); //---------------entry point for backend
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
     case 'state-header':
     buildHeader(data);
     break;
     case 'state-bt':
     buildBluetooth(data);
     break;
     case 'state-nwork':
     buildNetwork(data);
     break;
     case 'state-sys':
     buildSystem(data);
     break;
     case 'state-stream':
     buildStream(data);
     break;
     case 'state-usb':
     buildUsb(data);
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
//[0]: {time: "", system: "", card: "", default: "", muted: ""}
 function buildHeader(data) {
   let frameHTML =
   `<li class="list-group-item d-flex justify-content-between align-items-center player-list">
   <div class="col pl-0">
     <p class="settings-text-small pl-1 my-1">Version: <b> ${data.system}</b> at system time ${data.time}</p>
     <p class="settings-text-small pl-1 my-1">Amplifier: ${data.card}, it is ${data.muted}.</p>
     <p class="settings-text-small pl-1 my-1">Default output is ${data.default}.</p>
   </div>
 </li>`;
  document.getElementById("header").innerHTML = frameHTML;
};
//[1]: {devices: "", paired: "", connected: "", speakers: "", mac: "", btOn: "",
//      discoverable: ""};
function buildBluetooth(data) {
  let frameHTML = `<li class= "list-group-item d-flex justify-content-between align-items-center player-list">
  <div class="col pl-0">
    <p class="settings-text-small pl-1 my-1">Bluetooth is on? <b> ${data.btOn} </b>, is it pairable? <b> ${data.discoverable}</b>.  &nbsp; mac address: ${data.mac} <br>
    <p class="settings-text-small pl-1 my-1">Devices----: ${data.devices} <br>
    Paired-----: ${data.paired} <br>
    Connected: ${data.connected} <br>
    Speaker---: ${data.speakers}</p>
  </div>
 </li>`
 document.getElementById("bluetooth").innerHTML = frameHTML;
};
//[2]: {ip: "", wifi: "", mac: "", internet: "", rfkill: ""}
function buildNetwork(data) {
  let frameHTML = `<li class= "list-group-item d-flex justify-content-between align-items-center player-list">
  <div class="col pl-0">
    <p class="settings-text-small pl-1 my-1">All IP addresses: <br> &nbsp;<b> ${data.ip} </b> <br>
    whereas Wi-Fi: &nbsp; &nbsp;<b>${data.wifi}</b><br>
    mac address: <b>${data.mac}</b>&nbsp; &nbsp; Internet? <b>${data.internet}</b> </p>
    <p class="settings-text-small pl-1 my-1">rf kill status: <br> <em> ${data.rfkill}</em> </p>
  </div>
 </li>`
  document.getElementById("network").innerHTML = frameHTML;
};
//[3]: { used: "", free: "", tot: "", left: "", missing: "", running: "",
//       size: "", inUse: "", avail: "", usePercent: "" };
function buildSystem(data) {
  let frameHTML = `<li id="bluetooth" class= "list-group-item d-flex justify-content-between align-items-center player-list">
  <div class="col pl-0">
    <p class="settings-text-small pl-1 my-1">RAM usage of a total of <b>${data.tot}</b> MB:<br>
    [used ram &nbsp; ${data.used} &nbsp; | &nbsp; free ram ${data.free}, &nbsp; (${data.left} %) ] </p>
    <p class="settings-text-small pl-1 my-1">Disc usage of a total of &nbsp; <b> ${data.size}</b> GB:<br>
    [used disc ${data.inUse} &nbsp; (${data.usePercent}) &nbsp; | &nbsp; free disc ${data.avail} ] </p>
    <p class="settings-text-small pl-1 my-1">Running processes: <br>
    a. missing: <em>${data.missing} </em> <br>
    b. running: <em>${data.running} </em> </p>
  </div>
 </li>`
 document.getElementById("system").innerHTML = frameHTML;
};
//[4]: {sensor: "no read",  mpdDetect: "no read", bluetooth: "no read", upnp: "no read",
//      alsablu: "no read", mpdPid: "no read",    alsacurrent: "no read", alsaUser: "no read"};

function buildStream(data) {
  console.log("stream obj", data)
  let frameHTML = `<li id="bluetooth" class= "list-group-item d-flex justify-content-between align-items-center player-list">
  <div class="col pl-0">
    <p class="settings-text-small pl-1 my-1">Latest state of Player: <br>
    [sensor: <b>${data.sensor}</b> | upnp hook: <b>${data.mpdDetect}</b> | blut: <b>${data.bluetooth}</b> | up?: <b>${data.upnp}</b> ]</p>
    <p class="settings-text-small pl-1 my-1">
    [blue alsa pid: ${data.alsablu} | mpd & upnp alsa pid: ${data.mpdPid} ]<br>
    Current sub pid for alsa: ${data.alsacurrent} <br>
    Which bin is using  alsa? <b> ${data.alsaUser} </b> </p>
  </div>
 </li>`
  document.getElementById("stream").innerHTML = frameHTML;
};
//[5]: {songs: "no read", mpc: "no read", mpdDB: "no read",
//      uspRsp: "no read", userUSB: "no read", mountUSB: "no read"}
function buildUsb(data) {
  let frameHTML = `<li id="mpc" class= "list-group-item d-flex justify-content-between align-items-center player-list">
  <div class="col pl-0">
  <p class="settings-text-small pl-1 my-1"> mpc status information: -------- <br> [ <b>${data.mpc}</b>  ]  <br> </p>
  <p class="settings-text-small pl-1 my-1"> mpd Database information: ---- <br>
  Number of songs: ${data.songs}<br>
  Data base: ${data.mpdDB}<br></p>
  <p class="settings-text-small pl-1 my-1"> USB stick: -------- <br>
  Mounted usb user's stick: <b>${data.mountUSB}</b> <br>
  UUID of usb user's stick: <b>${data.userUSB}</b> <br>
  All system  attached USB: <em>${data.usbRsp}</em> </p>
  </div>
</li>`
  document.getElementById("usb").innerHTML = frameHTML;
};

 //================================================================ toast handler
 //{type: error|info|done|long, missive: "text", duration: msec [optional]]}
 function renderDispatch(data) {
   switch(data.type) {
 //Bluetooth off
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
