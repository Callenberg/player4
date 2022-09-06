//Machine-pid.js is licsensed according to below
//Additions made by Retro Audiophile Designs
//          ~ find the pid  ~
// Too slow, instead use:
// `sudo systemctl status aplay | fgrep "Main PID:" | cut -d' ' -f4 `
// 'sudo ps -eo pid,comm --noheader | fgrep ${cmd}'

const aux = require('./machine-auxiliary.js');
const exec = require('child_process').exec;

exports = module.exports = pidof;

function pidof(cmd, callback) {
    exec(`sudo ps -eo pid,comm --noheader | fgrep ${cmd} `,
      {uid: 1000, gid: 1000, encoding: 'utf8'},
      function (err, stdout, stderr) {
        if (err) {
            callback(err);
        } else {
            var pid = pidof.parse(stdout, cmd);
            callback(null, pid);
        };
    });
};

pidof.parse = function (data, cmd) {
    var cmdRe = new RegExp('/' + cmd + '$');
    var lines = data.trim().split('\n');
    for (var i = 0, l = lines.length; i < l; i++) {
        var fields = lines[i].trim().split(/\s+/, 2);

        if (fields.length !== 2) {
            continue;
        }

        if (fields[1] === cmd || fields[1].match(cmdRe)) {
            return parseInt(fields[0], 10);
        }
    }
    return null;
};

/* Copyright (C) 2012 Jakob Borg  + (C) 2021 Retro Audiophile Designs additions

Original code after the license text.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

- The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE. */

/* ORIGINAL CODE BT JACOB BERG:
var exec = require('child_process').exec;
exports = module.exports = pidof;
function pidof(cmd, callback) {
    exec('ps -eo pid,comm', function (err, stdout, stderr) {
        if (err) {
            callback(err);
        } else {
            var pid = pidof.parse(stdout, cmd);
            callback(null, pid);
        }
    });
};
pidof.parse = function (data, cmd) {
    var cmdRe = new RegExp('/' + cmd + '$');
    var lines = data.trim().split('\n');
    for (var i = 0, l = lines.length; i < l; i++) {
        var fields = lines[i].trim().split(/\s+/, 2);

        if (fields.length !== 2) {
            continue;
        }

        if (fields[1] === cmd || fields[1].match(cmdRe)) {
            return parseInt(fields[0], 10);
        }
    }
    return null;
}; */
