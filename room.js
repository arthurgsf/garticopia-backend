const { logger } = require('./logger');
const autoBind = require('auto-bind');
const { Pool } = require('pg');

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
		logger.debug("Room("+this.id+"-"+this.name+") Starting");
		// subscribe nos topicos necessarios
		this.topics.chat.subscribe(this.validate_guess.bind(this));
		this.topics.canvas.subscribe(this.echo_modification.bind(this));
		// call stage right at start
		this.timer = setImmediate(this.interval_stage.bind(this));
	}

	initial_stage() {
		logger.debug("Room("+this.id+"-"+this.name+") Initial Stage");
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
		logger.debug("Room("+this.id+"-"+this.name+") Winner Stage");
		// atualiza status
		this.stage = "winners";
		this.currentDrawer = -1;
		this.currentDrawing = null;
		// unsubscribe dos topicos do ciclo do jogo
		this.topics.chat.unsubscribe();
		this.topics.canvas.unsubscribe();
		// publica mudanca de status
		this.topics.status.publish(""+this.id, JSON.stringify(this.get_status()));
		// set timer para voltar par initial
		this.timer = setTimeout(this.initial_stage.bind(this), 1000*10);
		
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
		// reseta jogadores que acertaram e modificacoes do canvas
		this.alreadyGuessed = [];
		// verifica se a pontuacao maxima foi adquirida
		if (this.maxPoinsAchieved(12*this.players.length)) {
			// imediatamente muda para winner stage
			this.timer = setImmediate(this.winners_stage.bind(this));

		} else {
			// seleciona jogador para desenhar
			this.currentDrawer = this.generate_drawer();
			this.alreadyDraw.push(this.currentDrawer);
			// seleciona palavra para desenhar
			this.currentDrawing = this.generate_draw();
			// prepara timer para drawing stage function em 5 segundos
			this.timer = setTimeout(this.drawing_stage.bind(this), 1000*10);
			logger.debug("Room("+this.id+"-"+this.name+"): Interval Stage (Next Drawer: "+this.currentDrawer+", Next Drawing: "+this.currentDrawing+")");
			// publica mudanca de status
			this.topics.status.publish(""+this.id, JSON.stringify(this.get_status()));
		}
	
	}

	drawing_stage() {
		logger.debug("Room("+this.id+"-"+this.name+"): Drawing Stage");
		// atualiza status
		this.stage = "drawing";
		// prepara timer para interval stage function
		this.timer = setTimeout(this.interval_stage.bind(this), 1000*20);
		// publica mudanca de status
		this.topics.status.publish(""+this.id, JSON.stringify(this.get_status()));
	}

	echo_modification(message) {
		logger.debug("Room("+this.id+"-"+this.name+"): Canvas Modification");
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
			logger.debug("Room("+this.id+"-"+this.name+"): User("+messageDecoded.userID+") Guessed Correctly");
			// atualiza pontuacoes
			this.players[playerGuessingIndex].points += this.players.length - this.alreadyGuessed.length;
			// adiciona player para a lista de jogadores que ja acertaram
			this.alreadyGuessed.push( this.players[playerGuessingIndex].id );
			// publica mudanca de status
			this.topics.status.publish(""+this.id, JSON.stringify(this.get_status()));
			// adiciona extra info na resposta
			chatResposnse.info = "Acertou";
		} else {
			logger.debug("Room("+this.id+"-"+this.name+"): User("+messageDecoded.userID+") Guessed Wrong");
			// adiciona extra info na resposta
			chatResposnse.info = "Errou";
		}
		// verifica se mais alguem precisa acertar
		if (this.alreadyGuessed.length == (this.players.length-1) ) {
			// cancela timer para mudar para estado de intervalo
			logger.debug("Room("+this.id+"-"+this.name+"): Everyone already guessed");
			// clear old timer
			clearTimeout(this.timer);
			// go to interval stage
			this.timer = setImmediate(this.interval_stage.bind(this));
		}

		// publica resposta no site de respostas 
		this.topics.answers.publish(""+this.id, JSON.stringify(chatResposnse));
			
	}



	generate_draw() {
		function getRandomInt(min, max) {
			min = Math.ceil(min);
			max = Math.floor(max);
			return Math.floor(Math.random() * (max - min)) + min;
		}
		
		words = {
			'Esportes':[
				'MMA',
				'Boxe',
				'Fórmula-1',
				'Futebol Americano',
				'Golfe',
				'Vôlei',
				'Hóquei',
				'Rugby',
				'Atletismo',
				'Tênis',
				'Basquete',
				'Beisebol',
				'Airsoft',
			],
			'Comidas':[
				'Pão de Queijo',
				'Coxinha',
				'Acarajé',
				'Feijão',
				'Farofa',
				'Churrasco',
				'Açaí',
				'Brigadeiro',
				'Paçoca',
				'Sushi',
			],
			'Verbos':[
				'Andar',
				'Correr',
				'Comer',
				'Nadar',
				'Espiar',
				'Espirrar',
				'Jogar',
				'Brincar',
				'Banhar',
				'Lavar',
				'Coçar',
			]

		}

		return words[this.category][getRandomInt(0, words[this.category].length)]
	}

	generate_drawer() {
		// caso a sala nao tenha sido dstruida ainda na thread do server
		if (this.players.length == 0) {
			return -1;
		}
		// obtem usuarios que ainda nao desenharam
		let possibleDrawers = this.players.filter(player => !(this.alreadyDraw.includes(player.id)) );
		// se nao tiver mais jogadores disponiveis para desenhar
		if (possibleDrawers.length == 0) {
			logger.debug("Reseting Possible Drawers");
			// reseta lista de jogadores que ja desenharam e torna possivel desenhistar para todos os jogadores
			this.alreadyDraw = [];
			// caso a sala nao tenha sido dstruida ainda na thread do server
			if (this.players.length == 0) {
				return -1;
			}
			possibleDrawers = this.players;
		}
		// seleciona um jogador aleatorio
		let selected_player = possibleDrawers[Math.floor(Math.random() * possibleDrawers.length)];
		// se for undefined
		return selected_player.id;

	}

	get_players_status() {
		// obtem status dos jogadores
		return this.players.map(player=>player.status());
	}

	get_status() {
		// obtem status atual da sala
		var players = this.get_players_status();
		return {ID: this.id, name: this.name, category: this.category, stage: this.stage, alreadyGuessed: this.alreadyGuessed, timeLeft: getTimeLeft(this.timer), currentDrawer: this.currentDrawer, currentDrawing: this.currentDrawing, players: players, canvasModifications: this.canvasModifications};
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
            if (this.players[i].id == player_id) {
            	// obtem o jogador na posicao i, e remove a posicao i do vetor
                var player = this.players[i];
				logger.debug("Removing player with id "+player_id+" from Room <"+this.id+">");
                this.players.splice(i, 1);
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

	stop() {
		logger.info("Room("+this.id+"-"+this.name+"): Stopping");
		this.initial_stage();	        
		try {
			clearTimeout(this.timer);
		} catch (err) {
			logger.error(err);
		}
	}
}

// get the timeout of a timer in miliseconds
function getTimeLeft(timer) {
	if (timer === null) {
		return -1;
	}
	try {
		let sum = timer._idleStart+timer._idleTimeout;
		let currentTime = process.hrtime()[0]*1000
		let timeLeft = Math.ceil((sum-currentTime) / 1);
		console.log("getTimeLeft: "+timeLeft);
		return timeLeft;
	} catch (error) {
		logger.warning("getTimeLeft Error");
		console.log(error);
		return -1;
	}
}

module.exports = {Room}
