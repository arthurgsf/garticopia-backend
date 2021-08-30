import paho.mqtt.client as mqtt
from ably import AblyRest


# The callback for when the client receives a CONNACK response from the server.
def on_connect(client, userdata, flags, rc):
    print("Connected with result code "+str(rc))

    # Subscribing in on_connect() means that if we lose the connection and
    # reconnect then subscriptions will be renewed.
    client.subscribe("$SYS/#")

# The callback for when a PUBLISH message is received from the server.
def on_message(client, userdata, msg):
    print(msg.topic+" "+str(msg.payload))

def main():
	client = mqtt.Client("b75WYw-2326523") 
	client.username_pw_set("b75WYw.b2hCtw", "4uGJ5tWUuXuEokN2")
	client.on_connect = on_connect
	client.on_message = on_message

	client.connect("mqtts:mqtt.ably.io", 8883, 30)

	# Blocking call that processes network traffic, dispatches callbacks and
	# handles reconnecting.
	# Other loop*() functions are available that give a threaded interface and a
	# manual interface.
	client.loop_forever()

def test():
	client = AblyRest("b75WYw.b2hCtw:4uGJ5tWUuXuEokN2")
	channel = client.channels.get('channel_name')
	channel.publish('event', 'message')


if __name__ == "__main__":
	#test()
	main()
