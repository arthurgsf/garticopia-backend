const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
// postgree database module
const { Pool } = require('pg');
// ably broker api module
const { server } = require('./ably-app');
// logger api module
const { logger } = require('./logger');

// cria express app
const app = express();
const port = 3333

// use epxress parameteros
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

// chama require em todos os arquivos necessarios
require('./controllers/index')(app);

// uri do banco de dados
const uri = "postgres://zulvtfakhqhkof:5504013551534559e218e526643e5368920fed660d599543421444190363997b@ec2-44-197-40-76.compute-1.amazonaws.com:5432/degfb5n0uhscf9";

// cria conexao com o banco de dados
const pool = new Pool({
    connectionString: uri,
    ssl: {
        rejectUnauthorized: false
    }
})

// funcao para gerar um token de autenticacao baseado nos parametros passsados
function generateToken(params = {}) {
    // utiliza a API do jwt para gerar um token de 1 dia
    return jwt.sign(params, 'garticopia-backend', {
        expiresIn: 86400 //1 dia
    })
}

app.get('/', async function (req, res) {
    logger.debug("HTTP GET /")
    res.send('api do garticopia')
});

// funcao para lidar com POST de Registro de Usuario
app.post('/register', async (req, res) => {
    try {
        // obtem dados do usuario na mensagem da requisicao
        const { userName, userEmail, userPassword } = req.body;
        // faz uma busca no banco de dados para o email passado
        const findemail = await pool.query(`SELECT * FROM users WHERE email=$1`, [userEmail])
        // se o email ja existe, envia resposta de erro
        if (findemail.rows.length != 0) {
            logger.warning("Register User Request: "+userEmail+" [User already Registered]");    
            return res.status(400).send({ message: 'User already Registered' })
        }
        // senao, criar um salt aleatorio para encriptar a senha
        const salt = crypto.randomBytes(20).toString('hex');
        // calcula o Hash da senha + salt
        const passwordHash = crypto.createHash('sha256').update(userPassword + salt).digest('hex');
        // inseres os dados no banco de dados: Nome, Email, Salt, Hash da Senha
        await pool.query(`INSERT INTO users (name, email, password, salt) VALUES($1, $2, $3, $4)`, [userName, userEmail, passwordHash, salt])
        // obtem ID do usuario cadastrado
        const user = await (await pool.query(`SELECT * FROM users WHERE email=$1`, [userEmail])).rows[0];
        // envia resposta com o ID do usuario recem cadastrado
        logger.info("Register User Request: "+userName+" - "+userEmail);
        return res.status(200).send({ userToken: generateToken({ id: user.rows[0].id }), userID: user.rows[0].id, userName: user.rows[0].name });
    } catch (err) {
        // em caso de erro
        console.log(err);
        return res.status(500).send({ message: 'Falha ao registrar usuário' })
    }
});

// funcao para lidar com POST de autenticacao de Usuario
app.post('/auth', async (req, res) => {
    try {
        // obtem dados do usuario na mensagem da requisicao
        const { userEmail, userPassword } = req.body;
        // faz uma busca no banco de dados para o email passado
        const user = await pool.query(`SELECT * FROM users WHERE email=($1)`, [userEmail])

        // se usuario nao existe, envia resposta de erro
        if (user.rows.length == 0) {
            logger.warning("Login Request: "+userEmail+" [User Not Found]");    
            return res.status(400).send({ message: 'Usuário não encontrado' });
        }
        // obtem salt do usuario, para verificar se a hash da senha salva e igual ao hash da senha passada
        const salt = user.rows[0].salt
        // calcula o hash da senha passada + salt salvo
        const encrytedPassword = crypto.createHash('sha256').update(userPassword + salt).digest('hex');
        // se os hashs nao sao iguais, envia resposta de erro
        if (user.rows[0].password != encrytedPassword) {
            logger.warning("Login Request: "+userEmail+" [Wrong Password]");    
            return res.status(400).send({ message: 'Senha invalida' });
        
        }
        // envia os dados do usuario com o login
        logger.info("Login Request: "+userEmail);
        return res.status(200).send({ userToken: generateToken({ id: user.rows[0].id }), userID: user.rows[0].id, userName: user.rows[0].name });
    } catch (err) {
        console.error(err)
    }
});


app.listen(process.env.PORT || port, () => {
    logger.debug('Listening at Port '+port);
    logger.debug("Server Online");
});

