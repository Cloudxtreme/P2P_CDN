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

// we've either created or joined a room
socket.emit('create or join', room);

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

// used to communicate metadata between browsers
socket.on('message', function (message){
    console.log('Client received message:', message);

    // fire a callback based on the message (could be an offer, answer, etc.)
    signalingMessageCallback(message);
});

// on "get_peers", we create peer connections between nodes in a room
socket.on('get_peers', function(connectArray, you) {
    my_id = you;

    // update the connections array
    connections = connectArray;

    // create pc's between clients
    createPeerConnections();
    console.log("My connections:", connections, 
                "peerConnections:", peerConnections, 
                "dataChannels:", dataChannels);
});


// on "new_peer", log the socket id into the connections array and create a new pc
socket.on('new_peer', function(socketId) {
    console.log("new peer");

    // ad the id to the connections list
    connections.push(socketId);

    // create a pc
    createPeerConnection(isInitiator, configuration, socketId);
});

// when a client leaves the website...
socket.on('remove_peer', function(socketId) {
    // remove the pc
    if (typeof(peerConnections[socketId]) !== 'undefined') {
        peerConnections[socketId].close();
    }

    // delete from global arrays if
    delete peerConnections[socketId];
    delete dataChannels[socketId];
    delete connections[socketId];
    console.info("Client side clean!");
});

if (location.hostname.match(/localhost|127\.0\.0/)) {
    socket.emit('ipaddr');
}

// if browser doesn't support webrtc, just pull from the server immediately
if (!webrtcDetectedBrowser) {
    isInitiator = true;
    loadFromServer();
}

// update the graph, which keeps track of the asset load time for 
// every browser-based connection
function updateGraph(dataset) {
    dataset = dataset || [100, 200, 300, 400];
    console.log("updating", dataset);

    // width and height
    var w = dataset.length * 25;
    var h = 150;
    var padding = 1;

    // create scale functions
    var xScale = d3.scale.linear()
                         .domain([0, dataset.length])
                         .range([padding, w - padding * 2]);

    var yScale = d3.scale.linear()
                         .domain([0, d3.max(dataset)/20])
                         .range([h - padding, padding]);

    // define X axis
    var xAxis = d3.svg.axis()
                      .scale(xScale)
                      .orient("bottom")
                      .ticks(dataset.length);

    // define Y axis
    var yAxis = d3.svg.axis()
                      .scale(yScale)
                      .orient("left");

    // create a new svg
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

    // create X axis
    var xAxisLine = svg.append("g")
        .attr("class", "axis")
        .attr("transform", "translate(0," + (h - padding) + ")")
        .attr("stroke", 10)
        .call(xAxis);

    // create Y axis
    svg.append("g")
        .attr("class", "axis")
        .attr("transform", "translate(" + padding + ", 0)")
        .call(yAxis);
}

// downloads assets from the server
function loadFromServer() {
    // if we haven't yet downloaded
    if (isInitiator && !elementHasBeenDownloaded) {
        // write the image directly to the DOM
        $("#downloaded").attr("src", "/sample.jpg");
        // if our browser supports data channels, then we
        // allow others to download from us
        if (webrtcDetectedBrowser) {
            socket.emit('downloaded', room);
        }
        elementHasBeenDownloaded = true

        // report that we've downloaded from server
        $("#send_medium")[0].innerHTML = "server";

        // once the asset loads, report the download time
        $("#downloaded").load(function() {
            photoFinishedRenderingTime = new Date();
            var renderingTime = photoFinishedRenderingTime - photoBeganRenderingTime;
            $("#time_to_load")[0].innerHTML = renderingTime;
        });
    } 
}

// sends a message back to the singaling server 
function sendMessage(message){
    socket.emit('message', message);
}

/**************************************************************************** 
 * WebRTC peer connection and data channel functionality
 ****************************************************************************/

// used to establish peer connections
var peerConn;

// callback on receiving messages from other clients
function signalingMessageCallback(message) {
    if (message.type === 'offer') {
        console.log('Got offer. Sending answer to peer.');
        // answer the pc offer
        peerConn.setRemoteDescription(new RTCSessionDescription(message), function(){}, logError);
        peerConn.createAnswer(onLocalSessionCreated, logError);
    } else if (message.type === 'answer') {
        console.log('Got answer.');
        // set the remote description
        peerConn.setRemoteDescription(new RTCSessionDescription(message), function(){}, logError);
    } else if (message.type === 'candidate') {
        // add an ICE candidate
        peerConn.addIceCandidate(new RTCIceCandidate({candidate: message.candidate}));
    } else if (message === 'bye') {
        // no need to do anything here, we clean up sockets elsewhere
        console.log(message);
    }
}

// creates pc's with other clients in our room
createPeerConnections = function() {
    for (var i = 0; i < connections.length; i++) {
        createPeerConnection(false, configuration, connections[i]);
    }
};

// creates a pc
function createPeerConnection(isInitiator, config, peer_id) {
    isInitiator = isInitiator || false;
    var being = isInitiator ? "am" : "am not"
    console.log("My id is", my_id, "I", being, " an initiator, and I am creating a PC with", peer_id);
    
    // create a new pc using Google's stun server
    peerConn = peerConnections[peer_id] = new RTCPeerConnection(config);

    // send any ice candidates to the other peer
    peerConn.onicecandidate = function (event) {
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

    // initiators create the data channels
    if (isInitiator) {
        console.log("My id is", my_id, "and I am creating a DataChannel with", peer_id);
        // creates a data channel on top of the necessary peer connection
        dataChannels[peer_id] = peerConn.createDataChannel("photos " + my_id, {reliable: false});
        onDataChannelCreated(dataChannels[peer_id], peer_id);
        console.log('Creating an offer');
        peerConn.createOffer(onLocalSessionCreated, logError);
    } else {
        peerConn.ondatachannel = function (event) {
            // else, a data channel is being set up with us
            dataChannels[peer_id] = event.channel;
            onDataChannelCreated(dataChannels[peer_id], peer_id);
        };
    }
}

// set the local description of the pc
function onLocalSessionCreated(desc) {
    console.log('local session created:', desc);
    peerConn.setLocalDescription(desc, function () {
        console.log('sending local desc:', peerConn.localDescription);
        sendMessage(peerConn.localDescription);
    }, logError);
}

// once a data channel has been created, we can send bits between 2 browsers
function onDataChannelCreated(channel, id) {
    var being = isInitiator ? "am" : "am not"
    console.log("My id is", my_id, "I", being, " an initiator, and I CREATED a DataChannel with", id);

    channel.onopen = function () {
        console.log('Channel opened!');
        // send the photo if we initiated the data channel
        if (isInitiator) {
            sendPhoto();
        }
        // otherwise, just receive the bits and report the load medium
        else {
            $("#send_medium")[0].innerHTML = "browser";
        }
    };

    channel.onerror = function (e) {
        console.log('CHANNEL error!', e);
        loadFromServer();
    };

    // when a channel closes, clean up the data channel from our globals
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


// for receiving data on Chrome (or Opera, for that matter)
function receiveDataChromeFactory(id) {
    var buf, count;

    return function onmessage(event) {
        if (typeof event.data === 'string') {
            buf = window.buf = new Uint8ClampedArray(parseInt(event.data));
            count = 0;
            console.log('Expecting a total of ' + buf.byteLength + ' bytes');
            return;
        }

        // parse data from canvas element into Uint8ClampedArray
        var data = new Uint8ClampedArray(event.data);
        buf.set(data, count);

        count += data.byteLength;
        console.log('count: ' + count);

        // we've received all the data we can
        if (count == buf.byteLength) {
            // we're done: all data chunks have been received
            console.log('Done. Rendering photo.');

            // set the asset load time
            photoFinishedRenderingTime = new Date();
            var renderingTime = photoFinishedRenderingTime - photoBeganRenderingTime;
            $("#time_to_load")[0].innerHTML = renderingTime;

            // let the server know about the successful transfer
            socket.emit("bytes_received", room, renderingTime);

            // render the photo on screen
            renderPhoto(buf);
        }
    }
}

// for receiving data on Firefox
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

            // parse the data into Uint8ClampedArray
            var buf = new Uint8ClampedArray(total);
            var compose = function(i, pos) {
                var reader = new FileReader();
                reader.onload = function() { 
                    buf.set(new Uint8ClampedArray(this.result), pos);
                    if (i + 1 == parts.length) {
                        console.log('Done. Rendering photo.');

                        // set the asset load time
                        photoFinishedRenderingTime = new Date();
                        var renderingTime = photoFinishedRenderingTime - photoBeganRenderingTime;
                        $("#time_to_load")[0].innerHTML = renderingTime;
                        
                        // let the server know about the successful transfer
                        socket.emit("bytes_received", room, renderingTime);
                        
                        // actually render the photo on screen
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

// sends a photo over a browser-based data channel
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


// converts a canvas element to an image
function convertCanvasToImage(canvas) {
    var image = new Image();
    image.src = canvas.toDataURL();
    return image;
}

// renders a photo on screen by writing the data to
// a canvas element and turning it into an img
function renderPhoto(data) {
    // create the canvas elt
    var photoElt = document.createElement('canvas');
    photoElt.classList.add('photo');
    var ctx = photoElt.getContext('2d');
    ctx.canvas.width  = 300;
    ctx.canvas.height = 150;
    img = ctx.createImageData(300, 150);

    // set the image data
    img.data.set(data);
    ctx.putImageData(img, 0, 0);

    // write the new src into the DOM
    $("#downloaded").attr("src", convertCanvasToImage(photoElt).src);
    isInitiator = true;

    // let the server know about the successfull transfer
    socket.emit('downloaded', room);

    // close the data channel and pc
    dataChannels[Object.keys(dataChannels)[0]].close();
    delete dataChannels[Object.keys(dataChannels)[0]];
    peerConn.close();
}

// for error callbacks when creating RTC objects
function logError(err) {
    console.log(err.toString(), err);
}