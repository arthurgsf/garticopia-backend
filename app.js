const Ably = require('ably');

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

class logger  {

	static debug(message) {
		console.log("[ DEBUG ] "+message)
	}

	static info(message) {
		console.log("[ INFO ] "+message)
	}

	static warning(message) {
		console.log("[ WARNING ] "+message)
	}

	static error(message) {
		console.log("[ ERROR ] "+message)
	}

	static critical(message) {
		console.log("[ CRITICAL ] "+message)
	}
}

class Server {

	constructor() {
		// cria conexao com o ably brooker
		this.connection = new Ably.Realtime('b75WYw.5VOWVQ:zxct1AniXY80WGpd');
		this.connection.connection.on('connected', this.on_connected);

		this.rooms = [new Room(0, "Test", "Jobs"), new Room(1, "Test2", "Cars"), new Room(2, "Test3", "Jobs")];
		// init topics
		this.get_rooms_topic = this.connection.channels.get("getRooms");
		this.get_rooms_topic.subscribe((message)=>this.get_rooms(message));
		this.open_rooms_topic = this.connection.channels.get("openRooms");
	}

	//============================= callbacks =============================//
	
	on_connected() {
		logger.info('Server Online');
	}

	get_rooms(message) {
		logger.debug('Get Rooms Request Received');
		// JSON com os dados das salas abertas
		var response = {
			rooms: this.rooms.map( room => ({"roomID": room.id,"roomName": room.name,"roomPlayers": room.players.length}))
		}
		// publica salas abertas no topico openRooms
		this.open_rooms_topic.publish('Open Rooms', JSON.stringify(response), function(err) {
			if (err) {
				logger.error('Could not publish Open Rooms');
				console.log(err);	
			} else {
				logger.debug('Open Rooms published');
			}
		});
	}

}

const server = new Server();

/*
// Obtem principais topicos 
var room_topic = client.channels.get('getRooms');
var open_room_topic = client.channels.get('openRooms');

// Connecta no Brooker Ably
client.connection.on('connected', function() {
	console.log('[ INFO ] Server Online');
});

var open_rooms = [{roomName: "Test", roomID: 1}, {roomName: "Test2", roomID: 2}, {roomName: "Test3", roomID: 3}]

// subscribe to
room_topic.subscribe(function(message) {
	console.log('[ INFO ] Message Received:');
	console.log(message);
	// publish response
	var response_data = {
		rooms: open_rooms
	}

	open_room_topic.publish('OpenRooms', JSON.stringify(response_data), function(err) {
		if (err) {
			console.log('[ ERROR ] Could not publish open rooms to topic(openedRooms)');
			console.log(err);	
		} else {
			console.log('[ INFO ] Open Rooms publish to topic(openRooms)')
		}
	});
});
*/