// Copyright 2017 the project authors as listed in the AUTHORS file.
// All rights reserved. Use of this source code is governed by the
// license that can be found in the LICENSE file.
const mqtt = require('mqtt');
const path = require('path');
const fs = require('fs');
const socketio = require('socket.io');

// constants
const PAGE_HEIGHT = 320;
const PAGE_WIDTH = 390;

// this is filled in later as the socket io connection is established
var eventSocket;


///////////////////////////////////////////////
// micro-app framework methods
///////////////////////////////////////////////
var Server = function() {
}


Server.getDefaults = function() {
  return { 'title': 'pdf viewer' };
}


var replacements;
Server.getTemplateReplacments = function() {
  if (replacements === undefined) {
    var config = Server.config;
    replacements = [{ 'key': '<DASHBOARD_TITLE>', 'value': config.title },
                    { 'key': '<UNIQUE_WINDOW_ID>', 'value': config.title },
                    { 'key': '<PAGE_WIDTH>', 'value': PAGE_WIDTH },
                    { 'key': '<PAGE_HEIGHT>', 'value': PAGE_HEIGHT }];

  }
  return replacements;
}


Server.handleSupportingPages = function(request, response) {
  const pageRequested = request.url.substring(1);
  const pageObject = Server.config.extraFiles[pageRequested];
  if (pageObject) {
    const theFile = fs.readFileSync(path.join(__dirname, pageObject.file));
    response.writeHead(200, {'Content-Type': pageObject.type });
    response.end(theFile);
    return true;
  } else if (pageRequested.endsWith('.pdf')) {
    var pdfFile = undefined;
    try {
      pdfFile = fs.readFileSync(path.join(__dirname, '../pdfs', pageRequested.replace(/%20/g, ' ')));
    } catch (e) {
      pdfFile = fs.readFileSync(path.join(__dirname, '../pdfs', 'notFound.pdf'));
    }
    response.writeHead(200, {'Content-Type': 'application/pdf' });
    response.end(pdfFile);
    return true;
  }
  return false;
};


Server.startServer = function(server) {
  var config = Server.config;

  eventSocket = socketio.listen(server);

  // setup mqtt
  var mqttOptions;
  if (config.mqtt.serverUrl.indexOf('mqtts') > -1) {
    mqttOptions = { key: fs.readFileSync(path.join(__dirname, 'mqttclient', '/client.key')),
                    cert: fs.readFileSync(path.join(__dirname, 'mqttclient', '/client.cert')),
                    ca: fs.readFileSync(path.join(__dirname, 'mqttclient', '/ca.cert')),
                    checkServerIdentity: function() { return undefined }
    }
  }

  var mqttClient = mqtt.connect(config.mqtt.serverUrl, mqttOptions);

  // register the topics we are interested in
  mqttClient.on('connect',function() {
    mqttClient.subscribe(config.mqtt.requestTopic);
  });

  mqttClient.on('message', function(topic, message) {
    console.log(message.toString().toLowerCase());
    eventSocket.emit('message', message.toString().toLowerCase().replace(/'/g, '') + '.pdf');
  });

  eventSocket.on('connection', function(ioclient) {
    console.log('connection from client');
    // send initial pdf to display
    eventSocket.to(ioclient.id).emit('message', 'Buns.pdf');

    ioclient.on('message', function(event) {
    });
  });
};


if (require.main === module) {
  var microAppFramework = require('micro-app-framework');
  microAppFramework(path.join(__dirname), Server);
}


module.exports = Server;
