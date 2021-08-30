const Ably = require('ably');


// Room data
class Room {
	id;
	name;
	category;
	players=[];

	// sala possui os campos name, category, players e id 
	constructor(id, name, category) {
		this.id = id;
		this.name = name;
		this.category = category;
		this.players = [];
	}
}

// funcoes de log
var logger = {
	debug: function(message) {
		console.log("[ DEBUG ] "+message);
	},
	info: function(message) {
		console.log("[ INFO ] "+message);
	},
	warning: function(message) {
		console.log("[ WARNING ] "+message);
	},
	error: function(message) {
		console.log("[ ERROR ] "+message);
	},
	critical: function(message) {
		console.log("[ CRITICAL ] "+message);
	}
};


// dados do servidor
var server = {
	connection: new Ably.Realtime('b75WYw.5VOWVQ:zxct1AniXY80WGpd'),
	rooms: [new Room(0, "Test", "Jobs"), new Room(1, "Test2", "Cars"), new Room(2, "Test3", "Jobs")],	
}

// inicializa topicos
server.topics = {
	getRooms: server.connection.channels.get("getRooms"),
	openRooms: server.connection.channels.get("openRooms"),
}

// adiciona callback da connexao
server.connection.connection.on('connected', function() {
	logger.info('Server Online');
});


// validacao de token
function validateToken(token) {
	return token > 0;
}


// se inscreve no topic getRooms para ouvir requisicoes\
server.topics.getRooms.subscribe(function(message) {
	// log mesagem recebida
	logger.debug('Get Rooms Request Received');

	// parse a mensagem
	message_data = JSON.parse(message.data)

	// verifica se o token e valido
	if ( validateToken(message_data.userToken) ) {
		// JSON com os dados das salas abertas
		var response = {
			rooms: server.rooms.map( room => ({"roomID": room.id,"roomName": room.name,"roomPlayers": room.players.length}))
		}
		// publica salas abertas no topico openRooms
		server.topics.openRooms.publish('Open Rooms', JSON.stringify(response), function(err) {
			if (err) {
				logger.error('Could not publish Open Rooms');
				console.log(err);	
			} else {
				logger.debug('Open Rooms published');
			}
		});
	} else {
		logger.warning("Get Room Request with not authenticated token")
	}

});

