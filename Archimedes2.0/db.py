import mysql.connector
import oracledb as oci
import os
import pandas as pd
from pydantic import BaseModel, Field
import psycopg2
from dotenv import dotenv_values
from scipy.constants import gibi
from typing import Optional, Any
import logging
import pymysql

import utils

class MerlinDB(BaseModel):
    environment: str = Field(..., description="Configuration values from the .env file")
    db_type: str = Field(..., description="Type of database to connect to")
    db_host: str = Field(None, description="Host address for the database")
    db_port: int = Field(None, description="Port number for the database")
    db_user: str = Field(None, description="Username for the database")
    db_password: str = Field(None, description="Password for the database")
    db_name: str = Field(None, description="Name of the database")
    debug_active: bool = Field(False, description="Debug mode active")

    def setup_connection(self, config: dict):
        """Establishes a connection to the specified database."""
        match self.db_type:
            case "oci":
                self.db_host = config.get("OCI_HOST")
                self.db_port = config.get("OCI_PORT")
                self.db_user = config.get("OCI_USER")
                self.db_password = config.get("OCI_PASSWORD")
                self.db_name = config.get("OCI_DB_NAME")
                return self.connect_to_OCI()
            case "alloydb":
                return self._connection_AlloyDB()
            case "mysql":
                self.db_host = config.get("MYSQL_HOST")
                self.db_port = config.get("MYSQL_PORT")
                self.db_user = config.get("MYSQL_USER")
                self.db_password = config.get("MYSQL_PASSWORD")
                self.db_name = config.get("MYSQL_DB_NAME")
                return self.connect_MySQL()
            case _:
                logging.error("Database type not supported")
                raise ValueError("Fatal error: Database connection not defined")
    
    def connect_MySQL(self):
        """Connects to MySQL database using PyMySQL."""
        try:
            db_conn = pymysql.connect(
                host=self.db_host,
                port=int(self.db_port),
                user=self.db_user,
                password=self.db_password,
                database=self.db_name
            )
            return db_conn
        except Exception as e:
            logging.error(f"Error connecting to MySQL database: {e}")
            return None

    def connect_to_OCI(self):
        """Connects to Oracle database using oracledb."""
        try:
            dsn = oci.makedsn(
                host=self.db_host,
                port=self.db_port,
                service_name=self.db_name
            )

            db_conn = oci.connect(
                user=self.db_user,
                password=self.db_password,
                dsn=dsn
            )

            return db_conn
        except Exception as e:
            logging.error(f"Error connecting to Oracle database: {e}")
            return None
    
    def connect_to_AlloyDB(self):
        """ Connects to AlloyDB database."""
        pass

    def get_companies_data(self, db_conn: oci.Connection):
        """ Retrieves all necessary data joining client id from Merlin database."""
        cursor = db_conn.cursor()
        try:
            cursor.execute(
                "SELECT u.name AS company, s.hostid, s.hostname, s.version, "
                "s.insertdate AS first_date, s.last_stats_date AS last_date "
                "FROM merlin.users AS u "
                "JOIN merlin.storageapp AS s "
                "ON u.registration_number COLLATE utf8mb4_0900_ai_ci = s.client_ide COLLATE utf8mb4_0900_ai_ci "
                "ORDER BY u.name "
                "LIMIT 1000;"
            )
            rows = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]
            df_companies_data = pd.DataFrame(rows, columns=columns)
            logging.info(f"Data retrieved successfully: {len(df_companies_data)} records in total")
            if self.debug_active:
                utils.create_dir("data")
                utils.empty_dir("data")
                file_path = "data/companies_data.csv"
                utils.write_results(df_companies_data, file_path, "csv")
            cursor.close()
            return df_companies_data
        except Exception as e:
            logging.error(f"Error retrieving users data: {e}")
            return None
        
    def update_telemetry(self, db_conn: oci.Connection, last_id: str):
        """
        Retrieves telemetry data using a dynamic LIMIT.
        It first queries the maximum id from the telemetry table,
        computes the difference (new_last_id - last_id) and uses it as LIMIT.
        Returns a tuple: (DataFrame, new_last_id)
        """
        cursor = db_conn.cursor()
        
        # Recupera l'ultimo id presente nella tabella
        cursor.execute("SELECT MAX(id) FROM telemetry.stats_metrics")
        max_id_result = cursor.fetchone()
        new_last_id = max_id_result[0] if max_id_result and max_id_result[0] is not None else int(last_id)
        
        limit_value = new_last_id - int(last_id)
        if limit_value <= 0:
            return pd.DataFrame(), new_last_id

        query = (
            f"SELECT hostid, name AS pool, editdate, ref_time, avail, used, usedsnap AS snap, ratio "
            f"FROM telemetry.stats_metrics "
            f"WHERE id > {last_id} LIMIT {limit_value};"
        )
        try:
            cursor.execute(query)
            rows = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]
            df_telemetry_data = pd.DataFrame(rows, columns=columns)
            df_telemetry_data.to_csv("data/telemetry_data.csv")
            logging.info(f"Data retrieved successfully: {len(df_telemetry_data)} records in total")
            cursor.close()
            return df_telemetry_data, new_last_id
        except Exception as e:
            logging.error(f"Error retrieving telemetry data: {e}")
            return None, new_last_id
        
    def _set_environment_options(self):
        """ Sets the environment options for the database connection."""
        match self.environment:
            case "dev":
                self.debug_active = True
            case "prod":
                self.debug_active = False
            case _:
                self.environment = "dev"
                logging.warning("Environment not defined. Defaulting to dev")
                self.debug_active = True


def create_connection(config: dict, last_id_path: str) -> (MerlinDB, Any, str):
    """ Defines the connection to Merlin database using LAST_ID from the file. """
    db_type = config.get("DATABASE_TYPE").lower()
    environment = config.get("ENVIRONMENT").lower()
    # Legge il valore di LAST_ID dal file
    last_id = utils.read_last_id(last_id_path)
    match db_type:
        case "oci" | "alloydb" | "mysql":
            merlin_db = MerlinDB(environment=environment, db_type=db_type)
            db_conn = merlin_db.setup_connection(config)
            merlin_db._set_environment_options()
            return merlin_db, db_conn, last_id
        case _:
            logging.error("Database type not supported")
            raise ValueError("Fatal error: Database connection not defined")


def connect_merlindb(config: dict, last_id_path: str = "last_id.txt"):
    db_conn = None
    companies_df, telemetry_df = None, None
    try: 
        merlin_db, db_conn, last_id = create_connection(config, last_id_path)
        companies_df = merlin_db.get_companies_data(db_conn)
        telemetry_df, new_last_id = merlin_db.update_telemetry(db_conn, last_id)
        utils.update_last_id(new_last_id, last_id_path)
    except Exception as e:
        logging.error(f"Error connecting to Merlin database: {e}")
    finally:
        if db_conn:
            db_conn.close()
        return companies_df, telemetry_df

# FUNCTION FOR TESTS
def debug_oci_connection(conn: oci.Connection):
    try:
        if conn:
            return conn.cursor()
    except oci.DatabaseError as e:
        logging.error(f"Connection failed: {e}")
    return False

def debug_alloydb_connection(conn: psycopg2.extensions.connection):
    try:
        if conn and conn.status == psycopg2.extensions.STATUS_READY:
            return conn.cursor()
    except psycopg2.OperationalError as e:
        logging.error(f"Connection failed: {e}")
    return False
