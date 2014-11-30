var express = require('express')
var static = require('node-static');
var http = require('http');
var app = express();

app.set('port', (process.env.PORT || 5000))
app.use(express.static(__dirname + '/public'))

var file = new(static.Server)();
app.get('/', function(request, response) {
  file.serve(request, response);
})

app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'))
})



