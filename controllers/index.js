const fs = require('fs');
const path = require('path');

// Ao ser Requerido, require os arquivos necessarios, recebendo e passando express app
module.exports = app => {
	// para cada arquivo no diretorio e subdiretorios
	// ao filtrar os arquivos
	// chama require nos arquivos filtrados passando express app
    fs
        .readdirSync(__dirname)
        .filter(file => ((file.indexOf('.')) != 0 && (file != "index.js")))
        .forEach(file => require(path.resolve(__dirname, file))(app));
};