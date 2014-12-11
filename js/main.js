// our stun server, used to traverse NAT
var configuration = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};

// clients socket id, used for creating data channels
var my_id;

// true if user has already downloaded page assets and can 
// initiate a data channel with newcomers
var isInitiator;

// reference to the lone PeerConnection instance on which we build a data channel
var peerConnections = {};

// array of known peer socket ids in a given room
var connections = [];

// reference to the data channels
var dataChannels = {};
var currentDataChannel;

// used to time the asset load time
var photoBeganRenderingTime = new Date();
var photoFinishedRenderingTime;

// array of the asset load times of every connection
var connData = [];

// the rooms in which to place clients (can be more to change with #clients)
var rooms = [1,2,3,4,5]

// check if we're navigating directly to a room
var room = window.location.hash.substring(1);

// if we navigate to http://localhost/5000, place the user in random room and set in URL
if (!room) {
    randomRoom = Math.floor(Math.random()*rooms.length);
    room = window.location.hash = rooms[randomRoom];
}

// keeps track of whether or not page assets have been downloaded yet
var elementHasBeenDownloaded = false; 

// stores the socket information of the client
var socket = io.connect();

// if the user is a first to a room...
socket.on('created', function (room, clientId) {
    console.log('Created room', room, '- my client ID is', clientId);
  
    // store the socket id into a global
    my_id = clientId;
    
    // the client can now initiate downloads to other browsers
    isInitiator = true;
    loadFromServer();
});


// helper to average an array (used to calculate average asset load time)
function avg_array(arr) {
    var sum = 0
    for( var i = 0; i < arr.length; i++) {
        sum += arr[i];
    }
    return sum / arr.length;
}

// update the graph with asset load time once all bytes have been sent and received
socket.on('update_graph', function (time) {
    // push the time into the load-time array & update visualization
    connData.push(time);
    updateGraph(connData);

    // reports the data within the HTML
    $("#latency_report").css({"display":"block"});
    $("#latency_values").append("<p class='center left'>C" + connData.length + " : " +  time + "ms      |      </p>");
    $("#avg_report").css({"display":"block"});
    $("#num_connections")[0].innerHTML = connData.length;
    $("#avg_latency")[0].innerHTML = avg_array(connData);
});

// when a client joins a room
socket.on('joined', function (room, clientId) {
    console.log('This peer has joined room', room, 'with client ID', clientId, "socket", socket);
    
    // set the id as a global
    my_id = clientId;

    // initially not an initiator because no content has been downloaded
    isInitiator = false;

    // if browser not supported, load from server
    if (!webrtcDetectedBrowser) {
        loadFromServer();
    }
});

// helper to log server messages on the browser console
socket.on('log', function (array) {
  console.log.apply(console, array);
});

socket.on('message', function (message){
    console.log('Client received message:', message);
    signalingMessageCallback(message);
});

socket.on('get_peers', function(connectArray, you) {
    console.log("get peers");
    my_id = you;
    connections = connectArray;
    // for (var i = 0; i < connections.length; i++) {
    //     connData.push((i+1)*100);
    // }
    createPeerConnections();
    console.log("My connections:", connections, 
                "peerConnections:", peerConnections, 
                "dataChannels:", dataChannels);
    // updateGraph(connData);
});

socket.on('new_peer', function(socketId) {
    console.log("new peer");
    connections.push(socketId);
    // connData.push((connData.length + 1)*100);
    createPeerConnection(isInitiator, configuration, socketId);
    // updateGraph(connData);
});

socket.on('close', function() {
    // clean up connects 
});

socket.on('connect', function() {

});

socket.on('remove_peer', function(socketId) {
    if (typeof(peerConnections[socketId]) !== 'undefined')
        peerConnections[socketId].close();
    delete peerConnections[socketId];
    delete dataChannels[socketId];
    delete connections[socketId];
    console.info("Client side Clean!!");
});

// Join a room
socket.emit('create or join', room);

if (location.hostname.match(/localhost|127\.0\.0/)) {
    socket.emit('ipaddr');
}

// opera uses the chrome rendering engine, so we need to
// determine this manually
isOperaBrowser = (navigator.userAgent.match(/Opera|OPR\//) ? true : false);

// if browser doesn't support webrtc, just pull from the server
if (!webrtcDetectedBrowser || isOperaBrowser) {
    isInitiator = true;
    loadFromServer();
}

function updateGraph(dataset) {
    dataset = dataset || [100, 200, 300, 400];
    console.log("updating", dataset);

    //Width and height
    var w = dataset.length * 25;
    var h = 150;
    var padding = 1;

    //Create scale functions
    var xScale = d3.scale.linear()
                         .domain([0, dataset.length])
                         .range([padding, w - padding * 2]);

    var yScale = d3.scale.linear()
                         .domain([0, d3.max(dataset)/20])
                         .range([h - padding, padding]);

    //Define X axis
    var xAxis = d3.svg.axis()
                      .scale(xScale)
                      .orient("bottom")
                      .ticks(dataset.length);

    //Define Y axis
    var yAxis = d3.svg.axis()
                      .scale(yScale)
                      .orient("left");

    //SVG
    d3.select("svg").remove();
    var svg = d3.select("body")
        .append("svg")
        .attr("class", "graph")
        .attr("width", w)
        .attr("height", h);
    
    var rects = svg.selectAll("rect")
                .data(dataset)
                .enter()
                .append("rect")
                .attr("x", function(d, i) {
                    return i* (w / dataset.length);
                })
                .attr("y", function(d, i) {
                    return h;
                })
                .attr("width", w / dataset.length - padding)
                .attr("height", 0)
                .attr("fill", function(d) {
                    return "rgb(0, " + Math.floor(d/2000 * 255) + ", 0)";
                }).transition()
                .duration(1000)
                .attr("height", function(d) {
                    return d / 20;
                })
                .attr("y", function(d) {
                    return h - d/20;
                });

    //Create X axis
    var xAxisLine = svg.append("g")
        .attr("class", "axis")
        .attr("transform", "translate(0," + (h - padding) + ")")
        .attr("stroke", 10)
        .call(xAxis);

    //Create Y axis
    svg.append("g")
        .attr("class", "axis")
        .attr("transform", "translate(" + padding + ", 0)")
        .call(yAxis);

    svg.selectAll("text")
               .data(dataset)
               .enter()
               .append("text")
               .text(function(d) {
                    return d;
               })
               .attr("text-anchor", "middle")
               .attr("x", function(d, i) {
                    return i * (w / dataset.length);
               })
               .attr("y", function(d) {
                    return h - (d * 4);
               })
               .attr("font-family", "sans-serif")
               .attr("font-size", "11px")
               .attr("fill", "black");
}

// check whether data channel is supported.
function checkSupport() {
    try {
        // raises exception if createDataChannel is not supported
        var pc = new RTCPeerConnection(config);
        var channel = pc.createDataChannel('test', {reliable: false});
        channel.close();
        return true;
    } catch (e) {
        return false;
    }
};
function loadFromServer() {
    if (isInitiator) {
        if (!elementHasBeenDownloaded) {
            $("#downloaded").attr("src", "/sample.jpg");
            console.log("ELEMENT HAS BEEN DOWNLOADED FROM THE SERVER");
            // if our browser supports data channels, then we
            // allow others to download from us
            if (webrtcDetectedBrowser && !isOperaBrowser) {
                socket.emit('downloaded', room);
            }
            elementHasBeenDownloaded = true
            $("#send_medium")[0].innerHTML = "server";
            $("#downloaded").load(function() {
                photoFinishedRenderingTime = new Date();
                var renderingTime = photoFinishedRenderingTime - photoBeganRenderingTime;
                $("#time_to_load")[0].innerHTML = renderingTime;
            });
        }
    } 
}

/**
 * Send message to signaling server
 */
function sendMessage(message){
    // console.log('Client sending message: ', message);
    socket.emit('message', message);
}

/**************************************************************************** 
 * WebRTC peer connection and data channel
 ****************************************************************************/

var peerConn;

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
        // console.log("MESSSAGE", message)
    }
}

createPeerConnections = function() {
    for (var i = 0; i < connections.length; i++) {
        createPeerConnection(false, configuration, connections[i]);
    }
};

function createPeerConnection(isInitiator, config, peer_id) {
    isInitiator = isInitiator || false;
    var being = isInitiator ? "am" : "am not"
    console.log("My id is", my_id, "I", being, " an initiator, and I am creating a PC with", peer_id);
    peerConn = peerConnections[peer_id] = new RTCPeerConnection(config);

    // send any ice candidates to the other peer
    peerConn.onicecandidate = function (event) {
        // console.log('onIceCandidate event:', event);
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
        console.log("My id is", my_id, "and I am creating a DataChannel with", peer_id);
        dataChannels[peer_id] = peerConn.createDataChannel("photos " + my_id, {reliable: false});
        onDataChannelCreated(dataChannels[peer_id], peer_id);
        console.log('Creating an offer');
        peerConn.createOffer(onLocalSessionCreated, logError);
    } else {
        peerConn.ondatachannel = function (event) {
            // console.log('ondatachannel:', event.channel);
            dataChannels[peer_id] = event.channel;
            onDataChannelCreated(dataChannels[peer_id], peer_id);
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
    var being = isInitiator ? "am" : "am not"
    console.log("My id is", my_id, "I", being, " an initiator, and I CREATED a DataChannel with", id);

    channel.onopen = function () {
        console.log('CHANNEL opened!');
        if (isInitiator) {
            console.info("about to send...");
            sendPhoto();
            console.info("did it send?")
        }
        else {
            $("#send_medium")[0].innerHTML = "browser";
        }
    };

    channel.onerror = function (e) {
        console.log('CHANNEL error!', e);
        loadFromServer();
    };

    channel.onclose = function() {
        delete dataChannels[id];
        delete peerConnections[id];
        delete connections[id];
        console.info("dataChannel killed on client!");
    };

    channel.onmessage = (webrtcDetectedBrowser == 'firefox') ? 
        receiveDataFirefoxFactory(id) :
        receiveDataChromeFactory(id);
}

function receiveDataChromeFactory(id) {
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
            photoFinishedRenderingTime = new Date();
            var renderingTime = photoFinishedRenderingTime - photoBeganRenderingTime;
            socket.emit("bytes_received", room, renderingTime);
            $("#time_to_load")[0].innerHTML = renderingTime;
            renderPhoto(buf);
        }
    }
}

function receiveDataFirefoxFactory(id) {
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
                        photoFinishedRenderingTime = new Date();
                        var renderingTime = photoFinishedRenderingTime - photoBeganRenderingTime;
                        socket.emit("bytes_received", room, renderingTime);
                        $("#time_to_load")[0].innerHTML = renderingTime;
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
    var dcid = connections[Math.floor(Math.random()*connections.length)];
    var dataChannel = dataChannels[Object.keys(dataChannels)[0]];
    console.info("I have chosen dataChannel ", dataChannel, " with id ", dcid);

    console.error(dcid);
    currentDataChannel = dcid;

    // Split data channel message in chunks of this byte length.
    var CHUNK_LEN = 64000;

    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    var img = document.getElementById('downloaded');
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
    // dataChannel.close();
    // delete dataChannels[dcid];
    console.error(dataChannels, dataChannel);
}

function convertCanvasToImage(canvas) {
    var image = new Image();
    image.src = canvas.toDataURL();
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
    $("#downloaded").attr("src", convertCanvasToImage(photoElt).src);
    isInitiator = true;
    socket.emit('downloaded', room);

    // console.error(dataChannels, currentDataChannel);
    dataChannels[Object.keys(dataChannels)[0]].close();
    delete dataChannels[Object.keys(dataChannels)[0]];
    peerConn.close();
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