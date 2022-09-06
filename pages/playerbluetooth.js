///Copyright 2022 by Retro Audiophile Designs
//see license.txt¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨
//      ~ Front end code for Bluetooth Page of RAD Player ~
//NOTE: this file cannot be minimized. NOT BE MINIMIZED!!

//Entry point is function renderSettings(data), where data is the frame array.
//Incoming frame data format is an array of: [
//[0] {bluetooth: boolean, mac: string},
//[1] {devices:  [{name: string, mac: string, connected: boolean}...] },
//[2] {speakers: [{name: string, mac: string, connected: boolean}...] }   ];
//[3] {isConnected: boolean}    --- if there is a spkr connected

//document.getElementById("bluetooth-list").hidden = false;

//Global variables
var socket = io.connect();
var disconnection = false;
var notyf = new Notyf();    //the dispatcher for toasts
var btSpkrList = [];        //temporary storage for connectable bt speakers
var focusRender = true;
var visiRender = true;

//Render on page show events=====================================================
/*
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === 'visible') {
    console.log(timeStamp(),"Internal: ++++ tab is visible again ++++");
    socket.emit('page-opens',{ page: "bluetooth" });
  };
});*/
window.addEventListener('focus', function() {
  //console.log(timeStamp(),"Internal: ==== window is in focus again ====");
  socket.emit('page-opens',{ page: "bluetooth" });  //presence call to backend!
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
  //console.log("To backend: connect with (page-opens',{ page: bluetooth })");
  socket.emit('page-opens',{ page: "bluetooth" });
  socket.on("clear-dispatch", function (data) {
  //console.log(timeStamp(),"From backend: clear old announcement", data);
    notyf.dismissAll();
  });
//A1. Main listener for rerendering of page
  socket.on('bluetooth', function (data) {
    console.log(timeStamp(), "From backend: render Bluetooth page", data);
    $('#btSpkrModal').modal('hide');
    renderSettings(data); //<----------------------------entry point for backend
    disconnection = false; /*connection established */
          });
//A2. Listener for a list of bt speakers to render, data is stored in btSpkrList
  socket.on('speakers', function (data) {
    //console.log(timeStamp(),"From backend: speakers for Bluetooth page", data);
    $('#btSpkrModal').modal('hide');
    renderSpeakers(data); //<----------------------------entry point for backend
    disconnection = false; /*connection established */
          });
//B. Listeners for specific and general messages (toasts) for this page only
socket.on('notiz', function (data) {
  //console.log(timeStamp(),"From backend: settings announcement", data);
  renderDispatch(data);   //<----------------------------entry point for backend
  disconnection = false; /*connection established */
        });
socket.on('herald', function (data) {
  //console.log(timeStamp(),"From backend: general announcement", data);
  renderDispatch(data);   //<----------------------------entry point for backend
  disconnection = false; /*connection established */
                });
//C. Listener for disconnection from Player
  socket.on('connect_error', (error) => {
    if (error && (disconnection === false)) {
      disconnection = true;   /*disconnected */
      $('#btSpkrModal').modal('hide');
      disconnect(); //render disconnect frame once <-----entry point for backend
      // console.log("Internal: disconnected");
      socket.emit('page-opens',{ page: "bluetooth" });
    };
    // else the socket will automatically try to reconnect
    //no action here
  });

}); /* ready function done */


//================================================================ generate HTML
// Building HTML for settings ==================================================
//==============================================================================
/**HTML - render Bluetooth page  - called by entry point renderSettings() below
 * The statusArray is an ordered array of objects - this order is important:
 * [0] {bluetooth: boolean, mac: string},
 * [1] {devices:  [{name: string, mac: string, connected: boolean}...] },
 * [2] {speakers: [{name: string, mac: string, connected: boolean}...] }
 * [3] {isConnected: boolean}
 * @return {html}       of no interest
 */
function renderSettingStates(statusArray) {
  document.getElementById("bluetooth-list").innerHTML = buildSettings(statusArray);
  //setListeners(statusArray);
};
/**HTML - render all HTML strings needed to present Bluetooth state
 * The statusArray is an ordered array of objects - this order is important:
 * [0] {bluetooth:false, mac: ""} - {bluetooth:true, mac:"DC:A6:32:00:32:B2"}
 * [1] {devices: [ {name: "phone",   mac: "34:14:5F:48:32:F8", connected: false },...] }
 * [2] {speakers:[ {name: "bt spkr", mac: "FC:58:FA:ED:57:60", connected: true}, ...] }
 * [3] {isConnected: false} - {isConnected: true}
 * @return {html}       updated html to be rendered
 */
function buildSettings(statusArray){
  let settingsHTML = "";
  if (Array.isArray(statusArray) && (statusArray != [])) {
    let bluetoothState = statusArray[0];
    if (bluetoothState.bluetooth === true) {
      settingsHTML = `
      ${bluetoothStatusHTML(statusArray[0])}
      ${bluetoothSinkHTML(statusArray[2].speakers, statusArray[3].isConnected)}
      ${bluetoothSourceHTML(statusArray[1].devices)}
      `;
      return settingsHTML;
    }
    else {
      settingsHTML = `
      ${bluetoothStatusHTML(false)}
      `;
      return settingsHTML;
    };
  };
  return settingsHTML;
};
//A. HTML build for bluetooth status............................................
function bluetoothStatusHTML(bluetoothFrame) {
  if (bluetoothFrame !== false) {
    return `<ul id="bluetooth-status" class="list-group no-bullet">
      <li class="list-group-item d-flex justify-content-between align-items-center player-list mt-n1 mb-3">
      ${bluetoothOnHTML(bluetoothFrame.mac )}
    </li> </ul>`;
  }
  else {
    return `<ul id="bluetooth-status" class="list-group no-bullet">
    <li class="list-group-item d-flex justify-content-between align-items-center player-list mt-n1 mb-3">
      ${bluetoothOffHTML()}
    </li> </ul>`;
  };
};
//[0] {bluetooth:true, mac:"DC:A6:32:00:32:B2"}
function bluetoothOnHTML(mac){
    return `<div class="col-auto pl-2 pr-0">
      <i class="bluetooth-symbol fab fa-bluetooth-b fa-2x px-2 my-2"></i>
    </div>
    <div class="col-auto pl-0 pr-3">
      <i class="symbol-on fas fa-circle"></i>
    </div>
    <div class="col pl-0">
      <p class="settings-text my-3">Bluetooth is <strong>ON</strong> ${mac}</p>
    </div>
    <div id="disconnect-bluetooth" class="col-auto d-flex justify-content-end align-top p-1">
      <button class="playback-btn" type="button">
        <i class="settings-btn fas fa-times-circle fa-2x" title="Turn-off Bluetooth"></i>
      </button>
    </div>`;
  };
//[0] {bluetooth:false, mac: ""}
function bluetoothOffHTML() {
  return `<div class="col-auto pl-2 pr-0">
    <i class="nobluetooth fab fa-bluetooth-b fa-2x px-2 my-2"></i>
  </div>
  <div class="col-auto pl-0 pr-3">
    <i class="symbol-off fas fa-circle"></i>
  </div>
  <div id="connect-bluetooth" class="col my-2 ml-0 pl-1">
      <button type="button" class="btn usb-root-btn"title="Turn on Bluetooth">
        Turn On Bluetooth
      </button>
    </div>`;
};
//B. HTML build for bluetooth speakers............................................
//[2] {speakers:[ {name: "bt spkr", mac: "FC:58:FA:ED:57:60", connected: true}, ...] }
//[3] {isConnected: false} - {isConnected: true}
function bluetoothSinkHTML(sinkDevices, isConnected) {
  sinkArray = sinkDevices;  //sets GV in order to track devices further on
  let htmlString = "";
  if (sinkDevices.length === 0) {
//1. No speakers are connected or trusted - empty, done!
    htmlString = bluetoothSearchSink(true); //true wraps with a <ul> element
    return htmlString;
  }
  else {
//2. There are speakers, check them out...
    const numberOfDevices = sinkDevices.length;
    let liString = "";
    for (let i = 0; i < numberOfDevices; i++) {
      if (true) {  //list elements needs a space on top ("mt-n1")>
        liString = `<li id="bluetooth" class="list-group-item d-flex justify-content-between
                               align-items-center player-list mt-n1"
                        data-mac="${sinkDevices[i].mac}" data-connected="${sinkDevices[i].connected}">`   ;
      }
      else { //top element... NOT IN USE AT THE MOMENT
        liString = `
        <li id="bluetooth" class="list-group-item d-flex justify-content-between
                               align-items-center player-list"
                        data-mac="${sinkDevices[i].mac}" data-connected="${sinkDevices[i].connected}">`  ;
      };
      if (sinkDevices[i].connected === true) {
//2a. this particular speaker is the connected one
        htmlString = htmlString +
        `${liString}
          <div class="col-auto pl-2 pr-0">
            <i class="bluetooth-symbol fab fa-bluetooth-b fa-2x px-2 my-2"></i>
          </div>
          <div class="col-auto pl-0 pr-3">
            <i class="bluetooth-symbol fas fa-volume-off fa-2x"></i>
          </div>
          <div class="col pl-0">
            <p class="settings-text my-3">
              <strong> ${sinkDevices[i].name} </strong></p>
          </div>
          <div id="disconnect-speaker" class="col-auto d-flex justify-content-end align-top p-1">
            <button class="playback-btn" type="button">
              <i class="settings-btn fas fa-times-circle fa-2x" title="Disconnect speaker for now"></i>
            </button>
          </div>
        </li>`;

      }
      else if (isConnected === false ) {
//2b. this speaker is not connected and no one is connected -> create a button
        htmlString = htmlString +
        `${liString}
        <div class="col-auto pl-2 pr-0">
          <i class="nobluetooth fab fa-bluetooth-b fa-2x px-2 my-2"></i>
        </div>
        <div class="col-auto pl-0 pr-3">
          <i class="nobluetooth fas fa-volume-off fa-2x"></i>
        </div>
        <div id="trusted-speaker" class="col my-3 ml-0 pl-1">
            <button type="button" class="btn reconnect-spkr-btn" title="Reconnect Bluetooth Speaker">
              <span class="settings-text-small-black"> Connect:
              <strong> ${sinkDevices[i].name} </strong> </span>
            </button>
          </div>
            <div id="remove-speaker" class="col-auto d-flex justify-content-end align-top p-1">
                <button class="list-remove-btn" type="button">
                    <i class="settings-btn fas fa-minus-circle fa-2x" title="Remove speaker"></i>
                </button>
            </div>
        </li>`;
      }
      else {
//2c. this speaker is not connected, but another one is -> generate just plain text
        htmlString = htmlString +
        `${liString}
          <div class="col-auto pl-2 pr-0">
            <i class="nobluetooth fab fa-bluetooth-b fa-2x px-2 my-2"></i>
          </div>
          <div class="col-auto pl-0 pr-3">
            <i class="nobluetooth fas fa-volume-off fa-2x"></i>
          </div>
          <div class="col pl-0">
            <p class="my-3">
              <strong> ${sinkDevices[i].name} </strong></p>
          </div>
          <div id="remove-speaker" class="col-auto d-flex justify-content-end align-top p-1">
            <button class="list-remove-btn" type="button">
              <i class="settings-btn fas fa-minus-circle fa-2x" title="Remove speaker"></i>
            </button>
          </div>
        </li>`;
      };
    };
//C. Wrap things up, add help text and create the unordered list <ul> element
    if (isConnected === true) { //there is a speaker on - no scan button frame
      htmlString = `<p class="settings-text-small mt-2 mb-1 pb-0">
                  Status of Bluetooth Speakers:</p>
      <ul id="bluetooth-sink" class="list-group no-bullet">` + htmlString + `</ul>`
      return htmlString;
    }
    else {  //all speakers are off - add the scan button frame at top.
      let scanString = bluetoothSearchSink(false);  //<ul> is added here (see below)
      htmlString = `<p class="settings-text-small mt-2 mb-1 pb-0">
                  Bluetooth Speakers:</p>
      <ul id="bluetooth-sink" class="list-group no-bullet">`+ scanString + htmlString + `</ul>`
      return htmlString;
    };
  };
};
//Helper to create the scan for speaker button. Produces the scanString above...
function bluetoothSearchSink(isSolo) {
  let htmlString = ""
  htmlString = ( `
  <li class="list-group-item d-flex justify-content-between align-items-center player-list mt-n1">
  <div class="col-auto pl-2 pr-0">
    <i class="nobluetooth fab fa-bluetooth-b fa-2x px-2 my-2"></i>
  </div>
  <div class="col-auto pl-0 pr-3">
    <i class="nobluetooth fas fa-volume-off fa-2x"></i>
  </div>
  <div id="scan-speaker" class="col my-3 ml-0 pl-1">
      <button type="button" class="btn usb-root-btn"title="Scan for Bluetooth Speaker">
        Scan for Bluetooth Speaker
      </button>
    </div>
  </li>` );
  //If there are no speakers to be listed just wrap things up with a <ul>
  if (isSolo === true) {
    htmlString = ( `
    <ul id="bluetooth-sink" class="list-group no-bullet">` + htmlString + `</ul>` )
  }
  return htmlString;
};
//B2.HTML build for modal with bt speakers, also renders the modal
function renderSpeakerModal(speakerArray) {
  let htmlString = "";
  const numberOfDevices = speakerArray.length;
  for (let i = 0; i < numberOfDevices; i++) {
    htmlString = htmlString +
    ` <a href="#" class="list-group-item list-group-item-action scan-list playback-text mb-1"
                onclick="connectSpeaker(${i})">
                 ${sixSpaces} ${speakerArray[i].name} ${sixSpaces} </a>`;
  };
  document.getElementById("btspkr-available").innerHTML = htmlString;
  $('#btSpkrModal').modal('show');
};

//C. HTML build for bluetooth devices (phones are sources)......................
//[1] {devices: [ {name: "phone",   mac: "34:14:5F:48:32:F8" } connected: true,...] }
function bluetoothSourceHTML(sourceDevices) {
  //console.log(timeStamp(), "SourceHTML: the array:", sourceDevices);
  if (sourceDevices.length === 0) {
    return `<p class="settings-text-small mt-2 mb-1 pb-0">
                Status Bluetooth Devices:</p>
    <ul id="bluetooth-source" class="list-group no-bullet">
    <li class="list-group-item d-flex justify-content-between
                                      align-items-center player-list mt-n1 ">
    <div class="col-auto pl-2 pr-0">
      <i class="nobluetooth fab fa-bluetooth-b fa-2x px-2 my-2"></i>
    </div>
    <div class="col-auto pl-0 pr-3">
      <i class="nobluetooth fas fa-mobile-alt fa-2x"></i>
    </div>
    <div class="col pl-0">
      <p class="settings-text my-3">No devices connected</p>
    </div>
    </li>
    </ul>
    `  ;
  }
  else {
    const numberOfDevices = sourceDevices.length;
    let htmlString = ""
    let liString = ""
    for (let i = 0; i < numberOfDevices; i++) {
      let isConnected = sourceDevices[i].connected;
      if (true) {  //list elements needs a space on top ("mt-n1")
        liString = `<li id="bluetooth" class="list-group-item d-flex justify-content-between
                                              align-items-center player-list mt-n1"
                                    data-mac="${sourceDevices[i].mac}">`  ;
      }
      else {      //top phone needa a mt-n1  -- NOT IN USE AT THE MOMENT
        liString = `<li id="bluetooth" class="list-group-item d-flex justify-content-between
                                              align-items-center player-list"
                                    data-mac="${sourceDevices[i].mac}">`   ;
      };
      //console.log(timeStamp(), "SourceHTML: <if> connected?", sourceDevices[i].connected);
      if (isConnected === true) {
        //2a. this particular phone is connected
        htmlString = htmlString +
        `${liString}
          <div class="col-auto pl-2 pr-0">
            <i class="bluetooth-symbol fab fa-bluetooth-b fa-2x px-2 my-2"></i>
          </div>
          <div class="col-auto pl-0 pr-3">
            <i class="bluetooth-symbol fas fa-mobile-alt fa-2x"></i>
          </div>
          <div class="col pl-0">
            <p class="settings-text my-3">
              <strong> ${sourceDevices[i].name} </strong></p>
          </div>
          <div id="disconnect-device" class="col-auto d-flex justify-content-end align-top p-1">
            <button class="sourcedevice-btn" type="button">
              <i class="settings-btn fas fa-times-circle fa-2x" title="Disconnect"></i>
            </button>
          </div>
        </li>`
/*
      }
      else if (false) { //NOT IN USE since reconnect of a phone is not allowed
        //2b. this phone is not connected and no one is connected -> create a button
        htmlString = htmlString +
        `${liString}
        <div class="col-auto pl-2 pr-0">
          <i class="nobluetooth fab fa-bluetooth-b fa-2x px-2 my-2"></i>
        </div>
        <div class="col-auto pl-0 pr-3">
          <i class="nobluetooth fas fa-mobile-alt fa-2x"></i>
        </div>
        <div id="trusted-phone" class="col my-3 ml-0 pl-1">
            <button type="button" class="btn reconnect-spkr-btn" title="Reconnect Bluetooth Device">
              <span class="settings-text-small-black"> Connect:
              <strong> ${sourceDevices[i].name} </strong> </span>
            </button>
          </div>
            <div id="remove-phone" class="col-auto d-flex justify-content-end align-top p-1">
                <button class="list-remove-btn" type="button">
                    <i class="settings-btn fas fa-minus-circle fa-2x" title="Unpair Device"></i>
                </button>
            </div>
        </li>`; */
      }
      else {
        //2c. this phone is not connected -> generate just plain text
        htmlString = htmlString +
        `${liString}
          <div class="col-auto pl-2 pr-0">
            <i class="nobluetooth fab fa-bluetooth-b fa-2x px-2 my-2"></i>
          </div>
          <div class="col-auto pl-0 pr-3">
            <i class="nobluetooth fas fa-mobile-alt fa-2x"></i>
          </div>
          <div class="col pl-0">
            <p class="my-3">
              <strong> ${sourceDevices[i].name} </strong></p>
          </div>
          <div id="remove-speaker" class="col-auto d-flex justify-content-end align-top p-1">
            <button class="list-remove-phone-btn" type="button">
              <i class="settings-btn fas fa-minus-circle fa-2x" title="Unpair Device"></i>
            </button>
          </div>
        </li>`;
      };
    };  //End of loop
//C. Wrap things up, add help text and create the unordered list <ul> element
    htmlString = `<p class="settings-text-small mt-2 mb-1 pb-0">
                Bluetooth Devices:</p>
    <ul id="bluetooth-source" class="list-group no-bullet">` +
    htmlString + emptyEndItem() + `</ul>`  ;
    return htmlString;
  };
};
//empty ending item is appended, avoids last device being blocked by nav bar
function emptyEndItem() {
  return `<li id="the-end" class="end-element bg-inner list-group-item">
        <div class="end-text">
        <p end-text> <br>&nbsp;&nbsp;</p> </div>
        </div>
    </li>
     `;
};

//********************************************************************** Buttons
//Buttons **********************************************************************
//Set up listeners for buttons**************************************************
function setListeners(connectionsArray) {
const thisArray = connectionsArray;
//A. Bluetooth turn-off/turn-on
  if(thisArray[0].bluetooth === true) {
    $("#disconnect-bluetooth").on('click', function() {
      //console.log("A1. turn-off the Bluetooth");
      turnoffBluetoothClicked($(this));
    });
  }
  else {
    $("#connect-bluetooth").on('click', function() {
      //console.log("A2. turn-on the Bluetooth");
      turnonBluetoothClicked($(this));
    });
  };
//B. Bluetooth Speaker scan for/disconnect (audio sink device)
if(thisArray[2].speakers.length !== 0 ) {
  //only one disconnect button - use element id
  $("#disconnect-speaker").on('click', function() {
    //console.log("B1. disconnect the speaker");
    disconnectSpeakerClicked($(this));
  });
  //might be one or more - use class .list-remove-btn
  $(".list-remove-btn").on('click', function() {
    //console.log("B2. remove the speaker");
    removeSpeakerClicked($(this));
  });
  //might be one or more - use class .playback-btn
  $(".reconnect-spkr-btn").on('click', function() {
    //console.log("B3. reconnect trusted speaker");
    connectSpeakerAgainClicked($(this));
  });
  //only one scan button - use element id
  $("#scan-speaker").on('click', function() {
    //console.log("B4. scan for speakers");
    scanSpeakerClicked($(this));
  });
}
else {//only scan for bt speakers button needed here
  $("#scan-speaker").on('click', function() {
    //console.log("B4. scan for speakers");
    scanSpeakerClicked($(this));
  });
};
//C. Bluetooth device disconnect (audio source device = phone)
if(thisArray[1].devices.length !== 0) {
  //console.log("Going to set a listener for disconnect a phone");
  $(".sourcedevice-btn").on('click', function() {
    //console.log("C. disconnect a phone"); ight be one or more
    disconnectDeviceClicked($(this));
    });
  };
  //for disconnected sources, might be one or more - use class .list-remove-btn
  $(".list-remove-phone-btn").on('click', function() {
    //console.log("C2. remove the PHONE");
    removePhoneClicked($(this));
  });
};
//----------------------------------------------------------
// A. Bluetooth button functions ---------------------------
/**HTML and DOM - turns OFF Bluetooth - calls backend, sets up listener.
 * Changes settings to  Bluetooth connect button.
 * @param   {DOM jQuery}  buttonElement clicked button element DOM jQuery
 * @return {boolean}      true
 */
function turnoffBluetoothClicked(buttonElement) {
  let parentElement = buttonElement.parent();
  buttonElement.remove();
  parentElement.append(`
    <ul>
<div id="bluetooth-waiting-spinner" class="col-auto d-flex justify-content-start ml-3 pl-0">
  <div class="spinner-border loading-symbol" role="status">
    <span class="sr-only"></span>
  </div>
  </ul>`);
  //console.log("To backend:(disconnect-bluetooth',{network: true }");
  socket.emit('disconnect-network',{ network: "bluetooth" });
  //update html
  /*
  buttonElement.parent().html(bluetoothOffHTML());
  $("#connect-bluetooth").on('click', function() {
    // console.log("A2. turn-on the Bluetooth");
    turnonBluetoothClicked($(this));
  });*/
  return true;
};
/**HTML and DOM - turns ON Bluetooth - calls backend, sets up listener.
 * Shows spinner during connection. Changes settings to Bluetooth on text.
 * @param   {DOM jQuery}  buttonElement clicked button element DOM jQuery
 * @return {boolean}      true
 */
function turnonBluetoothClicked(buttonElement) {
  let parentElement = buttonElement.parent();
  buttonElement.remove();
  parentElement.append(`
    <ul>
<div id="bluetooth-waiting-spinner" class="col-auto d-flex justify-content-start ml-3 pl-0">
  <div class="spinner-border loading-symbol" role="status">
    <span class="sr-only"></span>
  </div>
  </ul>`);
  //console.log("To backend:(connect-network,{network: bluetooth })");
  socket.emit('connect-network', { network: "bluetooth" });
  //When connection is up
  /*
  parentElement.html(bluetoothOnHTML());
  //Set button again
  $("#disconnect-bluetooth").on('click', function() {
    console.log("A1. turn-off the Bluetooth");
    turnoffBluetoothClicked($(this));
  });*/
  return true;
};

// B. Bluetooth Speaker functions ------------------------------
/**HTML and DOM - user wants to scan for Bluetooth speakers
 * Send the request to backend, if there are any backend will eventually
 * correspond with a "speakers" call on socket (see A2. above)
 * @param  {DOM jQuery} buttonElement connect button DOM jQuery
 * @return {boolean}  true
 */
function scanSpeakerClicked(buttonElement) {
  //console.log("To backend:(scan-speakers, true)");
  $('#btSpkrModal').modal('hide'); //there might be a modal up, better hide
  /*
  if (buttonElement === false) {
    $('#btSpkrModal').modal('hide');
  };*/
  socket.emit('scan-speakers', true);
  return true;
};
/**Called from HTML/DOM - user has choosen a bt speaker and it is time to connect.
 * Used by the modal element showing bt speakers when a speaker is clicked.
 * This function executes the 'onclick' attribute of HTML in modal, 'arrayIndex'
 * is the argument stored in the onclick attribute created by renderSpeakerModal(),
 * the connection continues with waiting for backend to emit a "speakers"
 * call on socket (see A2. above).
 * Also the modal is hidden and the page is rerendered.
 * @param  {integer}    arrayIndex, index for the global variable btSpkrList
 * @global {btSpkrList} read the speaker object, reset btSpkrList to []
 * @return {boolean}    true
 */
function connectSpeaker(arrayIndex) {
  //console.log("To backend:(connect-speaker,", btSpkrList[arrayIndex],") -- onclick call");
  socket.emit('connect-speaker', btSpkrList[arrayIndex]);
  $('#btSpkrModal').modal('hide');
  btSpkrList = [];
  return true;
};
/**Called from HTML/DOM - user has choosen to disconnect a bt speaker.
 * Either it can be a connected speaker and it will be disconnected, but still
 * trusted by the machine and shown on frontend.
 * @param  {DOM jQuery} buttonElement disconnect button DOM jQuery
 * @return {?}    of no interest
 */
function disconnectSpeakerClicked(buttonElement) {
  let parentElement = $(buttonElement).parent();
  let mac = parentElement.attr("data-mac");
  //console.log('To backend: (disconnect-speaker, {mac:', mac, "mode: false})");
  socket.emit('disconnect-speaker', {mac: mac, mode: false});
};
/**Called from HTML/DOM - user has choosen to reconnect a trusted bt speaker.
 * The name has to be locked up at backend, 'name: false'.
 * @param  {DOM jQuery} buttonElement reconnect button DOM jQuery
 * @return {?}    of no interest
 */
function connectSpeakerAgainClicked(buttonElement) {
  let parentElement = $(buttonElement).parent();
  let grandParentElement = $(parentElement).parent();
  let mac = grandParentElement.attr("data-mac");
  //console.log('To backend: (connect-speaker, {mac: mac, name: false})");
  socket.emit('connect-speaker', {mac: mac, name: false});
};
/**Called from HTML/DOM - user has choosen to remove an already disconnected
 * bt speaker that is still trusted and thus rendered at frontend. Untrust!
 * @param  {DOM jQuery} buttonElement remove button DOM jQuery
 * @return {?}    of no interest
 */
 function removeSpeakerClicked(buttonElement) {
   let parentElement = $(buttonElement).parent();
   let grandParentElement = $(parentElement).parent();
   let mac = grandParentElement.attr("data-mac");
   console.log('To backend: (untrust-speaker, {mac:', mac,"})");
   socket.emit('untrust-speaker', {mac: mac, type: "speaker"});
};

/**Called from HTML/DOM - user has choosen to remove an already disconnected
 * bt phone that is still trusted and thus rendered at frontend. Untrust!
 * @param  {DOM jQuery} buttonElement remove button DOM jQuery
 * @return {?}    of no interest
 */
 function removePhoneClicked(buttonElement) {
   let parentElement = $(buttonElement).parent();
   let grandParentElement = $(parentElement).parent();
   let mac = grandParentElement.attr("data-mac");
   //console.log('To backend: (untrust-speaker, {mac:', mac, ", type: phone})");
   socket.emit('untrust-speaker', {mac: mac, type: "phone"});
};
/**Called from HTML/DOM - user has choosen to disconnect a source, a phone.
 * @param  {DOM jQuery} buttonElement remove button DOM jQuery
 * @return {?}    of no interest
 */
function disconnectDeviceClicked(buttonElement) {
  let parentElement = $(buttonElement).parent();
  let grandParentElement = $(parentElement).parent();
  let mac = grandParentElement.attr("data-mac");
  //console.log('To backend: (disconnect-device, {mac:', mac,"})");
  socket.emit('disconnect-device', {mac: mac});
}

//=============================================================================
// Functions called by backend ================================================
// render settings frames
//=============================================================================
/**HTML and DOM - render all the settings - called from backend  --> entry point
 * Render the settings
 * @param  {JSON} settings status array
 * @return {boolean}  true
 */
 function renderSettings(settings) {
   //fixes after reconnection
   //document.getElementById("bluetooth-list").hidden = false;
   //render the page and set the required listener
   if (settings) {
     renderSettingStates(settings);
     setListeners(settings);
   };
   return true;
 };
 /**HTML and DOM - render available Bluetooth speakers in Modal mode --> entry point
  * Format: [{ name: 'HR Port Spkr', mac: 'FC:58:FA:CC:30:A4' }, ... ]
  * @param  {JSON} speakerArray status array
  * @return {boolean}  true
  */
function renderSpeakers(speakerArray) {
  //console.log("Entry point renderSpeakers------------");
  if (speakerArray) {
    notyf.dismissAll();
    btSpkrList = speakerArray;  //used for index at on-click in HTML/DOM
    //console.log("Speakers saved in:",btSpkrList );
    renderSpeakerModal(speakerArray);
    //setMenuListeners();
  };
};
 /**HTML and DOM - disconnect from backend
  * Render a disconnected message
  * @return {boolean}  true
  */
 function disconnect() {
   //$("#bluetooth-list").hide();
   //document.getElementById("bluetooth-list").hidden = true;

   let message = `<ul class="list-group no-bullet">
    <li class="list-group-item d-flex error-list ">
      <div class="disconnect-text"> <br> <br> &nbsp; ERROR: disconnected from the Player<br> <br> <br> </div>
      </li>
   </ul> `;
   document.getElementById("bluetooth-list").innerHTML = message;
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
function timeStamp() {
  const d = new Date();
  return`${`0${d.getHours()}`.slice(-2)}:${`0${d.getMinutes()}`.slice(-2)}:${`0${d.getSeconds()}`.slice(-2)}:${`00${d.getMilliseconds()}`.slice(-3)}`;
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
