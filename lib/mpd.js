/* mpd.js is licensed under the MIT License, see below
Sourced from:					...in February 2020
github.com/andrewrk/mpd.js, Andrew Kelley - also the author of Ziglang
See  https://ziglang.org/ for more on the language Ziglang . . .
Modification of MpdClient.prototype.sendCommand added try/catch error, line 102:
try {
	self.send("noidle\n");	        assert.ok(self.idling);
	self.sendWithCallback(command, callback);	        self.send("noidle\n");
	self.sendWithCallback("idle", function(err, msg) {	        self.sendWithCallback(command, callback);
		self.handleIdleResultsLoop(err, msg);	        self.sendWithCallback("idle", function(err, msg) {
	});	            self.handleIdleResultsLoop(err, msg);
        });
	} catch(e) {
        self.emit('error', e.message);}};};
 */
//Modification: same type of modification on line 59 - catch error
var EventEmitter = require('events').EventEmitter
	, util = require('util')
	, assert = require('assert')
	, net = require('net')
	, MPD_SENTINEL = /^(OK|ACK|list_OK)(.*)$/m
	, OK_MPD = /^OK MPD /

module.exports = MpdClient;
MpdClient.Command = Command
MpdClient.cmd = cmd;
MpdClient.parseKeyValueMessage = parseKeyValueMessage;
MpdClient.parseArrayMessage = parseArrayMessage;

function MpdClient() {
	EventEmitter.call(this);

	this.buffer = "";
	this.msgHandlerQueue = [];
	this.idling = false;
}
util.inherits(MpdClient, EventEmitter);

var defaultConnectOpts = {
	host: 'localhost',
	port: 6600
}

MpdClient.connect = function(options) {
	options = options || defaultConnectOpts;

	var client = new MpdClient();
	client.socket = net.connect('/run/mpd/socket', function() {
		client.emit('connect');
	});
	client.socket.setEncoding('utf8');
	client.socket.on('data', function(data) {
		client.receive(data);
	});
	client.socket.on('close', function() {
		client.emit('end');
	});
	client.socket.on('error', function(err) {
		try {
			client.emit('error', err);
		}
		catch (error) {
		};
	});
	return client;
}

MpdClient.prototype.receive = function(data) {
	var m;
	this.buffer += data;
	while (m = this.buffer.match(MPD_SENTINEL)) {
		var msg = this.buffer.substring(0, m.index)
			, line = m[0]
			, code = m[1]
			, str = m[2]
		if (code === "ACK") {
			var err = new Error(str);
			this.handleMessage(err);
		} else if (OK_MPD.test(line)) {
			this.setupIdling();
		} else {
			this.handleMessage(null, msg);
		}

		this.buffer = this.buffer.substring(msg.length + line.length + 1);
	}
};

MpdClient.prototype.handleMessage = function(err, msg) {
	var handler = this.msgHandlerQueue.shift();
	handler(err, msg);
};

MpdClient.prototype.setupIdling = function() {
	var self = this;
	self.sendWithCallback("idle", function(err, msg) {
		self.handleIdleResultsLoop(err, msg);
	});
	self.idling = true;
	self.emit('ready');
};

MpdClient.prototype.sendCommand = function(command, callback) {
	var self = this;
	callback = callback || noop.bind(this);
	try {
        assert.ok(self.idling);
        self.send("noidle\n");
        self.sendWithCallback(command, callback);
        self.sendWithCallback("idle", function(err, msg) {
            self.handleIdleResultsLoop(err, msg);
        });
	} catch(e) {
        self.emit('error', e.message);
	}
};

MpdClient.prototype.sendCommands = function(commandList, callback) {
	var fullCmd = "command_list_begin\n" + commandList.join("\n") + "\ncommand_list_end";
	this.sendCommand(fullCmd, callback || noop.bind(this));
};

MpdClient.prototype.handleIdleResultsLoop = function(err, msg) {
	var self = this;
	if (err) {
		self.emit('error', err);
		return;
	}
	self.handleIdleResults(msg);
	if (self.msgHandlerQueue.length === 0) {
		self.sendWithCallback("idle", function(err, msg) {
			self.handleIdleResultsLoop(err, msg);
		});
	}
};

MpdClient.prototype.handleIdleResults = function(msg) {
	var self = this;
	msg.split("\n").forEach(function(system) {
		if (system.length > 0) {
			var name = system.substring(9);
			self.emit('system-' + name);
			self.emit('system', name);
		}
	});
};

MpdClient.prototype.sendWithCallback = function(cmd, cb) {
	cb = cb || noop.bind(this);
	this.msgHandlerQueue.push(cb);
	this.send(cmd + "\n");
};

MpdClient.prototype.send = function(data) {
	this.socket.write(data);
};

function Command(name, args) {
	this.name = name;
	this.args = args;
}

Command.prototype.toString = function() {
	return this.name + " " + this.args.map(argEscape).join(" ");
};

function argEscape(arg){
	// replace all " with \"
	return '"' + arg.toString().replace(/"/g, '\\"') + '"';
}

function noop(err) {
	if (err) this.emit('error', err);
}

// convenience
function cmd(name, args) {
	return new Command(name, args);
}

function parseKeyValueMessage(msg) {
	var result = {};

	msg.split('\n').forEach(function(p){
		if(p.length === 0) {
			return;
		}
		var keyValue = p.match(/([^ ]+): (.*)/);
		if (keyValue == null) {
			throw new Error('Could not parse entry "' + p + '"')
		}
		result[keyValue[1]] = keyValue[2];
	});
	return result;
}

function parseArrayMessage(msg) {
	var results = [];
	var obj = {};

	msg.split('\n').forEach(function(p) {
		if(p.length === 0) {
			return;
		}
		var keyValue = p.match(/([^ ]+): (.*)/);
		if (keyValue == null) {
			throw new Error('Could not parse entry "' + p + '"')
		}

		if (obj[keyValue[1]] !== undefined) {
			results.push(obj);
			obj = {};
			obj[keyValue[1]] = keyValue[2];
		}
		else {
			obj[keyValue[1]] = keyValue[2];
		}
	});
	results.push(obj);
	return results;
}

//=============================================================================
/*MIT License

Copyright (c) 2014 Andrew Kelley

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/
