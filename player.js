const { logger } = require('./logger');


// Player data
class Player {
	// player possui os campos: id, name, points
	constructor(id, name) {
		this.id = id;
		this.name = name;
		this.points=0;
	}

	status() {
		return {playerID: this.id, playerName: this.name, playerPoints: this.points};
	}
}

module.exports = {Player}