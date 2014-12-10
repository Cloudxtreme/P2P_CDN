var express = require('express')
var static = require('node-static');
var http = require('http');
var app = express();
var server = http.createServer(app);
var os = require('os');
var io = require('socket.io').listen(server);
var stats = require('measured').createCollection();

// boilerplate express setup
app.set('port', (process.env.PORT || 5000))
app.use(express.static(__dirname + '/public'))
app.use('/css', express.static(__dirname + '/css'))
app.use('/js', express.static(__dirname + '/js'))

var file = new(static.Server)();
app.get('/', function(request, response) {
  file.serve(request, response);
})

// server-side object to store information about our clients. 
// used for signaling (e.g., to pick nodes to connect to each other)
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

    function disconnect(id, list) {
        // remove the socket id from the socket array in the list
        list.splice(list.indexOf(id), 1);

        // for each socket id in the list
        for (var j = 0; j < list.length; j++) {

            // log the socket id
            console.log(list[j]);

            var sock;

            // for each open socket
            for (var k = 0; k < allClients.length; k++) {
                
                // store an open socket into "sock"
                sock = allClients[k];

                // finds the socket associated with the id
                if (list[j] === sock.id) {
                    break;
                }
            }

            // check to make sure the socket isn't undefined
            if (sock) {
                // let everyone know about the disconnect
                sock.emit("remove_peer", id);
            }
        }
    }

    // on receiving a message, broadcast it to every socket
	socket.on('message', function (message) {
        // log the message on the console
		log('Client said:', message);
		socket.broadcast.emit('message', message);
	});

    // when a socket creates or joins a given room
	socket.on('create or join', function (room) {
        // # clients in a given room
		var numClients = io.sockets.clients(room).length;
		log('Room ' + room + ' has ' + numClients + ' client(s)');

        // create a new room object if it doesn't exist
        rtc[room] = rtc[room] || {"total": [], "initiators": []};

        // the socket ids within each room
        var connectionIds = [];

        if (rtc[room].initiators.length) {
            // store the socket id in "id"
            var id = socket.id;

            // while our id = the socket that's connecting
            while (id === socket.id) {
                // set the id to a random initiator so that we can download content
                randomId = Math.floor(Math.random()*rtc[room].initiators.length)
                id = rtc[room].initiators[randomId];
            }
            // push the id into the array of connections to instantiate
            connectionIds.push(id);
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
        rtc[room].total.push(socket.id)
        log("Our current RTC object: " + JSON.stringify(rtc));
	});

    // when a socket downloads content from another browser
    socket.on('downloaded', function (room) {
        // log the id and room
        log('Socket', socket.id, "in room", room, "has finished downloading");

        // this socket is now an initiator and can contribute content
        rtc[room].initiators.push(socket.id);

        // log our RTC object for debugging purposes
        log("Our current RTC object: " + JSON.stringify(rtc));
    });

    // when we receive bytes through a data channel
    socket.on('bytes_received', function (room, time) {
        // tell everyone to update their time accordingly
        socket.broadcast.emit('update_graph', time)
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

            // Disconnect from both lists (total and initiators)
            // -1 if socket id doesn't exist in the room (not -1 otherwise)
            var exist_total = room.total.indexOf(socket.id);
            var exist_init = room.initiators.indexOf(socket.id);
            // if the socket id exists in one of the lists...
            if (exist_total !== -1 || exist_init !== -1) {

                if (exist_total !== -1) {
                    disconnect(socket.id, room.total);
                }
                if (exist_init !== -1) {
                    disconnect(socket.id, room.initiators);
                }
                break;
            }
        }

        // we've successfully closed the socket
        console.info("Server side clean!");

    });
});