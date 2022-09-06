//Copyright 2022 by Retro Audiophile Designs
//see license.txt¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨
//             ~ Frontend code for Player Page of RAD Player ~
//NOTE: this file cannot be minimized. NOT BE MINIMIZED!!

//Incoming frame data format:
//{ elapsed:integer, duration: integer, Title: string, Artist: string, albumart:
//  url as a string, playing: boolean, volume: integer, repeat: boolean,
//  shuffle: boolean, streaming: boolean }
//{ albumart: string } -- updating album art with a url

//Global variables
var socket = io.connect();  //socket for communication to backend
var disconnection = false;  //true if there has been a disconnect
var notyf = new Notyf();    //the dispatcher for toasts

//Render on page show events====================================================
/*
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === 'visible') {
    console.log(timeStamp(),"Internal: ++++ page is visible again ++++");
    socket.emit('page-opens',{ page: "startpage" });  //  presence call to backend!
  };
});       */

window.addEventListener('focus', function(){
  //console.log(timeStamp(), "Internal: ==== window is in focus again ====");
  socket.emit('page-opens',{ page: "startpage" });  //  presence call to backend!
});
//==============================================================================
//START sequence ===============================================================
  $(document).ready(function() {
    //Volume slider set up
    var slider2HTML = document.getElementById('volume-slider');
    //First create volume slider...
    noUiSlider.create(slider2HTML, {
      start: 50,
      animate: true,
      connect: "lower",
      step:5,
      behaviour: 'tap-drag',
      range: {
        'min': 0,
        'max': 100
             }
           });
    // ...and then set volume listener
    slider2HTML.noUiSlider.on('change', function() {
      // console.log("Volume handle moved");
      volumeTouched(this);
    });
//.......................................................................... iOS
   // iOS web app full screen hacks for all pages; PWA looks
  if(window.navigator.standalone == true) {
    // make all link remain in web app mode.
    $('a').click(function() { window.location = $(this).attr('href');
                return false;
                    });
                  };
//.................................................................... socket.io
//Set up socket.io connections events
    socket.emit('page-opens',{ page: "startpage" });  //  presence call to backend!

    socket.on("clear-dispatch", function () {
      notyf.dismissAll();
      // console.log(timeStamp(),"From backend: clear all notices...");
    });
//   Listener for rerendering of full page, data is an array of at least 2 elements
    socket.on('startpage', function (data) {
        //console.log(timeStamp(),"From backend: full rendering of Player page", data);
        renderPlayerStatus(data[0].status); //   render entry point for backend!
        //Set volume
        document.getElementById('volume-slider').noUiSlider.setHandle(0,
                                                          data[0].volume, true);
        infoArray = data.splice(1);
        renderPlayerInformation(infoArray);//    render entry point for backend!
        setListeners();
        disconnection && connectionAgain();
        disconnection = false; /*connection established*/
      });
//A. Listener for rerendering of page
    socket.on('status', function (data) {
      //console.log(timeStamp(),"From backend: new status frame", data);
      renderPlayerStatus(data); //               render entry point for backend!
      disconnection && connectionAgain();
      disconnection = false; /*connection established*/
    });
//B. Listeners for specific or general messages (toasts)
    socket.on('dartun', function (data) {
      disconnection && connectionAgain();
      // console.log("From backend: settings announcement", data);
      renderNotice(data);   //<------------------------- entry point for backend
      disconnection = false; /*connection established */
            });
    socket.on('herald', function (data) {
      disconnection && connectionAgain();
      // console.log("From backend: general announcement", data);
      renderNotice(data);   //<------------------------  entry point for backend
      disconnection = false; /*connection established */
                    });
//C. Listener for render information part of page,  NOT IN USE
    socket.on('new-volume', function (data) {
      //console.log(timeStamp(),"From backend: new incoming volume", data);
      //Set volume
      document.getElementById('volume-slider').noUiSlider.setHandle(0,
                                                                    data, true);
      disconnection && connectionAgain();
      disconnection = false; /*connection established*/
    });
//D. Listener for update of specific connection, data is an info object
    socket.on('update-information', function (data) {
      //console.log(timeStamp(),"From backend: render change/update:");
      //console.log(timeStamp(),"              calling renderSpecificInformation(data) ", data);
      renderSpecificInformation(data); // render entry point for backend
      setListeners();
      disconnection = false; //connection established
    });
//E. Listener for disconnection from Player
    socket.on('connect_error', (error) => {
      if (error && (disconnection === false)) {
        disconnection = true; /*disconnected*/
        disconnect(); /*render disconnected frame */
        // console.log("Internal: disconnected!");
        socket.emit('page-opens',{ page: "startpage" });
      };
      // else the socket will automatically try to reconnect
      //no action here
    });
}); /*  Ends the ready function */
//================================================================ toast handler
//{type: error|info|done|long, missive: "text", duration: msec [optional]]}
//{x:'center',y:'top'}, -> {x:'center',y:'center'},
function renderNotice(data) {
  switch(data.type) {
//Bluetooth off
    case "error":
    errorNotice(data.missive, data.duration);
    break;
    case "done":
    doneNotice(data.missive);
    break;
    case "info":
    infoNotice(data.missive);
    break;
    case "long":
    infoNotice(data.missive, data.duration);
    break;
    case "mishap":
    mishapNotice(data.missive, data.duration);
    break;
    default:
    infoNotice(data.missive);
    return true;
  };
};
const infoColor = "#AF5828";  //player-orange
const errorColor = "#4C1C1A"; //player-red
const okayColor = "#1B3E33";  //player-green
const oopsColor = "#5578A0";  //player-blue
const quickDuration = 3000;
const normalDuration = 5000;
const longDuration = 8000;
const lastingDuration = (60000 * 5);
const threeSpaces = "&nbsp; &nbsp; &nbsp;";
const fourSpaces = "&nbsp; &nbsp; &nbsp; &nbsp;";
const sixSpaces = "&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;";
function errorNotice(missive, duration) {
  duration = duration || longDuration;
  notyf.error({
      message: missive,
      duration: duration,
      background: errorColor,
      position: {x:'center',y:'center'},
      dismissible: true
    });
};
function infoNotice(missive, duration) {
  duration = duration || quickDuration;
  notyf.success({
      message: missive,
      duration: duration,
      background: infoColor,
      position: {x:'center',y:'center'},
      dismissible: true,
      icon: false

    });
};
function doneNotice(missive, duration) {
  duration = duration || normalDuration;
  notyf.success({
    message: missive,
    duration: normalDuration,
    background: okayColor,
    position: {x:'center',y:'center'},
    dismissible: true
  });
};
function mishapNotice(missive, duration) {
  duration = duration || normalDuration;
  notyf.success({
    message: missive,
    duration: longDuration,
    background: oopsColor,
    position: {x:'center',y:'center'},
    dismissible: true,
    icon: false
  });
};

//================================================================ generate HTML
// Building HTML dynamically for Player page ===================================
//==============================================================================
//Player Status Subframe HTML builds:
//------------------------------------------------------------------------------
/**HTML - render Player status - called by entry point renderStatus() above.
 * The status subframe has the id player-status and it is an <ul> element. The
 * content of the subframe is a <li> element. It might have a button/listener.
 * Status string can be: "idle", "bluetooth", "spotify", "playback", "airplay",
 *                       "upnp", "restart", "reboot", "disconnected"
 * @params {string}     status, current status to render
 * @return {html}       of no interest
 */
function renderPlayerStatus(status) {
  //console.log("Status frame update from backend:", status);
  switch(status) {
    case "idle":
    //Follow: 'machine.playing = false;' in machine to find the right triggers.
    //Triggers: idle is detected in pauseCurrent(), trackEnd(), emptyPlaylist(),
    //          streamingStopped() and whatIsStreaming() to some extent,
    //          restartStreamingServices() - last line.
    document.getElementById("player-status").innerHTML = idleStatusHTML();
    break;
    case "bluetooth":
    //Triggers: busyStreaming() + whatIsStreaming()
    document.getElementById("player-status").innerHTML = bluetoothStatusHTML();
    //button setting onclick="functionName()" or one-time listeners?
    break;
    case "spotify":
    //Triggers: busyStreaming() + whatIsStreaming()
    document.getElementById("player-status").innerHTML = spotifyStatusHTML();
    //button setting onclick="functionName()"
    break;
    case "playback":
    //Follow: 'machine.playing = true;' in machine to find the right triggers.
    //Trigger: playback is detected renderPlayCurrent()
    document.getElementById("player-status").innerHTML = playbackStatusHTML();
    //button setting onclick="functionName()"
    break;
    //Triggers: busyStreaming() + whatIsStreaming()
    case "airplay":
    document.getElementById("player-status").innerHTML = airplayStatusHTML();
    //button setting onclick="functionName()"
    break;
    case "disconnected":
    //Called from disconnect() below . . .
    document.getElementById("player-status").innerHTML = disconnectedStatusHTML();
    break;
    case "upnp":
    //Triggers: busyStreaming() + whatIsStreaming()
    document.getElementById("player-status").innerHTML = upnpStatusHTML();
    //button setting onclick="functionName()"
    break;
    case "restart":
    //Triggers: restartStreamingServices()
    document.getElementById("player-status").innerHTML = restartStreamingStatusHTML();
    break;
    case "reboot":
    //Triggers: restartPlayer()
    document.getElementById("player-status").innerHTML = restartPlayerStatusHTML();
    break;
    default:
    document.getElementById("player-status").innerHTML = unknownStatusHTML();
    return false;
  };
};
 //A. HTML build for idle status [no button]....................................
function idleStatusHTML() {
     return `
     <li id="idle-status" class="list-group-item d-flex justify-content-between align-items-center player-list">
       <div class="col-auto">
       <i class="wifi-symbol fas fa-record-vinyl fa-2x px-2 my-2"></i>
     </div>
     <div class="col pl-0">
       <p class="settings-text pl-0 my-3">Idle... </p>
     </div> </li>
     `;
};
//B. HTML build for USB Playback status.........................................
function playbackStatusHTML() {
     return `
     <li id="playback-status" class="list-group-item d-flex justify-content-between align-items-center player-list">
       <div class="col-auto">
       <i class="wifi-symbol fas fa-play-circle fa-2x px-2 my-2"></i>
     </div>
     <div class="col pl-0">
       <p class="settings-text pl-0 my-3">USB Playback... </p>
     </div>
     <div id="stop-playback" class="col-auto d-flex justify-content-end align-top pt-1 px-1">
       <button class="playback-btn" type="button">
         <i class="settings-btn fas fa-times-circle fa-2x" title="Stop Playback" onclick="playbackStopClicked()"></i>
       </button>
     </div> </li>
     `;
};
//C. HTML build for Bluetooth streaming status..................................
function bluetoothStatusHTML() {
     return `
     <li id="bluetooth-status" class="list-group-item d-flex justify-content-between align-items-center player-list">
       <div class="col-auto">
       <i class="wifi-symbol fab fa-bluetooth-b fa-2x px-2 my-2"></i>
     </div>
     <div class="col pl-0">
       <p class="settings-text pl-0 my-3">Streaming Bluetooth... </p>
     </div>
     <div id="stop-bluetooth" class="col-auto d-flex justify-content-end align-top pt-1 px-1">
       <button class="playback-btn" type="button">
         <i class="settings-btn fas fa-times-circle fa-2x" title="Stop Streaming" onclick="bluetoothStopClicked()"></i>
       </button>
     </div> </li>
     `;
};
//D. HTML build for Spotify streaming status....................................
function spotifyStatusHTML() {
     return `
     <li id="spotify-status" class="list-group-item d-flex justify-content-between align-items-center player-list">
       <div class="col-auto">
       <i class="wifi-symbol fab fa-spotify fa-2x px-2 my-2"></i>
     </div>
     <div class="col pl-0">
       <p class="settings-text pl-0 my-3">Streaming Spotify... </p>
     </div>
     <div id="stop-spotify" class="col-auto d-flex justify-content-end align-top pt-1 px-1">
       <button class="playback-btn" type="button">
         <i class="settings-btn fas fa-times-circle fa-2x" title="Stop Streaming" onclick="spotifyStopClicked()"></i>
       </button>
     </div>  </li>
     `;
};
//E. HTML build for Airplay streaming status....................................
//NOTE: Cannot use fontawesome icons, instead a css web-mask is used [line 93]
//<div class="bg-secondary airplay-symbol"> </div> and .css airplay-symbol
function airplayStatusHTML() {
     return `
     <li id="airplay-status" class="list-group-item d-flex justify-content-between align-items-center player-list">
      <div class="col-auto">
        <div class="bg-secondary airplay-symbol">
        </div>
     </div>
     <div class="col pl-0">
       <p class="settings-text pl-0 my-3">Streaming AirPlay... </p>
     </div>
     <div id="stop-airplay" class="col-auto d-flex justify-content-end align-top pt-1 px-1">
       <button class="playback-btn" type="button">
         <i class="settings-btn fas fa-times-circle fa-2x" title="Stop Streaming" onclick="airplayStopClicked()" ></i>
       </button>
     </div>  </li>
     `;
};
//F. HTML build for UPnP streaming status....................................
//NOTE: Cannot use fontawesome icons, instead a plain svg file is used
//Found icon here: https://iconape.com/upnp-logo-icon-svg-png.html
//Found <img> tips here: vgontheweb.com/#implementation
//<img src="upnp.svg" alt="Breaking Borders Logo" height="45" width="45">
//Changes to upnp.svg file: <path fill="#373D45"... and <path fill="#73777C"...
function upnpStatusHTML() {
     return `
     <li id="upnp-status" class="list-group-item d-flex justify-content-between align-items-center player-list">
       <div class="col-auto pl-2 pr-2">
          <img src="upnp.svg" alt="Breaking Borders Logo" height="45" width="45">
        </div>
        <div class="col pl-0">
        <p class="settings-text pl-0 my-3">Streaming UPnP... </p>
        </div>
        <div id="stop-UPnP" class="col-auto d-flex justify-content-end align-top pt-1 px-1">
        <button class="playback-btn" type="button">
          <i class="settings-btn fas fa-times-circle fa-2x" title="Stop Streaming" onclick="upnpStopClicked()" ></i>
          </button>
        </div> </li>
     `;
};
//G. HTML build for restarting status [no button]...............................
// originally fas fa-power-off
function restartPlayerStatusHTML() {
     return `
     <li id="restart-player-status" class="list-group-item d-flex justify-content-between align-items-center player-list">
       <div class="col-auto">
       <i class="symbol-off fas fa-times fa-2x px-2 my-2"></i>
     </div>
     <div class="col pl-0">
       <p class="settings-text pl-0 my-3">Restarting Player... </p>
     </div> </li>
     `;
};
//H. HTML build for restarting status [no button]...............................
//originally fs fa-circle-notch
function restartStreamingStatusHTML() {
     return `
     <li id="restart-streaming-status" class="list-group-item d-flex justify-content-between align-items-center player-list">
       <div class="col-auto">
       <i class="symbol-off fas fa-times fa-2x px-2 my-2"></i>
     </div>
     <div class="col pl-0">
       <p class="settings-text pl-0 my-3">Restarting all streaming... </p>
     </div> </li>
     `;
};
//I. HTML build for diconnect status [no button]................................
function disconnectedStatusHTML() {
     return `
     <li id="idle-status" class="list-group-item d-flex justify-content-between align-items-center player-list">
       <div class="col-auto">
       <i class="symbol-off fas fa-times fa-2x px-2 my-2"></i>
     </div>
     <div class="col pl-0">
       <p class="settings-text pl-0 my-3">ERROR: Disconnected </p>
     </div> </li>
     `;
};
//J. HTML build for empty status [unknown status]................................
function unknownStatusHTML() {
     return `
     <li id="idle-status" class="list-group-item d-flex justify-content-between align-items-center player-list">
     <div class="col pl-0">
       <p class="settings-text py-2"></p>
     </div> </li>
     `;
};
//Information Subframes HTML builds:
//------------------------------------------------------------------------------
/**HTML - render all kind of important information - called by entry point
 * renderinformation() above. The information can be in two ordered list elements.
 * Note: Even if they are tagged with 'type:' for now the order is significant.
 * They have the id 'bluetooth-list' or 'information-list' and they are <ul>
 * elements. The ids are used by .innerHTML() function for each <ul>.
 * The content of the subframes are <li> elements. They might each have a button.
 * The <ul> #bluetooth-list might have one or two subframes. Or be empty.
 *  [0] {type: "bt", btOn: boolean, spkr: "<spkr name>" or "", mac: "<mac>" or ""};
 * The <ul> #connection-list might have at least one subframe, max. is three.
 *  [1] {type: "conn", wifiOn: boolean, hotOn: boolean, ip: "<ip>",
 *       ssid: string or "", lanIp: "<ip>" or "", internet: boolean};
 * The optional bt object [0] and the conn object [0] or [1] are in an array.
 * @params {array}     informationArray,important information to render
 * @return {html}       of no interest
 */
function renderPlayerInformation(informationArray) {
  if (Array.isArray(informationArray)) {
    let settingsHTML = "";
    const numberOfInfo = informationArray.length;
    if (numberOfInfo === 2) {
      document.getElementById("bluetooth-list").innerHTML =
                                  btStatusHTML(informationArray[0]);
      document.getElementById("connection-list").innerHTML =
                                  connStatusHTML(informationArray[1]);
    }
    else if (numberOfInfo === 1) {
      document.getElementById("connection-list").innerHTML =
                                  connStatusHTML(informationArray[0]);
    };
  };
};
/**HTML - update specific important information - called by entry points
 * updateBtInfo() or updateConnInfo() above.
 * Affects the id 'bluetooth-list' or 'information-list' and they are <ul>
 * elements. The ids are used by .innerHTML() function for the specific <ul>.
 * The content of the subframes are <li> elements. They might each have a button.
 * The <ul> #bluetooth-list might have one or two subframes, or none.
 *  a) {type: "bt", btOn: boolean, spkr: "<spkr name>" or "", mac: "<mac>" or ""};
       {type: "bt", btOn: false} - will erase Bluetooth frames.
 * The <ul> #connection-list might have at least one subframe, max. is three.
 *  b) {type: "conn", wifiOn: boolean, hotOn: boolean, ip: "<ip>",
 *       ssid: string or "", lanIp: "<ip>" or "", internet: boolean};
 * @params {object}     statusObject, update important information
 * @return {html}       of no interest
 */
function renderSpecificInformation(statusObject) {
  //console.log("There has been a change, but what?", statusObject);
    let settingsHTML = "";
    if (statusObject.type === "bt") {
      document.getElementById("bluetooth-list").innerHTML =
                                  btStatusHTML(statusObject);
    }
    else if (statusObject.type === "conn") {
      document.getElementById("connection-list").innerHTML =
                                  connStatusHTML(statusObject);
    };
};
/**HTML - erase outdated Bluetooth information - called by entry points
 * eraseBtInfo()above. Empties the children elements of the id 'bluetooth-list'.
 * @return {html}       of no interest
 */
function eraseBtInformation() {
  document.getElementById("bluetooth-list").innerHTML = "";
};
//1. HTML build for if bluetooth is on and if there is a bt speaker connected
//[0] {type: "bt", btOn: true, spkr: "ENEBY30" mac: "FC:58:FA:ED:57:60"};
//The local variables '*String' are only there because of increased readability
function btStatusHTML(btObject) {
  //console.log(timeStamp(),"....bt object to parse", btObject);
  let btOnString = "";
  let btSpkrString = "";
  if (btObject.btOn === true) {
    btOnString = `
    <li id="btservice" class="list-group-item d-flex justify-content-between align-items-center player-list">
      <div class="col-auto pr-2">
        <i class="bluetooth-symbol fab fa-bluetooth-b fa-2x px-2 my-2"></i>
      </div>
      <div class="col pl-1">
        <p class="settings-text my-3">Bluetooth is <strong>ON</strong></p>
      </div>
      <div id="disconnect-bluetooth" class="col-auto d-flex justify-content-end align-top p-1">
        <button class="playback-btn" type="button">
          <i class="settings-btn fas fa-times-circle fa-2x" title="Turn-off Bluetooth"></i>
        </button>
      </div> </li>
    `;
    if (btObject.spkr !== "") {
      btSpkrString =
      `<li id="bluetooth-speaker" class="list-group-item d-flex justify-content-between
                             align-items-center player-list mt-n1" data-mac="${btObject.mac}">
        <div class="col-auto pr-2">
          <i class="bluetooth-symbol fab fa-bluetooth-b fa-2x px-2 my-2"></i>
        </div>
        <div class="col pl-0">
          <p class="settings-text my-3">
            <span class="settings-text-small"> Speaker: </span> <strong> ${btObject.spkr} </strong></p>
        </div>
        <div id="disconnect-speaker" class="col-auto d-flex justify-content-end align-top p-1">
          <button class="playback-btn" type="button">
            <i class="settings-btn fas fa-times-circle fa-2x" title="Disconnect speaker for now"></i>
          </button>
        </div>
      </li>
      <li id="analogue-speaker" class="list-group-item d-flex justify-content-between align-items-center player-list mt-n1">
        <div class="col-auto pr-1">
        <i class="wifi-symbol fas fa-volume-mute fa-2x px-2 my-2"></i>
        <!-- <i class="fas fa-volume-off  <i class="fas fa-volume-mute"></i> -->
      </div>
      <div class="col pl-0 m-0">
        <p class="settings-text-small pl-0 my-3">Note: analogue speaker output is muted <br> </p>
      </div>
      </li>`;
    };
    return btOnString + btSpkrString
  }
  else {
    return "";
  };
};
//2. HTML build for connections and Internet access made from an object
// [0] or [1] {type: "conn", wifiOn: true, hotOn: false, ip: "192.168.2.133",
//             ssid: "BELL503", lanIp: "", internet: true};
//There will always be an Internet information subframe last, and in addition one
//information subframe or more depending on the connections (wifi or hotspot, or lan)
//The local variables '*String' are only there because of increased readability
function connStatusHTML(connObject) {
  //console.log(timeStamp(),"From backend: the conn object", connObject);
  let htmlString = "";
  let wirelessString = "";
  let lanOnString = "";
  let internetString = "";
  if (connObject.wifiOn === true) {
    wirelessString = `
      <li id="wifi-is-on" class="list-group-item d-flex justify-content-between align-items-center player-list mb-1">
      <div class="col-auto">
        <i class="wifi-symbol fas fa-wifi fa-2x my-2 p-0"></i>
      </div>
      <div class="col p-0">
        <p id="wifi-text" class="settings-text mt-1 mb-2 pl-0">Wi-Fi: <strong>${connObject.ssid}</strong><br> IP-address is ${connObject.ip}</p>
      </div>
      <div id="disconnect-wifi" class="col-auto d-flex justify-content-end align-top pt-1 px-1">
        <button class="playback-btn" type="button">
          <i class="settings-btn fas fa-times-circle fa-2x" title="Disconnect Wi-Fi"></i>
        </button>
      </div>  </li>
      `;
      htmlString = wirelessString;
  //} else if (connObject.hotOn === true) { //older variant for one wlan iface
  };
  if (connObject.hotOn === true) {
    if (connObject.wifiOn === true) {
      wirelessString = `
        <li id="hotspot-is-on" class="list-group-item d-flex justify-content-between align-items-center player-list mb-1">
        <div class="col-auto ">
          <i class="wifi-symbol fas fa-wifi fa-2x fa-rotate-180 mt-2 mb-2 p-0"></i>
        </div>
        <div class="col p-0">
          <p class="settings-text hotspot mt-1 mb-0">Hotspot available: <br> Connect to IP-address 10.0.0.10 </p>
          <p class="settings-text-small mt-0 mb-2">[Note: Hotspot can be disconnected] </p>
        </div>
        <div id="disconnect-hotspot" class="col-auto d-flex justify-content-end align-top pt-1 px-1">
          <button class="playback-btn" type="button">
            <i class="settings-btn fas fa-times-circle fa-2x" title="Stop hotspot"></i>
          </button>
        </div>  </li>
        `;
    }
    else {
      wirelessString = `
        <li id="hotspot-is-on" class="list-group-item d-flex justify-content-between align-items-center player-list mb-1">
        <div class="col-auto ">
          <i class="wifi-symbol fas fa-wifi fa-2x fa-rotate-180 mt-2 mb-2 p-0"></i>
        </div>
        <div class="col p-0">
          <p class="settings-text hotspot mt-1 mb-2">Hotspot available: <br> Connect to IP-address 10.0.0.10 </p>
        </div>
        <div id="disconnect-hotspot" class="col-auto d-flex justify-content-end align-top pt-1 px-1">
          <button class="playback-btn" type="button">
            <i class="settings-btn fas fa-times-circle fa-2x" title="Stop hotspot"></i>
          </button>
        </div>  </li>
        `;
    };
    htmlString = htmlString + wirelessString;
  };
  if (connObject.lanIp !== "") {
    lanOnString = `
      <li id="lan-is-on" class="list-group-item d-flex justify-content-between align-items-center player-list mb-1">
      <div class="col-auto">
        <i class="lan-symbol fas fa-ethernet fa-2x mt-1 mb-2"></i>
      </div>
      <div class="col pl-0">
        <p class="settings-text mt-1 mb-2">LAN cable connected <br> IP-address is ${connObject.lanIp}</p>
      </div>  </li>
      `;
    htmlString = htmlString + lanOnString;
  };
  if(connObject.internet === true) {
    internetString = `
      <li id="internet" class="list-group-item d-flex justify-content-between align-items-center player-list">
      <div class="col-auto pl-2">
        <i class="wifi-symbol fas fa-globe fa-2x ml-2 my-2"></i>
      </div>
      <div class="col pl-1">
        <p class="settings-text my-2">Connected to Internet </p>
      </div> </li>
      `;
  }
  else {
    internetString = `
      <li id="no-internet" class="list-group-item d-flex justify-content-between align-items-center player-list">
      <div class="col-auto pl-2">
        <i class="no-lan  fas fa-globe fa-2x ml-2 my-2"></i>
      </div>
      <div class="col pl-1">
        <p class="settings-text my-2">No Internet access! </p>
      </div> </li>
      `;
  };
  htmlString = htmlString + internetString;
  return htmlString;
};
//------------------------------------------------------------------------------
//Static Listeners
//==================================================================== LISTENERS
function setListeners() {
  $("#disconnect-bluetooth").on('click', function() {
    //console.log("Button; turn-off Bluetooth - all and everything");
    turnoffBluetoothClicked();
  });

  $("#disconnect-speaker").on('click', function() {
    //console.log("Button; disconnect bt speaker");
    disconnectSpeakerClicked();
  });

  $("#disconnect-wifi").on('click', function() {
    //console.log("Button; disconnect Wi-Fi");
    disconnectWifiClicked();
  });

  $("#disconnect-hotspot").on('click', function() {
    //console.log("Button turn-off Hotspot");
    turnoffHotspotClicked();
  });
};


//_____________________________________________________________________________
// FRONTEND requests invoked by user ------------------------------------------
//-----------------------------------------------------------------------------
//A. stop buttons of status subframes
//================================================================= STOP BUTTONS
/**HTML and DOM - user has clicked on stop playback in the status subframe.
 * The function calls comes from DOM ' onclick="playbackStopClicked() " ' attribute
 * @return {boolean}      true
 */
function playbackStopClicked() {
  //console.log("Request to backend: (pause, { page: startpage })");
  socket.emit('pause', { page: "startpage" });
  return true;
};
/**HTML and DOM - user has clicked on stop bluetooth in the status subframe.
 * The function calls comes from DOM ' onclick="bluetoothStopClicked() " ' attribute
 * @return {boolean}      true
 */
 function bluetoothStopClicked() {
   //console.log("Request to backend: (stop-streaming-now, blut)");
   socket.emit('stop-streaming-now', "blut");
   return true;
 };
 /**HTML and DOM - user has clicked on stop spotify in the status subframe.
  * The function calls comes from DOM ' onclick="spotifyStopClicked() " ' attribute
  * @return {boolean}      true
  */
  function spotifyStopClicked() {
    //console.log("Request to backend: (stop-streaming-now, spot)");
    socket.emit('stop-streaming-now', "spot");
    return true;
 };
 /**HTML and DOM - user has clicked on stop airplay in the status subframe.
  * The function calls comes from DOM ' onclick="airplayStopClicked() " ' attribute
  * @return {boolean}      true
  */
  function airplayStopClicked() {
    //console.log("Request to backend: (stop-streaming-now, air)");
    socket.emit('stop-streaming-now', "air");
    return true;
 };
 /**HTML and DOM - user has clicked on stop playback in the status subframe.
  * The function calls comes from DOM ' onclick="airplayStopClicked() " ' attribute
  * @return {boolean}      true
  */
  function upnpStopClicked() {
    //console.log("Request to backend: (stop-streaming-now, upnp)");
    socket.emit('stop-streaming-now', "upnp");
    return true;
 };
//B. Volume slider function
//======================================================================= VOLUME
/**HTML and DOM - set the volume by user  - calls backend
 * The VOLUME slider bar has been moved and released.
 * @param   {DOM}           slider element
 * @backend {volume}        calls backend; with { volume: newVolume }
 * @return  {number}        new volume
 */
function volumeTouched(slider) {
  const newVolume = slider.get() * 1; /*faster conversion from string*/
  //console.log("Request to backend: (volume, { volume: newVolume })  new volume=", newVolume);
  socket.emit('volume', { volume: newVolume });
  newVolume;
};
//C. stop buttons of information subframes
//========================================================================= INFO
/**HTML and DOM - user has clicked on turn off bluetooth services in the
 * information subfram, invoked by static listener.
 * @return {?}      true?
 */
 function turnoffBluetoothClicked() {
   //console.log("Request to backend: (disconnect-network, { network: bluetooth })");
   socket.emit('disconnect-network',{ network: "bluetooth" });
   return true;
 };
 /**HTML and DOM - user has choosen to disconnect a bt speaker.
  * The speaker will vanish from Player page, but still be shown as trusted
  * on Bluetooth page.
  * @return {?}      true?
  */
 function disconnectSpeakerClicked(buttonElement) {
   //let parentElement = $(buttonElement).parent();
   //LIMITATION - there can only be one bt speaker, just use element id
   let mac = $("#bluetooth-speaker").attr("data-mac");
   //console.log('To backend: (disconnect-speaker, {mac:', mac, "mode: false})");
   socket.emit('disconnect-speaker', {mac: mac, mode: false});
 };

 /**HTML and DOM - user wants to disconnect wi-fi - calls backend.
  * @param  {DOM jQuery} buttonElement disconnect -- NOT USED
  * @return {?}  true?
  */
 function disconnectWifiClicked(){
   //console.log("To backend:(disconnect, [wifi]) ");
   socket.emit('disconnect-network',{ network: "wifi" })
 };
 /**HTML and DOM user wants to turn OFF Hotspot - calls backend
  * @return {?}  true?
  */
 function turnoffHotspotClicked(){
   //console.log("To backend:(disconnect-network, {network: hotspot}) ");
   socket.emit('disconnect-network',{ network: "hotspot" })
 };



// Functions for managing BACKEND disconnect and connected again ---------------
//------------------------------------------------------------------------------
/**HTML and DOM - disconnected by backend
 * Lost the connection - render a disconnected message............. disconnected
 * @return {Boolean}  true
 */
function disconnect() {
  renderPlayerStatus("disconnected");
  $('#volume-slider').hide();
  //$('#upper-nav-bar').hide();
  //$('#lower-nav-bar').hide();
  $('#bluetooth-list').hide();
  $('#connection-list').hide();
  //$(window).resize();
  notyf.error({
      message: "Disconnected from Player",
      duration: lastingDuration,
      background: errorColor,
      position: {x:'center',y:'center'},
      dismissible: true
    });
  return true;
};
/**HTML and DOM - connected by backend
 * The connection came back  - unhide all elements.....................connected
 * @return {Boolean}  true
 */
function connectionAgain() {
  $('#volume-slider').show();
  //$('#upper-nav-bar').show();
  //$('#lower-nav-bar').show();
  $('#bluetooth-list').show();
  $('#connection-list').show();
};
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ AUX
//Auxiliary help functions++++++++++++++++++++++++++++++++++++++++++++++++++++++
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
/**No HTML or DOM  - time stamp hrs:min:sec:msec on format 00:00:00:000
 * @return {string}           time stamp
 */
function timeStamp() {
  const d = new Date();
  return`${`0${d.getHours()}`.slice(-2)}:${`0${d.getMinutes()}`.slice(-2)}:${`0${d.getSeconds()}`.slice(-2)}:${`00${d.getMilliseconds()}`.slice(-3)}`;
};
/**No HTML or DOM - - really time critical, used for elapsed and duration!
 * Turn a string with either hh:mm:ss or mm:ss or ss to seconds.
 * Most common case is: "mm:ss", note: hh might be hhh if hundreds of hrs.
 * @param   {string}    timeString a time string
 * @return  {number}    seconds with fractions
 */
function timeStringToSeconds(timeString){
  timeString = timeString.split(':');
  const lengthTime = timeString.length;
  if (lengthTime === 2) { return ((+timeString[0]) * 60 + (+timeString[1]));
  } else if (lengthTime === 3) { return ((+timeString[0]) * 3600 + (+timeString[1]) * 60 + (+timeString[2]));
  } else if (lengthTime === 1) { return timeString[0] * 1;
  } else { return 0; };
};
/**No HTML or DOM - really time critical,  used for elapsed and duration!
 * Returns seconds as an integer in a string with either hh:mm:ss or mm:ss.
 * * Most common case is: less than 3,600 seconds, under an hour, ie. mm:ss.
 * @param   number    t = seconds elapsed
 * @return string     elapsed time in string
 */
function timeSecondsToString(t){
  if (t < 3600) { return ('0'+Math.floor(t/60)%60).slice(-2)+':'+('0' + t % 60).slice(-2);
  } else { return ('0'+Math.floor(t/3600) % 24).slice(-2)+':'+('0'+Math.floor(t/60)%60).slice(-2)+':'+('0' + t % 60).slice(-2);
  };
};
//*** Not in use yet, but nice to have***  ...might replace the one above
function formatSeconds(seconds) {
  var date = new Date(1970, 0, 1);
  date.setSeconds(seconds);
  return date.toTimeString().replace(/.*(\d{2}:\d{2}).*/, "$1");
};

/**No HTML or DOM
 * Checking if url image can be downloaded or not.
 * (set img.url to url + "favicon.ico" for more of a general "ping".)
 * @param {string}        url
 * @param {function}      callback
 * @return {boolean}      false or true
 */
function isSiteOnline(url, callback) {
    var timer = setTimeout( function() {
        // timeout after 3.5 seconds
        callback(false);
    }, 3500)
    var img = document.createElement("img");
    img.onload = function() {
        clearTimeout(timer);
        callback(true);
    }
    img.onerror = function() {
        clearTimeout(timer);
        callback(false);
    }
    img.src = url //+"/favicon.ico";
};
