const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Pool } = require('pg');
const { server, logger, Room, validateToken} = require('./ably-app');

const app = express();
const port = 3333

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const uri = "postgres://zulvtfakhqhkof:5504013551534559e218e526643e5368920fed660d599543421444190363997b@ec2-44-197-40-76.compute-1.amazonaws.com:5432/degfb5n0uhscf9";

const pool = new Pool({
    connectionString: uri,
    ssl: {
        rejectUnauthorized: false
    }
})


function generateToken(params = {}) {
    return jwt.sign(params, 'garticopia-backend', {
        expiresIn: 86400 //1 dia
    })
}

app.get('/', async function (req, res) {
    res.send('api do garticopia')
});

app.post('/register', async (req, res) => {//registra um usuario
    try {
        const { name, email, password } = req.body;
        const findemail = await pool.query(`SELECT * FROM users WHERE email=$1`, [email])
        if (findemail.rows.length != 0)
            return res.status(400).send({ message: 'User already Registered' })

        const salt = crypto.randomBytes(20).toString('hex');
        const passwordHash = crypto.createHash('sha256').update(password + salt).digest('hex');
        await pool.query(`INSERT INTO users (name, email, password, salt) VALUES($1, $2, $3, $4)`, [name, email, passwordHash, salt])
        logger.info("Register User Request Received");
        return res.status(200).send({ mensagem: `Usuário cadastrado com Sucesso` })
    } catch (err) {
        console.log(err);
        return res.status(400).send({ message: 'Falha ao registrar usuário' })
    }
});

app.post('/auth', async (req, res) => {//autentica um usuario
    try {
        const { email, password } = req.body;
        const user = await pool.query(`SELECT * FROM users WHERE email=($1)`, [email])

        if (user.rows.length == 0)
            return res.status(400).send({ message: 'Usuário não encontrado' })
        const salt = user.rows[0].salt
        const encrytedPassword = crypto.createHash('sha256').update(password + salt).digest('hex');
        if (user.rows[0].password != encrytedPassword)
            return res.status(400).send({ message: 'Senha invalida' })
        logger.info("Login Request Received");
        res.status(200).send({ userToken: user.rows[0].id })
    } catch (err) {
        console.error(err)
    }

});

// cria uma sala
app.post('/createroom', async (req, res) => {
    const userToken = req.body.userToken;
    // if the user is authenticated
    if (validateToken(userToken)) {
        // obtem nome e categoria da sala na mensagem
        const roomName = req.body.roomName;
        const roomCategory = req.body.roomCategory;
        // cria uma sala e adiciona nos dados do servidor
        var new_room = new Room(roomName, roomCategory);
        new_room.players.push(userToken);
        server.rooms.push(new_room);
        // log operacao
        logger.info("Create Room Request Received");
        // envia mensagem de resposta para o cliente
        res.status(200).send({roomID: new_room.id});
    } else {
        logger.warning("Create Room Request: User not registered");
        res.status(400).send({ message:'User not registered' });
    }  
});

// entra numa sala
app.post('/enterroom', async (req, res) => {
    const userToken = req.body.userToken;
    // if the user is authenticated
    if (validateToken(userToken)) {
        // obtem o id da sala
        const roomID = req.body.roomID;
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
            var user_inside = false;
            for (let j = 0; j < room_found.players.length; j++) {
                if (room_found.players[j] == userToken) {
                    user_inside = true;
                    break;
                }
            }
            if (user_inside) {
                logger.warning("Enter Room Request: User already inside the Room");
                res.status(400).send({ message:'User already inside the Room' });
            } else {
                // adiciona o usuario na sala
                room_found.players.push(userToken);
                logger.info("Enter Room Request");
                res.status(200).send({ message:'User added to the Room' });
            }
        } else {
            logger.warning("Enter Room Request: Room not Found");
            res.status(400).send({ message:'Room not Found' });
        }

    } else {
        logger.warning("Enter Room Request: User not registered");
        res.status(400).send({ message:'User not registered' });
    }    
});

// sai de uma sala
app.post('/exitroom', async (req, res) => {
    const userToken = req.body.userToken;
    // if the user is authenticated
    if (validateToken(userToken)) {
        // obtem o id da sala
        const roomID = req.body.roomID;
        // busca pela sala
        var room_found = null;
        for (let i = 0; i < server.rooms.length; i++) {
            if (server.rooms[i].id == roomID) {
                room_found = server.rooms[i];
                break;
            }
        }

        if (room_found) {
            // check if the user is in the room
            var user_inside = false;
            for (let j = 0; j < room_found.players.length; j++) {
                if (room_found.players[j] == userToken) {
                    user_inside = true;
                    break;
                }
            }
            if (user_inside) {
                // remove o id do jogador
                room_found.players = room_found.players.filter((player_id)=>{userToken != player_id});
                logger.info("Exit Room Request");
                // verifica se a sala esta vazia
                if (room_found.players.length == 0) {
                    server.rooms = server.rooms.filter((room)=>{room.id != roomID});
                    logger.debug("Removing Empty Room");
                }
                res.status(200).send({ message:'User removed from the Room' });
                
            } else {
                logger.warning("Exit Room Request: User already inside the Room");
                res.status(400).send({ message:'User is not inside the Room' });
            }
        } else {
            logger.warning("Exit Room Request: Room not Found");
            res.status(400).send({ message:'Room not Found' });
        }

    } else {
        logger.warning("Exit Room Request: User not registered");
        res.status(400).send({ message:'User not registered' });
    }    
});


app.use(cors());
app.use(express.json());


app.listen(port, () => (
    logger.info('Listening at Port '+port)
    //console.log('listening at port', port)

));

