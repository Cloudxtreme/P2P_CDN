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

var rtc = {};

var file = new(static.Server)();
app.get('/', function(request, response) {
  file.serve(request, response);
})

// var webRTC = require('rtc_server').listen(app.get('port'));

server.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'))
})


io.sockets.on('connection', function (socket){

    // convenience function to log server messages on the client
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

	socket.on('create or join', function (room) {
        log('Request to create or join room ' + room);

		var numClients = io.sockets.clients(room).length;
		log('Room ' + room + ' has ' + numClients + ' client(s)');

        rtc[room] = rtc[room] || [];
        var connectionIds = [];

        for (var i = 0; i < rtc[room].length; i++) {
            var id = rtc[room][i];
            if (id != socket.id) {
                // build a list of peers we want to connect this node to
                connectionIds.push(id)
                // code //
                var sock;
                for (var j = 0; j < io.sockets.length; j++) {
                    sock = io.sockets[j];
                    if (id === sock.id) {
                        break;
                    }
                }
                if (sock) {
                    sock.emit("new_peer", socket.id);
                    // sock.send(JSON.stringify({
                    //     "eventName": "new_peer",
                    //     "data": {
                    //         "socketId": socket.id
                    //     }
                    // // }), function(error) {
                    //       if (error) {
                    //         console.log(error);
                    //       }
                    // });
                }
            }
        }

        // send new peer a list of all prior peers
        socket.emit("get_peers", connectionIds, socket.id);
        // socket.send(JSON.stringify({
        //     "eventName": "get_peers",
        //     "data": {
        //         "connections": connectionIds,
        //         "you": socket.id
        //     }
        // }), function(error) {
        //     if (error) {
        //         console.log(error);
        //     }
        // });

		if (numClients === 0){
			socket.join(room);
			socket.emit('created', room, socket.id);

		} else  {
			socket.join(room);
            socket.emit('joined', room, socket.id);
            io.sockets.in(room).emit('ready');

		}
        // push each socket id into it's respective room
        rtc[room].push(socket.id)
	});

    socket.on('disconnect', function() {
        // find socket to remove
        var i = io.sockets.indexOf(socket);
        // remove socket
        io.sockets.splice(i, 1);

        // remove from rooms and send remove_peer_connected to all sockets in room
        var room;
        for (var key in rtc) {

            room = rtc[key];
            var exist = room.indexOf(socket.id);

            if (exist !== -1) {
                room.splice(room.indexOf(socket.id), 1);
                for (var j = 0; j < room.length; j++) {
                    console.log(room[j]);
                    var sock;
                    for (var k = 0; k < io.sockets.length; k++) {
                        sock = io.sockets[k];
                        if (id === sock.id) {
                            break;
                        }
                    }
                    if (sock) {
                        sock.emit("remove_peer", socket.id);
                    }
                }
                break;
            }
        }
        console.info("Server side Clean!!");
      // // we are leaved the room so lets notify about that
      // rtc.fire('room_leave', room, socket.id);
      
      // // call the disconnect callback
      // rtc.fire('disconnect', rtc);

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


