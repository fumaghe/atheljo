import os
import pandas as pd
#import fireducks.pandas as pd
#import polars as pl
import matplotlib.pyplot as plt
import seaborn as sns
from bisect import bisect_left
import mplfinance as mpf
from datetime import datetime, timedelta
import logfire as lf
from pydantic import BaseModel, Field, validator
from typing import List, Optional


class StateVector(BaseModel):
    """Initialize the StateVector class.

    Args:
        df (pd.DataFrame): The input DataFrame.
        hostid (str): The host ID to filter the data.
        pool (str): The pool to filter the data."""

    hostid: str = Field(..., description="The host ID to filter the data.")
    pool: str = Field(..., description="Pool to filter the data.")
    timeframes_days: List[float] = Field([0.5, 1, 3, 7], description="Timeframes to analyze.") # Add more timeframes for more results
    
    results: dict = Field(default_factory=dict, description="Results of the analysis.")
    sv_data: Optional[pd.DataFrame] = Field(default=None, description="State Vector data.")
    #self.lazyframe = (lf.filter(
    #    (pl.col("hostid") == self.hostid) & (pl.col("pool") == self.pool))
    #    .sort("timestamp")
    #    .select(["timestamp", "used_tb", "total"]))

    @validator("raw_dataframe")
    def validate_raw_dataframe(cls, df):
        """Validate the raw_dataframe."""

        required_columns = ["timestamp", "used_tb", "total"]

        if not isinstance(df, pd.DataFrame):
            raise ValueError("raw_dataframe must be a DataFrame.")
        
        if not all(col in df.columns for col in required_columns):
            raise ValueError(f"raw_dataframe does not contain necessary columns")
        
        if not pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
            raise ValueError("timestamp column must be of datetime type.")
        return df.sort_values("timestamp")[required_columns] 

    def __init__(self, df: pd.DataFrame, hostid: str, pool: str, **kwargs):
        """Initialize the StateVector class."""

        filtered_df = df[(df.hostid == hostid) & (df.pool == pool)]
        super().__init__(hostid=hostid, pool=pool, raw_dataframe=filtered_df, **kwargs)
        self.results.update({"Host ID": self.hostid, "Pool": self.pool})

    def _add_timeframes(self):
        for timeframe in self.timeframes_days:
            self.results[f"{timeframe*24}h"] = None

    def _get_bar_color(self, increments):
        """Helper function to assign colors based on increment values."""
        colors = []
        for value in increments:
            if value > 0:
                colors.append("green")  # Positive increment (growth)
            elif value < 0:
                colors.append("red")    # Negative increment (decrease)
            else:
                colors.append("blue")  # No change (stable)
        return colors


    def find_timestamps(self):
        """Find the last and start timestamps based on the timeframe."""
        try:
            #max_timestamp = self.lazyframe.select(pl.col("timestamp").max().alias("max_timestamp")).collect()[0, "max_timestamp"]
            max_timestamp = self.dataframe["timestamp"].max()
            limit_timestamp = max_timestamp - timedelta(days=self.timeframes_days[3])

            #left_closest_timestamp = (
            #    self.lazyframe
            #    .filter(pl.col("timestamp") < limit_timestamp)
            #    .select(pl.col("timestamp").max().alias("left_closest"))
            #    .collect()
            #)[0, "left_closest"]

            timestamps_series = self.dataframe["timestamp"].tolist()
            index = bisect_left(timestamps_series, limit_timestamp)

            left_closest_timestamp = timestamps_series[index]
            # this part is implemented to make sure the timestamp is not greater than the max timestamp
            if left_closest_timestamp > max_timestamp:
                index -= 1
                left_closest_timestamp = timestamps_series[index]

            self.results["Last Timestamp"] = max_timestamp
            self.results["Start Timestamp"] = left_closest_timestamp

        except Exception as e:
            lf.log.error(f"Error finding timestamps: {e}")


    def get_sv_values(self):
        """Retrieve state vector values."""
        try:
            #used_start = self.lazyframe.filter(pl.col("timestamp") == self.results["Last Timestamp"]).collect()[0, "used_tb"]
            #used_end = self.lazyframe.filter(pl.col("timestamp") == self.results["Start Timestamp"]).collect()[0, "used_tb"]
            #latest_max_space = self.lazyframe.filter(pl.col("timestamp") == self.results["Last Timestamp"]).collect()[0, "total"]

            used_start = self.dataframe[self.dataframe["timestamp"] == self.results["Start Timestamp"]]["used_tb"].values[0]
            used_end = self.dataframe[self.dataframe["timestamp"] == self.results["Last Timestamp"]]["used_tb"].values[0]
            latest_max_space = self.dataframe[self.dataframe["timestamp"] == self.results["Last Timestamp"]]["total"].values[0]

            global_state = (used_end - used_start) / latest_max_space

            self.results["Start Used Space"] = used_start
            self.results["Last Used Space"] = used_end
            self.results["Latest Max Space"] = latest_max_space
            self.results["Global State"] = global_state

        except Exception as e:
            lf.log.error(f"Error retrieving state vector values: {e}")


    def get_sv_data(self):
        """Retrieve state vector data."""
        try:
            #lf = self.lazyframe.filter(
            #    pl.col("timestamp").is_between(self.results["Start Timestamp"], self.results["Last Timestamp"])
            #    ).select("timestamp", "used_tb", "total") \
            #    .with_columns(
            #        (pl.col("used_tb") - pl.col("used_tb").shift(1)).alias("used_tb_diff")) \
            #    .with_columns(
            #        (pl.col("used_tb_diff") / pl.col("total")).alias("increment"))
            #self.sv_data = lf.collect().to_pandas()
            self.sv_data = self.dataframe[(self.dataframe["timestamp"] >= self.results["Start Timestamp"]) &
                                        (self.dataframe["timestamp"] <= self.results["Last Timestamp"])]

        except Exception as e:
            lf.log.error(f"Error in retrieving state vector data: {e}")


    def state_vector_analysis(self):
        """Perform state vector analysis."""
        try:
            state_vector_stats = {
                "writed": 0,
                "deleted": 0,
                "readed": 0
            }

            for value in self.sv_data["increment"]:
                if value > 0:
                    state_vector_stats["writed"] += 1
                elif value < 0:
                    state_vector_stats["deleted"] += 1
                else:
                    state_vector_stats["readed"] += 1

            self.results["Total Space"] = state_vector_stats["writed"] + state_vector_stats["deleted"] + state_vector_stats["readed"]

            self.results["Percentage Written"] = round(state_vector_stats["writed"] / self.results["Total Space"] * 100, 2)
            self.results["Percentage Deleted"] = round(state_vector_stats["deleted"] / self.results["Total Space"] * 100, 2)
            self.results["Percentage Read"] = round(state_vector_stats["readed"] / self.results["Total Space"] * 100, 2)

        except Exception as e:
            logger.error(f"Error in state vector analysis: {e}")


    def plot_usage_analysis(self, colors=None, labels=None, title=None):
        """Creates a donut graph with the results of the state vector analysis.

        Args:
            colors (list, optional): List of colors for the pie chart. Defaults to ["green", "red", "yellow"].
            labels (list, optional): List of labels for the pie chart. Defaults to ['Writed', 'Deleted', 'Readed'].
            title (str, optional): Title of the plot. Defaults to None.
        """
        if colors is None:
            colors = ["green", "red", "yellow"]
        if labels is None:
            labels = ['Writed', 'Deleted', 'Readed']
        if title is None:
            title = f"Usage Distribution of the last {int(self.timeframes_days[3]*24)} hours"

        writed_perc = self.results.get('Percentage Written', 0)
        deleted_perc = self.results.get('Percentage Deleted', 0)
        readed_perc = self.results.get('Percentage Read', 0)

        sizes = [writed_perc, deleted_perc, readed_perc]

        fig, ax = plt.subplots()
        ax.pie(sizes, labels=labels, colors=colors, wedgeprops=dict(width=0.3))

        ax.set_aspect('equal')

        plt.title(title)
        plt.legend(loc="upper right")
        plt.tight_layout()

        plt.show()
        

    def state_vector_lineplot(self):
        """Plot the state vector data over time with colored areas for increments, decrements, and stability."""
        if self.sv_data is not None:
            plt.figure(figsize=(12, 6))

            # Extract data
            timestamps = self.sv_data["timestamp"]
            increments = self.sv_data["increment"]

            # Plot the line
            plt.plot(timestamps, increments, label="Increment", color="black", linewidth=1)

            # Fill areas based on increment values
            for i in range(len(timestamps) - 1):
                x = [timestamps.iloc[i], timestamps.iloc[i + 1]]
                y = [increments.iloc[i], increments.iloc[i + 1]]

                if y[1] > y[0]:  # Growing (green)
                    plt.fill_between(x, y, color="green", alpha=0.3, label="Growth" if i == 0 else "")
                elif y[1] < y[0]:  # Decreasing (red)
                    plt.fill_between(x, y, color="red", alpha=0.3, label="Decrease" if i == 0 else "")
                else:  # Stable (blue)
                    plt.fill_between(x, y, color="blue", alpha=0.3, label="Stable" if i == 0 else "")

            # Add labels, title, and legend
            plt.xlabel("Timestamp")
            plt.ylabel("Increment (Normalized Change)")
            plt.title("State Vector Increments Over Time")
            plt.legend(loc="upper left")
            plt.grid(True, linestyle="--", alpha=0.7)
            plt.tight_layout()
            plt.show()
        else:
            logger.warning("No state vector data available to plot.")
            
    # NEED TO FIX
    def _state_vector_variationplot(self):
        """Plot the variation of the state vector data over time as a vertical bar plot."""
        if self.sv_data is not None:
            plt.figure(figsize=(12, 6))

            # Extract data
            timestamps = self.sv_data["timestamp"]
            increments = self.sv_data["used_tb_diff"]

            # Create the bar plot
            bars = plt.bar(timestamps, increments, label="Variation", color=self._get_bar_color(increments))

            # Add labels, title, and legend
            plt.xlabel("Timestamp")
            plt.ylabel("Variation")
            plt.title("State Vector Increments Over Time")
            plt.legend()
            plt.grid(True, linestyle="--", alpha=0.7)
            plt.tight_layout()
            plt.show()
        else:
            logger.warning("No state vector data available to plot.")
    

    def state_vector_candlestick(self):
        """Plot a candlestick chart for state vector data."""
        if self.sv_data is not None:
            # Prepare OHLC data
            ohlc_data = self._prepare_ohlc_data()

            # Plot the candlestick chart
            mpf.plot(ohlc_data, type='candle', style='charles', title='State Vector Candlestick Chart', ylabel='Space (TB)')
        else:
            logger.warning("No state vector data available to plot.")

    def _prepare_ohlc_data(self):
        """Helper function to prepare OHLC data from state vector data."""
        # Group data by time intervals (e.g., daily) and calculate OHLC
        ohlc_data = self.sv_data.resample('D', on='timestamp').agg({
            'used_tb': ['first', 'max', 'min', 'last'],  # Open, High, Low, Close
            'increment': 'sum'  # Optional: Add increment as volume
        })

        # Flatten the multi-index columns
        ohlc_data.columns = ['Open', 'High', 'Low', 'Close', 'Volume']

        # Drop rows with missing values
        ohlc_data.dropna(inplace=True)

        return ohlc_data
