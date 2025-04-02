import os
import pandas as pd
#import fireducks.pandas as pd
from pydantic import BaseModel, Field
from pprint import pprint
from typing import List, Union

from . import db, utils


class Pool(BaseModel):
    host_id: str = Field(..., description="Assigned host ID")
    pool_id: str = Field(..., description="Unique id for the Pool")
    pool_name: str = Field(..., description="Name assigned to the Pool")
    pool_dataframe: pd.DataFrame = Field(..., description="Raw data from the telemetry")

    def __str__(self):
        return f"Pool ID: {self.poolid}, Pool Name: {self.poolname}"    
    
    # Needs to be tested
    def _filter_dataframe(
        dataframe: pd.DataFrame, 
        columns_list: List[str], 
        values_list: Union[int, float, str, List[Union[int, float, str]]]
        ) -> pd.DataFrame:
        """
        Filters a DataFrame based on a column and a value or list of values.

        Args:
            dataframe (pd.DataFrame): The DataFrame to filter.
            columns_list (List[str]): The column(s) to filter on.
            values_list (Union[int, float, str, List[Union[int, float, str]]]): The value(s) to filter by.

        Returns:
            pd.DataFrame: The filtered DataFrame.
        """
        if not isinstance(values_list, list):
            values_list = [values_list]  # Convert single value to a list
        
        # Apply the filter for each column and value combination
        for column_name in columns_list:
            filtered_df = dataframe[dataframe[column_name].isin(values_list)]
        
        return filtered_df
    
    # Needs to be tested and moved to another file
    def get_pools(self) -> pd.DataFrame:
        return self.raw_dataframe[["hostid", "pool"]].drop_duplicates()

    def space_analysis(self):
        pass

    def state_vector_analysis(self):
        pass

    def capacity_prediction(self):
        pass


class Dataset(Pool):
    dataset_name: str = Field(..., description="Name assigned to the Dataset")

    def __str__(self):
        return f"Dataset Name: {self.dataset_name} from Pool ID: {self.pool_id}"
    
    def _filter_dataframe(dataframe, columns_list, values_list):
        return super()._filter_dataframe(columns_list, values_list)
    
    def space_analysis(self):
        return super().space_analysis()
    
    def state_vector_analysis(self):
        return super().state_vector_analysis()
    

    

