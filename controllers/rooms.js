const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { server } = require('../ably-app');
const { logger } = require('../logger');
const { Room } = require('../room');
const { Player } = require('../player');

const router = express.Router();
router.use(authMiddleware);

// cria uma sala
router.post('/createroom', async (req, res) => {
    // obtem nome e categoria da sala na mensagem
    const roomName = req.body.roomName;
    const roomCategory = req.body.roomCategory;
    // obtem dados do usuario na mensagem
    const userName = req.body.userName;
    const userID = req.body.userID;
    // cria uma sala e adiciona nos dados do servidor
    let new_room = new Room(roomName, roomCategory, server);
    let new_player = new Player(userID, userName);
    new_room.add_player(new_player);
    server.rooms.push(new_room);
    // log operacao
    logger.info("Create Room Request: "+roomName+" - "+roomCategory+" - "+new_room.id);
    // publica novas salas
    server.publishRooms();
    // envia mensagem de resposta para o cliente
    res.status(200).send({roomStatus: new_room.get_status()});
});

router.post('/startroom', async (req, res) => {
    const roomID = req.body.roomID;
    const userID = req.body.userID;
    // busca pela sala
    var room_found = null;
    for (let i = 0; i < server.rooms.length; i++) {
        if (server.rooms[i].id == roomID) {
            room_found = server.rooms[i];
            break;
        }
    }

    if (room_found) {
        // check if the user is already inside
        var player = room_found.find_player(userID);
        if (player == null) {
            logger.warning("Start Room Request From Invalid User");
            res.status(400).send({ message:'User Not inside Room' });
        } else {
            // comeca o ciclo da sala
            room_found.start();
            res.status(200).send({message: "Room Starting"});
        }
    } else {
        logger.warning("Enter Room Request: Room not Found["+roomID+"]");
        res.status(400).send({ message:'Room not Found' });
    }
});

// entra numa sala
router.post('/enterroom', async (req, res) => {
    const { userName, userID, roomID } = req.body;
    // busca pela sala
    var room_found = null;
    for (let i = 0; i < server.rooms.length; i++) {
        if (server.rooms[i].id == roomID) {
            room_found = server.rooms[i];
            break;
        }
    }

    if (room_found) {
        // check if the user is already inside
        var player = room_found.find_player(userID);
        if (player != null) {
            logger.warning("Enter Room Request: User already inside the Room");
            res.status(400).send({ message:'User already inside the Room' });
        } else {
            // cria um player e adiciona na sala
            var new_player = new Player(userID, userName);
            room_found.add_player(new_player);
            logger.info("Enter Room Request: room("+roomID+") by player("+userID+")");
            // publica novas salas
            server.publishRooms();
            res.status(200).send({roomStatus: room_found.get_status()});
        }
    } else {
        logger.warning("Enter Room Request: Room not Found["+roomID+"]");
        res.status(400).send({ message:'Room not Found' });
    }

});

// sai de uma sala
router.post('/exitroom', async (req, res) => {
    // obtem o id da sala e do usuario
    const userID = req.body.userID;
    const roomID = req.body.roomID;
    // busca pela sala
    var room_index = -1;
    for (let i = 0; i < server.rooms.length; i++) {
        if (server.rooms[i].id == roomID) {
            room_index = i;
            break;
        }
    }
    // tenta remover da sala e a sala foi encontrada
    if (room_index > -1) {
        // remove the user
        var user = server.rooms[room_index].remove_player(userID);

        // verifica se o jogador foi realmente removido
        if (user == null) {
            logger.warning("Exit Room Request: User is not inside the Room");
            res.status(400).send({ message:'User is not inside the Room' });

        } else {
            logger.info("Exit Room Request: room("+roomID+") by player("+userID+")");
            // verificar se a sala esta vazia, removendo-a se sim
            if (server.rooms[room_index].players.length == 0) {
                server.rooms.splice(room_index, 1);
                logger.debug("Removing Empty Room: "+room_index);
            }
            // publica novas salas
            server.publishRooms();
            // envia resposta
            res.status(200).send({ message:'User removed from the Room' });
        }

    } else {
        logger.warning("Exit Room Request: Room not Found ["+roomID+"]");
        res.status(400).send({ message:'Room not Found' });
    }

});


module.exports = app => app.use('/room', router);
