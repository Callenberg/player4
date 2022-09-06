//Copyright 2022 by Retro Audiophile Designs, all rights reserved.
////GNU General Public License v3.0 see license.txt            [Source code]
//          ~ USB playback of RAD Network Music Player ~


//const fs = require('fs');                         //for reading files
//const exec = require('child_process').exec;         //for Raspian cmds
const execSync = require('child_process').execSync; //for synched Raspbian cmds
const aux = require('./machine-auxiliary.js');      //auxiliary functions
const usb = require('./machine-usb.js');            //usb mngt
const loop = require('./machine-loop.js');
const mpd = require('./machine-mpd.js');
const machine = require('/player/machine.js');
const model = require('/player/machine-model.js'); //important - use 'model.xxx'
const events = require('events');                  //for creating events
const signal = new events.EventEmitter();
//Require playback related modules .............................................
const mpdjs = require('./mpd.js');      /*mpd connection object */
const cmd = mpdjs.cmd;                  /*mpd.js function: command call */
//const albumArt = require('album-art');  //album art retriever functions

module.exports.signal = signal;

module.exports.getPlaybackVariables = getPlaybackVariables;
module.exports.getPlaylist = getPlaylist;
module.exports.getShuffledPlaylist = getShuffledPlaylist;

module.exports.playbackAtBoot = playbackAtBoot;
module.exports.playbackSocket = playbackSocket;
module.exports.mpdDbScanned = mpdDbScanned;

module.exports.trackFrameData = trackFrameData;
module.exports.playlistFrameData = playlistFrameData;
module.exports.usblistFrameData = usblistFrameData;
module.exports.renderAllPlayerPlaylistPages = renderAllPlayerPlaylistPages;

module.exports.stopElapsing = stopElapsing;
module.exports.checkCurrentRemoved =  checkCurrentRemoved;
module.exports.playCurrent = playCurrent;
module.exports.pauseCurrent = pauseCurrent;
module.exports.previousTrack = previousTrack;
module.exports.nextTrack = nextTrack;
module.exports.setRepeat = setRepeat;
module.exports.setShuffle = setShuffle;
module.exports.seekDuration = seekDuration;
module.exports.seekStop = seekStop;

module.exports.clearPlaylist = clearPlaylist;
module.exports.emptyPlaylist = emptyPlaylist;
module.exports.removeTrackInPlaylist = removeTrackInPlaylist;
module.exports.playTrack = playTrack;
module.exports.recoverPlaylist = recoverPlaylist;
module.exports.resetPlayback = resetPlayback;

module.exports.addUSBFile = addUSBFile;
module.exports.addUSBFolders = addUSBFolders;
module.exports.playUSB = playUSB;
module.exports.nullifyElapsed = nullifyElapsed;

// General note:................................................................
// USB Playback uses mpd and mpc (mpd's cli). A challenge is that mpd is also
// used by the upmpdcli systemd service that enables UPnP streaming. upmpdcli
// takes over the mpd, clears the mpd queue and starts streaming. When it stops
// the queue is in disarray and can not be used. This is the approach:
// * Playback manages it own playlist in nodejs, the GV 'playlist'. It has to be
//   rebuilt after that UPnP has streamed.
// * Only the current track is uploaded to mpd/mpc.
// * The mpd mode is single. 'single' = 1 (even tough single doesn't work).
// * mpc commands is preffered over mpd ones, however mpc does not always work
//   as expected and requires some workarounds using mpd.
// * Playback manage its own USB handling for music files
// * Playback imports the state GV 'machine' from machine.js, the export version
//   is however called machineCtl.
// * Playback implements its own 'shuffle' - no use of mpd random.

//Global System Variables.......................................................
var nextTrackId = 0;   //creating a unique id for every playlist, next number
//const fourSpaces = "&nbsp; &nbsp; &nbsp; &nbsp;";              //for noticies
const fiveSpaces = "&nbsp; &nbsp; &nbsp; &nbsp; &nbsp;";       //for noticies
const sixSpaces = "&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;"; //for noticies

//Global Objects as data structures---------------------------------------------
//----------------------------------------------------------- playback js object
// machine js object for Playback - singleton, persistent
function MachineObject() {
//states of Playback
  this.playing = false;     //true if playing, strict boolean
  this.current = false;     //playlist song id of current track or false
//playback values
  this.elapsed = 0;         //seconds elapsed of current track
  this.timer = false;       //timer object for elapsed time or false
  this.mpdId = false;       //mpd's song id for current track or false, "11"
  this.mpdBusy = false;     //true when machine needs mpd to do many cmds at once
//Note: mpdBusy above is going to be depreciated and can be deleted further on.
//      To start play 3 mpc commands have to be executed synchronously and the
//      intention with 'mpdBusy = true' was to avoid a stop by UPnP streaming
  this.mpdPaused = false;   //true only when the state of mpd/mpc is paused
//settings
  this.repeat = false;      /*boolean  */
  this.shuffle = false;     /*boolean  */
//USB
  this.usb = false;        //false, or Raspbian fs UUID for attached USB stick
  this.usbPath = "get root for usb"; //last rendered USB path, or root
};

//Create the playback object for backend - singleton, persistent
var playback = new MachineObject();

//helper function in order to get playback status - for machine page
function getPlaybackVariables() {
  return playback;
};
module.exports.playback = playback;

// track objects; none or many may exist  ---------------------- track js object
function PlayerTrackObject() {    //Note: constructor never called explicitely!
  this.songId = 0;    //start value is 0
  this.duration = 0;  //start value is 0
  this.Title = "";    //if no title file name will be the title, Title with T
  this.Artist = "";   //if "---" there is no artist associated to track
  this.Album = "";    //if "---" there is no album associated to track
  this.albumart = ""; //url to album art picture
  this.path = "";     //mpd uri for audio file /mnt/usb/...
};
// USB item objects; none or many may exist ------------------USB-list js object
function USBlistObject() { //Note: constructor never called explicitely!
  this.type = "";       //parent, folder or file
  this.path = "";       //mpd uri for audio file /mnt/usb/...
  this.duration = "";   //file - track only, duration in seconds (float)
  this.Title = "";      //if no title file name will be the title
  this.Artist = "";     //file - track only
  this.Album = "";      //file - track only
};
//----------------------------------------------------------- playlist js object
//playlist is an array and set at boot to empty [], type: js object,
//playlist contains track objects or empty, singleton, persistent
//addUSBFile() and playUSB() add individual tracks... deleteTrack() purges tracks
var playlist = []; //empty when there is no Playlist in Player

//helper function in order to get the playlist - for machine page
function getPlaylist() {
  return playlist;
};
module.exports.playlist = playlist;

//-------------------------------------------------- shuffled playlist js object
//shuffledPlaylist object holds arrays and set at boot to empty []
//They holds playlist indexes, singleton
//Behaviour of shuffle: Each track is current once in a shuffled order.
//Current track can be playing or not, doesn't matter. It has then been current.
//a. If Repeat is on a new shuffle occurs when every track has been current,
//   otherwise the player comes to a stop
//b. If another track is clicked it plays and starts traversing from there.
//c. If next is clicked it plays the next one that hasn't been current.
//d. The playlist is shuffled every time shuffle is toggled on, and emptied
//   when turned off.
//e. deleting a track means deletion of the track from the shuffle arrays.
//f. clearing the playlist means emptying the shuffle arrays
// Current can be playing or not, but it is displayed on Player page (browser).
function YatesFisherPlaylist() {
  this.notPlayed = []; //shuffled order of tracks to become current, a queue
  this.played = [];   //already tracks that have been current, a stack
};
//..........................................................
//Create the shuffle arrays
var shuffledPlaylist = new YatesFisherPlaylist(); //empty when shuffle is off

//helper function in order to get the shuffled playlist - for machine page
function getShuffledPlaylist() {
  return shuffledPlaylist;
};

module.exports.shuffledPlaylist = shuffledPlaylist;

//******************************************************************* BOOT start
var io;      // the socket.io server object for communication to all web pages
//var socket;  // the actual socket.io connection to a specfic web page

/**A. Playback at boot - must called after web server starts
 * Asks for the io, the communication object to all web pages of the UI.
 * ... machine.js sends the object through 'vars.readFrontEndVars()'
 * @param  {socket.io object}    ioFromMachine, the general server object
 * @signal {machine}             'io-set' fired to machine
 * @return {object}              socket.io object
 */
function playbackAtBoot(ioFromMachine) {
  io = ioFromMachine;    //must have the 'io' inorder to do io.emits
  signal.emit('io-set');
  //console.log(aux.timeStamp(), "playback: got the io set now!  [socket.io]");
  return io;
};

function playbackSocket(socketFromMachine) {
  //socket = socketFromMachine;
  console.log(aux.timeStamp(), "Playback: got a socket update");
}
/**BOOT - mpd is up and USB detection is on. If there is a user USB attached
 * it has to be scanned by mpd. If there is no USB send 'mpd-ready'
 * This listener requests mpd to scan and the boot continues at the mpd event
 * listener in mpd.mpdBootPreparations(), see 'client.on('system-database',...'
 * That mpd listener emits 'mpd-db-scanned' directly to machine. The function
 * mpd.mpdAtBootMPC() does the actual scan.
 * @param   {object}   data, mpd socket (NOT USED)
 * @event   {mpd}      recieves; 'mpd-ready' from machine-mpd.js
 * @signal  {machine}  emits; 'mpd-ready', mpd sockets are set
 */// [BOOT B0. is done and request machine to continue with B1. or scan USB]
 mpd.signal.on('mpd-ready', function(data) {
   signal.emit('mpd-ready');  //fire off ready event to machine
   if (playback.usb !== false) {
     //Yes, scan the usb, might take a long time
     mpd.mpdAtBootMPC();                //scan the USB and wait...
     console.log(aux.timeStamp(), "playback: >>> USB scanning started     [...]");
     //B2. network prep and start web server continues in event 'mpd-db-scanned'
     //it makes more sense that playback waits for scanning done event...
   }
   else {
     //No need to scan
     console.log(aux.timeStamp(),"Playback: no USB scanning needed.");
   };
 });
/** BOOT: Called by machine when mpd is done with its rescan of the its db,
 * and there is an USB attached already at boot time. Or a new USB is attached.
 * The mpd scan might take a long time before its is finished (seconds).
 * Critical that mpd is done scanning before any rendering of USB content.
 * The event is first caught in machine 'mpd.signal.on('mpd-db-scanned' ...'
 * and then this function is called from machine. It builds the USB-list page
 * and render. (the name is a little bit misleading)
 * BOOT with RECONNECT of bt speaker: this might generate a minor error if it is
 * done to quickly after mpd restart. Something is failing deep down in
 * 'MpdClient.prototype.sendCommand - assert.ok(self.idling);' at
 * (/player/lib/mpd.js:107:14) - the USB is updated eventually and all is okay.
 ** NORMAL OPERATIONS:
 * It is also called by machine's 'socket.on('page-opens', ...' [user events]
 * @params {boolean or object}  socket, if object it is a specific open web page
 * @browsers{USBlist page}      render
 * @return {?}                  not of interest
 */
function mpdDbScanned(socket = false) {
  //!socket && console.log(aux.timeStamp(), "playback: [...]  general usb list update path:\n", playback.usbPath );
  try {
    usblistFrameData(playback.usbPath, socket);  //endpoint in called fn
    //!socket && console.log(aux.timeStamp(), "playback: [...]  updated");
  }
  catch (err) {
    //minor error (at /player/lib/mpd.js:107:14) is caught here...
    console.log(aux.timeStamp(), "playback: [...]  update failed this time");
    //console.log(err, "\n");
  };
};
//========================================================= packers for frontend
//Packing frame data for frontend render functions------------------------------
//The frontend is a state-based UI - states defines the rendering. Each page has
//a function that creates a data frame based on the state of the machine.
//  Playback page   - trackFrameData()      -- parsed in playerplayback.js
//  Playlist page   - playlistFrameData()   -- parsed in playerplaylist.js
//  USB-list page   - usblistFrameData()    -- parsed in playerusb.js
//.............................................................USB Playback page
/**A. Playback page - create an object with the track and state information
 * needed in order to render a correct track frame on the Player page.
 * If there is a current track - provide track info.
 * The naming of fields in the track js object is inconsistent due to mpd naming
 * convention. Below the principles of finding album art:                   mpd:
 * track.Title = ""     if no title file name will be the title, or text     [T]
 * track.Artist = ""    if "---" no artist defined, or text                  [A]
 * track.Album = ""     if "---" no album text, or text                      [A]
 * track.albumart = ""  i)    no album art yet;                              [a]
 *                      ii)   url to album art picture or photo of artist;
 *                      iii) "albumart_missing.png" -> no art or photo found.
 * NOTE: uses model imported object machineCtl and a call to this function
 *       therefore might require an 'await' and an 'async' function...
 * @global {playback}   reading property values, also elapsed for current track
 * @global {machineCtl} reading property values, model.machineCtl
 * @global {playlist}   reading property values
 * @return {object}     data for Player page frame
 */
async function trackFrameData() {
  //console.log(aux.timeStamp(), "Playback: model is:\n", model);
  let stateinfo = playback;
  let status = model.machineCtl;  //this is the whole machine object
  let songId = stateinfo.current;
  let statusString = status.status;
  let isStreaming = getStreaming(statusString);
  //console.log(aux.timeStamp(), "Playback: streaming?", isStreaming, "[machineCtl]");
  //console.log(aux.timeStamp(), "Playback: G V playback object?\n", playback);
  //if ((songId !== false) && (statusString === "playback")) {
  if ((songId !== false) && (isStreaming === false)) {
    let trackinfo = playlist[findIndexInPlaylist(songId)];
    let artist = trackinfo.Artist;
    let albumart = trackinfo.albumart
//Step 1: if there is a current tarck try to find the album art
    if (artist === "---") {
    //A: no artist - then there is no use to look for albumart or photo
    // (trackinfo.album === "---")
      trackinfo.albumart = "albumart_missing.png";
      io.emit('albumart', {albumart: "albumart_missing.png" });
    }
    else if ((status.internet === true)  &&
             ((status.wifi.wifi === true) ||
              (status.lan.lan === true))   ) {
    //B: there is Internet access - get the album art, fire of 'album-art'...
      if ( (albumart == "") ||
           (albumart === "albumart_missing.png") ) {
             //B1: album art is not set or it is missing (try again...)
             //   first set to missing album art, then try to get the album art
             //FINALLY: try to get the album art or photo over Internet
             acquireAlbumart(artist, trackinfo.Album, trackinfo);
           }
           else {
             //B2: there is already an album art url present -> render again
             io.emit('albumart', {albumart: albumart });
           }
    }
    else {
    //C: no internet - set the album art to missing
      trackinfo.albumart = "albumart_missing.png";
      io.emit('albumart', {albumart: "albumart_missing.png" });
    };
//Step 2: set the state of the tack - i.e. duration elapsed
    let duration = Math.round(trackinfo.duration);  //maybe ceiling instead???
    /*
    console.log(aux.timeStamp(), "Playback: track frame:\n",
    { elapsed:stateinfo.elapsed, duration:duration,
    Title:trackinfo.Title, Artist:trackinfo.Artist, albumart:trackinfo.albumart,
    playing:stateinfo.playing, volume: status.volume,
    repeat:stateinfo.repeat, shuffle:stateinfo.shuffle, streaming: isStreaming } );*/
//Step 3: return the frame
    return { elapsed:stateinfo.elapsed, duration:duration,
    Title:trackinfo.Title, Artist:trackinfo.Artist, albumart:trackinfo.albumart,
    playing:stateinfo.playing, volume: status.volume,
    repeat:stateinfo.repeat, shuffle:stateinfo.shuffle, streaming: isStreaming };
  }
  else  { //idle or streaming, this is an empty frame . . .
    return { elapsed:false, duration:false,
    Title:false, Artist:false, albumart:false, playing:false,
    volume: status.volume, repeat: stateinfo.repeat,
    shuffle: stateinfo.shuffle, streaming: isStreaming };
    };
};
/**Playback page helper - read the streaming status of machine.
 * The param 'machineStatus' is supposed to be a machine status. It is expected
 * that the value of 'model.machineCtl.status' is provided.
 * @param  {string}   machineStatus, the value of 'model.machineCtl.status'
 * @return {boolean}  true = streaming, false = not streaming
 */
function getStreaming(machineStatus) {
  let result = false;
  switch (machineStatus) {
    case "spotify":
    result =  true;
    break;
    case "bluetooth":
    result =  true;
    break;
    case "airplay":
    result =  true;
    break;
    case "upnp":
    result =  true;
    break;
    default:
    break;
  };
  return result;
};
/**Playback page helper - try to get the album art asynchronously for trackFrame(),
 * in order to update the play card on Player page, when there is album art.
 * The javascript call for 'album-art' npm package is:
 * 'albumArt( artist, {album: album, size: 'large'}, ( error, response ) => {...'
 * NOTE: the above does not work - use CLI instead: (CLI is slower though)
 * 'sudo album-art '${track.Artist}' --album '${track.Album}' --size "large" '
 * @param   {string}   artist, the track.Artist
 * @param   {string}   album, the track.Album
 * @param   {object}   track, Playlist track object
 * @browser {player}   render all open browsers
 * @return  {string}   mostly  http URL for cover art or a photo, or a .png
 */
function acquireAlbumart(artist, album, track) {
  //console.log(aux.timeStamp(), "Playback:  album ", album, "artist", artist);
  let response = "albumart_missing.png";
  if (album !== '---') {
    //A: if there is an album title, album text, try to find the album art
    try {
      response = aux.mpdMsgTrim(
          execSync(`sudo album-art "${artist}" --album "${album}" --size "large"`,
               {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000}));
        //console.log(aux.timeStamp(), "Playback: response from CLI", response );
        if (response.indexOf("Error: No results found") !== -1) {
          //FAIL - no album art found
          //console.log(aux.timeStamp(),"playback: no album art ERROR - - -");
          //track.albumart = "albumart_missing.png";
          //io.emit('albumart', {albumart: "albumart_missing.png" });
          acquireArtist(artist, track);//trying to get a photo of the artist
        }
        else {
          //SUCCESS - album art exists, render album art!!!!
          let path = `${response}`;
          track.albumart = path;
          io.emit('albumart', {albumart: path });
        };
    }
    catch (err) {
      //ERROR - no album art found
      //console.log(aux.timeStamp(),"playback: album-art ERROR\n", err);
      //track.albumart = "albumart_missing.png";
      //io.emit('albumart', {albumart: "albumart_missing.png" });
      acquireArtist(artist, track);//trying to get a photo of the artist
    };
  }
  else {
    //B: no album title available for this track try to get a photo of artist
    acquireArtist(artist, track);//trying to get a photo of the artist
  }
  return response;
};

/**Player page helper - try to get the artist photo instead of album art,
 * used when there was no cover art to be found. See also 'acquireAlbumart()'
 * @param  {string}   artist, the track.Artist
 * @param  {object}   track, Playlist track object
 * @browser {player}  render all open browsers
 * @return {string}   mostly http URL for a photo of artist or .png
 */
function acquireArtist(artist, track) {
  if (artist != "---") {
  //if (true) {
    let response = "albumart_missing.png";
    try {
      response = aux.mpdMsgTrim(
          execSync(`sudo album-art "${artist}" --size "large"`,
               {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000}));
        //console.log(aux.timeStamp(), "Playback: response from CLI", response );
        if (response.indexOf("Error: No results found") !== -1) {
          //FAIL - no photo
          //console.log(aux.timeStamp(),"playback: no album art ERROR - - -");
          track.albumart = "albumart_missing.png";
          io.emit('albumart', {albumart: "albumart_missing.png" });
        }
        else {
          //SUCCESS - a photo of the artist exists, render photo as album art
          let path = `${response}`;
          track.albumart = path;
          io.emit('albumart', {albumart: path });
        };
    }
    catch (err) {
      //ERROR: no photo
      //console.log(aux.timeStamp(),"playback: artist photo ERROR\n", err);
      track.albumart = "albumart_missing.png";
      io.emit('albumart', {albumart: "albumart_missing.png" });
    };
  }
  else {
    track.albumart = "albumart_missing.png";
    io.emit('albumart', {albumart: "albumart_missing.png" });
  }
};
//..................................................................... Playlist
/**B. Playlist page - create an object with state and all track information...
 * needed in order to render a correct frame on the Playlist page.
 * NOTE: uses machine imported object machineCtl and a call to this function
 *       therefore requires an 'await' and an 'async' function...
 * @global {playback}   reading playing and streaming, + model.machineCtl.status
 * @global {playlist}   reading full playlist
 * @return {object}     frame data for Playlist page frame
 */
async function playlistFrameData() {
  return { streaming: getStreaming(model.machineCtl.status), playing: playback.playing,
           markedTrack: playback.current,
           list: playlist };
};
//................................................................. USBlist page
/**C. USBlist page - create an object with content of the USB attached needed in
 * order to render a correct frame on the USB-list page. Calls mpd.
 * Outgoing frame data format:
 * { streaming: boolean, list: [content object] }, content object can be []
 * Where content object are array elements on format:
 * { type: string, path: uri, duration: string, Title:string, Artist:string,
 * Album:string }; object -- empty array means no USB is attached,
 * USB is always mounted at /mnt/usb and linked to var/lib/mpd/music/
 *
 * @param   {mpd uri}     path mpd uri format "folder/subfolder/subfolder"
 * @param   {socket}      socket calling browser's socket, or false = render all
 * @mpd     {mpd socket}  get the mpd socket; from machine-mpd.js
 * @mpd     {lsinfo path} calls mpd to get file structures and metadata
 * @browser {USB page}    only the calling browser with socket, or all browsers
 * @return  {object}      frame data for USB-list page frame
 */
async function usblistFrameData(path, socket) {
  let isStreaming = getStreaming(model.machineCtl.status);
  if (playback.usb != false) {
    let usbListArray = [];
    let isPath = (path !== "get root for usb") ? (path) : ("usb");
    playback.usbPath = path;
    //console.log(aux.timeStamp(), "Playback: usb real path is:  ", isPath);
    if (isPath !== false) {
      let mpdSocket = await mpd.getSocketMPD("usblistFrameData");
      //Sometimes error happens here - ignore, ADD 'try {} catch(err) {}' HERE!!!
      mpdSocket.sendCommand(cmd("lsinfo", [isPath]), async function(err, msg) {
        if (err) {
          // discard error
          console.log(aux.timeStamp(), "Playback: usb list ERROR in mpd\n?", err);
        }
        else {
            //render the content of the USB folder
            usbListArray = await aux.mpdParseLsinfo(msg, isPath);
            if (socket != false) {
              socket.emit('open-folder', {streaming: isStreaming, list: usbListArray});
            }
            else {
              io.emit('open-folder', {streaming: isStreaming, list: usbListArray});
            };
          };
      });
    }
    else { //this should not happen, isPath should have a value != false
      io.emit('open-folder', {streaming: isStreaming, list: []});
      return [];
    };
  }
  else {//render the empty USB....
    //console.log(aux.timeStamp(), "Playback: no usb attached, render empty array ");
    io.emit('open-folder', {streaming: isStreaming, list: []});
    return [];
  };
};

// USB Playback page buttons and sliders __________________ Backend for Playback

/**Machine - PLAY current track, calls mpd or mpc         - endpoint of fn-calls
 * This is the core play function of current track. It is horrible due to some
 * short commings of mpd and mpc...      some of them are mentioned below.
 * Plays the current track at elapsed time, it might be 0 or more.
 * A1. If .mpdId is false current track hasn't been played yet, it is not in mpd.
 * A2. .mpdId is true, track already in mpd queue - play track at elapsed
 * B.  If new track, first clear the mpd queue and then add track in .current
 * C1. If elapsed is 0 track can be played without a mpc 'seek'
 * C2. if elasped > 0, first 'play' than 'seek' since mpc is used (this is silly)
 * C3. However, elapsed cannot be too close to duration (min. 2 sec)
 * Warning: mpc cannot use track file names with ' (like "doesn't" ...in titles)
 * that is why the mpd command addid is used instead of the mpc command add.
 * Called by playTrack(), previous(), next(), trackEnd(), playUSBFile()
 * Order of execution to render the playing track:
 *   playCurrent() -> mpd -> 'mpd-playing' event -> renderPlayCurrent()
 * @param {string}          socket, which function is calling
 * @param {string}          who, which function is calling
 * @global {playlist}       find track with .current read .duration .path
 * @global {playback}        read: .mpdId
 * @return {?}              would have been nice to set, but mpd rules...
 */
 function playCurrent() {  //machine sends 'socket', why???
//first:   block mpd, i.e. prevent trackEnd() to be called in mpd status events
   playback.mpdBusy = true; //mpd stop events will be discarded by playback...
   let track = playlist[findIndexInPlaylist(playback.current)];
   let elapsed = playback.elapsed;    //elapsed is always an integer (seconds)
   let duration = track.duration;    //duration is a float (seconds) Math.trunc?
//Major debug consoles . . .
//console.log(aux.timeStamp(),"playback: [playCurrent] ---|>");
//console.log(aux.timeStamp(),"           playback is\n", playback);
//console.log(aux.timeStamp(),"              track is/n", track);
//console.log(aux.timeStamp(),"playback: [playCurrent] -----");
//Minor debug consoles . . .
//console.log(aux.timeStamp(),"playback:  mpdId:", playback.mpdId, "| machine id:", track.songId, "| du:", duration, "el:", elapsed );
//console.log(aux.timeStamp(),"playback:  path:", track.path, "| mpd busy?", playback.mpd, "| du:", duration, "el:", elapsed );
//A1. Play a current track, track is not in mpd = it has not been played yet
   if (playback.mpdId == false) {
//B. Clear mpd queue and add the new track..................clear and add track
//C1, C2. and C3. is handled by mpd.playCurrentUseMPC() further on
    mpd.playCurrentNotInMPD(track, elapsed);
  }//        --- end of A1. when .mpdId === false (see D1. for C3. above)
//A2. Track is already in mpd queue, it has been played, now paused, play again
//C1, C2. and C3. is handled by mpd.playCurrentUseMPC()
  else {
    mpd.playCurrentUseMPC(track, elapsed);
  };
};

/**Machine - render a track being played
 * Invoked by the 'mpd-playing' event to do the last part of playing a track.
 * This happens after playCurrent() has called the mpd.
 * @param  {integer}      elapsed, elapsed so far, 0 or more, sec
 * @param  {float}        duration, total duration of track, sec
 * @param  {socket.io}    socket, socket to calling player page, NOT USED ANYMORE
 * @param  {boolean}      noPlay, true if elasped is too close to duration
 * @global {playback}     set .mpdPaused .playing .mpdBusy .mpdAlsaPID
 * @render {browsers}     Player and Playlist pages
 * @return {?}            of no interest, only side effects here
 */
async function renderPlayCurrent(elapsed, duration, socket = false, noPlay) {
//console.log(aux.timeStamp(), "playback: >>>>> render play?", !noPlay);
    if (noPlay === false) {
      //console.log(aux.timeStamp(), "playback: set ---.playing = true & ---.mpdPaused = false");
      playback.playing = true;   playback.mpdPaused = false;
      machine.setMachineStatus("playback");
      startElapsing(elapsed, duration); //duration is not a float
      io.emit('status', "playback");    //update status frame on start page
    }
    else {
      playback.playing = false;  playback.mpdBusy = false;
      machine.setMachineStatus("idle");
      io.emit('status', "idle");    //update status frame on start page
    };
    //This is not used anymore... socket is always false
    if (socket && !noPlay) { //playCurrent was called from Player page
      socket.broadcast.emit('replace', await trackFrameData());  //endpoint
      socket.broadcast.emit('render', await playlistFrameData());//endpoint
    }
    else { //...called by machine - total update required of all pages
      //console.log(aux.timeStamp(), "playback: RENDER ALL => [], [], [] \n");
      renderAllPlayerPlaylistPages(); //endpoint -> THIS IS USED ALWAYS
    };
  };

 /**Machine - error handling when mpd cannot play a track
  * Used by playCurrent() when things go wrong.
  * Typical mpd error message: "Error:  [50@0] {playid} No such song"
  * ...it is assumed that the most common error is a missing audio file
  * @param  {string}       err, mpd error
  * @param  {string}       errorString, more comprehensible description
  * @global {playback}     resets .elapsed .mpdPaused .playing
  * @render {browsers}     Player and Playlist pages
  * @return {?}            of no interest
  */
 function mishapPlayCurrent(err, errorString) {
   stopElapsing();
   console.log(aux.timeStamp(),"Machine:", errorString );
   // console.log(aux.timeStamp(),"Machine:\n", err );
   io.emit("herald", {type: "error", missive: `Cannot Play this Track! <br>
                                               Track is Missing...     <br>
                                               ----------------------- <br>
                                               <em>...add track again</em>`,
                      duration: 26000});
   io.emit("herald", {type: "error", missive: `${errorString} <br>`,
                                     duration: 26000});
   playback.elapsed = 0;
   playback.playing = false;
   playback.mpdPaused = false;
   machine.setMachineStatus("idle");
   io.emit('status', "idle")
   renderAllPlayerPlaylistPages(); //endpoint of rendering
 };

/**Machine - PLAY track from Playlist or USBlist page, not from USB Playback page.
 * Play new track with the playlist array index data.songId from the beginning,
 * unless when it is the same track that is going to be played again. The latter
 * might happen when playing from Playlist (pause/play sequences of same track).
 * Calls playCurrent(), sometimes with a new current track where elapsed is 0.
 * Rendering happens in playCurrent() or in mishapPlayCurrent(), both above.
 * @param  {object}         data track data structure with songId
 * @global {playback}       set .current .elapsed .mpdId
 * @return {boolean}        true
 */
function playTrack(data) {
  //console.log(aux.timeStamp(), "machine: [PlayTrack] incoming NEW track:", data.songId, " -- current:", playback.current, "at", playback.elapsed  );
  if (playback.current !== data.songId) {
    //This is a change of track!
    playback.elapsed = 0;              //elapse is set to 0
    playback.current = data.songId;    //new current set
    playback.mpdId = false;            //reset mpdId will add the track to mpd
  };
  //lets play - call the core play function with new track set up in machine
  //console.log(aux.timeStamp(), "machine: [PlayTrack] going to play track:", playback.current, " |> at", playback.elapsed );
  playCurrent("[playTrack called]");  //endpoint of rendering
  return true;
};
/**Machine - PAUSE track, calls mpd - also end point of fn-calls
 * Pause track currently playing. Render new pages for all browsers.
 * Note: when used by 'machine.busyStreaming()' then no rendering.
 * @param  {object}       page,if track is stopped on Playlist Page -> no notify
 * @param  {boolean}      noRender,if true no rendering here
 * @global {playback}     sets .playing
 * @render {all browsers} Player and Playlist
 * @return {boolean}      true or false if mpd failed
 */
async function pauseCurrent(page, noRender = false) {
  let outcome = false;
  if (playback.playing) {
    outcome = await mpd.pauseCurrentMPC();
    //console.log(aux.timeStamp(), "playback: executing || for", page.page, "mpd =", outcome);
    if (outcome === true) {
      playback.playing = false;
      machine.setMachineStatus("idle");
      !noRender && io.emit('status', "idle");      //update status frame on start page
      stopElapsing();
      !noRender && renderAllPlayerPlaylistPages(); //total update required of all browsers
      (page.page !== "playlist") &&
       io.emit("bulletin",{type: "info", missive: "Paused Track"});
    }
    else {
        mishapPause();
    }
    return outcome;

  }
  return outcome;
};
/**Machine - error handling when mpd cannot pause playing
 * Used by pauseCurrent() ------------ have to stop mpd instead, not only pause
 * @param  {string}       err, mpd error or false
 * @global {playback}     resets  .elapsed .mpdPaused .playing
 * @render {browsers}     Player and Playlist pages
 * @return {?}        of no interest
 */
async function mishapPause(err) {
  let outcome = true;
  io.emit("herald", {type: "error", missive: `Problem with pausing!<br>
                                              Track reset to start...<br>
                                              -----------------------<br>
                                              <em>...play and try again</em>`});
  stopElapsing();
  outcome = await mpd.mpdBrutalStop();  //really try to stop
  if (outcome === false) {
    await mpd.mpdBrutalStop(1500);
  };
  playback.playing = false; playback.elapsed = 0;
  machine.setMachineStatus("idle");
  io.emit('status', "idle")
  renderAllPlayerPlaylistPages(); //total update required of all browsers
};

//...................................................................... elapser
/**Machine - starts the elapse timer - sets the machine.elapsed
 * The purpose is to continously get the elapsed time for current track when
 * playing. It starts the timer if there is enough time to continue playing
 * mpd playing is not stopped here or at all affected by this function;
 * The 'playback.elapsed' is set by the event 'mpd-elapsed', see just below...
 * When mpd stops at track end it triggers a state changed caught by
 * mpd.newMPDStatus(), the timer will always be stopped in stopElapsing().

 * Find % - `sudo mpc status | fgrep '(' | cut -d'(' -f2 | cut -d'%' -f1 `
 * Find mm:ss - `sudo mpc status | fgrep '(' | cut -d'/' -f2 `
 * @param { integer}  elapsed  elapsed time in seconds,
 * @param  {float}    duration total duration in seconds and milliseconds
 * @global {playback} sets values .elapsed .timer (.mpdBusy if no play)
 * @return {object or Boolean} timer or false if the timer did not start
 */
function startElapsing(elapsed, duration) {
  (playback.timer !== false) && stopElapsing();
  if ((Math.round(duration) - elapsed) > 1.8) {
    let timerInterval = setInterval(async function() {
      //request elapsed time - the results show up in the event 'mpd-elapsed'
      await mpd.getMPDElapsed();
      //console.log(aux.timeStamp(), "playback: requested elapsed time . . .");
    }, 500); /*execute time interval in ms */
    playback.timer = timerInterval;
    return timerInterval;
  }
  else {
    playback.mpdBusy = false;  //release mpd if no play
    playback.elapsed = Math.round(duration);
    return false;
  };
};
 /**Essential helper to startElapsing above, the only way to get the mpd
  * update of the elapsed time of a playing track. When a track stops there
  * might be a delay (due too await's) so better check playing === true before
  * setting 'elapsed'.
  * Stopping the timer above is not enough since we are forced to poll mpd
  * status messages in 'mpd.getMPDElapsed()' and fire event 'mpd-elapsed' .
  * @global    {playback}    set; .elapsed
  * @event     {mpd}         'mpd-elapsed' from 'mpd.getMPDElapsed()'
  * @return    {?}           not of interest
  */
mpd.signal.on('mpd-elapsed', function(elapsed) {
  //console.log(aux.timeStamp(), "playback: elapsed =", Math.ceil(elapsed));
  if (playback.playing === true) playback.elapsed = Math.ceil(elapsed);
});
/**Machine - stop mpd now!  . . .  and call trackEnd() to tidy up.
 * Called when mpd has to be stopped. Used by nextTrack() and also
 * shufflePlayCurrent() then 'toTop' is set to true.
 * @param  {boolean}    toTop if true next track will be start of playlist
 * @return {boolean}    true or false when in error state
 */
async function mpdEmergencyBrake(toTop) {
  stopElapsing();
  let mpdFailed = await mpd.mpdEmergencyBrakeMPC();
  if (mpdFailed === false) {
    //hopefully trackEnd() is not caught by mpd status event listener
    //  console.log(aux.timeStamp(), "Machine: emergency STOP");
    trackEnd(toTop, "mpdEmregencyBrake"); //end-point; toTop is just passed along
    return true;
  }
  else {
    trackEnd(toTop,"mpdEmregencyBrake" ); //end-point; toTop is just passed along
    mpdFailed = await mpd.mpdBrutalStop();
    if (mpdFailed === false) {
      mpd.mpdBrutalStop(1500);
    };
    return false;
  };
};
/**Machine - stop elapse timer for the machine, not mpd................. stopper
 * Delete timer and remove the timer id, frequently called
 * @global {playback}    sets property value timer to FALSE
 * @return {boolean}    true
 */
async function stopElapsing() {
  const timer = playback.timer;
  if (timer !== false) {
    await clearInterval(timer);
    playback.timer = false;
  };
  return true;
};
/**Machine - stop elapse timer if it is the current track that is going to be
 * removed. Calls stopElapsing() above.
 * @param  {object}    data read property songId of a track object
 * @return {?}         of no interest
 */
async function checkCurrentRemoved(data){
   if (playback.current === data.songId)  {
     await stopElapsing();
   };
};

//.................................................................... the ender
/**Machine - track has reached its end, clean up; endpoint of fn-calls.
 * The machine is in playing state since track ended.
 * This is called by handleMPDStatusUpdate() - mpd status event listener
 * @param  {boolean}      toTop - back to the start of playlist, no playing
 * @global {playback}     reading / setting property values
 * @global {playlist}     reading property values
 * @render {all browsers} Player and Playlist [endpoint]
 * @return {boolean}      true
 */
function trackEnd(toTop, who="unknown?") {
  //console.log(aux.timeStamp(),"Machine: track end, called by:", who);
  stopElapsing();
  if (toTop === true) {
    // logger.log("Machine: to top of playlist, no rep/shu applies");
    playback.playing = false; /*stops playing*/
    machine.setMachineStatus("idle");
    io.emit('status', "idle");    //update status frame on start page
    playback.elapsed = 0;    /*brings elapsed to 0 */
    playback.mpdId = false; //it might not have been played, reset to be sure
    renderAllPlayerPlaylistPages();
  }
  else {
    switch(playlist.length) {
      case 0:
  //CASE 4: [] empty playlist - no action; this should not happen!
      // logger.log(aux.timeStamp(),"Machine: track end, 4. no track - synch error");
      playback.playing = false; playback.elapsed = 0; playback.mpdId = false;
      playback.mpdBusy = false; playback.current = false;
      machine.setMachineStatus("idle");
      io.emit('status', "idle");    //update status frame on start page
      renderAllPlayerPlaylistPages();//render to get browsers synched
      break;
      case 1:
  //CASE 3: [0] one track in playlist
     //3b. one track in playlist and repeat or shuffle is true
     if ((playback.repeat === true) | (playback.shuffle === true)) {
       // logger.log(aux.timeStamp(),"Machine: trackEnd; 3b. one track, rep or shu is on");
       nextTrack("*track end [0]*");     /*brings elapsed to 0, resets mpdId and plays again*/
     }
     else {
       //3a. one track in playlist and no repeat/shuffle - it ends here!!!!!
       // console.log("Machine: trackEnd; 3a. one trackin list, no rep/shu");
       playback.playing = false; /*stops playing, but mpdId is still valid*/
       machine.setMachineStatus("idle");
       io.emit('status', "idle");    //update status frame on start page
       playback.elapsed = 0;    /*brings elapsed to 0 */
       playback.mpdId = false; //it might not have been played, reset to be sure
       setCurrentTrack(0);   //why do a reset here? it is current???
       renderAllPlayerPlaylistPages();//have to render elapsed 0 and no play
       io.emit("herald",{type: "done", missive: `${sixSpaces}End of Playlist!${sixSpaces}`});
     };
      break;
      default:
  //CASE 1 & 2: [0..n] - more than one track in playlist, sometimes the last one
      let isLastTrack = (findIndexInPlaylist(playback.current) === (playlist.length - 1));
      if ((isLastTrack === false)) {
        //CASE 1a. : more than one track, not the last one . . .
        // . . .call nextTrack() since playing is true here
        //console.log("Machine: trackEnd; 1a. more than one track");
        nextTrack("*track end [0..n]*");            /*brings elapsed to 0 */
      }
      else if ((playback.repeat === true) | (playback.shuffle === true)) {
      //CASE 2b. last track and repeat or shuffle is true
      //  logger.log("Machine: trackEnd; 2b. last track rep or shu is on")
      nextTrack("*track end[last]*");              /*brings elapsed to 0 */
    }
    else {
      //CASE 2a. last track and no repeat/shuffle, stop playing, get first track
      //  console.log("Machine: trackEnd; 2a. last track");
      playback.playing = false; /*stops playing and stops timer */
      machine.setMachineStatus("idle");
      io.emit('status', "idle");    //update status frame on start page
      playback.elapsed = 0;     /*brings elapsed to 0 */
      playback.mpdId = false;  //since change of track mpdId is not valid
      setCurrentTrack(0);     //reset track to first track
      renderAllPlayerPlaylistPages();//have to render first track and no play
      io.emit("herald",{type: "done", missive: `${sixSpaces}End of Playlist!${sixSpaces}`});
    };
  };
};
  return true;
};
//....................................................................the prever
/**Machine - get PREVIOUS track and make it current track.
* Get previous track in order, linear directly from playlist or shuffled.
 * @global {playback}   reading property values reset .elapsed .mpdId
 * @global {playlist}   reading property values
 * @return {boolean}    true
 */
 function previousTrack() {
   playback.elapsed = 0; /* duration have to be set to 0  */
   const playlistLength = playlist.length;
   const playing = playback.playing;
   switch(playlistLength) {
     case 0:
//CASE 4: [] empty playlist - no action; this should not happen!
     //  logger.log("Machine: prev; 4. no track at all - synch error");
     renderAllPlayerPlaylistPages();//render to synch all browsers
     break;
     case 1:
//CASE 3: [0] one track in playlist
    //3b. one track in playlist AND playing -> play
    if (playing === true) {
      playback.elapsed = 0;      //elapse is set to 0
      playback.mpdId = false;    //reset mpdId will add the track to mpd again
      playCurrent("previousTrack [0]");
      //singleNextOrPrevious() //endpoint function and mpdId is still there
      //console.log("Machine: prev; 3b. only one track in mpd, state: playing - mpd plays again")
    }
    else {
      //3a. one track in playlist and NOT playing - no action
      //  logger.log("Machine: prev; 3a. only one track in mpd, state: not playing");
      renderAllPlayerPlaylistPages();//render all to show elapsed 0
    };
     break;
     default:
     playback.mpdId = false;
     const repeating = playback.repeat;
     const shuffling = playback.shuffle;
     const currentIndex = findIndexInPlaylist(playback.current);
//CASE 2: [first..n] - more than one track in playlist, but first track
     if (currentIndex === 0) {
       if (playing === true) { //Playing . . .  code for 2b. and 2d. and 2f.
         if ((repeating === false) && (shuffling === false)) {
           // console.log("Machine: prev; 2b. no previous track, this is the first track - playing is true, mpd plays again");
           playCurrent("previousTrack [1st...n]");
           io.emit("herald",{type: "done", missive: `${fiveSpaces}Start of Playlist!${fiveSpaces}`});
         }
         else if ((repeating === true) && (shuffling === false)) {
           //  logger.log("Machine: prev; 2d. first track; REPEAT is on; next track = last track, mpd plays");
           setCurrentTrack(playlistLength - 1);
           playCurrent("previousTrack [1st...nR]");
         }
         else {
           let nonlinearIndex = setShuffledTrack(currentIndex, true);//left
           //  logger.log("Machine: prev; 2f. previous shuffled track plays; index =", nonlinearIndex,"...Machine index =", machine.current);
           let log = "Machine: prev; 2f. previous shuffled track plays; song id = " + nonlinearIndex;
           let logFalse = "Machine: next; 2f. no previous shuffled track, last shuffled track . . .";
           shufflePlayCurrent(nonlinearIndex, log, logFalse);
         };
        }
        else {//Not playing . . . code for 2a. and 2c. and 2e.
         //2a. [first..n] more than one track in playlist, first track, at start of playlist
         if ((repeating === false) && (shuffling === false)) {
           //  logger.log("Machine: prev; 2a. no previous track - first linear track, no action by mpd" );
           renderAllPlayerPlaylistPages(); //have to render elapsed = 0
           io.emit("herald",{type: "done", missive: `${fiveSpaces}Start of Playlist!${fiveSpaces}`});
         }
         else if ((repeating === true) && (shuffling === false)) {
           //  logger.log("Machine: prev; 2c. first track; REPEAT is on; next = last track");
           setCurrentTrack(playlistLength - 1);
           renderAllPlayerPlaylistPages(); //have to render new track
         }
         else {//same as 2a. for now . . . (REPEAT is also taken care of)
           let nonlinearIndex = setShuffledTrack(currentIndex, true); //left
           let log = "Machine: prev; 2e. at first track; previous shuffled track (since Shuffle = on), " + nonlinearIndex;
           let logFalse = "Machine: prev; 2e. at first track; no previous shuffled track either (since Shuffle = on)";
           //   logger.log("Machine: prev; 2e. first track; no previous track, linear - but Shuffle = on");
           shuffleCurrentTrack(nonlinearIndex, log, logFalse);
           logFalse && io.emit("herald",{type: "done", missive: `${fiveSpaces}Start of Playlist!${fiveSpaces}`});
         };
       };
     }
     else {
//CASE 1: [0..n] - more than one track in playlist - REPEAT has no effcet
        //1c. [0..n]  more than one track in playlist, shuffle on
        if (playing === true) {//Playing... code for cases 1b. and 1d
          //1b. [0..n] more than one track, play previous track, see *) below
          //  console.log("Machine: prev; [0..n] more than one track -- not first track, play");
          playback.mpdId = false;
          const repeating = playback.repeat;      //NOT USED HERE
          if (shuffling === false) {
            setCurrentTrack((currentIndex - 1));
            //  logger.log("Machine: prev; 1b. previous linear track now in mpd, mpd is playing");
            playCurrent("previousTrack [0...n]");
          }
          else {
            let nonlinearIndex = setShuffledTrack(currentIndex, true); //left
            //  logger.log("Machine: prev; 1d. previous shuffled track; index =", nonlinearIndex,"...Machine index =", machine.current);
            let log = "Machine: prev; 1d. previous shuffled track; song id = " + nonlinearIndex;
            let logFalse = "Machine: prev; 1d. no previous shuffled track, first shuffled track . . ."
            shufflePlayCurrent(nonlinearIndex, log, logFalse);
          };
        }
        else {//Not playing... code for cases 1a. and 1c
    //1a. [0..n] more than one track in playlist, get previous track in playlist
          if (shuffling === false) {//Do not have to consider Repeat
            setCurrentTrack((currentIndex - 1));
            //  logger.log("Machine: prev; 1a. previous track");
            renderAllPlayerPlaylistPages();
          }
          else {//1c. is the same as 1a. since not playing
            let nonlinearIndex = setShuffledTrack(currentIndex, true); //left
            let log = "Machine: prev; 1c. previous shuffled track, since Shuffle = on, " + nonlinearIndex;
            let logFalse = "Machine: prev; 1c. no previous shuffled track, since Shuffle = on ";
            //  logger.log("Machine: prev; 1c. no previous shuffled track, first shuffled track . . .");
            shuffleCurrentTrack(nonlinearIndex, log, logFalse);
           };
        };
      };
    };
  return true;
};//................................................................. the setter
/**Machine - set linear .current in the machine, helper to previous and next
 * @param  {integer}            index is the new index in playlist
 * @global {playback}           sets .current
 * @global {playlist}           gets the song id value which is array index
 * @return {songId}             mpd id - integer
 */
 function setCurrentTrack(index) {
   //let track = playlist[index];
   //  logger.log(aux.timeStamp(), "Machine: new current:", track.Title, "; index is:", index);
   playback.current = playlist[index].songId;
 };
 //.............................................................. the shuffler
 /**Machine - set .current in the machine, helper to previous/next when shuffle
  * Machine might be playing here - shuffle works on current tracks.
  * This is what happens: All track indexes that not yet have been current are
  * in the array notPlayed, it is a queue. All tracks that have been current
  * and might have been played as well, are in the array Played.
  * Note: the last index in notPlayed is currentIndex and can mostly be found
  * last in Played array to begin with and is put in the Played array. If the
  * direction is right the next shuffled index is the new last element and set
  * as current and returned. If traversing left and called from Previous() the
  * last index of Played is put back as the last element of notPlayed, and set
  * as current and returned. When notPlayed is empty - the shuffle is over,
  * all tracks have been current. If repeat is on a new shuffle will happen when
  * notPlayed is empty. The reason why the last elements are used is because
  * it is much faster than manipulating the arrays in the front - no reindexing.
  * @param  {integer}            currentIndex is the index of current track
  * @param  {boolean}            direction, false means traversing right
  * @global {playback}           sets .current, just as setCurrentTrack() does
  * @global {shuffledPlaylist}   changes index arrays .notPlayed and .played
  * @global {playlist}           gets actual song id
  * @return {songId}             track index - integer or false if notPlayed is empty
  */
function setShuffledTrack(currentIndex, direction) {
  let notPlayed = shuffledPlaylist.notPlayed;
  //CASE 2: only last track left and it was played - end of shuffle list
  if ((notPlayed.length < 2) && (direction === false)) {
    //  logger.log("Machine: setShuffle; *** no more tracks in shuffle ***");
    playlistShuffle();
    if (playback.repeat === true) {
      //  logger.log("Machine: setShuffle; 2b. Repeat is ON - new shuffle");
      setShuffledTrack(currentIndex, false);
    }
    else {
      let id = playlist[0].songId;
      playback.current = id; //songId is first linear track, so trackEnd() works
      //  logger.log("Machine: setShuffle; 2a. shuffle done, index set to false, back to start of playlist")
      return false;
      };
  }
  else { //CASE 1: at least two indexes in notPlayed[], get next shuffled index
      var shuffleIndex;
      let alreadyPlayed = shuffledPlaylist.played;
      //  logger.log("Machine: setShuffle; 1. at least two track left in shuffle - shuffle plays . . .")
      if (direction === false) { //CASE: 1a. traverse right; get next
        let arrayIndex = aux.findElementInArray(currentIndex, notPlayed);
        if (arrayIndex !== -1) { //remove current index  from not played
          notPlayed.splice(arrayIndex, 1);
        };//add current index to the tracks being played
        if (aux.findElementInArray(currentIndex, alreadyPlayed) === -1) {
          alreadyPlayed.push(currentIndex);
          //  logger.log("Machine: pushed current:", currentIndex, "into played[]\n", alreadyPlayed);
        };//next track is now last shuffled index
        shuffleIndex = notPlayed[notPlayed.length - 1];
        //  logger.log("Machine: setShuffle; 1a. \nnot played[]", notPlayed,"\nplayed[]", alreadyPlayed, "\nMachine:         -> new index:",shuffleIndex);
        //  logger.log("Machine: setShuffle; 1a. ");
        return (playback.current = playlist[shuffleIndex].songId);
      }
      else { //CASE: 1b. traverse left; get the previous shuffled track
        if (alreadyPlayed.length === 0) { //nothings was played yet . . .
          // logger.log("Machine: setShuffle; 1c. traversing left, at start of shuffle list \nnot played[]", notPlayed,"\nplayed[]", alreadyPlayed, "\nMachine:         -> new index:",shuffleIndex);
          if (playback.repeat === true) {
            //  logger.log("Machine: setShuffle; 2b. Repeat is ON - new shuffle, traversed left");
            playlistShuffle();
            setShuffledTrack(currentIndex, false);
          }
          else {
            //  logger.log("Machine: setShuffle; 1c. traversing left, at start of shuffle list ");
            return currentIndex; //current track will be index
          };
        }
        else {//previous track is last index in played = shuffleIndex
          shuffleIndex = alreadyPlayed[alreadyPlayed.length - 1];
          notPlayed.push(shuffleIndex); //add shuffleIndex to not played
          alreadyPlayed.pop(); //remove shuffleIndex from played
          //logger.log("Machine: setShuffle; 1b. traversing left, \nnot played[]", notPlayed,"\nplayed[]", alreadyPlayed, "\nMachine:         -> new index:",shuffleIndex);
          //  logger.log("Machine: setShuffle; 1b. traversing left");
          return (playback.current = playlist[shuffleIndex].songId);
        };
      };
    };
  };
//................................................................... the nexter
/**Machine - get NEXT track and make it current track.
 * Get  next track in order, linear from Playlist directly or next shuffled.
 * @global {playback}   reading property values reset .elapsed .mpdId
 * @global {playlist}   reading property values
 * @return {boolean}    true
 */
 function nextTrack(who="unknown!") {
   //console.log(aux.timeStamp(), "machine: ** nextTrack called by", who);
   playback.elapsed = 0;   //duration have to be set to 0 - new track!
   const playlistLength = playlist.length;
   const playing = playback.playing;
   switch(playlistLength) {
     case 0:
//CASE 4: [] empty playlist - no action; this should not happen!
     // logger.log("Machine: next; 4. no track - synch error");
     renderAllPlayerPlaylistPages();
     break;
     case 1:
//CASE 3: [0] one track in playlist
    //3b. one track in playlist AND playing -> play, mpdId is still correct
    if (playing === true) {
      //  console.log("Machine: next; 3b. only one track state: playing - request again", machine.mpdId)
      //singleNextOrPrevious();
      playback.elapsed = 0;      //elapse is set to 0
      playback.mpdId = false;    //reset mpdId will add the track to mpd again
      playCurrent("nextTrack [0]");
    }
    else {
      //3a. one track in playlist and NOT playing - no action, keep the track
      //  logger.log("Machine: next; 3a. only one track, state: not playing - no play");
      renderAllPlayerPlaylistPages();
    };
     break;
     default:
     playback.mpdId = false; //...and load to mpd --> new mpdId has to be set
     const repeating = playback.repeat;
     const shuffling = playback.shuffle;
     const currentIndex = findIndexInPlaylist(playback.current);
//CASE 2: [0..last] - more than one track in playlist, but LAST track
     if ((currentIndex + 1) === playlistLength) {
       if (playing === true) { //Playing . . . code for 2b. play next in line
         if ((repeating === false) && (shuffling === false)) {
           console.log("Machine: next; 2b. no next track, this is the last track . .");
           //  logger.log("Machine: . . . . - playing is true but mpd stops");
           mpdEmergencyBrake(); //stop the mpd, calls trackEnd() = endpoint
          }
          else if (shuffling === true) { //Playing . . . code for 2f. SHUFFLE
            //  logger.log("Machine: *** last linear track; but next is shuffled track *** ");
            let nonlinearIndex = setShuffledTrack(currentIndex, false);
            //  logger.log("Machine: next; 2f. next shuffled track; song id =", nonlinearIndex);
            let log = "Machine: next; 2f. next shuffled track; song id = " + nonlinearIndex;
            let logFalse = "Machine: next; 2f. no next shuffled track, last shuffled track . . .";
            shufflePlayCurrent(nonlinearIndex,log,logFalse);
          }
          else { //Playing . . . code for 2d. REPEAT play at the top
            //  logger.log("Machine: next; 2d. last linear track; REPEAT is on; next is 1st");
            setCurrentTrack(0);
            playCurrent("nextTrack [0..lastR]");
          };
        }
       else {//Not playing . . . code for 2a. and 2c. and 2e.
         if ((repeating === false) && (shuffling === false)) {
           //  logger.log("Machine: next; 2a. no next track - at last linear track, no action!" );
           renderAllPlayerPlaylistPages();
           io.emit("herald",{type: "done", missive: `${sixSpaces}End of Playlist!${sixSpaces}`});
       }
       else if ((repeating === true) && (shuffling === false)) {
         //Not playing . . . 2c. REPEAT render first track again
         //  logger.log("Machine: next; 2c. at last linear track; REPEAT is on; next = 1st track");
         setCurrentTrack(0);
         renderAllPlayerPlaylistPages();
       }
       else { //Not playing . . .  2e. SHUFFLE (setShuffledTrack fixes REPEAT)
         let nonlinearIndex = setShuffledTrack(currentIndex, false);
         let log = "Machine: next; 2e. at last linear track;shuffle is ON, next song id " + nonlinearIndex;
         let logFalse = "Machine: next; 2e. at last linear track; no next shuffled track either (shuffle = on)"
         //   logger.log("Machine: next; 2e. last track; no next linear track, but shuffle = on");
         shuffleCurrentTrack(nonlinearIndex, log, logFalse);
     };
   };
 }
 else {
//CASE 1: [0..n] - more than one track in playlist - REPEAT has no effect
        if (playing === true) { //Playing... code for 1b.
          if (shuffling === false) {
            setCurrentTrack((currentIndex + 1));
            playCurrent("nextTrack [0..n]");
            //console.log("Machine: next; 1b. next track, playing",currentIndex,"=>",(currentIndex + 1));
          }
          else {//Playing... code for 1d.
            let nonlinearIndex = setShuffledTrack(currentIndex, false);
            let log = "Machine: next; 1d. next shuffled track, song id = " + nonlinearIndex;
            let logFalse = "Machine: next; 1d. no next shuffled track, last shuffled track . . .";
            shufflePlayCurrent(nonlinearIndex,log,logFalse);
          };
        }
        else { //Not playing... code for 1a.
          if (shuffling === false) {
            setCurrentTrack((currentIndex + 1));
            //  logger.log("Machine: next; 1a. next track");
            renderAllPlayerPlaylistPages();
          }
          else {//Not playing... code for 1c.
            //   logger.log("Machine: next; 1c. next shuffled track is linear track");
            let nonlinearIndex = setShuffledTrack(currentIndex, false);
            let log = "Machine: next; 1c. next shuffled track (shuffle is on), song id = " + nonlinearIndex;
            let logFalse = "Machine: next; 1c. no next shuffled track, last shuffled track . . .";
            shuffleCurrentTrack(nonlinearIndex,log,logFalse);
          };
        };
      };
    };
  return true;
};
/**Machine - render all Player pages and all Playlist pages - endpoint function
 * (called by nextTrack, previousTrack, trackEnd, playCurrent, playTrack and
 * removeTrackInPlaylist)
 * trackFrameData() uses machine imported objects and requires an 'await'
 * @browser {player playlist} render all open browsers
 * @return  {boolean}         true
 */
async function renderAllPlayerPlaylistPages() {
  io.emit('replace', await trackFrameData());    //endpoint of fn-calls
  io.emit('render', await playlistFrameData());  //endpoint of fn-calls
  return true;
};
/**Machine - set REPEAT
 * Change the state of REPEAT.
 * @param  {object}       data new state for repeat
 * @global {playback}      set repeat property values
 * @return {boolean}      new value of shuffle
 */
function setRepeat(data) {
  playback.repeat = data.repeat;
  return true;
};
/**Machine - set SHUFFLE
 * Change the state of SHUFFLE.
 * @param  {object}           data new state for shuffle
 * @global {shuffledPlaylist} sets .played .notPlayed
 * @global {playback}         sets .shuffle property value
 * @return {boolean}          new value of the shuffle toggle
 */
function setShuffle(data) {
  let newShuffle = data.shuffle;
  if (newShuffle === true) {
    playlistShuffle();
  }
  else {
    shuffledPlaylist.notPlayed = [];
    shuffledPlaylist.played = [];
  };
  playback.shuffle = newShuffle;
  return newShuffle;
};
/**Machine - shuffle the playlist
 * Change the state of the .notPlayed and .Played. The result is a shuffled
 * sequences of all Playlist indexes in .notPlayed.
 * @global {shuffledPlaylist} sets .notPlayed .played
 * @global {playlist}         reads length of playlist
 * @return {object}           shuffled playlist object
 */
function playlistShuffle() {
    let playlistLength = playlist.length;
    shuffledPlaylist.played = [];
    switch(playlistLength) {
      case 0:
  //CASE D: [] empty playlist - no action; this should not happen!
      shuffledPlaylist.notPlayed = [];
      break;
      case 1:
  //CASE C: [0] one track in playlist
     //3b. one track in playlist - shuffle one track
     shuffledPlaylist.notPlayed = [0];
      break;
      case 2:
  //CASE B: [0, 1] two tracks in playlist - shuffle two tracks
     shuffledPlaylist.notPlayed = [0, 1]; //since reversed order
      break;
      default:
  //CASE A: [0..n] many tracks, makes sure that the indexes are really shuffled
      let shuffleIndexes = [];
      for (var i = (playlistLength - 1); i > -1; i--) {
        shuffleIndexes.push(i);
      };//since track indexes will be popped and pushed - reverser order
      let originalIndexes = [...shuffleIndexes]; //ordered indexes from [n..0]
      shuffledPlaylist.notPlayed = aux.shuffleFisherYates(shuffleIndexes);
      //the list must be shuffled - check if they are equal, if so redo . . .
      while (aux.areArraysEqual(originalIndexes, shuffledPlaylist.notPlayed) === true) {
      shuffledPlaylist.notPlayed = aux.shuffleFisherYates(shuffleIndexes);
      };
    };
    //  logger.log(aux.timeStamp(),"Machine: . . . a shuffle happened ~");
    io.emit("herald",{type: "info", missive: `${sixSpaces}Playlist Shuffled!${sixSpaces}`});
    return shuffledPlaylist;
  };
  /**Machine - play and renders new shuffled track ---- helper to previous/next
   * Used for playing when Shuffle is on.
   * If nonlienarIndex is false playing has to stop - reached end of shuffle
   * @param  {song Id}      nonlinearIndex next shuffled song in mpd
   * @param  {string}       log log message if there is a new song
   * @param  {string}       logFalse log message if there is a new song
   * @return {?}            who knows? calls mpd indirectly . . .
   */
function shufflePlayCurrent(nonlinearIndex, log, logFalse) {
  if (nonlinearIndex != false) {
    playCurrent("[shufflePlayCurrent]"); //endpoint;  nonlinearIndex != false play
  }
  else {
    //  logger.log("Machine: . . . . - playing is true but mpd stops");
    mpdEmergencyBrake(true); //endpoint; stops and returns to first track
  };
};
/**Machine - renders new shuffled track            ---- helper to previous/next
 * Used when not playing and Shuffle is on.
 * If nonlienarIndex is false - first linear track will be rendered.
 * @param  {song Id}      nonlinearIndex next shuffled song in mpd
 * @param  {string}       log log message if there is a new song
 * @param  {string}       logFalse log message if there is a new song
 * @return {?}            who knows? calls mpd indirectly . . .
 */
function shuffleCurrentTrack(nonlinearIndex, log, logFalse) {
  if (nonlinearIndex != false) {
    renderAllPlayerPlaylistPages(); //endpoint; nonlinearIndex != false render
  }
  else {
    //  logger.log("Machine: . . . . - rendering first track in playlist");
    renderAllPlayerPlaylistPages(); //endpoint; returns to first track
  };
};
/**Machine - set new elapsed and seek and start playing again, end point!
 * Play the track at a new elasped time of the duration.
 * @param  {object}       data holds new elapsed value in seconds
 * @param  {socket.io}    socket, socket for the open browser
 * @global {playback}     reads .current .playing and sets .elapsed value
 * @global {playlist}     reads .duration of track
 * @render {browsers}     other Player pages
 * @return {boolean}      true
 */
async function seekDuration(data, socket) {
  //console.log(aux.timeStamp(),"machine: SLIDER seek to", data.elapsed);
  let songId = playback.current;
  if (songId !== false) {
    let trackinfo = playlist[findIndexInPlaylist (songId)];
    let duration = trackinfo.duration;  //this is a float
    let newElapsed = data.elapsed;      //this is an integer
    if ((duration - newElapsed) > 2) {    //defines the precision at 2 seconds
      newElapsed = data.elapsed;
    }
    else {
      newElapsed = Math.trunc(duration);
    };
    if ((duration - newElapsed) > 1.5)  {
          //console.log(aux.timeStamp(),"machine: new elapse is okay; seek to", newElapsed + 1);
          if (playback.playing !== true) {
            //A: || track is not playing, set only the elapsed attribute
            playback.elapsed = newElapsed;
            socket.broadcast.emit('replace', await trackFrameData());  //endpoint
          }
          else {
            //B: |> track is playing, call for mpc
            if (await mpd.seekDurationMPC(newElapsed + 1) === true) {
              playback.elapsed = newElapsed + 1;
              startElapsing(newElapsed, duration);
              socket.broadcast.emit('replace', await trackFrameData());  //endpoint
            }
            else {
              mishapSeeking(false, "MPD ERROR: seek failed");
            };
          };
      }
      else {
        playback.elapsed = newElapsed;
        socket.broadcast.emit('replace', await trackFrameData());  //endpoint
    };
  };
  return true;
};
/**Machine - playing stopped by seek slider and brought the state to track end.
 * Seek = duration, no more playing of that track. The slider is at the right.
 * Note: For a stop and reset use 'play.resetPlayback()'
 * @param  {boolean}      resetElapsed, sets elapsed to 0 (instead of duration)
 * @mpd    {stop}         stop mpd if .playing = true
 * @global {playback}     reads .current and .playing
 * @return {boolean}      true
 */
async function seekStop() {
  //  console.log(aux.timeStamp(),"Machine: seek STOP");
  if ((playback.current !== false) && (playback.playing === true)) {
    let isStopped = await mpd.seekStopMPC();
    if (isStopped === false) {
        mishapSeeking(false, "MPD ERROR: seek stop\n"); //resets to start ...
      };
  };
  //false --> not end of playlist, not to top
  await trackEnd(false, "seekStop"); //call the endpoint directly
  return true;
};
/**Machine - error handling when mpd cannot seek a track
 * Used by seek and seek to a stop - can only occure when playing!!!
 * Typical mpd error message: "Error:  [50@0] {playid} No such song"
 * @param  {string}       err, mpd error
 * @param  {string}       errorString, more comprehensible description
 * @global {machine}      resets .current .elapsed sets .mpdPaused .playing
 * @render {browsers}     Player and Playlist pages
 * @return {?}            of no interest
 */
function mishapSeeking(err, errorString) {
  io.emit("herald", {type: "error", missive: `Failed Seeking During Play <br>
                                              Stopped Playing! <br>
                                              Track is reset to start... <br>
                                              -------------------------- <br>
                                              <em>...try seek when paused </em>`,
                     duration: 6000});
  stopElapsing();
  mpd.mpdBrutalStop();
  playback.elapsed = 0; playback.playing = false; playback.mpdPaused = false;
  machine.setMachineStatus("playback");
  io.emit('status', "idle");
  renderAllPlayerPlaylistPages(); //endpoint
};
// Playlist page buttons and sliders ______________________Backend for Playlist
/**Machine - CLEAR the Playlist and stop playing
 * 'Clear playlist' is blocked during streaming.
 * @return {boolean}    true
 */
  async function clearPlaylist() {
    if (await mpd.seekStopMPC() === true) {
      if (await mpd.clearPlaylistMPC() === true) {
      //all well, no action
      }
      else {
        if (await mpd.mpdBrutalClear() === false) {
          aux.sleep(1500).then(() => {
            mpd.mpdBrutalClear(); });
        };
      };
    }
    else {
      if (await mpd.mpdBrutalStop() === false)  {
        mpd.mpdBrutalStop(1500);
      }
    };
    emptyPlaylist();
    return true;
};
/**Machine - reset after a restart of mpd.  Reset all 'playback' properties
 * for track, but do not empty playlist. I.e. current track is still there.
 * Relates to 'emptyPlaylist()' but it resets all aspect of playback mode.
 * Called from 'bluetooth-speakerconnected' in machine.js.
 * @param   {boolean}   noRender, if true no rendering and no setting of "idle"
 * @global {playback}   nullifies track related properties
 * @return {boolean}    true
 */
 async function resetPlayback(noRender = false) {
   if (playback.current !== false) {
     stopElapsing();                //resets timer for elapseing, stop
     playback.playing = false;      //no playing
     playback.elapsed = 0;          //resets elapsed to start
     playback.mpdPaused = false;    //no paused anymore either
     playback.mpdId = false;        //new track will be added to mpc
     playback.mpdBusy = false;      //mpd does not need to be blocked
     !noRender &&machine.setMachineStatus("idle");
     !noRender && io.emit('status', "idle");
     !noRender && renderAllPlayerPlaylistPages();         //endpoint
   };
   return true;
 };

  /**Machine - REMOVE a track from playlist............................. remover
   * If track is current use nextTrack() in order to get the right next track
   * There is no current track when streaming
   * @param  {object}            data object with songId (mpd)
   * @global {playback}          reads .current .repeat .shuffle values
   * @global {playlist}          reads property values and changes playlist
   * @browser {playlist page}    render all open browsers
   * @return {boolean}           true
   */
async function removeTrackInPlaylist(data) {
  //console.log("Machine: playlist is\n", playlist);
     let songId = data.songId;
     let index = findIndexInPlaylist (songId);
     let playlistLength = playlist.length;
     let currentToBeRemoved = playback.current;
     switch (playlistLength) {
       case 0:
  //CASE 4: [] empty playlist - no action; This should not happen
       //console.log("Machine: remove; 4. no track - no action");
       break;
       case 1:
  //CASE 3: [0] one track in playlist, clear Playlist
       //console.log("Machine: remove; 3. the only track was removed by mpd, playlist cleared");
       await clearPlaylist(); //has to wait for machine-mpd.js
       renderAllPlayerPlaylistPages();
       io.emit("notice",{type: "info", missive: "Track Removed"});
       break;
       default:
  //CASE 1: there are more then one track, not the last track
       if ((index + 1) < playlistLength ) {
         // 1b. the track is actually CURRENT track
         if (songId === currentToBeRemoved) {
           //console.log("Machine: 1b. removed current, not last track:", songId,"index:", index);
           nextTrack("*remove track*"); //endpoint is the function call
           deleteTrack(index);
           io.emit('render', await playlistFrameData()); //endpoint
           io.emit("notice",{type: "info", missive: "Track Removed"});
         }
         else {
           //1a. track is not the current track
           //console.log("Machine: remove; 1a. removed track, it was not current or last:", songId,"index:", index);
           deleteTrack(index);
           io.emit('render', await playlistFrameData()); //endpoint
         };
       }
       else {
   //CASE 2 LAST track is going to be removed
         if ((playback.repeat === true) || (playback.shuffle === true)) {
           //2c. - track is current and repeat or shuffle is on, get NEXT track
           if (songId === currentToBeRemoved) {
             //console.log("Machine: 2b.removed current & last track - shu or rep is ON:", songId,"index:", index);
             nextTrack("*remove track*");//endpoint
             deleteTrack(index);
             io.emit('render', await playlistFrameData()); //endpoint
           }
           else {//2b. - repeat or shuffle is on, not current - delete track
             //console.log("Machine: 2a. removed last track - shu or rep is ON:", songId,"index:", index);
             deleteTrack(index);
             io.emit('render',await playlistFrameData()); //endpoint
           };
         }
         else {
           // 2a. - no shuffle and no repeat, get the PREVIOUS track if current
           (songId === currentToBeRemoved) && previousTrack();
           //console.log("Machine: 2c. removed last track, might be playing:", songId,"index:", index);
           deleteTrack(index);
           io.emit('render', await playlistFrameData()); //endpoint
           (songId === currentToBeRemoved) &&
            io.emit("notice",{type: "info", missive: "Track Removed"});
         };
       };//All is done - mpd doesn't need to be cleaned up anymore mpdId fixes that
       return true;
   };
 };
   /**Machine - Delets the track from the Playlist
    * Deals also with shuffle
    * @param  {integer}              currentIndex playlist index
    * @global {playback}             reads properties
    * @global {playlist}             removes the track
    * @global {shuffledPlaylist}     removes the track
    * @return {boolean}              true
    */
   function deleteTrack(currentIndex) {
     playlist.splice(currentIndex, 1); //remove the track from playlist
     if (playback.shuffle === true) {   //CASE: shuffle is on . . .
       let notPlayedList = shuffledPlaylist.notPlayed;
       let playedList = shuffledPlaylist.played;
       let notPlayedIndex = aux.findElementInArray(currentIndex, notPlayedList);
       let playedIndex = aux.findElementInArray(currentIndex, playedList);
       if (notPlayedIndex !== -1) {
         notPlayedList.splice(notPlayedIndex, 1);
       };
       if (playedIndex !== -1) {
         playedList.splice(playedIndex, 1);
       };
       let queueLength = notPlayedList.length;
       for (var i = 0; i < queueLength; i++) {
         if (notPlayedList[i] > (currentIndex - 1)) {
           notPlayedList[i] = notPlayedList[i] - 1;
         };
       };
       let stackLength = playedList.length;
       for (var j = 0; j < stackLength; j++) {
         if (playedList[j] > (currentIndex - 1)) {
          playedList[j] = playedList[j] - 1;
        };
      };
   };
   return true;
 };
/**Machine - empty playlist and nullify all 'playback' properties.
 * Brings the machine into "idle" mode. Any timer stopped by stopElapsing().
 * Relates to 'resetPlayback()' but it erases only the track properties.
 * @params {boolean}              noEmit, no render and no change of status
 * @global {playback}             nullifies all playback mode properties
 * @global {shuffledPlaylist}     empties shuffled lists -> [] []
 * @global {playlist }            empties playlist -> []
 * @global {nextTrackId }         restart from zero -> 0
 * @return {boolean}              true
  */
function emptyPlaylist(noEmit = false) {
  if (playlist.length > 0) {
    stopElapsing();               //stop timer for elapsing, stops
    playback.playing = false;     //no playing
    playback.current = false;     //no current track either, empty...
    playback.elapsed = 0;         //reset to start, 0
    !noEmit && machine.setMachineStatus("idle");
    !noEmit && io.emit('status', "idle");    //update status frame on start page
    playback.mpdPaused = false;    //no paused anymore either
    playback.mpdId = false;        //new track will be added to mpc
    playback.mpdBusy = false;      //mpd does not need to be blocked
    shuffledPlaylist.played = [];
    shuffledPlaylist.notPlayed = [];
    playlist = [];                 //playlist is erased and gone
    nextTrackId = 0;               //number for playback track id's is reset to 0
  };
    return true;
};
// USBlist page buttons and sliders ____________________________ Backend for USB
/**Machine - the track information is provided by USB-list, add the track
 * at the bottom of the playList. songId will be the array index (integer)and set
 * to playback.current (current track). Deals with shuffle too.
 * Format of data { songId: false, duration: string, Title: string,
 *                  Artist: string, Album: string, albumart: "", path: string) },
 * Unfortunately capital T and A's in keys above are inherited from mpd
 * @param   {object}      data playlist object for track on USB, from page
 * @param   {boolean}     noRender no rendering when called from addUSBFolders()
 * @global  {playback}           read/set the value of .current
 * @global  {playlist}           pushes the track to the playlist
 * @global  {shuffledPlaylist}   pushes the track randomly into .notPlayed
 * @browser {player playlist}    render all open browsers
 * @return  {undefined}   since send command to mpd doesn't support async/await
 */
async function addUSBFile(data, noRender) {
  if (getStreaming(model.machineCtl.status) === false) {
    //added with add button, added to the end and not playing for now . . .
    //a litle bit of prep of the track first
    let songId = generateId(); //here is where the song id is set
    //let status = playback;
    data.songId =  songId;
    data.albumart = "";
    data.duration = data.duration * 1;  //Should be trunced here as well
    //add track to playlist
    let playlistLength = playlist.push(data);
    //CASE: shuffle is on - create a dshuffle index
    if (playback.shuffle === true) {
      let trackIndex = playlistLength - 1;
      let shuffleIndex = Math.floor(Math.random() * playlistLength);
      shuffledPlaylist.notPlayed.splice(shuffleIndex, 0, trackIndex);
    };
    if (!noRender) {//to limit rendering when adding many tracks at once
      io.emit('render', await playlistFrameData());           //endpoint
      //Announce adding on Playlist, USB page is dealt with at frontend
      io.emit("bulletin",{type: "info", missive: "Added Track"})
    };
    if (playback.current === false) {
      //Note: track is not loaded into mpc/mpd yet... 'seek' does not work
      playback.current = songId; //first track to be added becomes current
      io.emit('replace', await trackFrameData());           //endpoint
    };
  }
  else {
    io.emit("bulletin",{type: "mishap", missive: `Busy streaming... <br>
                                                  No track added!`});
  };
};

//................................................................ the collector
/**Machine - add all tracks in folders. USB folder and file data comes on
 * format { type: string, path: uri, duration: string, Title:string,
 * Artist:string, Album:string } | where type: is parent | file | folder.
 * Parent is the first and then all the directories i.e. folders and finally
 * all the files, i.e. tracks. Similar to trackConstructor() in playerusb.js
 * NOTE: the track is added to the playlist array in addUSBFile() above.
 * @param  {object}       data must be a uri path for directory
 * @param  {integer}      level, for debugging of recursion only NOT IN USE
 * @mpd    {socket}       gets the mpd socket; from machine-mpd.js
 * @mpd    {lsinfo path}  gets the mpd file structure in a parseable format
 * @return {undefined}    returns nothing (mpd calls have no return value)
 */
async function addUSBFolders(data, level) {
  if (getStreaming(model.machineCtl.status) === false) {
    let mpdSocket = await mpd.getSocketMPD();
    mpdSocket.sendCommand(cmd("lsinfo", [data]), function(err, msg) {
      if (err) { // error discarded
      }
      else {
          let usbFolderListArray = aux.mpdParseLsinfo(msg,data);
          let folderItemsLength = usbFolderListArray.length;
          if (folderItemsLength > 1) { //skip parent
            for (let i = 1; i < folderItemsLength; i++) {
              if (usbFolderListArray[i].type === "file") { //packing the track
                //console.log ("Machine: incoming track to be packed\n", usbFolderListArray[i] )
                usbFolderListArray[i].Title =
                        aux.patchUpTitle(usbFolderListArray[i].Title,
                                         usbFolderListArray[i].path);
                usbFolderListArray[i].Artist =
                        aux.patchUpArtistOrAlbum(usbFolderListArray[i].Artist);
                usbFolderListArray[i].Album =
                        aux.patchUpArtistOrAlbum(usbFolderListArray[i].Album);
                if (i === (folderItemsLength - 1)) {
                    addUSBFile(usbFolderListArray[i], false); //render the batch
                }
                else { //no render until this level is done, see above
                  addUSBFile(usbFolderListArray[i], true);  //end point for rendering
                };
              }
              else if (usbFolderListArray[i].type === "folder") {
                //level = level + 1;  //recursion below ...
                addUSBFolders(usbFolderListArray[i].path);
              };
            };
          };
        };
      });
  }
  else {
    io.emit("bulletin",{type: "mishap", missive: `Busy streaming... <br>
                                                  No folder added!`});
  };
};
/**Machine - play a track on the USB page. Create a track, add it to the top of
 * the playList and start playing the track.
 * Format of data { songId: false, duration: float, Title: string,
 *                  Artist: string, Album: string, albumart: "", path: string) },
 * Unfortunately capital T and A's in keys above are inherited from mpd
 * @param  {object}     data object with a path
 * @global {playback}   read shuffle property
 * @global {machineCtl} read status property
 * @global {playlist}   adds the track to playlist
 * @global {shuffledPlaylist} generates a new shuffled list
 * @return {boolean}   true
 */
 function playUSB(data) {
   if (getStreaming(model.machineCtl.status) === false) {
     let songId = generateId(); //here is where the song id is set
     data.songId =  songId;
     data.albumart = "";
     data.duration = data.duration * 1;
     playlist.unshift(data); //new track added at the top of playlist
     //CASE: shuffle is on . . . . . .
     if (playback.shuffle === true) {
       let notPlayed = shuffledPlaylist.notPlayed;
       let arrayLength = notPlayed.length;
       for (var i = 0; i < arrayLength; i++) {
         notPlayed[i] = notPlayed[i] + 1;//move up the existing track indexes
       };
       let trackIndex = 0; //add the new track index randomly in notPlayed list
       let shuffleIndex = Math.floor(Math.random() * playlist.length);
       shuffledPlaylist.notPlayed.splice(shuffleIndex, 0, trackIndex);
     };
     playTrack({songId: data.songId});    //endpoint for rendering
     //Announce playing on Playlist, USB page is dealt with at frontend
     io.emit("bulletin",{type: "info", missive: "Playing Track"});
   }
   else  {
     io.emit("bulletin",{type: "mishap", missive: `Busy streaming... <br>`});
   };
   return true;
 };

//==============================================================================
//Music Player Daemon ======================================= Code Section David
//==============================================================================
//see also boot sequence around line 200 where two critical mpd events are caught
//during boot. They are the mpd ready and mpd db scanned events.

/**Stream - if upmpdcli has been streaming it leaves tracks in mpd queue,
 * the queue has to be cleared... If there is a current track of the playback it
 * has to be reloaded into mpc and get a new songId.
 * Note: also called from 'bluetooth-required-restart' event at machine.
 * Another note: a better name would have been 'recoverCurrentTrack', ah well...
 * @mpc     {clear}             empty the mpd queue
 * @mpc     {add}               add any current track to mpd
 * @global  {playback playlist} read track id and path (mpd uri)
 * @return  {boolean}           true if there was a total success
 */
function recoverPlaylist() {
  let outcome = false;
  // i) always clear the mpd queue after UPnP streaming
  try {
    execSync(`sudo mpc clear`,
            {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
    outcome = true;
  }
  catch (err) {
    console.log (aux.timeStamp(),"playback: clear ERROR\n", err );
  };
  // ii) any current track in playback has to be reloaded as well
  if ((playback.current !== false) && (outcome === true)) {
    let track = playlist[findIndexInPlaylist(playback.current)];
    let path = track.path;
    console.log (aux.timeStamp(),"playback: recovered current track ==> mpc added path:\n", `"${path}"`);
    //console.log (aux.timeStamp(),"playback: elapsed:", playback.elapsed);
    try {
      execSync(`sudo mpc add "${path}" `,
              {uid: 1000, gid: 1000, encoding: 'utf8', timeout: 10000});
      outcome = true;
    }
    catch (err) {
      //console.log (aux.timeStamp(),"playback: reload ERROR\n", err );
      console.log (aux.timeStamp(),"playback: reload ERROR; path is:-\n", path );
      outcome = false;
    };
  };
  return outcome;
};

/**'mpd-start-volume'event - set initial volume values. [mpd.startMPDSettings()]
 * I.e. rescan, clear, single mode and sets volume to startup volume
 * @param  {integer}    data, start up volume [aux.readStartVolume()]
 * @global {playback}    sets the volume based on startup volume on file
 * @return {?}          nothing
 */
/*mpd.signal.on('mpd-start-volume', function (data) {
  playback.volume = data;
  playback.startVolume = data;
});*/
//............................................................... mpd ctl events
/**'mpd-playToStop' mpd state has changed from 'play' -> 'stop', mpd is stopped,
 * but is it at track end?  [mpd.handleMPDStatusUpdate()]
 * I.e. mpd ctl has detected:          (in addition mpc status is not 'playing')
 * (inbox.status.state === 'play') && (statusState === 'stop')
 * @global {playback}     reads .timer .mpdId
 * @global {streamCtl}    reads .upnp
 * @event  {mpd}          recieves; 'mpd-playToStop' when mpd stopped playing
 * @return {?}            nothing
 */
mpd.signal.on('mpd-playToStop', function() {
  //Check: if mpd has reached track end and if status has changed; look for:
  //a. mpd song id is a Player track, timer is on = still elapsing (i.e. playing)
  //b. upnp is not streaming
  // a + b indicates on-going playback that now has to be stopped -> 'trackEnd()'
  //Older condition   '&& (playback.mpdBusy === false))' -- No, not here!!!
  //Consoles for major debugging:-
  //console.log(aux.timeStamp(), "playback: mpd-playToStop >");
  //console.log(aux.timeStamp(), "playback: conditions for stop \n[timer?, mpd id, no upnp?, mpd busy?]");
  //console.log([(playback.timer !== false), playback.mpdId,
  //             (model.machineCtl.status !== "upnp"), playback.mpdBusy ])
  if ( (playback.timer !== false)   &&
       (playback.mpdId !== false)   &&
       (model.machineCtl.status !== "upnp") ) {
        trackEnd(false, "= mpd-playToStop =");
      };
});

/**'upnp-streamed' the purpose is to catch any UPnP streaming, if so UPnP has
 * taken over the mpd and its queue and thereby erased any Player 'Playlist'
 * This information is used to restore any previous Player 'Playlist'.
 * The long story: mpd state has changed from 'stop' -> 'play', mpd is playing,
 * but is it UPnP streaming that just started?  [mpd.handleMPDStatusUpdate()]
 * I.e. mpd ctl has detected the upmpdcli start indicators, they are:
 * (mpdStatusInbox.options.single == "0") <-- this is a strong indication of UPnP
 * (inbox.status.state === 'stop') && (statusState === 'play')...,
 * in addition the value of 'status.songid' is handed over to machine (in 'data')
 * and compared with '.mpdID' = song ID of current for USB playback.
 * Note: signalling of the actual streaming of UPnP is done in machine-loop.js,
 * UPnP start with taking over the mpd queue, this is the ealiest trigger
 * @param   {string}    data, mpd song id of track that is playing
 * @global {playback}   ;reads .mpdId
 * @global {streamCtl}  ;reads .upnp - sets .upnpStreamed
 * @event  {mpd}        recieves; 'upnp-streamed' when UPnP is taking over
 * @return {?}         nothing
 */
mpd.signal.on('upnp-streamed', function(data) {
  //console.log(aux.timeStamp(), "machine: UPNP streaming request");
  //Check upmpdcli might have taken over mpd, even if no play yet, look for:
  //a. upnp stream is not yet marked as streaming by machine
  //b. song id is not used by Player USB playback
  //   If so set the upnpStreamed to true here
  if (model.machineCtl.status === "upnp") {
    if (data != playback.mpdId) {
      //there is a new song with a new song ID
      //it is needed to know later on if mpd queue was cleared by upmpdcli
      //console.log(aux.timeStamp(), "machine: UPNP has destroyed Player Playlist");
      model.streamCtl.upnpStreamed = true;
      //The call below will intercept the loopctl for detection of all streaming
      loop.upnpMightPlay(); //jumps into the ctl loop mpdLoop() behaviour
    };
  };
});
//.......................................................... mpd playback events
/**'mpd-playing' set new values for elapsed and mpd id for current track
 * [playCurrentUseMPC()]
 * @param   {array}     dataArray, [elapsed, duration, setMpdId, noPlay],
 *                                  setMpdId is false if it is already set
 * @global {playback}   sets .elapsed and .mpdId (if not false)
 *                      it also sets .mpdBusy to false since playback is in
 *                      control, not UPnP.
 * @return {?}          nothing
 */
mpd.signal.on('mpd-playing', function(dataArray) {
  //console.log(aux.timeStamp(), "playback: event NOW caught; [ mpd-playing ], array:\n", dataArray);
  playback.elapsed =  dataArray[0]; //always set elapsed
  if (dataArray[2] !== false) {
    playback.mpdId = dataArray[2]; //mpdId was not set yet, set mpdId
  };
  playback.mpdBusy = false; //playback releases mpd since it is now in control
  //console.log(aux.timeStamp(), "playback: playback.mpdId =", playback.mpdId);
  renderPlayCurrent(dataArray[0], dataArray[1], false, dataArray[3]);
  // --> renderPlayCurrent(<elapsed>, <duration>, false = no socket, <noPlay>);
});

//........................................................... mpd ERROR handling
/**'mpd-playFail' reset values for elapsed and mpd id for current track
 * [mpd.playCurrentNotInMPD() and mpd.playCurrentUseMPC()]
 * @global {playback} ;sets .elapsed .mpdId
 * @return {?}       nothing
 */
mpd.signal.on('mpd-playFail', function (data) {
  playback.mpdBusy = false;   //no play, release mpd
  playback.mpdId = false;     //mark that track is not loaded into mpc
  let error = "USB Playback failed";
  switch (data) {
    case "clear-failure":
    mishapPlayCurrent(error, "MPD ERROR: clear failed in playCurrent");
    break;
    case "addid-failure":
    mishapPlayCurrent(error, "MPD ERROR: add track failed in playCurrent");
    break;
    case "play-seek-failure":
    mishapPlayCurrent(error, "MPD ERROR: SEEK and PLAY failed in playCurrent");
    break;
    case "play-failure":
    mishapPlayCurrent(error, "MPD ERROR: play from start failed in playCurrent");
    break;
    default:
    mishapPlayCurrent(error, "Unknown MPD ERROR - mpd is panicking");
  };
});
//General errors:
mpd.signal.on('mpd-error', function(data) {
  switch (data) {
    case "rescan-failure":
    io.emit("herald",{type: "error", missive: `ERROR: USB Playback<br>
                                               Cannot access the USB!<br>
                                               Streaming still works...<br>
                                               -----------------------------<br>
                                               <em>...restart Player</em>`,
                     duration: 60000});
    break;
    case "status-failure":
    io.emit("herald", {type: "error", missive: `
                                                ERROR: USB Playback<br>
                                                Service is in an unknown state! <br>
                                                Streaming still works...<br>
                                                ------------------------------<br>
                                                <em> Please restart Player </em>`,
                      duration: 60000});
    break;
    case "reset-settings-failure":
    io.emit("herald", {type: "error", missive: `
                                                ERROR: USB Playback<br>
                                                Start settings failed! <br>
                                                Streaming still works...<br>
                                                ------------------------------<br>
                                                <em> Please restart Player </em>`,
                      duration: 60000});
    break;
    case "socket-failure":
    io.emit("herald",{type: "error", missive: `ERROR: USB Playback<br>
                                               No connection to service!<br>
                                               Streaming still works...<br>
                                               -----------------------------<br>
                                               <em>...restart Player</em>`,
                     duration: 60000});
    break;
    case "service-failure":
    io.emit("herald",{type: "error", missive: `ERROR: USB Playback<br>
                                               Service is not running!<br>
                                               Streaming still works...<br>
                                               -----------------------------<br>
                                               <em>...restart Player</em>`,
                     duration: 60000});
    break;
    case "usb-scan-failure":
    io.emit("herald", {type: "error", missive: `<br>
                                           USB Error:<br>
                                           Unable to scan USB <br>
                                           ------------------<br>
                                           <em>...check USB</em><br>`,
                   duration: 60000});

    break;
    case  "fatal-failure":
    io.emit("herald",{type: "error", missive: `FATAL ERROR: USB Playback<br>
                                               Something went really wrong!<br>
                                               Streaming might still work...<br>
                                               -----------------------------<br>
                                               <em>...restart Player</em>`,
                     duration: 60000});
    break;
    default:
    io.emit("herald",{type: "error", missive: `UNKNOWN ERROR: USB Playback<br>
                                               Something is wrong here!<br>
                                               Streaming might still work...<br>
                                               -----------------------------<br>
                                               <em>...restart Player</em>`,
                     duration: 60000});
    };
});
//__________________________________________________________ Code Section Gustav
//USB management ------------------------------------------------ USB management

//a USB device was attached in one of the USB ports and it has a UUID
usb.signal.on("usb-inserted", function () {
  io.emit("herald", {type: "long", missive: `${sixSpaces} USB was Inserted ${sixSpaces}`,
                     duration: 5000});
});
//an inserted USB was identified or nullified
usb.signal.on("set-usbID", function (data) {
  playback.usb = data;  //formats: false or a string (UUID)
});
//a newly inserted USB got its path set to top root -> "get root for usb"
usb.signal.on("set-usbPATH", function (data) {
  playback.usbPath = data;  //format: string, often "get root for usb"
});
//usb is mounted, now mpd has to scan the content, takes a long time.
usb.signal.on("scan-USB", function() {
  io.emit("herald", {type: "long", missive: `Scanning USB... <br>
                                             ...might take a while`,
                     duration: 10000});
  //wait 500 msec...   the mount cmd has to come in effect first...
    aux.sleep(500).then(() => {
      console.log(aux.timeStamp(),"playback: USB is going to be scanned");
      mpd.rescanMPD();
    }); //sleep section for mpd rescan ends
});
//................................................................... pulled out
//a USB device was pulled out from one of the USB ports, notify user
//...further it stops any USB playback that was going on, if it was the Player USB
usb.signal.on("usb-removed", async function () {
  //console.log(aux.timeStamp(),"playback: UUID waiting for udev . . . .");
  aux.sleep(4000).then(async () => {
    //There is a need to wait a number of seconds in order for udev to do its job,
    //this will not halt other executions - just this one. (no 'await' here)
    //console.log(aux.timeStamp(),"playback: . . .  .udev wait is over");
    let isThereUUID = await usb.usbFindUUID();
    //console.log(aux.timeStamp(),"playback: found usb stick UUID:", isThereUUID);
    if ((playback.usb !== false) && (isThereUUID === false))  {
      //console.log(aux.timeStamp(),"playback: Players usb was pulled out -->", playback.usb);
      await clearPlaylist(); //stops mpd and timer, nullify 'playback', status is idle
      renderAllPlayerPlaylistPages();
      io.emit('open-folder', []); //renders an empty USB-list page with no folders
      io.emit("clear-dispatch");
      io.emit("herald", {type: "long", missive: `${sixSpaces} USB was Removed ${sixSpaces} <br>`,
                       duration: 5000});
      usb.usbPulledOut(); //unmount USB...
    //usb.usbPulledOut() will emit "usb-cleanout" after unmounting, see below
    };
  }); //  -- ends the wait section
});
//after the USB is demounted the event of the pulled out USB needs to be updated
//in machine, this happens after 'usb-removed'. Fired by usb.usbPulledOut()
//...further mpd rescans
usb.signal.on("usb-cleanout", function() {
  //console.log(aux.timeStamp(),"playback: USB needs to be cleaned out");
  playback.usb = false;
  playback.usbPath = "get root for usb";
  mpd.rescanMPD();    //Why is this done before, empty mnt/usb ?
});

//Error handling......................................................... errors
usb.signal.on("usb-mountERROR", function() {
  playback.usb = false;                  //attached USB is unknown here,
  playback.usbPath = "get root for usb"; //nullify machine USB data
  io.emit("herald", {type: "error", missive: `Error cannot access USB... <br>
                                             ...something went wrong<br>
                                             ---------------------------<br>
                                             <em>...attach USB again...</em>`,
                     duration: 20000});
});

//************************************************************************** AUX
//Auxiliary functions not placed in file machine-auxiliary.js ******************
//******************************************************************************
//Find a songId ......................................................the finder
/**AUX - finds a track given a mpd song id
 * songId have become the array index overtime and this function is not really needed.
 * @param  {integer}     songId machine unique id for present playlist
 * @global {playlist}    runs through the playlist
 * @return {integer}     array index of playlist or false if not found
 */
function findIndexInPlaylist(songId) {
  let thisPlaylistArray = playlist; // for faster access in for-loop
  let playlistTracks = thisPlaylistArray.length;
  for(let i = 0; i < playlistTracks; i++) {
      if (songId === thisPlaylistArray[i].songId) {
        return i;
        break;
      };
    };
  return false;
};
/**AUX - generates a new sequential id number for a track when it is added
 * to the playlist, store in songId: of the track. Added by addUSBFile().
 * Adds 1 to the global variable nextTrack. That variable is reset every time
 * when the playlist is cleared by emptyPlaylist()
 * @global {nextTrackId}   last unique id assigned
 * @return {integer}     the next sequential id number
 */
 function generateId() {
   let newId = nextTrackId + 1;
   nextTrackId = newId;
   return newId;
 };

function nullifyElapsed() {
  playback.elapsed = 0;
};


//End of Code ***************************************************************EoC

/* original exported object machine from machine.js [before move to this file]
machineCtl =
MachineObject {
 playing: false,
 current: false,
 mpdPaused: false,
 elapsed: 0,
 timer: false,
 mpdId: false,
 mpdBusy: false,
 volume: 100,
 startVolume: 100,
 repeat: false,
 shuffle: false,
 streaming: false,
 bluetooth: {
   bluetooth: true,
   mac: 'E4:5F:01:33:AA:41',
   devices: [],
   pollTimer: false
 },
 bluetoothSpeakers: { speakers: [] },
 connectedSinks: [],
 wifi: { wifi: true, ssid: 'BELL503', ip: '192.168.2.214', tentative: '' },
 hotspot: { hotspot: false, ip: '10.0.0.10' },
 lan: { lan: true, ip: '192.168.2.191' },
 usb: '"44D7-2AD9"',
 usbPath: 'get root for usb',
 webServer: true,
 internet: true
}*/
