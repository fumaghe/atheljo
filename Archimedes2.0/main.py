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
        logging.info("=== Inizio run() ===")
        
        # Ricarica il file .env ad ogni iterazione
        self.config = dotenv_values(self.env_file_path)
        logging.debug("Configurazione caricata da {}: {}".format(self.env_file_path, self.config))
        
        # Log del DATABASE_TYPE
        db_type = self.config.get("DATABASE_TYPE")
        logging.info("DATABASE_TYPE letto: {}".format(db_type))
        
        # Se il DATABASE_TYPE è MySQL, forziamo MYSQL_DB_NAME a essere una stringa (anche se vuota)
        if db_type == "MySQL":
            original_db_name = self.config.get("MYSQL_DB_NAME")
            self.config["MYSQL_DB_NAME"] = original_db_name or "default_mysql_db"
            logging.info("MYSQL_DB_NAME: '{}' (originalmente '{}')".format(self.config["MYSQL_DB_NAME"], original_db_name))
        else:
            # Per Mongo, se MONGO_URI non è definito, impostiamo un dummy value
            if not self.config.get("MONGO_URI"):
                self.config["MONGO_URI"] = "mongodb://localhost:27017/dummydb"
                logging.info("MONGO_URI non definito, impostato dummy value: {}".format(self.config["MONGO_URI"]))
        
        logging.info("=== Inizio connessione al database ===")
        try:
            raw_data_companies, raw_data_telemetry = connect_merlindb(self.config, self.env_file_path)
            logging.info("Connessione al database riuscita")
            logging.debug("Dati companies: {} records".format(len(raw_data_companies) if raw_data_companies else 0))
            logging.debug("Dati telemetry: {} records".format(len(raw_data_telemetry) if raw_data_telemetry else 0))
        except Exception as e:
            logging.error("Errore durante la connessione al database: {}".format(e))
            raise e
        
        logging.info("=== Inizio elaborazione tabelle ===")
        try:
            df_capacity = results.capacity_trends_table(raw_data_telemetry)
            df_systems = results.systems_data_table(raw_data_companies, raw_data_telemetry)
            logging.info("Tabelle elaborate correttamente")
            logging.debug("Dimensione df_capacity: {}".format(df_capacity.shape))
            logging.debug("Dimensione df_systems: {}".format(df_systems.shape))
        except Exception as e:
            logging.error("Errore durante l'elaborazione delle tabelle: {}".format(e))
            raise e
        
        if self.config.get("SAVE_TABLES") == 'True':
            logging.info("Salvataggio delle tabelle abilitato")
            try:
                results_folder = self.config.get("RESULTS_FOLDER")
                dir_path = os.path.join(self.directory, results_folder)
                utils.create_dir(dir_path)
                utils.write_results(df_capacity, os.path.join(results_folder, "capacity_data.csv"))
                utils.write_results(df_systems, os.path.join(results_folder, "systems_data.csv"))
                logging.info("Tabelle salvate in {}".format(dir_path))
            except Exception as e:
                logging.error("Errore nel salvataggio delle tabelle: {}".format(e))
        
        logging.info("=== Inizializzazione di Firebase Admin SDK ===")
        try:
            if not firebase_admin._apps:
                cred_path = os.path.join(self.directory, "credentials.json")
                logging.info("Caricamento credenziali da: {}".format(cred_path))
                cred = credentials.Certificate(cred_path)
                initialize_app(cred)
                logging.info("Firebase Admin SDK inizializzato")
            db = firestore.client()
        except Exception as e:
            logging.error("Errore nell'inizializzazione di Firebase Admin SDK: {}".format(e))
            raise e
        
        logging.info("=== Aggiornamento dati su Firestore ===")
        try:
            for idx, row in df_systems.iterrows():
                doc_id = f"{row['hostid']}_{row['pool']}"
                doc_data = row.to_dict()
                db.collection("system_data").document(doc_id).set(doc_data, merge=True)
            logging.info("Aggiornamento di Firestore completato")
        except Exception as e:
            logging.error("Errore durante l'aggiornamento di Firestore: {}".format(e))
            raise e
        
        logging.info("=== Esecuzione fs.run_archimedesDB ===")
        try:
            environment = self.config.get("ENVIRONMENT")
            logging.info("ENVIRONMENT: {}".format(environment))
            match environment:
                case "DEV":
                    fs.run_archimedesDB(self.directory, "AVALON.json")
                case "PROD":
                    fs.run_archimedesDB(self.directory, "AVALON.json")
                case _:
                    fs.run_archimedesDB(self.directory)
            logging.info("fs.run_archimedesDB eseguito")
        except Exception as e:
            logging.error("Errore durante l'esecuzione di fs.run_archimedesDB: {}".format(e))
            raise e
        
        logging.info("=== Fine run() ===")
        
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run main cycles")
    parser.add_argument("--cycles", type=int, default=1, help="Numero di cicli da eseguire")
    args = parser.parse_args()
    
    # Carica il file .env e attiva il logger
    env_path = os.path.join(os.getcwd(), ".env")
    if not load_dotenv(env_path):
        raise Exception("Fatal Error: .env file not found")
    config = dotenv_values(env_path)
    utils.activate_logger(config, os.getcwd())
    
    logging.info("=== Avvio del programma main.py ===")
    main_instance = Main()
    for i in range(1, args.cycles + 1):
        logging.info("=== Inizio ciclo {} ===".format(i))
        try:
            main_instance.run()
        except Exception as e:
            logging.error("Error during iteration {}: {}".format(i, e))
        if i < args.cycles:
            logging.info("Attesa di 20 secondi prima del prossimo ciclo")
            time.sleep(20)
    logging.info("=== Fine del programma main.py ===")
