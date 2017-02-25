// Copyright 2017 the project authors as listed in the AUTHORS file.
// All rights reserved. Use of this source code is governed by the
// license that can be found in the LICENSE file.
const mqtt = require('mqtt');
const path = require('path');
const fs = require('fs');
const socketio = require('socket.io');
const pdfkit = require('pdfkit');

// constants
const PAGE_HEIGHT = 320;
const PAGE_WIDTH = 390;

// this is filled in later as the socket io connection is established
var eventSocket;
var lastRequest = 'none.pdf';


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
    const pdfsDir = path.join(__dirname, '../pdfs');
    lastRequest = pageRequested;
    try {
      pdfFile = fs.readFileSync(path.join(pdfsDir, lastRequest.replace(/%20/g, ' ')));
    } catch (e) {
      response.writeHead(200, {'Content-Type': 'application/pdf' });
      const doc = new pdfkit( {
        Title: 'Not Found'
      });
      doc.fontSize(Server.config.notFoundTextSize);
      doc.text('Recipe not found(' +
               lastRequest.substring(0, lastRequest.indexOf('.pdf')).replace(/%20/g, ' ') +
               '), options:');
      doc.moveDown();
      const files = fs.readdirSync(pdfsDir);
      for (var i in files) {
        if (files[i].endsWith('.pdf')) {
          doc.text(files[i].substring(0, files[i].indexOf('.pdf')));
        }
      }
      doc.pipe(response).on('finish', function() {
        response.end();
      });
      doc.end();
      return true;
    }
    response.writeHead(200, {'Content-Type': 'application/pdf' });
    response.end(pdfFile);
    return true;
  }
  return false;
};


Server.startServer = function(server) {
  var config = Server.config;

  // set defaults for values if not set in config file
  if (config.notFoundTextSize === undefined) {
    config.notFoundTextSize = 16;
  }

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
    // send initial pdf to display
    eventSocket.to(ioclient.id).emit('message', lastRequest);
  });
};


if (require.main === module) {
  var microAppFramework = require('micro-app-framework');
  microAppFramework(path.join(__dirname), Server);
}


module.exports = Server;
