import argparse
import time
import logging
import os
from dotenv import load_dotenv, dotenv_values

import utils
from db import connect_merlindb
import results
import fs

from firebase_admin import credentials, firestore, initialize_app
import firebase_admin
from pydantic import BaseModel, Field
import pandas as pd

class Main(BaseModel):
    directory: str = Field(default=os.getcwd(), description="Main directory of the project")
    env_file_path: str = Field(default_factory=lambda: os.path.join(os.getcwd(), ".env"),
                                 description="Path to the .env file")
    last_id_path: str = Field(default_factory=lambda: os.path.join(os.getcwd(), "last_id.txt"),
                              description="Path to the last_id.txt file")
    config: dict = Field(default_factory=lambda: dotenv_values(os.path.join(os.getcwd(), ".env")),
                          description="Configuration values from the .env file")
    
    def run(self):
        # Load configuration from the .env file
        self.config = dotenv_values(self.env_file_path)
        
        try:
            with open(self.env_file_path, "r") as f:
                env_file_content = f.read()
        except Exception as e:
            logging.error("Error reading .env file: {}".format(e))
        
        db_type = self.config.get("DATABASE_TYPE")
        logging.info("Read DATABASE_TYPE: {}".format(db_type))
        
        if db_type is None:
            logging.error("DATABASE_TYPE is not defined in the .env file!")
        
        try:
            # Connect to the Merlin database and retrieve the raw data
            raw_data_companies, raw_data_telemetry = connect_merlindb(self.config, self.last_id_path)
            logging.info("Database connection succeeded")
        except Exception as e:
            logging.error("Error during database connection: {}".format(e))
            raise e
        
        try:
            # Process data to generate capacity trends and systems data tables
            df_capacity = results.capacity_trends_table(raw_data_telemetry)
            df_systems = results.systems_data_table(raw_data_companies, raw_data_telemetry)
            logging.info("Tables processed successfully")
        except Exception as e:
            logging.error("Error during tables processing: {}".format(e))
            raise e
        
        if self.config.get("SAVE_TABLES") == 'True':
            try:
                results_folder = self.config.get("RESULTS_FOLDER")
                target_dir = os.path.join(self.directory, results_folder)
                utils.create_dir(target_dir)
                utils.write_results(df_capacity, os.path.join(results_folder, "capacity_data.csv"))
                utils.write_results(df_systems, os.path.join(results_folder, "systems_data.csv"))
                logging.info("Tables saved in: {}".format(target_dir))
            except Exception as e:
                logging.error("Error saving tables: {}".format(e))
        
        try:
            # Determine the credentials file path for Firestore
            cred_path = os.environ.get("FIRESTORE_CREDENTIALS_PATH")
            if cred_path and os.path.exists(cred_path):
                logging.info("Using FIRESTORE_CREDENTIALS_PATH from environment: {}".format(cred_path))
            else:
                cred_path = os.path.join(self.directory, "credentials.json")
                if not os.path.exists(cred_path):
                    cred_path = os.path.join(self.directory, "secrets", "credentials.json")
            if not os.path.exists(cred_path):
                raise FileNotFoundError(f"File credentials.json not found. "
                                        f"Check if FIRESTORE_CREDENTIALS_PATH is set or if the file is present in {os.path.join(self.directory, 'secrets')}")
            cred = credentials.Certificate(cred_path)
            if not firebase_admin._apps:
                initialize_app(cred)
            db = firestore.client()
        except Exception as e:
            logging.error("Error in Firebase Admin SDK: {}".format(e))
            raise e
        
        try:
            # Update Firestore documents for system data
            for idx, row in df_systems.iterrows():
                # Build the document ID based on hostid and pool.
                # If "pool" is missing (NaN), use only hostid.
                if pd.isna(row['pool']):
                    doc_id = f"{row['hostid']}"
                else:
                    doc_id = f"{row['hostid']}_{row['pool']}"
                
                # Prepare the complete document data from the DataFrame row
                full_doc_data = row.to_dict()
                
                # Get a reference to the Firestore document
                doc_ref = db.collection("system_data").document(doc_id)
                current_doc = doc_ref.get()
                
                if current_doc.exists:
                    # If the document already exists, update only the "sending_telemetry" field
                    update_data = {"sending_telemetry": full_doc_data.get("sending_telemetry")}
                    doc_ref.set(update_data, merge=True)
                else:
                    # If the document does not exist, create it with the full data
                    doc_ref.set(full_doc_data)
            logging.info("Firestore update completed")
        except Exception as e:
            logging.error("Error updating Firestore: {}".format(e))
            raise e
        
        try:
            # Execute additional Firestore operations using ArchimedesDB
            env_value = self.config.get("ENVIRONMENT")
            match env_value:
                case "DEV":
                    fs.run_archimedesDB(self.directory, "requirements.json")
                case "PROD":
                    fs.run_archimedesDB(self.directory, "requirements.json")
                case _:
                    fs.run_archimedesDB(self.directory)
        except Exception as e:
            logging.error("Error in fs.run_archimedesDB: {}".format(e))
            raise e
        
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run main cycles")
    parser.add_argument("--cycles", type=int, default=1, help="Number of cycles to execute")
    args = parser.parse_args()
    
    env_path = os.path.join(os.getcwd(), ".env")
    if not load_dotenv(env_path):
        raise Exception("Fatal Error: .env file not found")
    config = dotenv_values(env_path)
    utils.activate_logger(config, os.getcwd())
    
    logging.info("=== Start of main.py ===")
    main_instance = Main()
    for i in range(1, args.cycles + 1):
        try:
            main_instance.run()
        except Exception as e:
            logging.error("Error during iteration {}: {}".format(i, e))
        if i < args.cycles:
            time.sleep(20)
    logging.info("=== End of program main.py ===")
