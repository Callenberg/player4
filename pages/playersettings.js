//Copyright 2021 by Retro Audiophile Designs
//see license.txt
//      ~ Front end code for Settings Page of RAD Player ~
//Entry point is function renderSettings(data), where data is the frame array.
//Incoming frame data format is an array of:
// [ {volume: integer},{internet: boolean} ]


//Global variables
var socket = io.connect();
var disconnection = false;
var notyf = new Notyf();    //the dispatcher for toasts

//Render on page show events=====================================================
/* document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === 'visible') {
    // console.log("Internal: ++++ tab is visible again ++++");
    socket.emit('page-opens',{ page: "settings" });
  };
}); */
window.addEventListener('focus', function(){
  // console.log(timeStamp(), "Internal: ==== window is in focus again ====");
  socket.emit('page-opens',{ page: "settings" });  //  presence call to backend!
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
  socket.emit('page-opens',{ page: "settings" });
  socket.on("clear-dispatch", function () {
    notyf.dismissAll();
  });
//A. Main listener for rerendering of page
  socket.on('settings', function (data) {
    //console.log("From backend: render settings page", data);
    renderSettings(data); //<----------------------------entry point for backend
    disconnection = false; /*connection established */
          });
//B. Listeners for specific or general messages (toasts)
//Note: 'dispatch' is shared with Wifi page, there are no specific 'dispatch'
//      messages emitted for this page - all are 'herald', general broadcast.
//NOTE: 'dispatch' is disabled for now....
/*
socket.on('dispatch', function (data) {
  // console.log("From backend: wifi announcement", data);
  renderDispatch(data);   //<----------------------------entry point for backend
  disconnection = false;  //connection established
});   */
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
      socket.emit('page-opens',{ page: "settings" });
    };
    // else the socket will automatically try to reconnect
    //no action here
  });

}); /* ready function done */


//================================================================ generate HTML
// Building HTML for settings ==================================================
//==============================================================================
/**HTML - render settings page  - called by entry point renderSettings() below
 * The statusArray is an ordered array - this order is important:
 * [0] {volume:(0-100)}
 * [1] {internet:false} - {internet:true}
 * @return {html}       of no interest
 */
function renderSettingStates(statusArray) {
  //console.log("Internal: the incoming array:"statusArray);
  unmarkVolumeSettingsHTML();
  document.getElementById("connection-list").innerHTML = buildSettings(statusArray);
  volumeSettingsHTML(statusArray[0].volume);
};
/**HTML - render network settings part
 * The statusArray is an ordered array - this order is important:
 * [0] {volume:integer}
 * [1] {internet:boolean}
 * @return {html}       of no interest
 */
function buildSettings(statusArray){
  if (Array.isArray(statusArray)) {
    let settingsHTML = `
    ${internetSettingsHTML(statusArray[1])}
    `;
    return settingsHTML;
  };
};

//HTML for Internet access .....................................................
//[1] {internet:false} - {internet:true}
function internetSettingsHTML(statusObject) {
  if (statusObject.internet === true) {
    return `
      <li id="lan" class="list-group-item d-flex justify-content-between align-items-center player-list">
        ${internetConnectedHTML()}
      </li> `;
  }
  else {
    return `
      <li id="lan" class="list-group-item d-flex justify-content-between align-items-center player-list">
        ${internetDisconnectedHTML()}
        </li> `;
  };
};

function internetConnectedHTML(){
  return `<div class="col-auto">
    <i class="wifi-symbol fas fa-globe fa-2x ml-2 my-2"></i>
  </div>
  <div class="col pl-1">
    <p class="settings-text my-2">Connected to Internet </p>
  </div>`
};

function internetDisconnectedHTML(){
  return `<div class="col-auto">
    <i class="no-lan  fas fa-globe fa-2x ml-2 my-2"></i>
  </div>
  <div class="col pl-1">
    <p class="settings-text my-2">No Internet access! </p>
  </div>`
};

//HTML for preset Volume ................................................ volume
//[0] {volume:integer}
function volumeSettingsHTML(volume) {
  $(`#vol${volume}`).addClass("active");
  return volume;
};
//Have to traverse the menu until active is found
function unmarkVolumeSettingsHTML() {
  var i;
  for (i = 0; i < 101; i = i + 10) {
    let volume = $(`#vol${i}`);
    if (volume.hasClass("active") === true) {
      volume.removeClass("active");
      break;
    };
  };
};
//******************************************************************************
//Buttons **********************************************************************
//Set up listeners for buttons**************************************************
function setListeners(connectionsArray) {
//No dynamic listeners on this page, still this will be a place holder...
};
//..........................................................
//Static listeners, set up at first time opening of browser
//D. Preset Volume choice menu
$("#volume-menu").on("hide.bs.dropdown", function(event){
    // console.log("D. set startup volume");
    setStartupVolume(event.clickEvent.target);
    });
//E. Restart streaming services
$("#restart-streaming").on('click', function() {
    // console.log("E. restart streaming services");
    restartStreaming($(this));
    });
//F. Reboot
$("#reboot").on('click', function() {
    // console.log("F. reboot system");
    restartPlayer($(this));
    });


//----------------------------------------------------------
//D. Set startup volume functions ---------------------------------
/**HTML and DOM - set the startup volume - calls backend
 * Unmark the old volume in menu and mark the new volume value in %.
 * @param  {DOM} menuElement button element in HTML DOM, not jQuery
 * @return {boolean}  true
 */
function setStartupVolume(menuElement) {
  let newVolume = parseInt(menuElement.getAttribute("data-volume"));
  if (newVolume || (newVolume === 0)) {
    unmarkVolumeSettingsHTML();
    // console.log("To Backend: (startup-volume, { volume:", newVolume, " })");
    socket.emit('startup-volume',{ volume: newVolume });
    //unmarkVolumeSettingsHTML(connectStatusArray[4].volume);
    //Simulation sets global variable
    //connectStatusArray[4].volume = `${newVolume}`;
    //volumeSettingsHTML(newVolume);
  }
  else {
    // console.log("Internal: no volume choosen.")
  };
  return true;
};
/**No HTML or DOM - calls backend OBSOLETE, NOT IN USE ANYMORE
 * Simulating backend retrieving volume at start up.  SIMULATION only
 * @return {number}  volume in %
 */
function getStartVolumeBackend() {
  // console.log("Internal: startup volume set to", connectStatusArray[4].volume * 1)
  return connectStatusArray[4].volume * 1;
};
//E. Restart streaming Services ---------------------------------
/**HTML and DOM - restart streaming - calls backend
 * @param  {DOM} element button element in DOM
 * @return {boolean}  true
 */
function restartStreaming(element) {
  // console.log("To backend:(restart, {system: streaming})...");
  socket.emit('restart',{ system: "streaming" });
  return true;
};
//F. Restart Player system - reboot ---------------------------------
/**HTML and DOM - request to reboot system - calls backend
 * @param  {DOM} element button element in DOM
 * @return {boolean}  true
 */
function restartPlayer(element) {
  // console.log("To backend:(restart, {system: player})");
  socket.emit('restart',{ system: "player" });
  return true;
};
//=============================================================================
// Functions called by backend ================================================
// render settings frames
//=============================================================================
/**HTML and DOM - render all the settings - called from backend     entry point
 * Render the settings
 * @param  {object} settings status array
 * @return {boolean}  true
 */
 function renderSettings(settings) {
   //fixes after reconnection
   disconnection && $('#connection-text').show() && $('#volume-frame').show() &&
   $('#system-text').show() && $('#restart-list').show();
   if (settings) {
     renderSettingStates(settings);
     //setListeners(settings);
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
