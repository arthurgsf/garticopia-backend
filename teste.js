function generate_draw() {

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
    return words['Verbos'][getRandomInt(0, words['Verbos'].length)];
}

generate_draw()