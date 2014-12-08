var RTCPeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);

// var WebSocket = require('ws');
function handleImage(e){
    var reader = new FileReader();
    reader.onload = function(event){
        var img = new Image();
        img.onload = function(){
            canvas.drawImage(img,0,0);
        }
        canvas.width = img.width;
        canvas.height = img.height;
        img.src = event.target.result;
    }
    reader.readAsDataURL(e.target.files[0]);
}

function drawCanvasElement(text) {
    var c = document.getElementById("canvas_test")
    var ctx = c.getContext("2d");
    ctx.font = "14px Arial";
    ctx.beginPath();
    ctx.arc(95,105,20,0,2*Math.PI);
    ctx.stroke();
    $("#send_medium")[0].innerHTML = text;
}

var configuration = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]},
// {"url":"stun:stun.services.mozilla.com"}

    roomURL = $("#url"),
    photo = $("#photo"),
    trail = $("#trail"),
    canvasHolder = $("#canvasHolder"),
    sendBtn = $("#send"),
    canvasWidth, canvasHeight;

// Attach event handlers
$("#send").click(sendPhoto);

// All the information about this client
var _me = {};
var id;
// Create a random room if not already present in the URL.
var isInitiator;
// Reference to the lone PeerConnection instance.
var peerConnections = {};
// Array of known peer socket ids
var connections = [];

// Reference to the data channels
var dataChannels = {};

var rooms = [1,2,3,4,5]
var room = window.location.hash.substring(1);
if (!room)
    room = window.location.hash = rooms[Math.floor(Math.random()*rooms.length)];
var elementHasBeenDownloaded = false; 

/****************************************************************************
 * Signaling server 
 ****************************************************************************/

// Connect to the signaling server
var socket = io.connect();

socket.on('ipaddr', function (ipaddr) {
    console.log('Server IP address is: ' + ipaddr);
    updateRoomURL(ipaddr);
});

socket.on('created', function (room, clientId) {
  console.log('Created room', room, '- my client ID is', clientId);
  isInitiator = true;
  loadRes();
});

socket.on('joined', function (room, clientId) {
  console.log('This peer has joined room', room, 'with client ID', clientId, "socket", socket);
  isInitiator = false;
});

socket.on('ready', function () {
    createPeerConnection(isInitiator, configuration, socket.id);
})

socket.on('log', function (array) {
  console.log.apply(console, array);
});

socket.on('message', function (message){
    console.log('Client received message:', message);
    signalingMessageCallback(message);
});

socket.on('get_peers', function(connectArray, you) {
    // connections = data.connections;
    // id = data.you;
    id = you;
    connections = connectArray;
    // if (rtc.offerSent) { // 'ready' was fired before 'get_peers'
        // rtc.addStreams()
        createPeerConnections();
        // rtc.addDataChannels();
        // rtc.sendOffers();
    // }
    // fire connections event and pass peers
    // rtc.fire('connections', connections);
    console.log("HULLO", "connections:", connections, "peerConnections:", peerConnections, "dataChannels:", dataChannels);
    console.log("ID, BABY", id)
});

socket.on('new_peer', function(socketId) {
    // var socketId = data.socketId;
    connections.push(socketId);
    // delete rtc.offerSent;

    createPeerConnection(false, configuration, socketId);
    // for (var i = 0; i < rtc.streams.length; i++) {
    //     var stream = rtc.streams[i];
    //     pc.addStream(stream);
    // }
});

socket.on('connect', function() {

    // socket.on('get_peers', function(data) {
    //     connections = data.connections;
    //     id = data.you;
    //     // if (rtc.offerSent) { // 'ready' was fired before 'get_peers'
    //         // rtc.addStreams()
    //         createPeerConnections();
    //         // rtc.addDataChannels();
    //         // rtc.sendOffers();
    //     // }
    //     // fire connections event and pass peers
    //     // rtc.fire('connections', connections);
    //     console.log("HULLO", "connections:", connections, "peerConnections:", peerConnections, "dataChannels:", dataChannels);
    //     console.log("ID, BABY", id)
    // });

    // socket.on('new_peer', function(data) {
    //     var socketId = data.socketId;
    //     connections.push(socketId);
    //     // delete rtc.offerSent;

    //     createPeerConnection(false, configuration, socketId);
    //     // for (var i = 0; i < rtc.streams.length; i++) {
    //     //     var stream = rtc.streams[i];
    //     //     pc.addStream(stream);
    //     // }
    // });
});

// Join a room
socket.emit('create or join', room);

if (location.hostname.match(/localhost|127\.0\.0/)) {
    socket.emit('ipaddr');
}

function loadRes() {
    if (isInitiator) {
        // room = window.location.hash = randomToken();
        // room = window.location.hash = 1
        // if the element has not been downloaded yet
        if (!elementHasBeenDownloaded) {
            $("#ht").attr("src", "/math.jpg");
            console.log("ELEMENT HAS BEEN DOWNLOADED FROM THE SERVER")
            elementHasBeenDownloaded = true
            $("#send_medium")[0].innerHTML = "server";
        }
    } 
}

/**
 * Send message to signaling server
 */
function sendMessage(message){
    console.log('Client sending message: ', message);
    socket.emit('message', message);
}

/**
 * Updates URL on the page so that users can copy&paste it to their peers.
 */
function updateRoomURL(ipaddr) {
    var url;
    if (!ipaddr) {
        url = location.href
    } else {
        url = location.protocol + '//' + ipaddr + ':2013/#' + room
    }
    roomURL.innerHTML = url;
}

/**************************************************************************** 
 * WebRTC peer connection and data channel
 ****************************************************************************/

var peerConn;
var dataChannel;

function signalingMessageCallback(message) {
    if (message.type === 'offer') {
        console.log('Got offer. Sending answer to peer.');
        peerConn.setRemoteDescription(new RTCSessionDescription(message), function(){}, logError);
        peerConn.createAnswer(onLocalSessionCreated, logError);

    } else if (message.type === 'answer') {
        console.log('Got answer.');
        peerConn.setRemoteDescription(new RTCSessionDescription(message), function(){}, logError);

    } else if (message.type === 'candidate') {
        peerConn.addIceCandidate(new RTCIceCandidate({candidate: message.candidate}));

    } else if (message === 'bye') {
        // TODO: cleanup RTC connection?
    }
}

createPeerConnections = function() {
    for (var i = 0; i < connections.length; i++) {
        createPeerConnection(false, configuration, connections[i]);
    }
};

function createPeerConnection(isInitiator, config, id) {
    console.log('Creating Peer connection as initiator?', isInitiator, 'config:', config);
    peerConn = peerConnections[id] = new RTCPeerConnection(config);
    // send any ice candidates to the other peer
    peerConn.onicecandidate = function (event) {
        console.log('onIceCandidate event:', event);
        if (event.candidate) {
            sendMessage({
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        } else {
            console.log('End of candidates.');
        }
    };

    if (isInitiator) {
        console.log('Creating Data Channel');
        dataChannel = peerConn.createDataChannel("photos", {reliable: false});
        onDataChannelCreated(dataChannel, id);
        dataChannels[id] = dataChannel
        console.log('Creating an offer');
        peerConn.createOffer(onLocalSessionCreated, logError);
    } else {
        peerConn.ondatachannel = function (event) {
            console.log('ondatachannel:', event.channel);
            dataChannel = event.channel;
            onDataChannelCreated(dataChannel, id);
            dataChannels[id] = dataChannel
        };
    }
}

function onLocalSessionCreated(desc) {
    console.log('local session created:', desc);
    peerConn.setLocalDescription(desc, function () {
        console.log('sending local desc:', peerConn.localDescription);
        sendMessage(peerConn.localDescription);
    }, logError);
}

function onDataChannelCreated(channel, id) {
    console.log('onDataChannelCreated:', channel);

    channel.onopen = function () {
        console.log('CHANNEL opened!');
        if (isInitiator) {
            $("#send").click()
        }
        else {
            $("#send_medium")[0].innerHTML = "browser";
        }
    };

    channel.onerror = function (e) {
        console.log('CHANNEL error!', e);
    };

    channel.onclose = function() {
        delete dataChannels[id];
        delete peerConnections[id];
        delete connections[id];
    };

    channel.onmessage = (webrtcDetectedBrowser == 'firefox') ? 
        receiveDataFirefoxFactory() :
        receiveDataChromeFactory();
}

function receiveDataChromeFactory() {
    var buf, count;

    return function onmessage(event) {
        if (typeof event.data === 'string') {
            buf = window.buf = new Uint8ClampedArray(parseInt(event.data));
            count = 0;
            console.log('Expecting a total of ' + buf.byteLength + ' bytes');
            return;
        }

        var data = new Uint8ClampedArray(event.data);
        buf.set(data, count);

        count += data.byteLength;
        console.log('count: ' + count);

        if (count == buf.byteLength) {
            // we're done: all data chunks have been received
            console.log('Done. Rendering photo.');
            renderPhoto(buf);
        }
    }
}

function receiveDataFirefoxFactory() {
    var count, total, parts;

    return function onmessage(event) {
        if (typeof event.data === 'string') {
            total = parseInt(event.data);
            parts = [];
            count = 0;
            console.log('Expecting a total of ' + total + ' bytes');
            return;
        }

        parts.push(event.data);
        count += event.data.size;
        console.log('Got ' + event.data.size + ' byte(s), ' + (total - count) + ' to go.');

        if (count == total) {
            console.log('Assembling payload')
            var buf = new Uint8ClampedArray(total);
            var compose = function(i, pos) {
                var reader = new FileReader();
                reader.onload = function() { 
                    buf.set(new Uint8ClampedArray(this.result), pos);
                    if (i + 1 == parts.length) {
                        console.log('Done. Rendering photo.');
                        renderPhoto(buf);
                    } else {
                        compose(i + 1, pos + this.result.byteLength);
                    }
                };
                reader.readAsArrayBuffer(parts[i]);
            }
            compose(0, 0);
        }
    }
}


/**************************************************************************** 
 * Aux functions, mostly UI-related
 ****************************************************************************/

function sendPhoto() {
    // Split data channel message in chunks of this byte length.
    var CHUNK_LEN = 64000;

    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    var img = document.getElementById('ht');
    context.drawImage(img, 0, 0);
    var myData = context.getImageData(0, 0, img.width, img.height);

    // canvasWidth = 300;
    // canvasHeight = 150;
    // var img = canvas.getImageData(0, 0, canvasWidth, canvasHeight),
    //     len = img.data.byteLength,
    //     n = len / CHUNK_LEN | 0;
    var len = myData.data.byteLength,
    n = len / CHUNK_LEN | 0;

    console.log('Sending a total of ' + len + ' byte(s)');
    dataChannel.send(len);

    // split the photo and send in chunks of about 64KB
    for (var i = 0; i < n; i++) {
        var start = i * CHUNK_LEN,
            end = (i+1) * CHUNK_LEN;
        console.log(start + ' - ' + (end-1));
        dataChannel.send(myData.data.subarray(start, end));
    }

    // send the reminder, if any
    if (len % CHUNK_LEN) {
        console.log('last ' + len % CHUNK_LEN + ' byte(s)');
        dataChannel.send(myData.data.subarray(n * CHUNK_LEN));
    }
}

function convertCanvasToImage(canvas) {
    var image = new Image();
    image.src = canvas.toDataURL();
    console.log(image.src);
    return image;
}

function renderPhoto(data) {
    var photoElt = document.createElement('canvas');
    photoElt.classList.add('photo');
    var ctx = photoElt.getContext('2d');
    ctx.canvas.width  = 300;
    ctx.canvas.height = 150;
    img = ctx.createImageData(300, 150);
    img.data.set(data);
    ctx.putImageData(img, 0, 0);
    console.log(photoElt.height);
    $("#ht").attr("src", convertCanvasToImage(photoElt).src);
    isInitiator = true;
}

function show() {
    Array.prototype.forEach.call(arguments, function(elem){
        elem.style.display = null;
    });
}

function hide() {
    Array.prototype.forEach.call(arguments, function(elem){
        elem.style.display = 'none';
    });
}

function randomToken() {
    return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
}

function logError(err) {
    console.log(err.toString(), err);
}

