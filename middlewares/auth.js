const jwt = require('jsonwebtoken');
const { logger } = require('../logger');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        logger.warning("Request without Token received");
        return res.status(401).send({ error: 'Token não informado' })
    }

    const parts = authHeader.split(' ');
    if (!parts.length === 2)
        return res.status(401).send({ error: 'Erro no Token' })
    
    const [scheme, token] = parts;

    if(!/^Bearer$/i.test(scheme)) {
        logger.warning("Request with Bad Formatted Token");
        return res.status(401).send({ error: 'Token mal formatado' });
    }

    jwt.verify(token, 'garticopia-backend', (err, decoded) => {
        if (err) {
            logger.warning("Request with Invalid Token");
            return res.status(401).send({ error: 'Token invalido' });
        }
        
        req.userId = decoded.id;
        return next();
    });
};