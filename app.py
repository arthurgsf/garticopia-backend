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

def hash_data(data: str):
	""" Encrypt a data
	"""
	hash_ = hashlib.sha256()
	hash_.update(data.encode())
	return hash_.hexdigest()

class Server:
	"""
	Gartic Server
	"""

	# url do servidor (usar localhost em caso de falha)
	url = os.environ.get('CLOUDAMQP_URL', 'amqp://guest:guest@localhost:5672')
	# credenciais do banco de dados
	credentials = {
		"host": "ec2-44-197-40-76.compute-1.amazonaws.com",
		"dbname": "degfb5n0uhscf9",
		"user": "zulvtfakhqhkof",
		"port": 5432,
		"password": "5504013551534559e218e526643e5368920fed660d599543421444190363997b"
	}

	def __init__(self, *args, **kwargs):
		logging.info("Starting Server.")
		
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
		show_room_queue = self.channel.queue_declare("", exclusive=True)

		# bind filas para o topico de acordo com cada chave de roteamento
		self.channel.queue_bind(exchange='user', queue=login_queue.method.queue, routing_key="login")
		self.channel.queue_bind(exchange='user', queue=signup_queue.method.queue, routing_key="signup")
		self.channel.queue_bind(exchange='user', queue=create_room_queue.method.queue, routing_key="createRoom")
		self.channel.queue_bind(exchange='user', queue=enter_room_queue.method.queue, routing_key="enterRoom")
		self.channel.queue_bind(exchange='user', queue=enter_room_queue.method.queue, routing_key="exitRoom")
		self.channel.queue_bind(exchange='user', queue=enter_room_queue.method.queue, routing_key="showRooms")
		
		# bind cada chave de roteamento para o method
		self.channel.basic_consume(queue=login_queue.method.queue, on_message_callback=self.login, auto_ack=False)
		self.channel.basic_consume(queue=signup_queue.method.queue, on_message_callback=self.signup, auto_ack=False)
		self.channel.basic_consume(queue=create_room_queue.method.queue, on_message_callback=self.create_room, auto_ack=False)
		self.channel.basic_consume(queue=enter_room_queue.method.queue, on_message_callback=self.enter_room, auto_ack=False)
		self.channel.basic_consume(queue=exit_room_queue.method.queue, on_message_callback=self.enter_room, auto_ack=False)
		self.channel.basic_consume(queue=show_room_queue.method.queue, on_message_callback=self.enter_room, auto_ack=False)

	#============================= Consume Methods =============================#

	def login(self, channel, method, properties, body):
		""" Processa uma mensagem de login.
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
			# sql para inserir novo usuario
			sql = "SELECT id FROM users WHERE email=%s AND password=%s;"
			# obtem cursor e executa sql
			cursor = self.db_connection.cursor()
			cursor.execute(sql, (data["userEmail"], data["userPassword"]))
			# get result

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

	def signup(self, channel, method, properties, body):
		""" Processa uma mensagem de login.
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
		print("[CREATE ROOM] message:")
		print(body)

	def enter_room(self, channel, method, properties, body):
		print("[MAKE ROOM] message:")
		print(body)


if __name__ == "__main__":
	# set logging format
	logging.basicConfig(format='[ %(levelname)s ] ( %(asctime)s ) - %(message)s', level=logging.DEBUG)
	# create and start server
	server = Server()
	server.run()



