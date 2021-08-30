const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const { Pool } = require('pg');

const app = express();
const port = 3333

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const pool = new Pool({
    user: 'zulvtfakhqhkof',
    host: 'ec2-44-197-40-76.compute-1.amazonaws.com',
    database: 'degfb5n0uhscf9',
    password: '5504013551534559e218e526643e5368920fed660d599543421444190363997b',
    port: 5432
});

pool.query('SELECT NOW()', (err, res) => {
    console.log(err, res)
    // pool.end()
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
        if (await pool.query(`SELECT * FROM user WHERE email=${email}`))
            return res.status(400).send({ error: 'Usuário já cadastrado' })

        const user = await client.query('INSERT INTO user(data) VALUES($1)', [{ name: name, email: email, password: password }])
        return res.status(200).send(`Usuário cadastrado com Sucesso + ${user}`)
    } catch (err) {
        console.log(err);
        return res.status(400).send({ error: 'Falha ao registrar usuário' })
    }
});

app.post('/auth', async (req, res) => {//autentica um usuario
    const { email, password } = req.body;

    const user = await pool.query(`SELECT * FROM user WHERE email=${email}`)

    if (!user)
        return res.status(400).send({ error: 'Usuário não encontrado' })

    if (user.senha != password)
        return res.status(400).send({ error: 'Senha invalida' })

    user.senha = undefined;

    res.send({
        token: generateToken({ id: user.id }),
    })
});

app.use(cors());
app.use(express.json());

app.listen(port, () => (
    console.log('listening at port', port)
));