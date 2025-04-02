import os
import shutil
import pandas as pd
# import fireducks.pandas as pd
from pydantic import BaseModel, Field
from pprint import pprint
from icecream import ic
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from scipy.constants import giga, gibi, tera
from typing import Union, Literal, List, Callable
from datetime import datetime, timedelta
import xlsxwriter as xw
from dotenv import load_dotenv, set_key
import logging

DECIMAL_PRECISION = 2
TIMEFRAME_HOURS = 4

#### General use decorators and functions
def format_decimal_places(precision: int = DECIMAL_PRECISION):
    """ Decorator to set the number of decimal places for int or float"""
    def deco(func):
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)
            if isinstance(result, (int, float)):  # Check that the value is actually a number 
                return round(result, precision)
            return result
        return wrapper
    return deco

def convert_to_percentage(func: Callable) -> Callable:
    """ Decorator to convert a number to a percentage"""
    def wrapper(*args, **kwargs):
        result = func(*args, **kwargs)
        if isinstance(result, (int, float)):  # Check that the value is actually a number
            return round(result * 100)
        return result
    return wrapper

def convert_to_string(func: Callable) -> Callable:
    def wrapper(*args, **kwargs):
        result = func(*args, **kwargs)
        if isinstance(result, (int, float)):  # Check that the value is actually a number
            return str(result)
        return result
    return wrapper

def set_decimal_precision(raw: Union[int, float], precision: int = DECIMAL_PRECISION):
    return round(raw, precision)

@format_decimal_places()
def set_to_percentage(raw: float) -> float:
    return raw * 100

@format_decimal_places()
def byte_to_giga(byte_raw: int):
    return byte_raw / giga

@format_decimal_places()
def byte_to_gibi(byte_raw: int):
    return byte_raw / gibi

@format_decimal_places()
def byte_to_tera(byte_raw: int):
    return byte_raw / tera

def numpy_to_python(record):
    """
    Converts values from a numpy array to the appropriate Python data types.
    """
    for key, value in record.items():
        if isinstance(value, np.integer):
            record[key] = int(value)
        elif isinstance(value, np.floating):
            record[key] = float(value)
        elif isinstance(value, np.datetime64):
            record[key] = pd.to_datetime(value).strftime("%Y-%m-%d %H:%M:%S")
    return record

def datetime_to_string(datetime_obj: datetime, allow_colon: bool = True) ->  str:
    if not allow_colon:
        return datetime_obj.strftime("%Y-%m-%d_%H-%M-%S")
    return datetime_obj.strftime("%Y-%m-%d_%H:%M:%S")

def string_to_bool(value: str) -> bool:
    value = value.strip().lower()
    true_values = {"true", "1", "yes", "y", "t"}
    false_values = {"false", "0", "no", "n", "f"}

    try: 
        if value in true_values:
            return True
        elif value in false_values:
            return False
    except ValueError:
        raise ValueError("Invalid boolean value")

@format_decimal_places(3)    
def format_sec_min(seconds: Union[int, float]) -> float:
    """
    Converts seconds to a float in the format "min.sec".
    Example:
        10.4 seconds → 0.104 (0 minutes and 10.4 seconds)
        70.5 seconds → 1.105 (1 minute and 10.5 seconds)
    """
    try:
        minutes = int(seconds // 60)
        remaining_seconds = seconds % 60
        return minutes + (remaining_seconds / 100)
    except (ValueError, TypeError):
        return 0.0

#### File and directory functions
def create_dir(dir_path: str):
    if not os.path.exists(dir_path):
        os.makedirs(dir_path)

def delete_dir(dir_path: str):
    if os.path.exists(dir_path):
        shutil.rmtree(dir_path)

def empty_dir(dir_path: str):
    if os.path.exists(dir_path):
        for f in os.listdir(dir_path):
            os.remove(os.path.join(dir_path, f))

### Function for environment variables
def change_last_id(new_last_id, env_path: str) -> int:
    """
    Updates the LAST_ID value in the .env file with new_last_id.
    """
    load_dotenv(env_path)
    current_value = os.getenv("LAST_ID")
    new_value = str(new_last_id)
    set_key(env_path, "LAST_ID", new_value)
    logging.info(f"Updated LAST_ID from {current_value} to {new_value} in .env file")
    return new_last_id

#### Logging functions
def activate_logger(config_values: dict, directory_path: str):
    """
    Activate logging for the application.
    Configurations are pulled from the .env file.
    By default, logs are printed to the terminal and saved to a .log file.
    """
    # Clear any existing handlers
    logging.getLogger().handlers.clear()

    # Read configurations from .env file and configure logging level
    logging_level = config_values.get("LOGGING_LEVEL", "INFO").upper()
    level = getattr(logging, logging_level, logging.INFO)  # Default to INFO if invalid level is provided

    # Set up the basic configuration for logging
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(levelname)s - %(message)s",
        handlers=[]
    )

    # Add a StreamHandler to log to the terminal
    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(level)
    stream_handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logging.getLogger().addHandler(stream_handler)

    save_logs = string_to_bool(config_values.get("SAVE_LOGS", "False"))

    # Check if logs should be saved to a file
    if save_logs:
        log_file_path = create_logs(config_values, directory_path)  # Create the log file and directory
        # Add a FileHandler to log to the file
        file_handler = logging.FileHandler(log_file_path)
        file_handler.setLevel(level)
        file_handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
        # Log a message to confirm file logging is enabled

    # Log a message to confirm the logger is activated

def create_logs(config: dict, directory: str) -> str:
    """
    Create a directory to store logs and set up the log file.
    The directory name is "archimedes-analyzer-{timestamp}".
    """
    # Create the directory if it doesn't exist
    log_dir = config.get("LOG_DIR", "logs")
    log_dir_path = os.path.join(directory, log_dir)
    create_dir(log_dir_path)

    # Generate timestamp for the directory name
    timestamp = datetime_to_string(datetime.now(), False)
    log_file_name = f"archimedes-analyzer-{timestamp}.log"
    log_file_path = os.path.join(log_dir_path, log_file_name)

    # Create the log file (empty file)
    with open(log_file_path, "w") as f:
        pass  # Just create the file

    return log_file_path

#### Analysis results functions (for local analysis)
def graph_canvas(x_label: str, y_label: str, title: str, show_legend: bool, show_grid: bool):
    std_style = "whitegrid"
    sns.set_style(std_style)
    
    plt.xlabel(x_label)
    plt.ylabel(y_label)
    plt.title(title)

    if show_legend:
        plt.legend()

    if show_grid:
        plt.grid(True)

    plt.tick_params(
        axis='both',
        which='both',
        direction='out',
        length=6,
        width=2,
        colors='blue',
        labelsize=12,
        bottom=True,
        left=True,
        grid_color='grey',
        grid_alpha=0.5
    )
    plt.xticks(rotation=45)
    plt.tight_layout()

def save_graph(dir_path: str, format: Literal["png", "jpg", "svg", "pdf"] = "png"):
    file_path = os.path.join(dir_path, f"graph.{format}")
    plt.savefig(file_path, format=format)
    pass

def write_results(results, file_path: str, save_format: Literal["csv", "json", "excel", "parquet"] = "csv"):
    results_type = type(results)
    match save_format:
        case 'csv':
            if results_type == pd.DataFrame:
                results.to_csv(file_path, index=False)
        case 'json':
            if results_type == pd.DataFrame:
                results.to_json(file_path)
        case 'excel':
            pass
        case 'parquet':
            pass
