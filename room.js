const { logger } = require('./logger');
const autoBind = require('auto-bind');

// track room id incremenet
var current_room_id=0;

// Room data
class Room {
	// sala possui os campos name, category, players e id 
	constructor(name, category, server) {
		this.id = current_room_id;
		current_room_id++
		this.name = name;
		this.category = category;
		// TODO implementar list de jogadores como arvore binaria pelo ID
		this.players = [];
		// list com IDs do usuarios que ja desenharam
		this.alreadyDraw = [];
		// lista com IDs do usuario que ja acertaram
		this.alreadyGuessed = [];
		// timer que ira chamar as funcoes de mudanca de estado (referencia salva para poder cancelar se necessario)
		this.timer = null;

		// game cycle properties
		this.stage = "initial"
		this.currentDrawer = -1;
		this.currentDrawing = null;

		// create room topics
		this.topics = {
			status: server.connection.channels.get("/rooms/"+this.id),
			canvas: server.connection.channels.get("/rooms/"+this.id+"/canvas"),
			chat: server.connection.channels.get("/rooms/"+this.id+"/chat"),
			answers: server.connection.channels.get("/rooms/"+this.id+"/answers"),
		} 


	}

	start() {
		logger.debug("Room("+this.id+") Starting");
		// subscribe nos topicos necessarios
		this.topics.chat.subscribe(this.validate_guess.bind(this));
		// call stage right at start
		this.timer = setImmediate(this.interval_stage.bind(this));
	}

	initial_stage() {
		logger.debug("Room("+this.id+") Initial Stage");
		// atualiza status
		this.stage = "initial";
		// reseta valores
		this.currentDrawer = -1;
		this.currentDrawing = null;
		this.alreadyGuessed = [];
		this.alreadyDraw = [];
		// atualiza pontuacoes
		for (let i = 0; i < this.players.length; i++) {
            this.players[i].points = 0;
        }
		// publica mudanca de status
		this.topics.status.publish(""+this.id, JSON.stringify(this.get_status()));
		
	}

	winners_stage() {
		logger.debug("Room("+this.id+") Winner Stage");
		// atualiza status
		this.stage = "winners";
		this.currentDrawer = -1;
		this.currentDrawing = null;
		// publica mudanca de status
		this.topics.status.publish(""+this.id, JSON.stringify(this.get_status()));
		// set timer para voltar par initial
		this.timer = setTimeout(this.initial_stage.bind(this), 1000*5);
		
	}

	interval_stage() {
		// atualiza status
		this.stage = "interval";
		// calcula pontuacao da rodada passada
		if (this.currentDrawer != -1) {
			// obtem jogador a partir do id do desenhista
			let playerDrawer = this.find_player(this.currentDrawer);
			// para evitar erro
			if (playerDrawer !== null) {
				playerDrawer.points += 1 + this.alreadyGuessed.length;
			}
		}
		// reseta jogadores que acertaram
		this.alreadyGuessed = [];
		// verifica se a pontuacao maxima foi adquirida
		if (this.maxPoinsAchieved(20)) {
			// imediatamente muda para winner stage
			this.timer = setImmediate(this.winners_stage.bind(this));

		} else {
			// seleciona jogador para desenhar
			this.currentDrawer = this.generate_drawer();
			this.alreadyDraw.push(this.currentDrawer);
			// seleciona palavra para desenhar
			this.currentDrawing = this.generate_draw();
			// prepara timer para drawing stage function em 5 segundos
			this.timer = setTimeout(this.drawing_stage.bind(this), 1000*5);
			logger.debug("Room("+this.id+"): Interval Stage (Next Drawer: "+this.currentDrawer+", Next Drawing: "+this.currentDrawing+")");
			// publica mudanca de status
			this.topics.status.publish(""+this.id, JSON.stringify(this.get_status()));
		}
	
	}

	drawing_stage() {
		logger.debug("Room("+this.id+"): Drawing Stage");
		// atualiza status
		this.stage = "drawing";
		// prepara timer para interval stage function
		this.timer = setTimeout(this.interval_stage.bind(this), 1000*10);
		// publica mudanca de status
		this.topics.status.publish(""+this.id, JSON.stringify(this.get_status()));
	}

	validate_guess(message) {
		// decodifica mensagem
		let messageDecoded = JSON.parse(message.data);
		// mensagem a ser envida no chat de respostas
		let chatResposnse = {userID: messageDecoded.userID, guess: messageDecoded.guess};

		// obtem jogador a desenhar
		let playerGuessingIndex = this.find_player_index(messageDecoded.userID);
		// verifica se o chute esta correto
		if ((messageDecoded.guess == this.currentDrawing) && (this.stage == "drawing") && (messageDecoded.userID != this.currentDrawer) && (!this.alreadyGuessed.includes(messageDecoded.userID)) && (playerGuessingIndex > -1)) {
			logger.debug("Room("+this.id+"): User("+messageDecoded.userID+") Guessed Correctly");
			// atualiza pontuacoes
			this.players[playerGuessingIndex].points += 9 - this.alreadyGuessed.length;
			// adiciona player para a lista de jogadores que ja acertaram
			this.alreadyGuessed.push( this.players[playerGuessingIndex].id );
			// publica mudanca de status
			this.topics.status.publish(""+this.id, JSON.stringify(this.get_status()));
			// adiciona extra info na resposta
			chatResposnse.info = "Acertou";
		} else {
			logger.debug("Room("+this.id+"): User("+messageDecoded.userID+") Guessed Wrong");
			// adiciona extra info na resposta
			chatResposnse.info = "Errou";
		}
		// verifica se mais alguem precisa acertar
		if (this.alreadyGuessed.length == (this.players.length-1) ) {
			// cancela timer para mudar para estado de intervalo
			logger.debug("Room("+this.id+"): Everyone already guessed");
			// clear old timer
			clearTimeout(this.timer);
			// go to interval stage
			this.timer = setImmediate(this.interval_stage.bind(this));
		}

		// publica resposta no site de respostas 
		this.topics.answers.publish(""+this.id, JSON.stringify(chatResposnse));
			
	}

	generate_draw() {
		// gera uma nova palavra para ser desenhada
		return this.category
	}

	generate_drawer() {
		// obtem usuarios que ainda nao desenharam
		let possibleDrawers = this.players.filter(player => !(this.alreadyDraw.includes(player.id)) );
		// se nao tiver mais jogadores disponiveis para desenhar
		if (possibleDrawers.length == 0) {
			// reseta lista de jogadores que ja desenharam e torna possivel desenhistar para todos os jogadores
			this.alreadyDraw = [];
			possibleDrawers = this.players;
		}
		// seleciona um jogador aleatorio
		return possibleDrawers[Math.floor(Math.random() * possibleDrawers.length)].id;
	}

	get_players_status() {
		// obtem status dos jogadores
		return this.players.map(player=>player.status());
	}

	get_status() {
		// obtem status atual da sala
		var players = this.get_players_status();
		return {ID: this.id, name: this.name, category: this.category, stage: this.stage, alreadyGuessed: this.alreadyGuessed, timeLeft: getTimeLeft(this.timer), currentDrawer: this.currentDrawer, currentDrawing: this.currentDrawing, players: players};
	}

	add_player(player) {
		logger.debug("Adding Player("+player.id+") to Room("+this.id+")");
		// add player and publish current status
		this.players.push(player);
		this.topics.status.publish(""+this.id, JSON.stringify(this.get_status()));
		logger.debug("Publishing at /rooms/"+this.id+": "+JSON.stringify(this.get_status()));
	}

	find_player(player_id) {
		// busca por cada jogador e retorna o jogador com id igual
		for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].id == player_id) {
                return this.players[i];
            }
        }
        return null;
	}

	find_player_index(player_id) {
		// busca por cada jogador e retorna o index do jogador com id igual
		for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].id == player_id) {
                return i;
            }
        }
        return -1;
	}

	maxPoinsAchieved(points) {
		// busca por cada jogador e verifica se alguem possui a quantidade de pontos
		for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].points >= points) {
                return true;
            }
        }
        return false;
	}


	remove_player(player_id) {
		// remove jogador da sala e retorna os seus dados
		for (let i = 0; i < this.players.length; i++) {
            if (this.players[i] == player_id) {
            	// obtem o jogador na posicao i, e remove a posicao i do vetor
                var player = this.players[i];
				logger.debug("Removing player with id "+player_id+" from Room <"+this.id+">");
                this.players.splice(player_index, 1);
                // publish mudanca de status
                this.topics.status.publish(""+this.id, JSON.stringify(this.get_status()));
				logger.debug("Publishing at /rooms/"+this.id+": "+JSON.stringify(this.get_status()));
                // retorna o jogador removido
            	return player;
            }
        }
        // returona null se nao achou o jogador
        return null;
	}
}

// get the timeout of a timer in miliseconds
function getTimeLeft(timer) {
	if (timer === null) {
		return -1;
	}
	try {
		console.log(timer._idleStart);
		console.log(timer._idleTimeout);
		let sum = timer._idleStart+timer._idleTimeout;
		console.log(sum);
		console.log(Date.now());
		console.log(sum-Date.now());
		Math.ceil((sum-Date.now()) / 1);
	} catch (error) {
		logger.warning("getTimeLeft Error");
		console.log(error);
		return -1;
	}
}

module.exports = {Room}