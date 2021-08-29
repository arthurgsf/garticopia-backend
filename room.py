from itertools import count

class Room:
	"""
	Sala Abertas da Aplicacao
	"""

	# id generator para cada instancia
	_ids = count(0)

	def __init__(self, name, category):
		self.id = next(self._ids)
		self.name = name
		self.category = category
		self.players = []