///Copyright 2022 by Retro Audiophile Designs
//see license.txt¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨
//      ~ Front end code for Settings Page of RAD Player ~

//NOTE: this file cannot be minimized. NOT BE MINIMIZED!!

//Entry point is function renderSettings(data), where data is the frame array.
//Incoming frame data format is an array of: [
//{wifi: boolean, ssid: string, ip: string },
//{hotspot: boolean, ip: string};,
//{lan: boolean, ip: string},


//Global variables
var socket = io.connect();
var disconnection = false;
var wifiList = [];          //an array of wifi networks
var notyf = new Notyf();    //the dispatcher for toasts

//Render on page show events=====================================================
/*
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === 'visible') {
    // console.log("Internal: ++++ tab is visible again ++++");
    socket.emit('page-opens',{ page: "settings" });
  };
});*/
window.addEventListener('focus', function(){
  //console.log(timeStamp(), "Internal: ==== window is in focus again ====");
  //console.log(timestamp(), "To backend: page-opens === in focus again");
  socket.emit('page-opens',{ page: "wifi" });  //  presence call to backend!
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

  //console.log(timestamp(), "To backend: page-opens first time");
  socket.emit('page-opens',{ page: "wifi" });
//Special listener:
  socket.on("clear-dispatch", function () {
    notyf.dismissAll();
  });
//A. Main listener for rerendering of page
socket.on('wifi', function (data) {
    //console.log(timestamp(), "From backend: render wifi page", data);
    renderSettings(data); //<----------------------------entry point for backend
    if (data[0].connecting === true) {
      sleep(50).then(() => {
        console.log(timestamp(), "From backend: in addition render spinner...");
        spinWifiSpinner("#connect-wifi"); //<-----entry point for backend
        //Set button so wi-fi can be disconnected again
        $("#disconnect-wifi").on('click', function() {
          // console.log("B1. disconnect Wi-Fi");
          disconnectWifiClicked($(this));
        });
      });
    };
    disconnection = false; /*connection established */
          });
//A2. Listener for a list of bt speakers to render, data is stored in btSpkrList
socket.on('wifi-networks', function (data) {
  //console.log("From backend: wifi network scan array:", data);
  $('#wifiModal').modal('hide');
  renderWifiNetworks(data); //<--------------------------entry point for backend
  disconnection = false; /*connection established */
                    });
//B. Listeners for specific or general messages (toasts)
socket.on('dispatch', function (data) {
  // console.log("From backend: settings announcement", data);
  renderDispatch(data);   //<----------------------------entry point for backend
  disconnection = false; /*connection established */
        });
socket.on("clear-dispatch", function (data) {
//console.log(timeStamp(),"From backend: clear old announcement", data);
  notyf.dismissAll();
});
socket.on('herald', function (data) {
  //console.log(timestamp(),"From backend: general announcement");
  renderDispatch(data);   //<----------------------------entry point for backend
  disconnection = false; /*connection established */
                });
//C. Listener for disconnection from Player
  socket.on('connect_error', function (error) {
    //console.log(timestamp(), "Internal: disconnected Error indication");
    //socket.emit('page-opens',{ page: "wifi-error", errormsg: error});
    let isError = false;
    if ((error === undefined) || (typeof error === "undefined") || (error == null)) {
      isError = false;
    }
    else {
      isError = true;
    };
    if ((isError === true) && (disconnection === false)) {
      disconnection = true;   /*disconnected */
      disconnect(); //render disconnect frame once <-----entry point for backend
      //console.log(timestamp(), "To backend: page-opens DISCONNECT");
      socket.emit('page-opens',{ page: "wifi" });
    };
    // else the socket will automatically try to reconnect
    //no action here
              });
//D. Listener for showing that a connect attempt is going on - spinner
socket.on('wifi-connecting', function () {
    //console.log(timestamp(), "From backend: ...render spinner again!");
    spinWifiSpinner("#connect-wifi"); //<-----entry point for backend
    //Set button so wi-fi can be disconnected again
    $("#disconnect-wifi").on('click', function() {
      // console.log("B1. disconnect Wi-Fi");
      disconnectWifiClicked($(this));
    });
    disconnection = false; /*connection established */
          });
  /*
  socket.on('connect', function () {
    //console.log(timestamp(), "Internal: connected");
    socket.emit('page-opens',{ page: "wifi-connect"});
  });
  socket.on('disconnect', function (reason) {
    //console.log(timestamp(), "Internal: disconnected:", reason);
    socket.emit('page-opens',{ page: "wifi-disconnect", reason: reason});
    //socket.connect();
  });
  socket.on('error', (error) => {
    //console.log(timestamp(), "Internal: io error:", error);
  });
  socket.on('reconnect', (number) => {
    //console.log(timestamp(), "Internal: reconnect#:", number);
  });
  */

}); /* ready function done */

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
//================================================================ generate HTML
// Building HTML for settings ==================================================
//==============================================================================
/**HTML - render settings page  - called by entry point renderSettings() below
 * The statusArray is an ordered array - this order is important:
 * [0] {wifi:false, ip:"", connecting: true/false}
 * [0] {wifi:true, ip:"192.168.2.147", ssid:"BELL503", connecting: true/false}
 * [1] {hotspot:false, ip:"10.0.0.10"} - {hotspot:true, ip:"10.0.0.10"}
 * [2] {lan:false, ip:""} - {lan:true, ip:"192.168.2.136"},
 * and in addition: volume is integer (0-100)   systemVersion is a string"3.019"
 * @return {html}       of no interest
 */
function renderSettingStates(statusArray, volume, systemVersion) {
  document.getElementById("connection-list").innerHTML = buildSettings(statusArray);
};
/**HTML - render network settings part
 * The statusArray is an ordered array - this order is important:
 * [0] {wifi:false, ip: string}
 *   - {wifi:true, ip: string, ssid: string}
 * [1] {hotspot:true, ip: string, ifaces: boolean}
 *   - {hotspot:false, ip: string, ifaces: boolean}
 * [2] {lan:true, ip:string} - {lan: false, ip: ""},
 * @return {html}       of no interest
 */
function buildSettings(statusArray){
  if (Array.isArray(statusArray)) {
    let settingsHTML = `
    ${wifiSettingsHTML(statusArray[0])}
    ${hotspotSettingsHTML(statusArray[1], statusArray[0])}
    ${lanSettingsHTML(statusArray[2])}
    `;
    return settingsHTML;
  };
};
//A. HTML build for Wi-fi ....................................................... wifi
//[0] {wifi:false, ip:""} - {wifi:true, ip:"192.168.2.147", ssid:"BELL503"}
function wifiSettingsHTML (wifiJSON){
  if (wifiJSON.wifi === true) {
    return `<li id="wifi" class= "list-group-item d-flex justify-content-between align-items-center player-list mt-n1">
        ${wifiConnectedHTML (wifiJSON)}
      </li>`
  }
  else {
    return `<li id="wifi" class="list-group-item d-flex justify-content-between align-items-center player-list mt-n1">
        ${wifiDisconnectedHTML()}
            </li>`;
  };
};
function wifiConnectedHTML(wifiJSON) {
  return `<div class="col-auto">
    <i class="wifi-symbol fas fa-wifi fa-2x my-2 p-0"></i>
  </div>
  <div class="col p-0">
    <p id="wifi-text" class="settings-text mt-1 mb-0 pl-0">Wi-Fi: <strong>${wifiJSON.ssid}</strong><br> IP-address is ${wifiJSON.ip}</p>
    <p class="settings-text-small mt-0 mb-2"> [Connected to wireless network] </p>
  </div>
  <div id="disconnect-wifi" class="col-auto d-flex justify-content-end align-top pt-1 px-1">
    <button class="playback-btn" type="button">
      <i class="settings-btn fas fa-times-circle fa-2x" title="Disconnect Wi-Fi"></i>
    </button>
  </div> `
};
//This was used when wifi was not scanned first, direct enter of ssid and password
function OLDIEwifiDisconnectedHTML() {  //pop-up and enter ssid + pwd
  return `<div class="col-auto">
    <i class="nowifi fas fa-wifi fa-2x mt-3 mb-2 p-0"></i>
  </div>
  <div id="connect-wifi" class="col my-2 p-0">
    <div id="wifi-dropdown" class="dropdown">
      <button class="btn connect-wifi-btn dropdown-toggle" type="button" id="dropdownMenuButton" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
        Connect to Wi-Fi
      </button>
      <div id="wifi-dropdown-menu" class="dropdown-menu bg-lighter border border-dark" aria-labelledby="dropdownMenuButton">
        <form id="wifi-form" class="px-4 py-2">
          <div class="form-group">
            <label for="exampleDropdownFormEmail1" style="white-space:nowrap"><b>Enter Wi-Fi network SSID:</b></label>
            <input id="wifi-SSID" type="text" class="form-control text-muted" placeholder="SSID">
          </div>
          <div class="form-group">
            <label for="exampleDropdownFormPassword1"><b>Password:</b></label>
            <input id="wifi-password" type="password" class="form-control" autocomplete="current-password" placeholder="Password">
          </div>
          <button type="submit" class="btn connect-wifi-btn">Connect</button>
        </div>
        </div>
      </div>`
};

function wifiConnectHTML(ssid) {  //pop-up in order to enter ssid + password
  //This is the body of the modal #wifiConnectModal
  //Inserted at #wifi-selected;
  //removed: autocomplete="current-password" and also type="password"
  return `
        <form id="wifi-form" class="px-4 py-2">
          <div class="form-group  player-headline">
            <label for="exampleDropdownFormEmail1" style="white-space:nowrap"><b>Selected Wi-Fi network (or enter a new one):</b></label>
            <input id="wifi-SSID" type="text" class="form-control text-muted" value="${ssid}">
          </div>
          <div class="form-group  player-headline">
            <label for="exampleDropdownFormPassword1"><b>Password:</b></label>
            <input id="wifi-password" type="text" class="form-control"  placeholder="Enter Password...">
          </div>
          <button type="submit" class="btn connect-wifi-btn">Connect to Wi-Fi</button>
        </div> `
};


function wifiDisconnectedHTML() {
  return `<div class="col-auto">
    <i class="nowifi fas fa-wifi fa-2x mt-3 mb-2 p-0"></i>
  </div>
  <div id="connect-wifi" class="col my-2 p-0">
      <button type="button" class="btn usb-root-btn"title="Scan for Wi-Fi">
        Scan for Wi-Fi networks
      </button>
    </div>
      </div>`;
};
//HTML build for 1st modal with wifi networks scan results, render the modal
//wifiArray format:  [ '<ssid<', '<ssid>', '<ssid>', ...]
function renderWifiModal(wifiArray) {
  //console.log("Internal: Preparing for wifi modal");
  let htmlString = "";
  const numberOfDevices = wifiArray.length;
  for (let i = 0; i < numberOfDevices; i++) {
    htmlString = htmlString +
    ` <a href="#" class="list-group-item list-group-item-action scan-list playback-text mb-1"
                onclick="connectWifi(${i})">
                 ${sixSpaces} ${wifiArray[i]} ${sixSpaces} ${sixSpaces} </a>`;
  };
  document.getElementById("wifi-available").innerHTML = htmlString;
  $('#wifiModal').modal('show');
};
//HTML build for modal with the selected wifi network, ssid
//Rendering the 2nd modal with a form to get the password
function renderSelectedModal(ssid) {
  let htmlString = wifiConnectHTML(ssid);  //see above
  document.getElementById("wifi-selected").innerHTML = htmlString;
  $('#wifiConnectModal').modal('show');
};

//HTML build for hotspot...................................................... Hotspot
//[1] {hotspot:false, ip:"10.0.0.10", ifaces: true} - {hotspot:true, ip:"10.0.0.10", ifaces: false}
function hotspotSettingsHTML(hotspotJSON, wifiJSON) {
  if (hotspotJSON.hotspot) {
    return `<li id="hotspot" class="list-group-item d-flex justify-content-between align-items-center player-list mt-n1">
      ${hotspotOnHTML(hotspotJSON)}
      </li>`;
  }
  else if ((wifiJSON.wifi === true) && (hotspotJSON.ifaces === false)) {
    // console.log("Internal: Wi-fi is connected and only one iface -> Hotspot can not be connected");
    return `<li id="hotspot" class="list-group-item d-flex justify-content-between align-items-center player-list mt-n1">
      ${hotspotOffWifiOnHTML()}
      </li>`;
  }
  else {
    // console.log("Internal: Hotspot can be connected");
    return `<li id="hotspot" class="list-group-item d-flex justify-content-between align-items-center player-list mt-n1">
      ${hotspotOffHTML()}
    </li>`;
  };
};

function hotspotOnHTML(hotspotJSON) {
  return `<div class="col-auto ">
    <i class="wifi-symbol fas fa-wifi fa-2x fa-rotate-180 mt-2 mb-2 p-0"></i>
  </div>
  <div class="col p-0">
    <p class="settings-text hotspot mt-1 mb-0"> Hotspot available: connect <br> first to IP-address ${hotspotJSON.ip} </p>
    <p class="settings-text-small mt-0 mb-2"> ...and then enter http://player.local </p>
  </div>
  <div id="disconnect-hotspot" class="col-auto d-flex justify-content-end align-top pt-1 px-1">
    <button class="playback-btn" type="button">
      <i class="settings-btn fas fa-times-circle fa-2x" title="Stop hotspot"></i>
    </button>
  </div>`;
};

function hotspotOffWifiOnHTML() {
  return `<div class="col-auto ">
    <i class="nohotspot fas fa-wifi fa-2x fa-rotate-180 mt-2 mb-2 p-0"></i>
  </div>
  <div class="col p-0">
    <p class="settings-text hotspot mt-1 mb-2">Hotspot is not available <br> when Wi-Fi is connected</p>
  </div>`;
};

function hotspotOffHTML() {
  return `<div class="col-auto">
    <i class="nohotspot fas fa-wifi fa-2x fa-rotate-180 mt-2 mb-2 p-0"></i>
  </div>
  <div id="connect-hotspot" class="col my-2 p-0">
      <button type="button" class="btn usb-root-btn"title="Start the hotspot">
        Start Player's Hotspot
      </button>
    </div>
      </div>`;
};
//HTML for LAN.............................................................. LAN
//[2] {lan:false, ip:""} - {lan:true, ip:"192.168.2.136"}
function lanSettingsHTML(lanJSON) {
  if (lanJSON.lan === true) {
    return `<li id="lan" class="list-group-item d-flex justify-content-between align-items-center player-list mt-n1">
      ${lanConnectedHTML(lanJSON)}
    </li>`;
  }
  else {
    return `<li id="lan" class="list-group-item d-flex justify-content-between align-items-center player-list mt-n1">
      ${lanDisconnectedHTML()}
    </li>`;
  };
};

function lanConnectedHTML(lanJSON){
  return `<div class="col-auto">
    <i class="lan-symbol fas fa-ethernet fa-2x mt-1 mb-2"></i>
  </div>
  <div class="col pl-0">
    <p class="settings-text mt-1 mb-0">LAN cable attached <br> IP-address is ${lanJSON.ip}</p>
    <p class="settings-text-small mt-0 mb-2"> [Connected to network] </p>
  </div>`
};

function lanDisconnectedHTML(){
  return `<div class="col-auto">
    <i class="nolan fas fa-ethernet fa-2x mt-1 mb-2"></i>
  </div>
  <div class="col pl-0">
    <p class="settings-text mt-1 mb-2">No LAN cable attached </p>
  </div>`
};
//******************************************************************************
//Buttons **********************************************************************
//Set up listeners for buttons**************************************************
function setListeners(connectionsArray) {
const thisArray = connectionsArray;
//A. Wi-Fi connect/Disconnect
if(thisArray[0].wifi === true) {
  $("#disconnect-wifi").on('click', function() {
    // console.log("B1. disconnect Wi-Fi");
    disconnectWifiClicked($(this));
  });
}
else {
  //i) listens for the wifi scan button to be clicked
  $('#connect-wifi').on('click', function() {
      // console.log("B2. ask for scan of Wi-Fi networks");
      scanWifiClicked($(this))
  });
  //ii) listens for the pop-up for ssid and pwd on 2nd modal
  $('#wifi-form').submit(function() {
      // console.log("B2. connect to Wi-Fi from modal");
      connectWifiClicked($('#wifi-SSID').val(), $('#wifi-password').val());
      //stop submit form default which is: post and reload page (= not wanted)
      return false; //this is the stopper mentioned above
  });
};
//B. Hotspot turn-off/turn-on
if(thisArray[1].hotspot) {
  $("#disconnect-hotspot").on('click', function() {
    // console.log("C1. turn-off Hotspot");
    turnoffHotspotClicked($(this));
  });
}
else {
  $("#connect-hotspot").on('click', function() {
    // console.log("C2. turn-on the Hotspot");
    turnonHotspotClicked($(this));
  });
 };
 //C. LAN - no button for LAN cable, pull out or attach
};
//----------------------------------------------------------
// A. Wi-Fi button functions -------------------------------
/**HTML and DOM - user wants to scan for wifi networks
 * Send the request to backend, if there are any wifis, backend will eventually
 * correspond with a "wifi" call on socket (see A2. above).
 * Backend will indireclty call 'renderWifiNetworks(wifiArray)' -- see below
 * STEP 1: This is the main button, the button has been clicked. Wait for backend.
 * @param  {DOM jQuery} buttonElement connect button DOM jQuery
 * @return {boolean}  true
 */
function scanWifiClicked(buttonElement) {
  //console.log("To backend:(scan-wifi, true)");
  $('#wifiModal').modal('hide'); //there might be a modals up, better hide them
  $('#wifiConnectModal').modal('hide');
  socket.emit('scan-wifi', true); //scan request to backend, now wait...
  return true;
};
/**HTML and DOM - user has picked a wifi network from the modal to connect to.
 * The attribute 'onclick="connectWifi(index)" gets the right ssid'. It is time
 * to ask for the password.
 * Scan modal still up and the select wifi modal will be shown.
 * STEP 2: a wifi network (ssid) have been choosen from the wifi scan modal.
 *         Show the selected wifi modal. Hide first modal. Now wait...
 * @param  {string} arrayIndexString used for wiFiList array, convert it first
 * @return {string}  ssid
 */
function connectWifi(arrayIndexString) {
  let ssid = wifiList[arrayIndexString * 1];
  $('#wifiModal').modal('hide');
  renderSelectedWifi(ssid);
  $('#wifi-form').submit(function() {
      // console.log("B2. connect to Wi-Fi from modal");
      connectWifiClicked($('#wifi-SSID').val(), $('#wifi-password').val());
      //stop submit form default which is: post and reload page (= not wanted)
      return false; //this is the stopper mentioned above
  });
  return ssid;
};
/**HTML and DOM - user choosen to connect to wi-fi - sets up diconnect listener.
 * SSID/password is passed from the listener in 'setListeners()'.
 * Step 3: the ssid and passwors was retrieved from form and now sent to backend.
 *         Ask spinner start spinning, backend does the connection. Now wait...
 *         Eventually backend will call for render with new connection, or not.
 * @param  {string} SSID SSID from submitted form from 2nd modal.
 * @param  {string} password submitted password in form 2nd modal
 * @return {boolean}  true
 */
function connectWifiClicked(sSID, password) {
  //Close submit form by removing .show classes: THE OLD WAY DOING HIDE
      //$('#wifi-dropdown-menu').removeClass("show");
      //$('#wifi-dropdown').removeClass("show");
  //Close submit form by hiding 2nd modal, all modal should now bee hidden.
  $('#wifiConnectModal').modal('hide');   //have to be hidden here!
  $('#wifiModal').modal('hide');          //just in case...
  if (sSID !== false) {
    //console.log("To back-end: (wifi-connect, {SSID:", sSID,", password:", password,"})");
    socket.emit('wifi-connect',{ssid:sSID, password: password});
    spinWifiSpinner("#connect-wifi");
    //Set button so wi-fi can be disconnected again, BUT the connection may fail
    $("#disconnect-wifi").on('click', function() {
      // console.log("B1. disconnect Wi-Fi");
      disconnectWifiClicked($(this));
    });
  }
  else {
    // console.log("Internal: no SSID or no password - no action.");
  };
  return true;
};
/**HTML and DOM - helper function. Starts the spinner indicating that a connection
 * attempt is going on (Wi-Fi) or start-up of hotspot.
 * STEP 4: spin the spinner! ...until the wifi connection is established, or not
 * @return {boolean}  true
 */
function spinWifiSpinner(liString) {
  let buttonElement = $(liString)
  let parentElement = buttonElement.parent();
  buttonElement.remove();
  parentElement.append(`
<div id="bluetooth-waiting-spinner" class="col-auto d-flex justify-content-start ml-3 pl-5">
  <div class="spinner-border loading-symbol" role="status">
    <span class="sr-only"></span>
  </div>`);
  return true;
};
// - - - - - - - - - - - - - - - -
/**HTML and DOM - user wants to DISCONNECT wi-fi - calls backend, sets up listeners.
 * Displays scan wi-fi networks button in DOM after disconnect.
 * @param  {DOM jQuery} buttonElement disconnect button DOM jQuery
 * @return {boolean}  true
 */
function disconnectWifiClicked(buttonElement){
  // console.log("To backend:(disconnect, [wifi]) - response: confirmed.");
  socket.emit('disconnect-network',{ network: "wifi" })
  //set button and submit form event listeners so Wi-fi can be connected again
  //i) listens for the wifi scan button to be clicked
  $('#connect-wifi').on('click', function() {
      // console.log("B2. ask for scan of Wi-Fi networks");
      scanWifiClicked($(this))
  });
  //ii) listens for the pop-up for ssid and pwd on 2nd modal
  $('#wifi-form').submit(function() {
      // console.log("B2. connect to Wi-Fi from modal");
      connectWifiClicked($('#wifi-SSID').val(), $('#wifi-password').val());
      //stop submit form default which is: post and reload page (= not wanted)
      return false; //this is the stopper mentioned above
  });
  return true;
  };

// C. Hotspot functions ------------------------------------
/**HTML and DOM user wants to turn OFF Hotspot - calls backend
 * Request backend to turn off the Hotspot.
 * When disconnected displays the connect button in DOM and sets up listener.
 * @param  {element} buttonElement button element in DOM jQuery
 * @return {boolean}  true
 */
function turnoffHotspotClicked(buttonElement){
  // console.log("To backend:(disconnect-network, {network: hotspot}) - response: confirmed.");
  socket.emit('disconnect-network',{ network: "hotspot" })
  //buttonElement.parent().html(hotspotOffHTML());
  $("#connect-hotspot").on('click', function() {
    // console.log("C2. turn-on the Hotspot");
    turnonHotspotClicked($(this));
  });
  return true;
    };
/**HTML and DOM user wants to turn ON Hotspot - calls backend
 * Request backend to turn on the Hotspot.
 * When connected isplays the disconnect button in DOM and sets up listener.
 * @param  {DOM} element button element in DOM jQuery
 * @return {boolean}  true
 */
function turnonHotspotClicked(buttonElement) {
  // console.log("To backend:(connect-network',{ network: hotspot}) - up and running)");
  socket.emit('connect-network',{ network: "hotspot" })
  spinWifiSpinner("#connect-hotspot")
  //Set button again
  $("#disconnect-hotspot").on('click', function() {
    // console.log("C1. turn-off Hotspot");
    turnoffHotspotClicked($(this));
  });
  return true;
};

//=============================================================================
// Functions called by backend ================================================
// render settings frames
//=============================================================================
/**HTML and DOM - render all the settings - called from backend     entry point
 * Render the settings
 * @param  {JSON} settings status array
 * @return {boolean}  true
 */
 function renderSettings(settings) {
   //fixes after reconnection
   disconnection && $('#connection-text').show() && $('#volume-frame').show() &&
   $('#system-text').show() && $('#restart-list').show();
   if (settings) {
     renderSettingStates(settings);
     setListeners(settings);
   };
   return true;
 };
 /**HTML and DOM - render available Wi-Fi networks in Modal mode --> entry point
  * Format: ["BELL503", "BELL503x", "BELL267", ... ]
  * @param  {JSON}      wifiArray status array
  * @global {array}     wifiList, the status array is saved to DOM
  * @return {boolean}   true
  */
 function renderWifiNetworks(wifiArray) {
  //console.log("Entry point renderWifi networks to select ------------");
  if (wifiArray.length !== 0) {
    notyf.dismissAll();
    //wifilist is a GV is the array of wifi ssid strings
    wifiList = wifiArray;  //used for index string at on-click in HTML/DOM
    //console.log("Wifi networks incoming:", wifiArray );
    renderWifiModal(wifiArray);
    //setMenuListeners();
  };
  return true;
 };
 /**HTML and DOM - render selected Wi-Fi network - ssid in Modal mode.
  * In order to get the password open the 2nd modal, the '#wifiConnectModal'.
  * @param  {string}    ssid name of selected wifi
  * @global {array}     wifiList, reset to the empty array, scan is over
  * @return {boolean}   true
  */
 function renderSelectedWifi(ssid) {
  //console.log("Now ask for the wifi password ------------");
  if (ssid !== "") {
    //console.log("Selected wifi has ssid:", ssid );
    wifiList = [];
    renderSelectedModal(ssid);
  };
  return true;
 };

 /**HTML and DOM - disconnect from backend
  * Render a disconnected message
  * @return {boolean}  true
  */
 function disconnect() {
   $('#connection-text').hide(); $('#volume-frame').hide();
   $('#system-text').hide(); $('#restart-list').hide();
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
//..........................................................
//Auxiliary help functions .................................
function timestamp() {
  const d = new Date();
  return`${`0${d.getHours()}`.slice(-2)}:${`0${d.getMinutes()}`.slice(-2)}:${`0${d.getSeconds()}`.slice(-2)}:${`00${d.getMilliseconds()}`.slice(-3)}`;
};

/**Sleep util, stop for a while...
 * Use: sleep(ms).then(() => {  ...code here... });
 * @param {integer}            ms time in msec
 * @return {?}                 ...of no value
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};
