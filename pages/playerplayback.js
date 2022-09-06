//Copyright 2022 by Retro Audiophile Designs
//see license.txt¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨
//             ~ Frontend code for USB Playback Page of RAD Player ~
//Incoming frame data format:
//{ elapsed:integer, duration: integer, Title: string, Artist: string, albumart:
//  url as a string, playing: boolean, volume: integer, repeat: boolean,
//  shuffle: boolean, streaming: boolean }
//{ albumart: string } -- updating album art with a url

//Global variables
var socket = io.connect();  //socket for communication to backend
var timerID = false;        /*used internally for setInterval()*/
var playTrack = false;      /*used internally as datastructure*/
var disconnection = false;  //true if there has been a disconnect
var notyf = new Notyf();    //the dispatcher for toasts

//Render on page show events=====================================================
/*
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === 'visible') {
     // console.log(timeStamp(),"Internal: ++++ tab is visible again ++++");
    socket.emit('page-opens',{ page: "player" });  //  presence call to backend!
  };
});*/
window.addEventListener('focus', function(){
  // console.log(timeStamp(), "Internal: ==== window is in focus again ====");
  socket.emit('page-opens',{ page: "player" });  //  presence call to backend!
});

//==============================================================================
//START sequence ===============================================================
  $(document).ready(function() {
    //Playback control buttons and sliders --------------------------- listeners
    //A. play/pause button listener
      $("#play-or-pause").on('click', function() {
        // console.log("A. play/pause or stop streaming clicked");
        playOrPauseClicked(this);
        });
    //B. repeat button listener
      $("#repeater").on('click', function() {
        // console.log("B. repeat clicked");
        repeatClicked(this);
          });
    //C. shuffle button listener
      $("#shuffler").on('click', function() {
          // console.log("C. shuffle clicked");
          shuffleClicked(this);
        });
    //D. previous button listener
      $("#previous").on('click', function() {
          // console.log("D. previous clicked");
          previousClicked();
        });
    //E. next button listener
      $("#next").on('click', function() {
        // console.log("E. next clicked");
        nextClicked();
      });
    //F. Duration slider set up
    var slider1HTML = document.getElementById('duration-slider');
    //First create duration slider...
      noUiSlider.create(slider1HTML, {
        start: 50,
        animate: false,
        connect: "lower",
        //behaviour: 'tap-drag',
        range: {
          'min': 0,
          'max': 100
              }
            });
      // ...and then set the two duration listeners
      slider1HTML.noUiSlider.on('start', function() {
        //F1. called first and only once when dragging . . .
        clearInterval(timerID);
        // console.log("F1. duration handle dragged and moved");
        if((timerID !== false) && (playTrack.playing === true)) {
          timerID = false;
        };
      });
      slider1HTML.noUiSlider.on('change', function() {
        //F2. called last and only once, when there is a new slider value . . .
        clearInterval(timerID);
        // console.log("F2. duration handle released - find out new value");
        if((timerID !== false) && (playTrack.playing === true)) {
          timerID = false;
        };
        durationTouched(this);
      });
    //G. Volume slider set up
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
      // console.log("G. volume handle moved");
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
//....................................................................... center
   //Center the player in the middle of the viewport
   $(window).resize(function(){
     $('.center-container').css({
       position:'absolute',
       left: ($(window).width() - $('.center-container').outerWidth())/2,
       top: ($(window).height() - $('.center-container').innerHeight())/2
                    });
                  });
    // Call the function...
    $(window).resize();
//.................................................................... socket.io
    //Set up socket.io connections events
    socket.emit('page-opens',{ page: "player" });  //  presence call to backend!
    socket.on("clear-dispatch", function () {
      notyf.dismissAll();
      // console.log(timeStamp(),"From backend: clear all notices...");
    });
//A. Main listener for rerendering of page
    socket.on('replace', function (data) {
      console.log(timeStamp(),"From backend: replace request with track", data);
      replaceTrack(data); //                     render entry point for backend!
      disconnection = false; /*connection established*/
    });
//B. Listeners for specific or general messages (toasts)
    socket.on('notice', function (data) {
      // console.log("From backend: settings announcement", data);
      renderNotice(data);   //<------------------------entry point for backend
      disconnection = false; /*connection established */
            });
    socket.on('herald', function (data) {
      // console.log("From backend: general announcement", data);
      renderNotice(data);   //<------------------------entry point for backend
      disconnection = false; /*connection established */
                    });
//C. Listener for album art uppdates
    socket.on('albumart', function (data) {
      //  console.log(timeStamp(),"From backend: found album art", data);
      renderAlbumart(data); // <----------------- render entry point for backend
      disconnection = false; /*connection established*/
    });
//D. Listener for render streaming service is on
    socket.on('stream', function (data) {
      // console.log(timeStamp(),"From backend: render streaming", data);
      streaming(data); // <---------------------- render entry point for backend
      disconnection = false; /*connection established*/
    });
//E. Listener for disconnection from Player
    socket.on('connect_error', (error) => {
      if (error && (disconnection === false)) {
        disconnection = true; /*disconnected*/
        disconnect(); /*render disconnected frame */
        // console.log("Internal: disconnected!");
        socket.emit('page-opens',{ page: "player" });
      };
      // else the socket will automatically try to reconnect
      //no action here
    });
}); /*  Ends the ready function */

//================================================================ toast handler
//{type: error|info|done|long, missive: "text", duration: msec [optional]]}
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
const quickDuration = 1000;
const normalDuration = 2000;
const longDuration = 5000;
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
      position: {x:'center',y:'top'},
      dismissible: true
    });
};

function infoNotice(missive, duration) {
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

function doneNotice(missive, duration) {
  duration = duration || normalDuration;
  notyf.success({
    message: missive,
    duration: normalDuration,
    background: okayColor,
    position: {x:'center',y:'top'},
    dismissible: true
  });
};

function mishapNotice(missive, duration) {
  duration = duration || normalDuration;
  notyf.success({
    message: missive,
    duration: longDuration,
    background: oopsColor,
    position: {x:'center',y:'top'},
    dismissible: true,
    icon: false
  });
};

//_____________________________________________________________________________
// FRONTEND requests invoked by user ------------------------------------------
//-----------------------------------------------------------------------------
// play/pause, next, previous, duration, repeat, shuffle, volume
//_____________________________________________________________________________

//A. play/pause toggle button functions
//============================================================== PLAY PAUSE STOP
/**HTML and DOM - play control switches symbol (play or pause or remove)
 * If there is a current track playing (i.e. Pause is showing)
 * then set icon to Pause and show Play, or do the opposite,
 * (CCS class .fa-pause indicates pause symbol shown); or the player is
 * streaming and the Remove button is clicked ( = stop streaming)
 * @param  {DOM jQuery}   button element
 * @return {boolean}      true
 */
function playOrPauseClicked(element) {
    if (isCurrentTrack() && $(element).hasClass("fa-play")) {
      // Not playing - changing to PLAY, switch to playing if there is a track
          playTrack.playing = true;
          playTrackBackend();
          startDuration(playTrack.elapsed, playTrack.duration);
          markTrackPlaying(element);
      }
      else if ($(element).hasClass("fa-pause")){
          // must be playing - showing PAUSE, so change to pause-state
          playTrack.playing = false;
          pauseTrackBackend();
          stopDuration();
          unmarkTrackPlaying(element)
      }//THIS IS NOT IN USE ANYMORE
      else if ($(element).hasClass("fa-times-circle")) {
        //Streaming - showing REMOVE, change back to startup playback
        stopStreamingBackend();
      };
    return true;
    };
/**HTML and DOM - switches to play symbol in DOM. PLAY
 * Switch to class  .fa-play renders the Play icon.
 * @param  {DOM jQuery}    button element
 * @return {boolean}       true
 */
 function markTrackPlaying(element) {
   $(element).removeClass("fa-play").addClass("fa-pause").attr("title", "Pause");
   return true;
 };
 /**HTML and DOM - switches to pause symbol in DOM. PAUSE
  * Switch to  class .fa-pause renders the Pause icon.
  * @param  {DOM jQuery}    button element
  * @return {boolean}       true
  */
 function unmarkTrackPlaying(element) {
   $(element).removeClass("fa-pause").addClass("fa-play").attr("title", "Play");
 };
 /**No HTML or DOM; user wants to play a track - calls backend
  * PLAY current track.
  * @backend {play}        calls backend; play, { page: player }
  * @return  {boolean}     true
  */
 function playTrackBackend() {
   // console.log("Request to backend: (play, { page: player })", playTrack);
   socket.emit('play',{ page: "player" });
   return true;
 };
 /**No HTML or DOM; user wants to pause a track - calls backend
  * PAUSE current track - triggered by user clicking Pause button
  * @backend {pause}       calls backend; pause, {page: player}
  * @return  {boolean}     true
  */
 function pauseTrackBackend() {
   // console.log("Request to backend: (pause, {page: player})", playTrack);
   socket.emit('pause',{ page: "player" });
   return true;
 };
 /**No HTML or DOM; user wants to stop streaming - call to backend NOT USED
  * STOPS streaming  - triggered by user clicking Remove button
  * @backend {stop-streaming} calls backend; stop-streaming, {streaming:false}
  * @return  {boolean}        true
  */                                // NOT USED ANYMORE
function stopStreamingBackend() {
  // console.log("Request to backend: (stop-streaming, {streaming:false})");
  socket.emit('stop-streaming', { streaming:false });
  return true;
};
 /**HTML and DOM - MOVES the duration handle during PLAY
  * Get the elapsed time and duration - start moving.
  * Stops the interval timer when elapsed = duration.
  * Extremely time critical!   [it runs to fast about +6 seconds per hour]
  * Sometimes the slider jumps back a little, that is because it is not synched
  * with machine.elapsed at 'play', 'pause' syncs since the page is rendered.
  * @param  {number} elapsed  elapsed = elapsed time in seconds
  * @param  {number} duration total duration in seconds
  * @return {object or Boolean} timer or false if the timer did not start
  */
 function startDuration(elapsed, duration) {
   if ((duration - elapsed) > 1) {
     //start interval timer . . . .
     var slider = document.getElementById('duration-slider');
     var timePassed = elapsed; /*slider time slots */
     var oldTime = 0;         /*elapsed time slots to be displayed */
     //Timer is started here and timer id stored in timerInterval variable
     var timerInterval = setInterval(function() {
         //timePassed = timePassed + 0.05;  /*steps are 50 milliseconds 50*/
         //timePassed = timePassed + 0.1;  /*steps are 100 milliseconds, 100 */
         timePassed = timePassed + 0.2;  /*steps are 200 milliseconds, 200 */
         //timePassed = timePassed + 0.5;  /*steps are 500 milliseconds, 500 */
         //move  slider forward but only update elapsed time every second passed
         if ((duration - timePassed) > 0) {
           //move slider handle in DOM using per cent values
           //slider.noUiSlider.setHandle(0, (timePassed / duration)*100, true);
           slider.noUiSlider.set((timePassed / duration) * 100);
           //display new elapsed second in DOM using seconds as integers
           //let newTime = Math.round(timePassed); //trunc or round????
           let newTime = Math.trunc(timePassed);
           if (newTime !== oldTime) {
             oldTime = newTime;
             document.getElementById('elapsed').textContent = timeSecondsToString(newTime);
            }
          }
          else {
            //Stop the interval timer and set slider handle to the rightmost position
            slider.noUiSlider.set(100);
            playTrack.elapsed = duration;
            stopDuration();
            document.getElementById('elapsed').textContent = timeSecondsToString(duration);
            // console.log("Internal: reached END state - timer stopped, timerID", timerID, "track is", playTrack);
       };
       // . . . at end of timer function
     }, 200);
     //store the timer reference
      timerID = timerInterval;
      // console.log("Internal: timer started: timerID", timerID, "track=", playTrack);
   }
   else {
     //No use to start interval timer, to close to end . . .
     document.getElementById('duration-slider').noUiSlider.setHandle(0, 100, true);
     document.getElementById('elapsed').textContent = timeSecondsToString(duration);
     // console.log("Internal: timer cannot start, too close to duration; elapsed", elapsed, "and duration", duration);
     playTrack.elapsed = duration;
     document.getElementById('elapsed').textContent = timeSecondsToString(duration);
     // console.log("Internal: requesting END state instead, track was", playTrack);
     return false;
   };
 };
 /**HTML and DOM will immediately stop duration slider animation and clear timer
  * Stop timer! Set  elapsed time in playTrack, but track can still be in
  * playing  mode since this is used to stop the animation.
  * NOTE: Playing = false is NOT set here!
  * @return {boolean}      true
  */
 function stopDuration(){
   clearInterval(timerID);
   timerID = false;
   playTrack.elapsed = timeStringToSeconds(document.getElementById('elapsed').textContent);
   // console.log("Internal: slider handle animation & timer stopped, timerID =", timerID, "track=", playTrack);
   return true;
 };
//B. repeat button Functions
//======================================================================= REPEAT
/**HTML and DOM - switches the colour of repeat (orange or dark)
 * If repeat is on the button is orange, otherwise dark
 * (CCS class .repeat-btn = off;  .repeat-btn-on = on)
 * @param  {DOM}           button element
 * @return {boolean}       true
 */
function repeatClicked(element) {
  //One might consider to check if there is a current track?
  if ($(element).hasClass("repeat-btn")) {
            // If repeat is off, so change to ON
            // console.log("Internal: repeat is OFF, turn it on")
            turnRepeatOnBackend();
            turnOnRepeatDOM(element);
            playTrack.repeat = true;
      }
      else {
            // Must be showing repeat, so change to OFF
            // console.log("Internal: repeat is ON, turn it off")
            turnRepeatOffBackend();
            turnOffRepeatDOM(element);
            playTrack.repeat = false;
        };
      };
/**HTML and DOM - switches the colour of REPEAT from orange to dark = OFF)
 * (CCS class .repeat-btn = OFF;  .repeat-btn-on = ON)
 * @param  {DOM}           button element
 * @return {boolean}       true
 */
 function turnOnRepeatDOM(element) {
   $(element).removeClass("repeat-btn").addClass("repeat-btn-on").attr("title", "No repeat");
   return true;
 };
 /**HTML and DOM - switches the colour of REPEAT from dark to orange = ON)
  * (CCS class .repeat-btn = OFF;  .repeat-btn-on = ON)
  * @param {DOM}           button element
  * @return {boolean}      true
  */
  function turnOffRepeatDOM(element) {
    $(element).removeClass("repeat-btn-on").addClass("repeat-btn").attr("title", "Repeat");
    return true;
  };
/**No HTML or DOM - calls backend
 * request to backend for a change of status to REPEAT
 * @backend {repeat}       calls backend; repeat, { repeat: true }
 * @return  {boolean}      true
 */
function turnRepeatOnBackend() {
  // console.log("Request to backend: (repeat, {repeat: true })");
  socket.emit('repeat', { repeat: true });
  return true;
};
/**No HTML or DOM - calls backend
 * request to backend for a change  of status to NO REPEAT
 * @backend {repeat}       calls backend; repeat, { repeat: false }
 * @return {boolean}      true
 */
function turnRepeatOffBackend() {
  // console.log("Request to backend: (repeat, {repeat: false })");
  socket.emit('repeat', { repeat: false });
  return true;
};
//C. shuffle button Functions
//====================================================================== SHUFFLE
/**HTML and DOM - switches the colour of shuffle (orange or dark)
 * If shuffle is on the button is orange, otherwise dark
 * (CCS class .shuffle-btn = off;  .shuffle-btn-on = on)
 * @param  {DOM}           button element
 * @return {boolean}       true or false
 */
function shuffleClicked(element) {
  if ($(element).hasClass("shuffle-btn")) {
        // If shuffle is off, so change to on
        // console.log("Internal: Shuffle is OFF, turn it on")
        turnShuffleOnBackend();
        turnOnShuffleDOM(element);
        playTrack.shuffle = true;
    }
      else {
        // Must be showing shuffle, so change to off
        // console.log("Internal: Shuffle is ON, turn it off")
        turnShuffleOffBackend();
        turnOffShuffleDOM(element);
        playTrack.shuffle = false;
    }
};
/**HTML and DOM - switches the colour of SHUFFLE from dark to orange)
 * (CCS class .shuffle-btn = OFF;  .shuffle-btn-on = ON)
 * @param  {DOM}           button element
 * @return {boolean}       true
 */
function turnOnShuffleDOM(element) {
  $(element).removeClass("shuffle-btn").addClass("shuffle-btn-on").attr("title", "No shuffle");
  return true;
};
/**HTML and DOM - switches the colour of SHUFFLE from orange to dark)
 * (CCS class .shuffle-btn = OFF;  .shuffle-btn-on = ON)
 * @param  {DOM}           button element
 * @return {boolean}       true
 */
function turnOffShuffleDOM(element) {
  $(element).removeClass("shuffle-btn-on").addClass("shuffle-btn").attr("title", "Shuffle");
  return true;
};
/**No HTML or DOM - calls backend
 * request for a change of status to SHUFFLE on
 * @backend {shuffle}       calls backend; repeat, { shuffle: true }
 * @return  {boolean}       true
 */
function turnShuffleOnBackend() {
  // console.log("Request to backend: (shuffle, {shuffle: true})");
  socket.emit('shuffle', { shuffle: true });
  return true;
};
/**No HTML or DOM - calls backend
 * request for a change of status to SHUFFLE off
 * @backend {repeat}       calls backend; shuffle, { shuffle: false }
 * @return  {boolean}     true
 */
function turnShuffleOffBackend() {
  // console.log("Request to backend: (shuffle, {shuffle: false})");
  socket.emit('shuffle', { shuffle: false });
  return true;
};
//D. Previous button Function
//===================================================================== PREVIOUS
/**No HTML or DOM - calls backend for PREVIOUS track,
 * request for PREVIOUS track to be played
 * @backend {previous}    calls backend; previous, { page: player }
 * @return  {boolean}     true
 */
function previousClicked() {
  if (isCurrentTrack()) {
    // console.log("Request to backend: (previous, {page: player})");
    socket.emit('previous', { page: "player" });
  };
  return true;
};
//E. Next button Function
//========================================================================= NEXT
/**No HTML or DOM - calls backend
 * request for NEXT track to be played
 * @backend {next}       calls backend; repeat, { page: player }
 * @return  {boolean}    true
 */
function nextClicked() {
  if (isCurrentTrack()) {
    // console.log("Request to backend: (next, {page: player})");
    socket.emit('next', { page: "player" });
  };
  return true;
};
//F. Volume slider function
//======================================================================= VOLUME
/**HTML and DOM - set the volume by user  - calls backend
 * The VOLUME slider bar has been moved and released.
 * @param   {DOM}           slider element
 * @backend {volume}        calls backend; with { volume: newVolume }
 * @return  {number}        new volume
 */
function volumeTouched(slider) {
  const newVolume = slider.get() * 1; /*faster conversion from string*/
  playTrack.volume = newVolume;
  // console.log("Request to backend: (volume, { volume: newVolume })  Internal: new volume:", newVolume);
  socket.emit('volume', { volume: newVolume });
  newVolume;
};
//F. Duration slider functions
//===================================================================== DURATION
/**HTML and DOM - the duration is changed by user  - calls backend
 * The DURATION slider handle has been released with a new value.
 * @param   {DOM HTML}    slider element (not JQuery)
 * @backend {seek}        calls backend; with { elapsed: newElapsedSeconds }
 * @return  {number}      new time unit in %
 */
function durationTouched(slider) {
  const newTimeUnit = slider.get() * 1; /*convert to number the fast way */
  if (newTimeUnit < 99) {
    const durationSeconds = playTrack.duration;
    const newElapsedSeconds = Math.round((newTimeUnit/100) * durationSeconds);
    // set new elapsed time for playTrack and in the track card (HTML)
    playTrack.elapsed = newElapsedSeconds;
    const newElapsedString = timeSecondsToString(Math.round(newElapsedSeconds));
    document.getElementById('elapsed').textContent = newElapsedString;
    // console.log("Request to backend: (seek,{ elapsed:", newElapsedSeconds, "}) Internal: new elasped time is", newElapsedString, "for track", playTrack);
    socket.emit('seek', { elapsed: newElapsedSeconds });
    //if playing start duration
    playTrack.playing && startDuration(newElapsedSeconds, durationSeconds);
  }
  else {
  //Duration handle is at the right - do not continue playing
    playTrack.elapsed = playTrack.duration;
    // console.log("Internal: no playing now - too close to end:", newTimeUnit,"in %" );
    if (playTrack.playing === true) {
      stopDuration();
      // console.log("Request to backend: (track-end,{elapsed: duration}) - Internal: for track", playTrack, "timerID is now", timerID);
      socket.emit('track-end', { elapsed: playTrack.duration });
    }
    else {
      slider.set(100);
      document.getElementById('elapsed').textContent = timeSecondsToString(playTrack.duration);
      // console.log("Request to backend: (seek,{elapsed: duration}) - Internal: for track", playTrack);
      socket.emit('seek', { elapsed: playTrack.duration });
    }
  };
  return newTimeUnit;
};
//_________________________________________________________ BACKEND entry points
// Functions for managing BACKEND requests ------------------------------------
//-----------------------------------------------------------------------------
// start player or streaming and replace track---------------------------------
//_____________________________________________________________________________

//1. start player functions
//========================================================= render playback mode
/**HTML and DOM - disconnected by backend
 * Lost the connection - render a disconnected message............. disconnected
 * @return {Boolean}  true
 */
function disconnect() {
  //HIDE everything and replace with error frame (predefined in HTML)
  timerID && stopDuration();
  $('#track-card').hide();
  $('#track-card-disconnected').show(); /*render disconnected frame */
  $('#duration-slider').hide();
  $('#previous').hide(); $('#play-or-pause').hide(); $('#next').hide();
  $('#repeater').hide(); $('#shuffler').hide();
  $('#volume-slider').hide(); $('#vol-down-symbol').hide(); $('#vol-up-symbol').hide();
  $('#nav-bar').hide();
  $(window).resize();
  notyf.error({
      message: "Disconnected from Player",
      duration: lastingDuration,
      background: errorColor,
      position: {x:'center',y:'top'},
      dismissible: true
    });
  return true;
};
/**HTML and DOM - bring playback controls in order............ playback controls
 * Called at startup of player unit, also when change to new track or no track
 * and after terminating streaming and entering playback or idle again
 * Renders: prev, play/pause, next, repeat,shuffle and volume slider
 * @param  {Boolean}   playing flag if called in playing state
 * @param  {Boolean}   repeatOn flag if repeat
 * @param  {Boolean}   shuffleOn flag if shuffle
 * @param  {Integer}   volume volume in %
 * @global {disconnection}   true, if there has been a disconnection
 * @return {Boolean}  true
 */
 function renderPlaybackControls(playing, repeatOn, shuffleOn, volume) {
   let playOrPauseOrStream = $('#play-or-pause');
   $(playOrPauseOrStream).show(); /* fixes a disconnect */
   //CLEAR first the play/pause/remove-button, just to be sure . . .
    //playOrPauseOrStream.show("fa-times-circle").removeClass("fa-pause").removeClass("fa-play");
    //RENDER the correct button: play or pause
    if (playing === true) {
      playOrPauseOrStream.removeClass("fa-play").addClass("fa-pause").attr("title", "Pause");
    }
    else {
      playOrPauseOrStream.removeClass("fa-pause").addClass("fa-play").attr("title", "Play");
    };
    //Set repeat and shuffle
    if (repeatOn === true) {
      turnOnRepeatDOM($('#repeater'));
    } else {
      turnOffRepeatDOM($('#repeater'));
    };
    if (shuffleOn === true) {
      turnOnShuffleDOM($('#shuffler'));
    }
    else {
      turnOffShuffleDOM($('#shuffler'));
    };
    //All these buttons are not showing after streaming, so show()
    $('#previous').show() && $('#next').show() && $('#repeater').show() && $('#shuffler').show();
    //Set volume
    document.getElementById('volume-slider').noUiSlider.setHandle(0, volume, true);
    //fixes returning from a disconnect
    disconnection &&  $('#track-card-disconnected').hide() && $('#track-card').show()
    && $('#volume-slider').show() && $('#vol-down-symbol').show() && $('#vol-up-symbol').show()
    && $('#nav-bar').show();
    return true;
  };
/**HTML and DOM - display the track information,  ......................... card
 * Load any album art or no album art, set elapsed, duration, title and artist
 * Also render and set the duration handle.
 * @param  {JSON}      track  track datastructure
 * @param  {Integer}   elapsed  seconds
 * @param  {Integer}   duration  seconds
 * @return {Boolean}   true
 */
function renderTrackcardAndSlider(track, elapsed, duration) {
  if (duration !== false) {
    //RENDER: duration slider and set elapsed time
    document.getElementById('duration-slider').noUiSlider.setHandle(0, (elapsed / duration) * 100, true);
    $('#duration-slider').show();
    //RENDER track information
    document.getElementById('elapsed').textContent = timeSecondsToString(elapsed);
    document.getElementById('duration').textContent = timeSecondsToString(duration);
    document.getElementById('track-text').textContent =`${track.Title} - ${track.Artist}`;
    let albumartSrc = track.albumart;
    if (albumartSrc != "") {
      //Track has an album art image link - render the cover image
      //  console.log(timeStamp(), "Album art link exist:", albumartSrc);
      if (albumartSrc != "albumart_missing.png") {
        //the album art link is a spotify url for an album image, try to download
        isSiteOnline(albumartSrc, function(found){
          if(found) { //there is an albumart url that can be rendered
                $('#albumart').attr('src', albumartSrc);
                //  console.log(timeStamp(), "Album art image rendered at first time!", albumartSrc);
          }
          else { //No album art can be rendered, because:
                // site is offline or image not found, or server is too slow
              $('#albumart').attr('src', "albumart_missing.png");
              // console.log(timeStamp(), "No Album art(!) could be rendered first time:", albumartSrc);
          };
        });
      }
      else {
        $('#albumart').attr('src', "albumart_missing.png");
      };
    }
    else { // Track has no album art at all, render missing message in this case too
      $('#albumart').attr('src', "albumart_missing.png");
      track.albumart = "albumart_missing.png";
    };
  }
  else if (track.streaming === false) {
    //NO duration = idle mode and not streaming, then RENDER empty playlist
    document.getElementById('elapsed').textContent = "00:00";
    document.getElementById('duration').textContent = "00:00";
    document.getElementById('track-text').textContent =`There is no track in playlist!`;
    //NOTE: duration slider is hidden when in idle mode
    $('#duration-slider').hide();
    $('#albumart').attr('src', "empty_playlist.png"); //empty playlist card
  }
  else {
    //RENDER streaming mode (no duration and not in idle mode)
    document.getElementById('track-text').textContent = "Busy streaming . . .";
    document.getElementById('elapsed').textContent = "--:--";
    document.getElementById('duration').textContent = "--:--";
    $('#duration-slider').hide();
    $('#albumart').attr('src', "streaming.png"); //streaming card
  };
 $(window).resize();
 return true;
};
/**HTML and DOM - render result after looking for album art.............albumart
 * Replace any existing album art with the new one just recieved from backend.
 * This function is an entry point for backend and it is called after backend
 * has been looking for the real album art, hopefully it found it.
 * @param  {JSON}      data  album art path, {albumart: url }
 */
function renderAlbumart(data) {
  let albumart = data.albumart;
  if (albumart != "albumart_missing.png") {
    //there is an image url, but can it be reached?
    isSiteOnline(data.albumart,function(found){
      if(found) { //Finally, the url works, render album art!
            $('#albumart').attr('src', albumart);
            //console.log(timeStamp(), "Album art rendered second time:", albumart);
      }
      else { //Oh no, url doesn't work, cannot download because:
             //Spotify site is offline or image not found, or server is too slow
          $('#albumart').attr('src', "albumart_missing.png");
          //console.log(timeStamp(), "No Album art! rendered second time:", albumart);
      };
    });
  }
  else { //no luck, rerender the missing image again to be sure
    $('#albumart').attr('src', "albumart_missing.png");
  };
  $(window).resize();
};
//2. Streaming functions
//======================================================== render streaming mode
/**Backend - render that the player unit is streaming
 * Render a stop-streaming button (remove button) instead of play/pause
 * Hide previous, next, repeat, shuffle, hide duration slider as well.
 * Show streaming in track card and render the correct volume
 * @param  {JSON}      state track from Backend (only volume is important here)
 * @global {disconnection}   true, if there has been a disconnection
 * @return {Boolean}         true
 */
function streaming(state) {
  //stop the duration slider moving if playing
  timerID && stopDuration();
  //HIDE the  controls, except Volume slider
  $("#play-or-pause").hide();
  $('#previous').hide();
  $('#next').hide();
  $('#repeater').hide();
  $('#shuffler').hide();
  //RENDER streaming message in track card
  renderTrackcardAndSlider(state, false, false);
  document.getElementById('volume-slider').noUiSlider.setHandle(0, state.volume, true);
  // fixes returning from a disconnect . . .
  disconnection && $('#track-card-disconnected').hide() && $('#track-card').show() && $('#volume-slider').show() &&
  $('#vol-down-symbol').show() && $('#vol-up-symbol').show() && $('#nav-bar').show();
  // console.log("Internal: render streaming mode, track =", state, "timer should be false, timerID =", timerID);
  $(window).resize();
  return true;
};
//3. Backend replace-track function - called by socket.io event handler ========
//====================================== entry point for backend render requests
//------------------------------------------------------------------------------
/**Backend - a new track card and state will be rendered
 * Player will be brought into mode: play/pause or streaming depending on
 * the values of track.playing and/or track.streaming
 * Format of frame data to be rendered: js object{} (i.e.a track)
 * { elapsed: integer, duration:integer, Title: string, Artist:string,
 * albumart:string, playing:boolean, volume:integer, repeat: boolean,
 * shuffle:boolean, streaming: boolean }    -- maybe Album must be included????
 * @param  {JSON}       track track object from backend including states
 * @Global {playTrack}  set the track information
 * @return {Boolean}    true
 */
function replaceTrack(track) {
  playTrack = track;
  let streamingFlag = track.streaming;
  if (streamingFlag === false) {
    let playingFlag = track.playing;
    //In playback mode; 1. STOP any duration slider timer for the old track. . .
    if (timerID !== false) {
      clearInterval(timerID);
      timerID = false;
    }; //2. RENDER...
    let elapsed = track.elapsed;
    let duration = track.duration;
    //...set track card and duration slider...
    renderTrackcardAndSlider(track, elapsed, duration, streamingFlag);
    //...render all playback controls buttons and volume.
    renderPlaybackControls(playingFlag, track.repeat, track.shuffle, track.volume,streamingFlag);
    //If status is PLAY - start the duration timer
    (playingFlag === true) && startDuration(elapsed, duration);
  } else {
    //In streaming mode; then render streaming frame
    streaming(track);
  };
  $(window).resize();
  // console.log("Internal: new track rendered", track);
  return true;
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
function formatSeconds(seconds) {        //** NOT USED ***
  var date = new Date(1970, 0, 1);
  date.setSeconds(seconds);
  return date.toTimeString().replace(/.*(\d{2}:\d{2}).*/, "$1");
};
/**No HTML or DOM
 * Checking if there is a current track in the browser
 * @return {boolean}      false or true
 */
function isCurrentTrack() {
  if (playTrack.duration !== false) {
    return true;
  } else {
    return false;};
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
