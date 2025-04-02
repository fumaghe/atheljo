import datetime
import logfire as lf
import pandas as pd
#import fireducks.pandas as pd
from pydantic import BaseModel, Field
from typing import List, Dict

from pool import *


class Hostid(BaseModel):
    name: str = Field(..., description="Name of the host")
    pools: List[Pool] = Field(..., description="List of pools associated with the host")


class AireUnit(BaseModel):
    unitid: str = Field(..., description="Unique identifier for the Aire unit")
    hostids: List[Hostid] = Field(..., description="List of host IDs associated with the Aire unit")
    pools: List[Pool] = Field(..., description="List of pools associated with the Aire unit")
    


