//Copyright 2022 by Retro Audiophile Designs
//GNU General Public License v3.0 see license.txt            [Source code]
//                      ~ webserver for player ~
module.exports.startWebServer = startWebServer;
var io;

async function startWebServer() {
//Require modules needed for web server:
  let express = require('express');
  let app = require('express')();
  let server = require('http').Server(app);
  let path = require('path');
  let router = express.Router();
  io = require('socket.io')(server);
  module.exports.io = io;
  //start Express and socket.io on port 80
  server.listen(80);
  //setup routers for every HTML page:
  router.get('/',function(req,res){
    res.sendFile(path.join(__dirname +'/pages/player.html'));
  });
  router.get('/',function(req,res){
    res.sendFile(path.join(__dirname +'/pages/playerplayback.html'));
  });
  router.get('/',function(req,res){
    res.sendFile(path.join(__dirname +'/pages/playerplaylist.html'));
  });
  router.get('/',function(req,res){
    res.sendFile(path.join(__dirname +'/pages/playerusb.html'));
  });
  router.get('/',function(req,res){
    res.sendFile(path.join(__dirname +'/pages/playerbluetooth.html'));
  });
  router.get('/',function(req,res){
    res.sendFile(path.join(__dirname +'/pages/playersettings.html'));
  });
  router.get('/',function(req,res){
    res.sendFile(path.join(__dirname +'/pages/playerstate.html'));
  });
  router.get('/',function(req,res){
    res.sendFile(path.join(__dirname +'/pages/playermachine.html'));
  });
  //set the http server directories needed to serve the HTML pages:
  app.use(express.static(__dirname + '/pages'));
  app.use(express.static(__dirname + '/pages/ccs'));
  app.use(express.static(__dirname + '/pages/webfonts'));
  app.use('/', router); //connect the http server to the routers
  return io;
};
