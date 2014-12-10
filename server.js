var express = require('express')
var static = require('node-static');
var http = require('http');
var app = express();
var server = http.createServer(app);
var os = require('os');
var io = require('socket.io').listen(server);
var stats = require('measured').createCollection();
// var d3 = require("d3");

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
    // stats.meter('requestsPerSecond').mark();
    // setInterval(function() {
    //     console.log(stats.toJSON());
    // }, 1000);
    
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

	socket.on('message', function (message) {
		log('Client said:', message);
        // for a real app, would be room only (not broadcast)
		socket.broadcast.emit('message', message);
	});

    // when a socket creates or joins a given room
	socket.on('create or join', function (room) {
        // # clients in a given room
		var numClients = io.sockets.clients(room).length;
		log('Room ' + room + ' has ' + numClients + ' client(s)');

        // create a new room object if it doesn't exist
        rtc[room] = rtc[room] || {"total": [], "initiators": [], "notinitiators": []};

        // the socket ids within each room
        var connectionIds = [];

        // for each client (e.g., socket id) within a room
        // for (var i = 0; i < rtc[room].initiators.length; i++) {
        if (rtc[room].initiators.length) {
            
        //     // store the socket id into "id"
        //     var id = rtc[room].total[i];

        //     // if the id we're looking 
        //     // at != the socket that's being connected
        //     if (id != socket.id) {

        //         // build a list of peers we want to connect this socket to
        //         connectionIds.push(id)

                var id = socket.id;
                while (id === socket.id)
                    id = rtc[room].initiators[Math.floor(Math.random()*rtc[room].initiators.length)];
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
        // }

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
        rtc[room].notinitiators.push(socket.id)
        log('Look at my rtc, my rtc is amazing ' + JSON.stringify(rtc));
	});

    socket.on('downloaded', function (room) {
        log('Socket', socket.id, "in room", room, "has finished downloading");
        rtc[room].initiators.push(socket.id);
        rtc[room].notinitiators.splice(rtc[room].notinitiators.indexOf(socket.id));
        log('Look at my rtc, my rtc is amazing ' + JSON.stringify(rtc));
    });

    socket.on('bytes_received', function (room, time) {
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

            // Disconnect from both lists
            // -1 if socket id doesn't exist in the room
            // not -1 otherwise
            var exist_total = room.total.indexOf(socket.id);
            var exist_init = room.initiators.indexOf(socket.id);
            // if the socket id exists in a list...
            if (exist_total !== -1 || exist_init !== -1) {
                if (exist_total !== -1)
                    disconnect(socket.id, room.total);
                if (exist_init !== -1)
                    disconnect(socket.id, room.initiators);
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


