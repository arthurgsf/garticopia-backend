const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const { Pool } = require('node-postgres');

const app = express();
const port = 3333


const pool = new Pool({
    user: 'zulvtfakhqhkof',
    host: 'ec2-44-197-40-76.compute-1.amazonaws.com',
    database: 'degfb5n0uhscf9',
    password: '5504013551534559e218e526643e5368920fed660d599543421444190363997b',
    port: 5432
});

function generateToken(params = {}) {
    return jwt.sign(params, authConfig.secret, {
        expiresIn: 86400 //1 dia
    })
}

app.get('/', async function (req, res) {
    res.send('api do garticopia')
});

app.post('/register', async (req, res) => {//registra um usuario
    try {
        const { name, email, password } = req.body;
        if (await pool.query())
            return res.status(400).send({ error: 'Usuário já cadastrado' })

        //cadastro de usuário
        return res.send('Usuário Cadastrado')
    } catch (err) {
        console.log(err);
        return res.status(400).send({ error: 'Falha ao registrar usuário' })
    }
});

app.post('/auth', async (req, res) => {//autentica um usuario
    const { email, password } = req.body;

    const user = await pool.query()

    if (!user)
        return res.status(400).send({ error: 'Usuário não encontrado' })

    if (!await bcrypt.compare(senha, user.senha))
        return res.status(400).send({ error: 'Senha invalida' })

    user.senha = undefined;

    res.send({
        user,
        token: generateToken({ id: user.id }),
    })
});

app.use(cors());
app.use(express.json());

app.listen(port, () => (
    console.log('listening at port', port)
));