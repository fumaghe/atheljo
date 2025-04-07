import argparse
import time
import logging
from pydantic import BaseModel, Field
import os
from dotenv import load_dotenv, dotenv_values

import utils
from db import connect_merlindb
import results
import fs

# Importa Firebase Admin SDK per Firestore
from firebase_admin import credentials, firestore, initialize_app
import firebase_admin

class Main(BaseModel):
    directory: str = Field(default=os.getcwd(), description="Main directory of the project")
    env_file_path: str = Field(default_factory=lambda: os.path.join(os.getcwd(), ".env"),
                                 description="Path to the .env file")
    config: dict = Field(default_factory=lambda: dotenv_values(os.path.join(os.getcwd(), ".env")),
                          description="Configuration values from the .env file")
    
    def run(self):
        """Main function to run the project."""
        # Ricarica il file .env ad ogni iterazione
        self.config = dotenv_values(self.env_file_path)
        
        # Gestione in base al tipo di database
        if self.config.get("DATABASE_TYPE") == "MySQL":
            # Se il DATABASE_TYPE è MySQL, assicuriamoci che MYSQL_DB_NAME sia definito
            if not self.config.get("MYSQL_DB_NAME"):
                logging.error("MYSQL_DB_NAME is not defined in the .env file for MySQL connection.")
                raise Exception("MYSQL_DB_NAME not defined")
        else:
            # Per Mongo, se MONGO_URI non è definito, impostiamo un dummy value
            if not self.config.get("MONGO_URI"):
                logging.warning("MONGO_URI is not defined in the .env file. Using default dummy value for Merlin DB connection.")
                self.config["MONGO_URI"] = "mongodb://localhost:27017/dummydb"
        
        logging.info("Connecting to database")
        try:
            raw_data_companies, raw_data_telemetry = connect_merlindb(self.config, self.env_file_path)
        except Exception as e:
            logging.error(f"Error connecting to Merlin database: {e}")
            raise e
        
        df_capacity = results.capacity_trends_table(raw_data_telemetry)
        df_systems = results.systems_data_table(raw_data_companies, raw_data_telemetry)

        if self.config.get("SAVE_TABLES") == 'True':
            logging.info("Saving tables")
            utils.create_dir(os.path.join(self.directory, self.config.get("RESULTS_FOLDER")))
            utils.write_results(df_capacity, os.path.join(self.config.get("RESULTS_FOLDER"), "capacity_data.csv"))
            utils.write_results(df_systems, os.path.join(self.config.get("RESULTS_FOLDER"), "systems_data.csv"))
        
        # Inizializza Firebase Admin SDK se non già avviato
        if not firebase_admin._apps:
            cred_path = os.path.join(self.directory, "credentials.json")
            cred = credentials.Certificate(cred_path)
            initialize_app(cred)
        db = firestore.client()

        for idx, row in df_systems.iterrows():
            doc_id = f"{row['hostid']}_{row['pool']}"
            doc_data = row.to_dict()
            db.collection("system_data").document(doc_id).set(doc_data, merge=True)
        
        # Uso di match-case per gestire l'ambiente (richiede Python 3.10+)
        match self.config.get("ENVIRONMENT"):
            case "DEV":
                fs.run_archimedesDB(self.directory, "AVALON.json")
            case "PROD":
                fs.run_archimedesDB(self.directory, "AVALON.json")
            case _:
                fs.run_archimedesDB(self.directory)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run main cycles")
    parser.add_argument("--cycles", type=int, default=1, help="Numero di cicli da eseguire")
    args = parser.parse_args()
    
    if not load_dotenv(os.path.join(os.getcwd(), ".env")):
        raise Exception("Fatal Error: .env file not found")
    
    utils.activate_logger(dotenv_values(os.path.join(os.getcwd(), ".env")), os.getcwd())
    
    main_instance = Main()
    for i in range(1, args.cycles + 1):
        try:
            main_instance.run()
        except Exception as e:
            logging.error(f"Error during iteration {i}: {e}")
        if i < args.cycles:
            time.sleep(20)
