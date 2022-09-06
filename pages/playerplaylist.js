//Copyright 2022 by Retro Audiophile Designs
//see license.txt¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨
//      ~ Front end code for Playlist Page of RAD Player ~
//Incoming frame data format:
//{ streaming: boolean, markedTrack: boolean or track, playing: boolean,
//  list: [track object] }
//track object format:                 - the list array can be empty
// { songId: integer, duration: integer, Title: string, Artist: string, Album:
//  string, albumart: url as a string, path: mpd uri as a string }

//Global Variables
var socket = io.connect();  //used for communication with backend
var playlistArray = [];     //the actual playlist rendered in browser
var playlistState = false;  //track that is marked as being current, might play
var isPlaying = false;      //the marked track is playing
var isStreaming = false;    //the machine is busy streaming
var disconnection = false;  //true if there has been a disconnect
var notyf = new Notyf();    //the dispatcher for toasts

//Render on page show events====================================================
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === 'visible') {
    //console.log("Internal: ++++ tab is visible ++++");
    socket.emit('page-opens',{ page: "playlist" }); // presence call to backend!
  };
});
window.addEventListener('focus', function(){
  // console.log(timeStamp(), "Internal: ==== window is in focus again ====");
  socket.emit('page-opens',{ page: "playlist" });  //  presence call to backend!
});
//______________________________________________________________________________
//Playlist page on load ====================================== start-up sequence
$(document).ready(function() {
  // A. Listener - clear the playlist button, always exists...permanent listener
  $("#clear-all").on('click', function() {
    // console.log("A. clear playlist.");
    if (isStreaming === false) {
      clearAll();
    }
    else {
      // console.log("Internal: machine says it is busy streaming ~~~~~~~~~~~~~~~~");
    };
    });
    // iOS web app full screen hacks........................................ iOS
   if(window.navigator.standalone == true) {
     // make all link remain in web app mode.
     $('a').click(function() { window.location = $(this).attr('href');
                 return false;
                     });
                   };
    //Set up socket.io listener event for connections................. socket.io
    // console.log("Do we have a socket?", socket);
    socket.emit('page-opens',{ page: "playlist" });//  presence call to backend!
    socket.on("clear-dispatch", function () {
      notyf.dismissAll();
    });
//A. Main listener for rerendering of page
    socket.on('render', function (data) {
      //console.log("From backend: render playlist\n", data);
      renderPlaylist(data); //                   render entry point for backend!
      disconnection = false; /* connection established */
        });
//B. Listeners for specific or general messages (toasts)
    socket.on('bulletin', function (data) {
      // console.log("From backend: player list announcement", data);
      renderBulletin(data);   //<------------------------entry point for backend
      disconnection = false; /*connection established */
                });
    socket.on('herald', function (data) {
      // console.log("From backend: general announcement", data);
      renderBulletin(data);   //<------------------------entry point for backend
      disconnection = false; /*connection established */
                        });
//C. Listener for diconnection from Player
    socket.on('connect_error', (error) => {
      if (error && (disconnection === false)) {
        disconnection = true; /* disconnected */
        disconnect(); /* render disconnected frame */
        // console.log("Internal: disconnected!");
        socket.emit('page-opens',{ page: "playlist" });
          };
      // else the socket will automatically try to reconnect
      //no action here
    });

}); /*End of ready-function  . . . */

//================================================================ toast handler
//{type: error|info|done|long, missive: "text", duration: msec [optional]]}
function renderBulletin(data) {
  switch(data.type) {
//Bluetooth off
    case "error":
    errorBulletin(data.missive, data.duration);
    break;
    case "done":
    doneBulletin(data.missive);
    break;
    case "info":
    infoBulletin(data.missive);
    break;
    case "mishap":
    mishapBulletin(data.missive, data.duration);
    break;
    case "long":
    infoBulletin(data.missive, data.duration);
    break;
    default:
    infoBulletin(data.missive);
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

function errorBulletin(missive, duration) {
  duration = duration || longDuration;
  notyf.error({
      message: missive,
      duration: duration,
      background: errorColor,
      position: {x:'center',y:'top'},
      dismissible: true
    });
};
//Note: most bullentins rendered directly at frontend, not at backend
function infoBulletin(missive, duration) {
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

function doneBulletin(missive, duration) {
  duration = duration || normalDuration;
  notyf.success({
    message: missive,
    duration: normalDuration,
    background: okayColor,
    position: {x:'center',y:'top'},
    dismissible: true
  });
};

function mishapBulletin(missive, duration) {
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

//============================================================== RENDER PLAYLIST
//Building playlist ================================================= build HTML
/**HTML and DOM - builds the HTML for rendering the playlist ======= Entry point
 * Called directly by backend trough socket.io events.
 * Format:{ markedTrack: trackToMark, list: playlist }
 * ,where playlist is an array of:
 * { songId: integer, duration: seconds, Title:string, Artist:string,
 *   Album:string, albumart: uri, path: mpd uri }, or empty [].
 * This is the entry point for backend render request.
 * The HTML code is inserted under <ul> id = #playlist
 * @backend {clear}        calls backend, with { page: playlist }
 * @return  {boolean}      true
 */
function renderPlaylist(frameData) {
  playlistState = frameData.markedTrack;  //track# or false (no tracks at all)
  isPlaying = frameData.playing;          //true -> play, false -> not playing
  playlistArray = frameData.list;
  isStreaming = frameData.streaming;
  disconnection && $("#nav-bar").show(); /*fixes after streaming and reconnect */
  if (isStreaming === true) {
    let message =
    `<li id="disconnected" class="error-list">
    <div class="disconnect-text"> <br> <br>Busy streaming . . . &nbsp; &nbsp; &nbsp; playlist is not shown at the moment.<br> <br> <br> </div>
    </li>
     `;
    $("#playlist").html(message); /*no track elements*/
  }
  else {
    $("#playlist").html(buildPlaylist(playlistArray, playlistState));
    setListeners();
  };
};
//Helper function to build the HTML structures, each track is a <li>
//Unfortunately capital T and A's in property names are inherited from mpd
function buildPlaylist(songArray, state){
  if (Array.isArray(songArray)) {
    let playlistTracks = songArray.length;
    let playlistHTML ='';
    for(var i = 0; i < playlistTracks; i++) {
      const songId = songArray[i].songId;
      const isPlayingOrNot = markPlayingState(songId, state);
      playlistHTML +=
  `<li id="${songId}" class="${isPlayingOrNot} list-group-item d-flex justify-content-between align-items-center">
  <button class="list-btn list-track-btn" type="button" title="Play or Pause">
    <div class="row list-row">
      <div class="col-auto title-icon align-top"><i class="icon track"></i></div> <div class="col list-element d-flex align-items-start"> <b> ${songArray[i].Title} </b> </div>
      </div>
    <div class="row list-row ">
      <div class="col-auto artist-icon align-top"><i class="icon artist"></i></div> <div class="col list-element d-flex align-items-start">${songArray[i].Artist}</div>
      </div>
    <div class="row list-row">
      <div class="col-auto album-icon align-top"><i class="icon album"></i></div> <div class="col list-element-bottom d-flex align-items-start "><em>${songArray[i].Album}</em></div>
      </div>
    </button>
  <button class="list-remove-btn list-play-btn" type="button" title="Remove">
      <i class="icon remove"></i>
    </button>
  </li>
   `;
 };//an empty ending element is appended last to avoid last track being blocked
  if (playlistTracks > 0) {
    playlistHTML += `<li id="the-end" class="end-element bg-inner list-group-item">
          <div class="end-text">
          <p end-text> <br>&nbsp;&nbsp;</p> </div>
          </div>
      </li>
       `;
  };
  return playlistHTML;
}
else
{
  return false; };};
// helper function to mark the playing track - only one track can be playing
function markPlayingState(songId, state) {
  if (state != songId) { //CCS: .player-list for tracks not playing
    return "player-list"
  }
  else { //CCS: .playing marks the track that is currently playing
    return "playing"
  };
};
//helper function to check if there is a track playing
function isPlaying(songArray) {
  let playlistTracks = songArray.length;
  if (Array.isArray(songArray) && (playlistTracks !== 0)) {
    for (let i = 0; i < playlistTracks; i++) {
      if (songArray[i].playing) {
        return (songArray[i].songId) * 1; /*fast parsing of string */
      };
    };
  return false;
};
    return false;
};
//Buttons *********************************************************************
//Set up listeners for buttons.--------------------------------------- listeners
function setListeners() {
//$(document).ready(function() {

//B. Remove a track button - for each track listed
$(".list-remove-btn").on('click', function() {//.................... remove btns
  // console.log("B. remove a track.");
  removeButtonClicked($(this));
  });

//C. Play a track button - for each track listed
  $(".list-btn").on('click', function() {//........................... play btns
    //console.log("C. play or pause the track\n");
    playTrackClicked($(this));
  });
  //})
};
// A. Clear all button functions ------------------------------------- CLEAR ALL
/**HTML and DOM - delete all <li> DOM elements - calls backend
 * Clear the playlist when user clicks Clear button. Calls backend.
 * @backend {clear}        calls backend, with { page: playlist }
 * @return  {boolean}      true
 */
function clearAll() {
  if (playlistArray) {
          // console.log("To backend:(clear, { page: playlist } ) - response: confirmed.");
          infoBulletin(`${sixSpaces} Playlist Cleared ${sixSpaces}`); //notice called made at frontend
          socket.emit('clear',{ page: "playlist" });
          $("#playlist").html(`<li></li>`); /*remove all HTML track elements*/
          playlistState = false;
          isPlaying = false;
          playlistArray = false;
          // console.log("Internal: list is", playlistArray, "and state", playlistState);
      };
  return true;
    };

// B. Remove button functions ------------------------------------------- REMOVE
/**HTML and DOM - find DOM list element that was clicked
 * When remove button is clicked by user, find the track element in DOM.
 * @param   {DOM}      element button element in DOM
 * @return  {boolean}  true
 */
function removeButtonClicked(element){
  removeTrack($(element).parent()); /*argument is the <li> element */
  return true;
};
/**HTML and DOM - delete DOM element
 * Remove a track element from the DOM.
 * @param  {DOM} trackElement track element in DOM, <li>
 * @return {boolean}  true
 */
function removeTrack(trackElement) {
  //Dealing with global variables
  let thisPlaylistArray = playlistArray; /*gives faster access in for-loop*/
  let playlistTracks = thisPlaylistArray.length;
  let songId = getSongId(trackElement);
  var trackIndex = findIndexInPlaylist(songId);
  //If trackIndex found...
  if (trackIndex || (trackIndex === 0)) {
    infoBulletin(`${sixSpaces} Track Removed ${sixSpaces}`); //notice called made at frontend
    //call backend
    removeSongBackend(parseInt(trackElement.attr("id")));
    //remove the track from playlistArray global variable using index found
    thisPlaylistArray.splice(trackIndex, 1);
    //something is weird here
    //playlistArray = thisPlaylistArray;
    if (thisPlaylistArray.length > 0) {
      playlistArray = thisPlaylistArray;
    }
    else {
      playlistArray = false;
    }
    //(playlistState === songId) && (playlistState = false);
    // console.log("Internal: Removed track#", songId, " - new array -", playlistArray, "state is", playlistState);
    //Remove track from DOM
    trackElement.remove();
    };
    return true;
};
/**No HTML or DOM - calls backend
 * Remove a track from backend. Calls backend.
 * @param   {number}   songId song id in mpd = track# in <li id="#">
 * @backend {remove}   calls backend, with { songId: songId }
 * @return  {boolean}  true
 */
function removeSongBackend(songId){
    //Update playlist at backend
    // console.log("To backend: (remove,{ songId:", songId, "}) - confirmed!");
    socket.emit('remove',{ songId: songId });
    return true;
    };
//C. Play button functions ------------------------------------------ PLAY PAUSE
/**HTML and DOM - find DOM list element that was clicked
 * When the track in the list is clicked by user, find the track element in DOM.
 * @param  {DOM} element button element in DOM
 * @return {boolean}  true
 */
function playTrackClicked(element) {
  playTrackElement(element.parent()); /*argument is the <li> element */
  };
/**HTML and DOM - style track elements effected by play-click-in-list
 * Mark track element in DOM as playing, unmark previous track.
 * Set playlist state accordingly.
 * 1) A track is playing  - change to play new tracks
 * 2) A track is marked   - play the new track
 * 3) A track is playing  - it is the same track, pause the track
 * 4) A track is marked   - it is the same track, start playing the track
 * @param  {DOM}     trackElement track element in DOM to be played
 * @global {playlistState isPlaying}  set and read
 * @return {integer}  trackId - the track now playing
 */
function playTrackElement(trackElement) {
  let thisPlaylistArray = playlistArray;
  let playlistTracks = thisPlaylistArray.length;
  let trackMarked = playlistState;
  let trackId = getSongId(trackElement);
  //console.log(">--------------------------- |>");
  //console.log("Internal: incoming -> track#", trackId, " STATUS: playlistState =", playlistState," play |>?", isPlaying );
  if ((trackMarked !== trackId) || (!isPlaying && (trackMarked === trackId))) {
        infoBulletin(`${sixSpaces} Playing Track ${sixSpaces}`); //notice called made at frontend
        playTrackBackend(trackId);      /*call backend first */
        //Is there another track playing? unmark that track . . .
        if (trackMarked !== trackId) {
          unmarkPlayingTrack(getTrackElement(trackMarked));
        };
        markTrackPlaying(trackElement); //mark a new track or remark the same track
        playlistState = trackId;
        isPlaying = true;
        //console.log("Internal: CHANGED track#", trackId, "STATUS: playlistState =", playlistState,"play |>?", isPlaying );
    }
    else if (isPlaying && (trackMarked === trackId)) {
      infoBulletin(`${sixSpaces} Paused Track ${sixSpaces}`); //notice called made at frontend
      pauseTrackBackend(trackId);
      isPlaying = false;
      //console.log("Internal: PAUSED track#", trackId, "STATUS: playlistState =", playlistState,"play |>?", isPlaying );
      //console.log("-----------------------");
    };
  return trackId;
};
/**HTML and DOM - change styling of DOM element to playing
 * Mark the track element in DOM as playing (CSS classes).
 * @param  {DOM} TrackElement track element in DOM to be played
 * @return {boolean}  true
 */
function markTrackPlaying(trackElement) {
  $(trackElement).removeClass("player-list").addClass("playing");
  return true;
};
/**HTML and DOM - change styling of DOM element to NOT playing
 * Mark the track element in DOM as not playing anymore (CSS classes).
 * @param  {DOM} TrackElement track element in DOM to be unmarked
 * @return {boolean}  true
 */
function unmarkPlayingTrack(trackElement) {
  $(trackElement).removeClass("playing").addClass("player-list");
  return true;
};
/** no HTML and DOM - backend call
 * request backend to play the track.
 * @param   {number}      songId track to be played, song id in mpd
 * @backend {play-track}  calls backend, with { songId: songId }
 * @return  {number}      songid
 */
function playTrackBackend(songId) {
  // console.log("To backend: (play-track, {songId:", songId,"}) - confirmed!");
  socket.emit('play-track',{ songId: songId });
  return songId;
};
/** no HTML and DOM - backend call
 * request backend to pause current track.
 * @param   {number}       songId track to paused, song id in mpd
 * @backend {play-track}   calls backend, with { page: "playlist" }
 * @return  {boolean}      true
 */
function pauseTrackBackend(songId) {
  // console.log("To backend: (pause, { page: playlist }) - confirmed");
  socket.emit('pause',{ page: "playlist" });
  return true;
}
//______________________________________________________________________________
//Auxiliary help functions for frontend requests *******************************
/**HTML and DOM - finds a track list element in DOM, returns an element
 * @param {number}          songId is song id in mpd also track# in DOM
 * @return {DOM jQuery}     a <li> jQuery DOM element holding the track
 */
function getTrackElement(songId) {
  return $(`#${songId}`);
};
/**HTML and DOM - finds a track list id element in DOM, returns an integer
 * @param {DOM jQuery}   rack  a jQuery track element in DOM
 * @return {number}      mpd song id
 */
function getSongId(trackElement) {
  return trackElement.attr("id") * 1; /*fast conversion into number */
};
/**Find the index of a songID in the playlistArray (global variable)
 * @param  {number}  songId id number of song in mpd
 * @return {number}  index or false if none was found
 */
function findIndexInPlaylist (songId) {
  let thisPlaylistArray = playlistArray; /*for faster access in for-loop */
  let playlistTracks = thisPlaylistArray.length;
  let trackIndex = false;
  for(var i = 0; i < playlistTracks; i++) {
      if (songId === thisPlaylistArray[i].songId) {
        return trackIndex = i;
        break; /* stop looping */
      };
    };
  return trackIndex;
};
/**HTML & DOM - delete all <li> DOM elements - disconnected by backend
 * Render a disconnected message
 * @return {boolean}      true
 */
function disconnect(){
  //$("#clear-all").hide();
  $("#nav-bar").hide();
  let message =
  `<li id="disconnected" class="error-list">
  <div class="disconnect-text"> <br> <br>ERROR: disconnected from the Player<br> <br> <br> </div>
  </li>
   `;
  $("#playlist").html(message);
  notyf.error({
      message: "Disconnected from Player",
      duration: lastingDuration,
      background: errorColor,
      position: {x:'center',y:'center'},
      dismissible: true
    });
  return true;
};
/*
================================================================================
Functions directly called by backend ===========================================
clear & render (is defined at the beginning above)
================================================================================
*/
/**HTML and DOM - delete all <li> DOM elements - called by backend only
 * Clear the playlist from backend -> if USB is removed
 * @return {boolean}      true   FUNCTION OBSOLETE NOT IN USE!!!!!!!!!!!
 */
function clearAllbyBackend() {
  $("li").remove(); /*remove all HTML list elements*/
  playlistArray = false;
  playlistState = false;
  // console.log("Backend request: (cleared, []) - confirmed: playlist is now", playlistArray, "state is", playlistState);
  return true;
};
