# logging module
import logging
# import RabbitMQ module and change its logging level
import pika
#logging.getLogger("pika").setLevel(logging.WARNING)
logging.getLogger("pika").propagate = False

#postgree module 
import psycopg2
# system module
import os
# messages json module
import json
# hash module
import hashlib
# unique id module
import uuid

# import own modules
from room import Room

def hash_data(data: str)->str:
	""" hash a string data.

	Aplica um hash na data string passada utilizando
	o algoritimo sha256, retornando um string com
	o hash em hexadecimal.

	Args:
		data (str): Data a ser hash.

	Returns:
		str: hash da data em hexadecimal.

	"""
	hash_ = hashlib.sha256()
	hash_.update(data.encode())
	return hash_.hexdigest()

class Server:
	"""Gartic Server.

	Servidor do Gartic Responsavel por se comunicar com o bando de dados para cadastrar
	e fazer o login dos usuarios; Gerenciar as Salas abertas; Executar o ciclo de vida
	das partidas das salas abertas. O Servidor trata as mensagens de requisicao dos
	clientes, e se comunica com os clientes atraves de mensagens JSON para gerenciar
	o ciclo de vida de uma partida.

	Attributes:
		url (str): url do broker do RabbitMQ.
		credentials (dict): Credenciais do banco de dados.
		mq_connection (:obj:): conexao com o broker do RabbitMQ.
		db_connection (:obj:): conexao com o Banco de Dados.
		channel (:obj:): canal de conexao com o RabbitMQ.
		rooms (list[:obj:]): vetor de Salas abertas
	"""

	# url do servidor (usar localhost em caso de falha)
	url = os.environ.get('CLOUDAMQP_URL', 'amqp://guest:guest@localhost:5672')
	# credenciais do banco de dados
	credentials = {
		"host": "",
		"dbname": "",
		"user": "",
		"port": 0,
		"password": ""
	}

	def __init__(self, *args, **kwargs):
		logging.info("Starting Server.")
		self.rooms = []
		
		# cria conexao com o banco de dados 
		logging.info("Connecting to DataBase.")
		self.db_connection = psycopg2.connect(**self.credentials)

		# cria conexao e canal ao RabbitMQ
		logging.info("Connecting to RabbitMQ Broker.")
		self.mq_connection = pika.BlockingConnection(pika.URLParameters(self.url))
		
		logging.debug("Initialing Communiction Settings.")
		self.channel = self.mq_connection.channel()

		# inicia topicos
		self.init_user_topic()

	def __del__(self):
		# fecha connexao com rabbit mq
		logging.info("Closing RabbitMQ Connection")
		self.mq_connection.close()
		logging.info("Closing Database Connection")
		self.db_connection.close()

	def run(self):
		""" Inicia o Servidor
		"""
		logging.info("Server Online")
		self.channel.start_consuming()
		
	#============================= Init Methods =============================#

	def init_user_topic(self):
		# cria exchangep pro topic usuario
		self.channel.exchange_declare(exchange='user', exchange_type='topic')
		# create a queue for each routing key in the topic
		login_queue = self.channel.queue_declare("", exclusive=True)
		signup_queue = self.channel.queue_declare("", exclusive=True)
		create_room_queue = self.channel.queue_declare("", exclusive=True)
		enter_room_queue = self.channel.queue_declare("", exclusive=True)
		exit_room_queue = self.channel.queue_declare("", exclusive=True)
		get_room_queue = self.channel.queue_declare("", exclusive=True)

		# bind filas para o topico de acordo com cada chave de roteamento
		self.channel.queue_bind(exchange='user', queue=login_queue.method.queue, routing_key="login")
		self.channel.queue_bind(exchange='user', queue=signup_queue.method.queue, routing_key="signup")
		self.channel.queue_bind(exchange='user', queue=create_room_queue.method.queue, routing_key="createRoom")
		self.channel.queue_bind(exchange='user', queue=enter_room_queue.method.queue, routing_key="enterRoom")
		self.channel.queue_bind(exchange='user', queue=exit_room_queue.method.queue, routing_key="exitRoom")
		self.channel.queue_bind(exchange='user', queue=get_room_queue.method.queue, routing_key="getRooms")
		
		# bind cada chave de roteamento para o method
		self.channel.basic_consume(queue=login_queue.method.queue, on_message_callback=self.login, auto_ack=False)
		self.channel.basic_consume(queue=signup_queue.method.queue, on_message_callback=self.signup, auto_ack=False)
		self.channel.basic_consume(queue=create_room_queue.method.queue, on_message_callback=self.create_room, auto_ack=False)
		self.channel.basic_consume(queue=enter_room_queue.method.queue, on_message_callback=self.enter_room, auto_ack=False)
		self.channel.basic_consume(queue=exit_room_queue.method.queue, on_message_callback=self.enter_room, auto_ack=False)
		self.channel.basic_consume(queue=get_room_queue.method.queue, on_message_callback=self.get_room, auto_ack=False)

	#============================= Consume Methods =============================#

	def login(self, channel, method, properties, body):
		"""Login Method.

		Callback method chamado quando uma mensagem e recebida na fila
		do topico 'user' com chave de roteamento 'login'. Recebe um json
		equiavelente ao LoginRequest.json com os dados do login. Retorna
		um json equivalente ao LoginResponse.json com os dados da resposta.
		Em caso de falha, retorna um json equivalente a GeneralResponse.json
		com os dados da falha. A falha pode acontecer caso a mensagem 
		passada nao for um JSON; ou nao for equivalente a LoginRequest.json;
		ou o email nao estiver cadastrado no banco de dados; ou a senha e/ou
		email nao sao validos.

		Args:
			channel: pika.Channel.
			method: pika.Method.
			properties: pika.BasicProperties.
			body: byte

		"""

		# try to parse the message
		try:
			data = json.loads(body)
		except Exception as err:
			# envia uma mensagem de erro
			message = json.dumps({"request": "login", "success": False, "motive": str(err)}) 
			channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
			channel.basic_ack(delivery_tag=method.delivery_tag)
			# log erro
			logging.warning("Login Operation Error on Parse: " + str(err))
			return

		# verifica se a mensagem possui os campos corretos
		if ("userEmail" not in data.keys()) or ("userPassword" not in data.keys()):
			# envia mensagem com campos errados
			message = json.dumps({"request": "login", "success": False, "motive": "Fields Missing on the Request"}) 
			channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
			channel.basic_ack(delivery_tag=method.delivery_tag)
			# log erro
			logging.warning("Login Operation Error on Parse: Invalid Fields")
			return
		
		# valida signup
		try:
			# sql para inserir novo usuario
			sql = "SELECT id, name, password, salt FROM users WHERE users.email=%s;"
			# obtem cursor e executa sql
			cursor = self.db_connection.cursor()
			cursor.execute(sql, (data["userEmail"],))
			
			# fetch o resultado (deve ser somente um pois cada email e unico, e n tem como ter varios resultados no select)
			result = cursor.fetchone()

			# se n tiver achado o email passado, avisa o cliente
			if result is None:
				# envia mensagem de senha invalida
				message = json.dumps({"request": "login", "success": False, "motive": "Invalid Email"}) 
				channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
				channel.basic_ack(delivery_tag=method.delivery_tag)
				# log erro
				logging.warning("Login Operation: Invalid Email")
				return
			
			# obtem dados do resultado obtido do banco de dados
			id_token, name, password, salt = result
			# valida a senha
			if hash_data(data["userPassword"]+salt) != password:
				# envia mensagem de senha invalida
				message = json.dumps({"request": "login", "success": False, "motive": "Invalid Password or Email Combination"}) 
				channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
				channel.basic_ack(delivery_tag=method.delivery_tag)
				# log erro
				logging.warning("Login Operation: Invalid Password or Email Combination")
				return
			# commit os valores inseridos e fecha o cursor
			self.db_connection.commit()
			cursor.close()
		except Exception as err:
			# envia uma mensagem de erro
			message = json.dumps({"request": "login", "success": False, "motive": str(err)}) 
			channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
			channel.basic_ack(delivery_tag=method.delivery_tag)
			# log erro
			logging.error("Login Operation Error on SQL Operation: "+str(err))
			return

		# envia resposta
		message = json.dumps({"userToken": id_token, "userName": name}) 
		channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
		channel.basic_ack(delivery_tag=method.delivery_tag)
		# log sign up
		logging.debug(" Login Operation: {userEmail: "+str(data["userEmail"])+", userPassword: "+'*'*len(data["userPassword"])+"}")
		return	

	def signup(self, channel, method, properties, body):
		""" SignUp Method.
		
		Callback method chamado quando uma mensagem e recebida na fila
		do topico 'user' com chave de roteamento 'signup'. Recebe um json
		equiavelente ao SignUpRequest.json com os dados do login. Retorna
		um json equivalente ao GeneralResponse.json notificando o sucesso.
		Em caso de falha, retorna um json equivalente a GeneralResponse.json
		com os dados da falha. A falha pode acontecer caso a mensagem 
		passada nao for um JSON; ou nao for equivalente a SignUpRequest.json;
		ou o email ja esta cadastrado no banco de dados;

		Args:
			channel: pika.Channel.
			method: pika.Method.
			properties: pika.BasicProperties.
			body: byte

		"""

		# try to parse the message
		try:
			data = json.loads(body)
		except Exception as err:
			# envia uma mensagem de erro
			message = json.dumps({"request": "signup", "success": False, "motive": str(err)}) 
			channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
			channel.basic_ack(delivery_tag=method.delivery_tag)
			# log erro
			logging.warning("SignUp Operation Error on Parse: " + str(err))
			return

		# verifica se a mensagem possui os campos corretos
		if ("userEmail" not in data.keys()) or ("userPassword" not in data.keys()) or ("userName" not in data.keys()):
			# envia mensagem com campos errados
			message = json.dumps({"request": "signup", "success": False, "motive": "Fields Missing on the Request"}) 
			channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
			channel.basic_ack(delivery_tag=method.delivery_tag)
			# log erro
			logging.warning("SignUp Operation Error on Parse: Invalid Fields")
			return
		
		# valida signup
		try:
			# encrypt the password
			salt = uuid.uuid4().hex
			hash_password = hash_data(data["userPassword"]+salt)
			# sql para inserir novo usuario
			sql = "INSERT INTO users(name, email, password, salt) VALUES (%s, %s, %s, %s);"
			# obtem cursor e executa sql
			cursor = self.db_connection.cursor()
			cursor.execute(sql, (data["userName"], data["userEmail"], hash_password, salt))
			# commit os valores inseridos e fecha o cursor
			self.db_connection.commit()
			cursor.close()
		except Exception as err:
			# envia uma mensagem de erro
			message = json.dumps({"request": "signup", "success": False, "motive": str(err)}) 
			channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
			channel.basic_ack(delivery_tag=method.delivery_tag)
			# log erro
			logging.warning("SignUp Operation Error on SQL Operation: "+str(err))
			return

		# envia resposta
		message = json.dumps({"request": "signup", "success": True}) 
		channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
		channel.basic_ack(delivery_tag=method.delivery_tag)
		# log sign up
		logging.debug(" SignUp Operation: {userName: "+str(data["userName"])+", userEmail: "+str(data["userEmail"])+", userPassword: "+'*'*len(data["userPassword"])+"}")
		return	

	def create_room(self, channel, method, properties, body):
		"""Criar Sala Method.

		Callback method chamado quando uma mensagem e recebida na fila
		do topico 'user' com chave de roteamento 'createRoom'. Recebe um json
		equiavelente ao CreateRoomRequest.json com os dados do login. Retorna
		um json equivalente ao CreateRoomResponse.json com os dados da resposta.
		Em caso de falha, retorna um json equivalente a GeneralResponse.json
		com os dados da falha. A falha pode acontecer caso a mensagem 
		passada nao for um JSON; ou nao for equivalente a CreateRoomRequest.json;
		ou o token de autenticacao do usuario for invalido

		Args:
			channel (pika.Channel): Canal de Comunicacao.
			method (pika.Method): method utilizado.
			properties (pika.BasicProperties): propriedades da mensagem.
			body (byte): bytes do json da mensagem 
		"""

		# try to parse the message
		try:
			data = json.loads(body)
		except Exception as err:
			# envia uma mensagem de erro
			message = json.dumps({"request": "createRoom", "success": False, "motive": str(err)}) 
			channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
			channel.basic_ack(delivery_tag=method.delivery_tag)
			# log erro
			logging.warning("Create Room Operation Error on Parse: " + str(err))
			return

		# verifica se a mensagem possui os campos corretos
		if ("roomName" not in data.keys()) or ("roomCategory" not in data.keys()) or ("userToken" not in data.keys()):
			# envia mensagem com campos errados 
			message = json.dumps({"request": "login", "success": False, "motive": "Fields Missing on the Request"}) 
			channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
			channel.basic_ack(delivery_tag=method.delivery_tag)
			# log erro
			logging.warning("Login Operation Error on Parse: Invalid Fields")
			return

		# valida nome

		# valida categoria

		# valida token
		if data["userToken"] < 0:
			# envia mensagem com campos errados 
			message = json.dumps({"request": "login", "success": False, "motive": "Invalid Authentication Token"}) 
			channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
			channel.basic_ack(delivery_tag=method.delivery_tag)
			# log erro
			logging.warning("Login Operation Error on Parse: Invalid Authentication Token")
			return

		# Cria Sala e adiciona na lista de Salas
		new_room = Room(data["roomName"], data["roomCategory"])
		self.rooms.append(new_room)

		# envia resposta
		message = json.dumps({"roomID": new_room.id}) 
		channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
		channel.basic_ack(delivery_tag=method.delivery_tag)
		# log sign up
		logging.debug("Create Room  Operation: {roomName: "+str(data["roomName"])+", roomCategory: "+str(data["roomCategory"])+", roomID: "+str(new_room.id)+"}")
		return	

	def get_room(self, channel, method, properties, body):
		"""Criar Sala Method.

		Callback method chamado quando uma mensagem e recebida na fila
		do topico 'user' com chave de roteamento 'getRooms'. Recebe um json
		equiavelente ao GetRoomsRequest.json com os dados do login. Retorna
		um json equivalente ao GetRoomsResponse.json com os dados da resposta.
		Em caso de falha, retorna um json equivalente a GeneralResponse.json
		com os dados da falha. A falha pode acontecer caso a mensagem 
		passada nao for um JSON; ou nao for equivalente a GetRoomsRequest.json;
		ou o token de validacao do usuario for invalido.

		Args:
			channel (pika.Channel): Canal de Comunicacao.
			method (pika.Method): method utilizado.
			properties (pika.BasicProperties): propriedades da mensagem.
			body (byte): bytes do json da mensagem 
		"""

		# try to parse the message
		try:
			data = json.loads(body)
		except Exception as err:
			# envia uma mensagem de erro
			message = json.dumps({"request": "createRoom", "success": False, "motive": str(err)}) 
			channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
			channel.basic_ack(delivery_tag=method.delivery_tag)
			# log erro
			logging.warning("Create Room Operation Error on Parse: " + str(err))
			return

		# verifica se a mensagem possui os campos corretos
		if ("userToken" not in data.keys()):
			# envia mensagem com campos errados 
			message = json.dumps({"request": "login", "success": False, "motive": "Fields Missing on the Request"}) 
			channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
			channel.basic_ack(delivery_tag=method.delivery_tag)
			# log erro
			logging.warning("Login Operation Error on Parse: Invalid Fields")
			return
			
		# valida token
		if data["userToken"] < 0:
			# envia mensagem com campos errados 
			message = json.dumps({"request": "login", "success": False, "motive": "Invalid Authentication Token"}) 
			channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
			channel.basic_ack(delivery_tag=method.delivery_tag)
			# log erro
			logging.warning("Login Operation Error on Parse: Invalid Authentication Token")
			return

		# obtem salas abertas
		rooms = [{"roomID": room.id, "roomName": room.name, "roomPlayers": len(room.players)} for room in self.rooms if len(room.players) < 10]

		# envia resposta
		message = json.dumps({"rooms": rooms}) 
		channel.basic_publish(exchange="", routing_key=properties.reply_to, body=message, properties=pika.BasicProperties(correlation_id=properties.correlation_id)) 
		channel.basic_ack(delivery_tag=method.delivery_tag)

		# log get room
		logging.debug("Get Room Operation: ["+",".join([str(room["roomID"]) for room in rooms])+"]")
		return	


	def enter_room(self, channel, method, properties, body):
		print("[MAKE ROOM] message:")
		print(body)


if __name__ == "__main__":
	# set logging format
	logging.basicConfig(format='[ %(levelname)s ] ( %(asctime)s ) - %(message)s', level=logging.DEBUG)
	# create and start server
	server = Server()
	server.run()



