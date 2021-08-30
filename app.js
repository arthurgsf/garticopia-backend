const Ably = require('ably');

var client = new Ably.Realtime('b75WYw.5VOWVQ:zxct1AniXY80WGpd');
var decoder = new TextDecoder();
var channel = client.channels.get('user');

client.connection.on('connected', function() {
  console.log('connected');
});

channel.subscribe(function(message) {
  var command = decoder.decode(message.data);
  console.log(command);
});