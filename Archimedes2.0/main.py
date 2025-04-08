import argparse
import time
import logging
import os
from dotenv import load_dotenv, dotenv_values

import utils
from db import connect_merlindb
import results
import fs

# Importa Firebase Admin SDK per Firestore
from firebase_admin import credentials, firestore, initialize_app
import firebase_admin
from pydantic import BaseModel, Field

class Main(BaseModel):
    directory: str = Field(default=os.getcwd(), description="Main directory of the project")
    env_file_path: str = Field(default_factory=lambda: os.path.join(os.getcwd(), ".env"),
                                 description="Path to the .env file")
    # Specifica il percorso corretto del file last_id.txt
    last_id_path: str = Field(default_factory=lambda: os.path.join(os.getcwd(), "last_id.txt"),
                              description="Path to the last_id.txt file")
    config: dict = Field(default_factory=lambda: dotenv_values(os.path.join(os.getcwd(), ".env")),
                          description="Configuration values from the .env file")
    
    def run(self):
        logging.info("=== Inizio run() ===")
        
        # Ricarica il file .env ad ogni iterazione
        self.config = dotenv_values(self.env_file_path)
        logging.debug("Configurazione letta dal file {}: {}".format(self.env_file_path, self.config))
        
        # Log del contenuto grezzo del file .env per verificare la formattazione
        try:
            with open(self.env_file_path, "r") as f:
                env_file_content = f.read()
            logging.debug("Contenuto del file .env:\n{}".format(env_file_content))
        except Exception as e:
            logging.error("Errore nella lettura del file .env: {}".format(e))
        
        # Log della variabile DATABASE_TYPE
        db_type = self.config.get("DATABASE_TYPE")
        logging.info("DATABASE_TYPE letto: {}".format(db_type))
        
        if db_type is None:
            logging.error("DATABASE_TYPE non è definito nel file .env!")
        
        logging.info("=== Inizio connessione al database ===")
        try:
            # Qui viene passato il percorso corretto del file last_id.txt
            raw_data_companies, raw_data_telemetry = connect_merlindb(self.config, self.last_id_path)
            logging.info("Connessione al database riuscita")
            logging.debug("Records companies: {}".format(len(raw_data_companies) if raw_data_companies is not None else 0))
            logging.debug("Records telemetry: {}".format(len(raw_data_telemetry) if raw_data_telemetry is not None else 0))
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
                target_dir = os.path.join(self.directory, results_folder)
                utils.create_dir(target_dir)
                utils.write_results(df_capacity, os.path.join(results_folder, "capacity_data.csv"))
                utils.write_results(df_systems, os.path.join(results_folder, "systems_data.csv"))
                logging.info("Tabelle salvate in: {}".format(target_dir))
            except Exception as e:
                logging.error("Errore nel salvataggio delle tabelle: {}".format(e))
        
        logging.info("=== Inizializzazione Firebase Admin SDK ===")
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
        
        logging.info("=== Aggiornamento Firestore ===")
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
            env_value = self.config.get("ENVIRONMENT")
            logging.info("ENVIRONMENT: {}".format(env_value))
            match env_value:
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
