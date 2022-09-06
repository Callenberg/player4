//Copyright 2022 by Retro Audiophile Designs
//see license.txt¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨
//      ~ Front end code for Player USB-list of RAD Player ~

//Incoming frame data format:
//{ streaming: boolean, list: [content object] }
//where content object format is:                 - the list array can be empty
//{ type: string, path: uri, duration: string, Title:string, Artist:string,
// Album:string }; object -- empty array means no USB is attached

//Out going frame data format: see trackConstructor() at bottom
//{ songId: false, duration: float, Title: string,
//  Artist: string, Album: string, albumart: "", path: string) },

//Global Variables
var socket = io.connect(); //used for communication with backend
var disconnection = false; //true if there has been a disconenction
var isStreaming = false;   //the machine is busy streaming
var notyf = new Notyf();    //the dispatcher for toasts
//Render on page show events====================================================
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === 'visible') {
    // console.log("Internal: ++++ tab is visible again ++++");
    socket.emit('page-opens',{ page: "usb" });//       presence call to backend!
  };
});
window.addEventListener('focus', function(){
  // console.log(timeStamp(), "Internal: ==== window is in focus again ====");
  socket.emit('page-opens',{ page: "usb" });  //  presence call to backend!
});
//______________________________________________________________________________
//USBlist on load ========================================================= Init
$(document).ready(function() {

// A. Top folder button - set up only once
$("#root").on('click', function() {
// console.log("Btn - A; to root");
    backToTopFolder();
    });

    // iOS web app full screen hacks.
    if(window.navigator.standalone == true) {
     // make all link remain in web app mode.
     $('a').click(function() { window.location = $(this).attr('href');
                 return false;
                     });
                   };

//Set up socket.io listener events at start up
// console.log("To backend: connect with (page-opens',{ page: usb }), on socket", socket);
socket.emit('page-opens',{ page: "usb" });//           presence call to backend!
socket.on("clear-dispatch", function () {
  notyf.dismissAll();
});
//A. Main listener for rerendering of page
socket.on('open-folder', function (data) {
  // console.log("From backend: show folder content", data);
  renderFolder(data); //                         render entry point for backend!
  disconnection = false; /*connection established */
        });
//B. Listeners for specific or general messages (toasts)
socket.on('flash', function (data) {
    // console.log("From backend: settings announcement", data);
    renderFlash(data);   //<----------------------------entry point for backend
    disconnection = false; /*connection established */
                });
socket.on('herald', function (data) {
    // console.log("From backend: general announcement", data);
    renderFlash(data);   //<----------------------------entry point for backend
    disconnection = false; /*connection established */
                        });
socket.on('connect_error', (error) => {
  if (error && (disconnection === false)) {
    disconnection = true; /*disconnected */
    disconnect(); /*render disconnect frame */
    // console.log("Internal: disconnected");
    socket.emit('page-opens',{ page: "usb" });
  };
  // else the socket will automatically try to reconnect - no action here
     });
});                                                     /* end ready function */

//================================================================ toast handler
//{type: error|info|done|long, missive: "text", duration: msec [optional]]}
function renderFlash(data) {
  switch(data.type) {
//Bluetooth off
    case "error":
    errorFlash(data.missive, data.duration);
    break;
    case "done":
    doneFlash(data.missive);
    break;
    case "info":
    infoFlash(data.missive);
    break;
    case "mishap":
    mishapFlash(data.missive, data.duration);
    break;
    case "long":
    infoFlash(data.missive, data.duration);
    break;
    default:
    infoFlash(data.missive);
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

function errorFlash(missive, duration) {
  duration = duration || longDuration;
  notyf.error({
      message: missive,
      duration: duration,
      background: errorColor,
      position: {x:'center',y:'top'},
      dismissible: true
    });
};

function infoFlash(missive, duration) {
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

function doneFlash(missive, duration) {
  duration = duration || normalDuration;
  notyf.success({
    message: missive,
    duration: normalDuration,
    background: okayColor,
    position: {x:'center',y:'top'},
    dismissible: true
  });
};

function mishapFlash(missive, duration) {
  duration = duration || longDuration;
  notyf.success({
    message: missive,
    duration: normalDuration,
    background: oopsColor,
    position: {x:'center',y:'top'},
    dismissible: true,
    icon: false
  });
};

//==============================================================================
//................................................................... build HTML
// Builds the USB folder content list from an array
// Backend calls renderFolder and calls renderFolderlist which calls this fn.
// If folderContenArray === [], then there is no USB attached.
function buildContentUSB(folderContentArray){
  let listContent ="";
  if(Array.isArray(folderContentArray) && (folderContentArray.length > 0)) {
    let folderItems = folderContentArray.length;
    //First step: generate HTML for present folder, it is always on top
    listContent =`<li id="present-folder" class="list-group-item d-flex justify-content-between align-items-center folder-list" data-path="${folderContentArray[0].path}" data-title-path="/${folderContentArray[0].Title}">
    <button id="add-folder" class="list-btn" type="button" title="Add Folder" data-toggle="tooltip">
      <p><i class="icon folder-up"></i><br><b><em>${folderContentArray[0].Title}</em></b>
    </button>
    <button id="parent-folder" class="list-remove-btn" type="button" title="Up one level">
      <i class="icon open-folder"></i> </button></li>
      `;
      //Second step: generate HTML for 1. a track or 2. a subfolder to the present folder
      for(i = 1; i < folderItems; i++) {
        if(folderContentArray[i].type == "file") {
          //1: generate track list element . . .
          let path = folderContentArray[i].path
          let title = patchUpTitle(folderContentArray[i].Title, path);
          let artist = patchUpArtistOrAlbum(folderContentArray[i].Artist);
          let album = patchUpArtistOrAlbum(folderContentArray[i].Album);
          listContent +=
          `<li class="list-group-item d-flex justify-content-between align-items-center player-list" data-path="${path}" data-duration="${folderContentArray[i].duration}" data-tracktitle="${title}" data-artist="${artist}" data-album="${album}">
          <button class="list-btn list-track-btn" type="button" title="Add Track" data-toggle="tooltip">
            <div class="row list-row">
              <div class="col-auto title-icon align-top"><i class="icon track"></i></div> <div class="col list-element d-flex align-items-start"><b>${title}</b></div>
              </div>
            <div class="row list-row ">
              <div class="col-auto artist-icon align-top"><i class="icon artist"></i></div> <div class="col list-element d-flex align-items-start">${artist}</div>
              </div>
            <div class="row list-row">
              <div class="col-auto album-icon align-top"><i class="icon album"></i></div> <div class="col list-element-bottom d-flex align-items-start "><em>${album}</em></div>
              </div>
            </button>
          <button class="list-remove-btn list-play-btn" type="button" title="Add & Play Track" data-toggle="tooltip">
              <i class="icon play"></i>
            </button>
          </li>
           `;
        }
     else {
       //2.  . . . or generate sub folder list element
      listContent +=
      `<li class="list-group-item d-flex justify-content-between align-items-center folder-list" data-path="${folderContentArray[i].path}"  >
      <button class="list-btn list-folder-btn align-self-center" type="button" title="Add Folder" data-toggle="tooltip">
        <p><i class="icon folder-open"></i><br>${folderContentArray[i].Title}</p>
      </button>
        <button id="open-folder" class="list-remove-btn list-open-folder-btn" type="button" title="Open Folder">
          <i class="icon folder"></i>
        </button>
      </li>
      `;
    };};
    //Last step: at end always add a trailing empty list element
    listContent +=
    `<li id="the-end" class="end-element bg-inner list-group-item">
          <div class="end-text">
          <p end-text> <br>&nbsp;&nbsp;</p> </div>
          </div>
      </li>
       `;
  return listContent;
}
else {//no USB attached generate HTML for an empty slot
  listContent =   `<li id="the-end" class="end-element bg-inner list-group-item">
          <div class="disconnect-text">
          <p end-text> <br>&nbsp;No USB attached!&nbsp;</p> </div>
          </div>
      </li>
       `;
       return listContent;
     };
   };
//................................................................ render HTML
/**HTML and DOM - inserts HTML built by buildContentUSB() and render
 * Inserts the HTML code in the <ul> element with id = #directory-content.
 * @param  {string}       parentElement is id #directory-content
 * @param  {array}        folderArray usb information given by backend
 * @return {boolean}      true
 */
function renderFolderList(parentElement, folderArray) {
    $(parentElement).html(buildContentUSB(folderArray));
};
//Define undefined metadata, if undefined title becomes file name . . .
function patchUpTitle(title, path) {
  if ((title == undefined) || (title == null)) {
    let pathIndex = path.lastIndexOf("/")
    let stopIndex = (path.lastIndexOf(".") > - 1) ?
      (path.lastIndexOf(".")) :
      (path.length);
    return path.slice((pathIndex + 1), (stopIndex));
  } else return title;
};
//Define undefined metadata, if undefined it becomes "---"
function patchUpArtistOrAlbum(information) {
  if (information == undefined || (information == null)) {
    return "---";
  } else return information;
};
//******************************************************************************
//Buttons ************************************************************ listeners
function allListeners() {
// console.log("Internal: set up listeners");
//$(document).ready(function() {

//B. Folder up button
$("#parent-folder").on('click', function() {
  // console.log("Btn - B; up one level");
  upOneFolderButtonClicked($(this));
  });

//C. Add all content of present folder to playlist button
$("#add-folder").on('click', function() {
 // console.log("Btn - C; add  this folder");
  if (isStreaming === false) {
    //$(this).tooltip('show');
    addFolderClicked($(this));
  }
  else {
    // console.log("Internal: machine says it is busy streaming ~~~~~~~~~~~~~~~~");
  };
  });

//D. Add clicked track to playlist button
$(".list-track-btn").on('click', function() {
   // console.log("Btn - D; add file");
  if (isStreaming === false) {
    //$(this).tooltip('show');
    addFileClicked($(this));
  }
  else {
    // console.log("Internal: machine says it is busy streaming ~~~~~~~~~~~~~~~~");
  };
  });

//E. Play clicked track (and add to playlist) button
$(".list-play-btn").on('click', function() {
   // console.log("Btn - E; play file");
  if (isStreaming === false) {
    //$(this).tooltip('show');
    playFileClicked($(this));
  }
  else {
    // console.log("Internal: machine says it is busy streaming ~~~~~~~~~~~~~~~~");
  };
  });

//F. Open clicked folder button
$(".list-open-folder-btn").on('click', function() {
 // console.log("Btn - F; open folder");
          openFolderClicked($(this));
          });

//G. Add all content of folder button that is not the present folder
$(".list-folder-btn").on('click', function() {
   // console.log("Btn - G; add files of folder");
  if (isStreaming === false) {
    //$(this).tooltip('show');
    addFolderClicked($(this), true);
  }
  else {
    // console.log("Internal: machine says it is busy streaming ~~~~~~~~~~~~~~~~");
  };
          });

//});
};
//******************************************************************************
// A. Top folder button functions ------------------- to Top Folder / to root A.
/**HTML and DOM - find DOM element that was clicked
 * Render the top folder provided by backend. Key string: "get root for usb"
 * @backend {usb}          calls backend, with { folder: "get root for usb" }
 * @return  {boolean}      true
 */
function backToTopFolder() {
  // console.log("To backend: (usb, { folder: get root for usb }) - confirmed.");
  socket.emit('usb',{ folder: "get root for usb" });
  return true;
};

// B. Folder up button functions ------------------------------ one Folder up B.
/**HTML and DOM - find DOM element that was clicked
 * Render the parent folder stored in "data-path" of the element.
 * @param   {DOM}      element button element in DOM
 * @backend {usb}      calls backend; { folder: parentElement.attr("data-path")}
 * @return  {boolean}  true
 */
function upOneFolderButtonClicked(element){
  var parentElement = $(element).parent();
  // console.log("To backend: (usb, { folder: ", parentElement.attr("data-path"), "}) - confirmed.");
  socket.emit('usb',{ folder: parentElement.attr("data-path") });
  return true;
};
//C. Add folder button functions -----clicked folder icon--------- add Folder C.
/**HTML and DOM - find DOM element that was clicked
 * Add content of current folder to playlist. Calls backend.
 * if the folder is the present folder at top of list, isTitle has to be added.
 * If at root, usb cannot have isTitle appended - - -
 * @param  {DOM}         element button element in DOM
 * @backend {add-folder} calls backend; { folder: path }
 * @return {boolean}     true
 */
function addFolderClicked(element, noTitle) {
  var parentElement = $(element).parent();
  let path = `${parentElement.attr("data-path")}`
  let isTitle = parentElement.attr("data-title-path");
  if ((isTitle !== "/Top folder") && (noTitle === undefined)) {
  path = path + isTitle //isTitle is only used for present folder
  };
  //console.log("To backend: (add-folder, {", path, "}) - confirmed!");
  infoFlash(`${sixSpaces} Added Folder ${sixSpaces}`); //notice called made at frontend
  socket.emit('add-folder',{ folder: path });
  return true;
  };
//D. Add track button functions ----------------------------------- add Track D.
/**HTML and DOM - find DOM element that was clicked
 * Add clicked track to playlist, trackConstructor builds track - call backend.
 * @param  {DOM}        element button element in DOM to be added
 * @backend {add-track} calls backend; { track js object }
 * @return {boolean}    true
 */
function addFileClicked(element) {
  var parentElement = $(element).parent();
  // console.log("To backend: (add, (add-track, ", trackConstructor(parentElement), ")");
  infoFlash(`${sixSpaces} Added Track ${sixSpaces}`); //notice called made at frontend
  socket.emit('add-track',trackConstructor(parentElement));
  return true;
  };
//E. Play (and add to playlist) button functions------------------------ Play E.
/**HTML and DOM - find DOM element that was clicked
 * Add clicked track to playlist and start playing - call backend.
 * @param  {DOM}        element track element in DOM to be played
 * @backend {play-usb}  calls backend; { track js object }
 * @return {boolean}    true
 */
function playFileClicked(element) {
  var parentElement = $(element).parent();
  // console.log("To backend: (play-usb, {folder: ", trackConstructor(parentElement), "})");
  infoFlash(`${sixSpaces} Play Track ${sixSpaces}`); //notice called made at frontend
  socket.emit('play-usb',trackConstructor(parentElement));
  return true;
};

//F. Open clicked folder in list button functions---------------- open Folder F.
/**HTML and DOM - find DOM element that was clicked
 * Request folder content and render - call backend.
 * @param  {DOM} element folder element in DOM to be opened
 * @backend {usb}  calls backend; { folder: parentElement.attr("data-path") }
 * @return {boolean}  true
 */
function openFolderClicked(element) {
  var parentElement = $(element).parent();
  // console.log("To backend: (usb, { folder: ", parentElement.attr("data-path"), "})");
  socket.emit('usb',{ folder: parentElement.attr("data-path") });
  return true;
};
//G. see C. above, same procedure, clicked folder element -------- add Folder G.

//=========================================================== called by back-end
//Functions called by backend; render-folder,                       Entry point
//==============================================================================
/**HTML and DOM - entry point for rendering, called by backend
 * Render the folder and file information provided by backend in an array.
 * First element of the array is the present folder, {type: parent}, if there
 * are any sub-folders {type: folder}, they are next and last the track(s)
 * (audio files) will show up, {type: file}, there is always a present folder.
 * Building and rendering USB folder content list from an array on format:
 * { type: string, path: uri, duration: string, Title:string, Artist:string,
 *  Album:string }  ,whereas type: is parent | folder | file.
 * NOTE: capital letters T and A are inherited from mpd - inconsistency!!
 * @param  {JSON}       array folder content in an arry to be rendered in DOM
 * @global {disconnect} true, if there was a disconnection
 * @return {boolean}    true
 */
function renderFolder(data) {
  disconnect && $("#nav-bar").show();  /* fixes after reconnect */
  isStreaming = data.streaming;
  renderFolderList("#directory-content", data.list);
  // console.log("Internal: rendering folder content")
  //have to set up the event handlers as well . . .
  allListeners();
  return true;
};
/**HTML and DOM - render disconnected message
 * If backend disconnects a disconnect message is rendered
 * @return {boolean}  true
 */
function disconnect() {
    $("#nav-bar").hide();
    let message =
    `<li id="disconnected" class="error-list">
    <div class="disconnect-text"> <br> <br>ERROR: disconnected from the Player<br> <br> <br> </div>
    </li>
     `;
    $("#directory-content").html(message)
    notyf.error({
        message: "Disconnected from Player",
        duration: lastingDuration,
        background: errorColor,
        position: {x:'center',y:'center'},
        dismissible: true
      });
    return true;
};
//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ Auxiliary function
//Unfortunately capital T and A's in property names are inherited from mpd
/**HTML and DOM - gets the track information from the DOM
 * The parentElement is the <li> element.
 * @param  {element}  parentElement, the "data-" attribute holds the information
 * @return {boolean}  true
 */
function trackConstructor(parentElement) {
  return {
  songId:false,
  duration: parentElement.attr("data-duration"),
  Title: parentElement.attr("data-tracktitle"),
  Artist: parentElement.attr("data-artist"),
  Album: parentElement.attr("data-album"),
  albumart: "",
  path: parentElement.attr("data-path")
  };
};
