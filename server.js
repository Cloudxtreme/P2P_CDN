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

        //   var connectionsId = [];
        //   var roomList = rtc.rooms[data.room] || [];

        //   roomList.push(socket.id);
        //   rtc.rooms[data.room] = roomList;


        //   for (var i = 0; i < roomList.length; i++) {
        //     var id = roomList[i];

        //     if (id == socket.id) {
        //       continue;
        //     } else {

        //       connectionsId.push(id);
        //       var soc = rtc.getSocket(id);

        //       // inform the peers that they have a new peer
        //       if (soc) {
        //         soc.send(JSON.stringify({
        //           "eventName": "new_peer_connected",
        //           "data":{
        //             "socketId": socket.id
        //           }
        //         }), function(error) {
        //           if (error) {
        //             console.log(error);
        //           }
        //         });
        //       }
        //     }
        //   }
        //   // send new peer a list of all prior peers
        //   socket.send(JSON.stringify({
        //     "eventName": "get_peers",
        //     "data": {
        //       "connections": connectionsId,
        //       "you": socket.id
        //     }
        //   }), function(error) {
        //     if (error) {
        //       console.log(error);
        //     }
        //   });
        // });

		if (numClients === 0){
			socket.join(room);
			socket.emit('created', room, socket.id);

		} else  {
			socket.join(room);
            socket.emit('joined', room, socket.id);
            io.sockets.in(room).emit('ready');

		}
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


