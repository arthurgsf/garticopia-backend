// ably broker
const Ably = require('ably');
// logger api
const { logger } = require('./logger');


// dados do servidor
const server = {
	// local API b75WYw.5VOWVQ:zxct1AniXY80WGpd
	connection: new Ably.Realtime('f3tY9A.5_05yA:RGdvuS_TneYKSUG5'),
	// TODO implementar lista de salas como arvore binaria pelo ID
	rooms: [],	
}


// inicializa topicos
server.topics = {
	rooms: server.connection.channels.get("rooms"),
	rooms: server.connection.channels.get("/rooms"),
}

// adiciona callback da connexao
server.connection.connection.on('connected', function() {
	logger.info('Connected to Broker');
});

server.connection.connection.on('connecting', function() {
	logger.info('Connecting to Broker');
});

server.connection.connection.on('disconnected', function() {
	logger.info('Broker Disconnected');
});

server.connection.connection.on('closed', function() {
	logger.info('Connection to Broker Closed');
});


module.exports = {server, logger}
