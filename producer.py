# publish.py
import pika
import os

url = 'amqps://qyjjuarn:umOghA8igjcidH9vHmQdKJeFx-CNhd5K@chimpanzee.rmq.cloudamqp.com/qyjjuarn'

params = pika.URLParameters(url)
connection = pika.BlockingConnection(params)
channel = connection.channel()  # start a channel
channel.queue_declare(queue='hello')  # Declare a queue
channel.basic_publish(exchange='',
                      routing_key='hello',
                      body='World!')

print(" [x] Sent 'Hello World!'")
connection.close()
