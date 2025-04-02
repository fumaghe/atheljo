import os
from dotenv import dotenv_values

base_dir = os.path.dirname(os.path.abspath(__file__))
config = dotenv_values(os.path.join(base_dir, ".env"))
print(config)
