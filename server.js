var express = require('express')
var static = require('node-static');
var http = require('http');
var app = express();
var server = http.createServer(app);
var os = require('os');
var io = require('socket.io').listen(server);

app.set('port', (process.env.PORT || 5000))
app.use(express.static(__dirname + '/public'))
app.use('/css', express.static(__dirname + '/css'))
app.use('/js', express.static(__dirname + '/js'))

var file = new(static.Server)();
app.get('/', function(request, response) {
  file.serve(request, response);
})

// server-side object to store
// information about our clients.
// used for signaling
var rtc = {};

// make the server listen at some port
server.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'))
})

// an array of all open sockets
var allClients = [];

// when a socket connects to the server
io.sockets.on('connection', function (socket){
    
    // push the connected sockets into allClients array
    allClients.push(socket);

    // let's us log messages on the console
    function log(){
		var array = [">>> Message from server:"];
        array.push.apply(array, arguments);
	    socket.emit('log', array);
	}

	socket.on('message', function (message) {
		log('Client said:', message);
        // for a real app, would be room only (not broadcast)
		socket.broadcast.emit('message', message);
	});

    // when a socket creates or joins a given room
	socket.on('create or join', function (room) {
        log('Request to create or join room ' + room);

        // # clients in a given room
		var numClients = io.sockets.clients(room).length;
		log('Room ' + room + ' has ' + numClients + ' client(s)');

        // create a new room object if it doesn't exist
        rtc[room] = rtc[room] || [];

        // the socket ids within each room
        var connectionIds = [];

        // for each client (e.g., socket id) within a room
        for (var i = 0; i < rtc[room].length; i++) {
            
            // store the socket id into "id"
            var id = rtc[room][i];

            // if the id we're looking 
            // at != the socket that's being connected
            if (id != socket.id) {

                // build a list of peers we want to connect this socket to
                connectionIds.push(id)

                var sock;
                // for each open socket...
                for (var j = 0; j < allClients.length; j++) {
                    // store an open socket into "sock"
                    sock = allClients[j];
                    // finds the socket associated with the id 
                    if (id === sock.id) {
                        break;
                    }
                }
                // check to make sure the socket isn't undefined
                if (sock) {
                    // let everyone know about the join
                    sock.emit("new_peer", socket.id);
                }
            }
        }

        // send new peer a list of all prior peers
        socket.emit("get_peers", connectionIds, socket.id);

        // if the number of clients in the room is 0
		if (numClients === 0){
            // join the room
			socket.join(room);
            // let everyone know that a room was created by a given id
			socket.emit('created', room, socket.id);
		// if the room has already been created
        } else  {
            // join the room
			socket.join(room);
            // let everyone know that a room was joined by a given id
            socket.emit('joined', room, socket.id);
            // emit a ready message 
            io.sockets.in(room).emit('ready');

		}

        // push each socket id into it's respective room.
        // used for opening data channels
        rtc[room].push(socket.id)
	});

    // when a socket disconnects from the server
    socket.on('disconnect', function() {
        
        // find socket to remove
        var i = allClients.indexOf(socket);

        // remove socket from the open sockets array
        allClients.splice(i, 1);

        var room;
        // remove the socket id from each room
        for (var key in rtc) {
            
            // each room (as represented by the token)
            room = rtc[key];

            // -1 if socket id doesn't exist in the room
            // not -1 otherwise
            var exist = room.indexOf(socket.id);

            // if the socket id exists in a room...
            if (exist !== -1) {

                // remove the socket id from the socket array in the room
                room.splice(room.indexOf(socket.id), 1);

                // for each socket id in the room
                for (var j = 0; j < room.length; j++) {

                    // log the socket id
                    console.log(room[j]);

                    var sock;

                    // for each open socket
                    for (var k = 0; k < allClients.length; k++) {
                        
                        // store an open socket into "sock"
                        sock = allClients[k];

                        // finds the socket associated with the id
                        if (room[j] === sock.id) {
                            break;
                        }
                    }

                    // check to make sure the socket isn't undefined
                    if (sock) {
                        // let everyone know about the disconnect
                        sock.emit("remove_peer", socket.id);
                    }
                }
                break;
            }
        }

        // we've successfully closed the socket
        console.info("Server side clean!");

    });

    socket.on('ipaddr', function () {
        var ifaces = os.networkInterfaces();
        for (var dev in ifaces) {
            ifaces[dev].forEach(function (details) {
                if (details.family=='IPv4' && details.address != '127.0.0.1') {
                	log("address", details.address)
                    socket.emit('ipaddr', details.address);
                }
          });
        }
    });

});


