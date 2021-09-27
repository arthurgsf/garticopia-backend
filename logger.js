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

module.exports = {logger}