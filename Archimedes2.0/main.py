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

class Main(BaseModel):
    directory: str = Field(default=os.getcwd(), description="Main directory of the project")
    env_file_path: str = Field(default_factory=lambda: os.path.join(os.getcwd(), ".env"),
                                 description="Path to the .env file")
    last_id_path: str = Field(default_factory=lambda: os.path.join(os.getcwd(), "last_id.txt"),
                              description="Path to the last_id.txt file")
    config: dict = Field(default_factory=lambda: dotenv_values(os.path.join(os.getcwd(), ".env")),
                          description="Configuration values from the .env file")
    
    def run(self):
        self.config = dotenv_values(self.env_file_path)
        try:
            raw_data_companies, raw_data_telemetry = connect_merlindb(self.config, self.last_id_path)
            print(f"Loaded {len(raw_data_companies) if raw_data_companies is not None else 0} company records")
            print(f"Loaded {len(raw_data_telemetry) if raw_data_telemetry is not None else 0} telemetry records")
        except Exception as e:
            logging.error(f"Error connecting to the database: {e}")
            raise e
        
        try:
            df_capacity = results.capacity_trends_table(raw_data_telemetry)
            df_systems = results.systems_data_table(raw_data_companies, raw_data_telemetry)
            print("Tables processed successfully")
        except Exception as e:
            logging.error(f"Error processing tables: {e}")
            raise e
        
        if self.config.get("SAVE_TABLES") == 'True':
            try:
                results_folder = self.config.get("RESULTS_FOLDER")
                target_dir = os.path.join(self.directory, results_folder)
                utils.create_dir(target_dir)
                utils.write_results(df_capacity, os.path.join(results_folder, "capacity_data.csv"))
                utils.write_results(df_systems, os.path.join(results_folder, "systems_data.csv"))
                print(f"Tables saved in: {target_dir}")
            except Exception as e:
                logging.error(f"Error saving tables: {e}")
        
        try:
            cred_path = os.environ.get("FIRESTORE_CREDENTIALS_PATH")
            if not (cred_path and os.path.exists(cred_path)):
                cred_path = os.path.join(self.directory, "credentials.json")
                if not os.path.exists(cred_path):
                    cred_path = os.path.join(self.directory, "secrets", "credentials.json")
            if not os.path.exists(cred_path):
                raise FileNotFoundError("credentials.json file not found.")
            if not firebase_admin._apps:
                initialize_app(credentials.Certificate(cred_path))
                print("Firebase Admin SDK initialized")
            db = firestore.client()
        except Exception as e:
            logging.error(f"Error initializing Firebase Admin SDK: {e}")
            raise e
        
        try:
            for idx, row in df_systems.iterrows():
                doc_id = f"{row['hostid']}_{row['pool']}"
                doc_data = row.to_dict()
                db.collection("system_data").document(doc_id).set(doc_data, merge=True)
            print("Firestore update completed")
        except Exception as e:
            logging.error(f"Error updating Firestore: {e}")
            raise e
        
        try:
            env_value = self.config.get("ENVIRONMENT")
            if env_value in ["DEV", "PROD"]:
                fs.run_archimedesDB(self.directory, "requirements.json")
            else:
                fs.run_archimedesDB(self.directory)
            print("fs.run_archimedesDB executed")
        except Exception as e:
            logging.error(f"Error executing fs.run_archimedesDB: {e}")
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
    
    print("Starting main.py")
    main_instance = Main()
    for i in range(1, args.cycles + 1):
        print(f"Cycle {i} start")
        try:
            main_instance.run()
        except Exception as e:
            logging.error(f"Error during cycle {i}: {e}")
        if i < args.cycles:
            time.sleep(20)
    print("Finished main.py")
