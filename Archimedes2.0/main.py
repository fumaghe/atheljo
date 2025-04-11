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

        # ------------------------------------------------------------------------------
        # Nuovo blocco: aggiornamento della collection capacity_history
        # Salviamo per ogni record della capacity trends solo se il campo "pool" NON contiene '/'
        try:
            for idx, row in df_capacity.iterrows():
                if pd.isna(row['pool']) or ('/' not in row['pool']):
                    # Costruiamo un document ID utilizzando hostid, pool e date (con formattazione dei separatori)
                    formatted_date = row['date'].replace(" ", "_").replace(":", "-")
                    doc_id = f"{row['hostid']}_{row['pool']}_{formatted_date}"
                    # Salviamo nella collection capacity_history i campi hostid, pool e date
                    db.collection("capacity_history").document(doc_id).set({
                        "hostid": row['hostid'],
                        "pool": row['pool'],
                        "date": row['date']
                    })
            logging.info("Firestore capacity_history update completed")
        except Exception as e:
            logging.error("Error updating capacity_history: {}".format(e))
        # ------------------------------------------------------------------------------

        # ------------------------------------------------------------------------------
        # Nuovo blocco: eliminazione dei documenti in capacity_history più vecchi di 2 ore
        # Utilizziamo la tecnica di prendere per ogni gruppo (hostid, pool) il documento più recente e calcolare il cutoff = max_date - 2 ore.
        try:
            # Scarichiamo tutti i documenti dalla collection capacity_history
            capacity_docs = list(db.collection("capacity_history").stream())
            # Raggruppiamo per (hostid, pool)
            groups = {}
            for doc in capacity_docs:
                data = doc.to_dict()
                hostid = data.get("hostid")
                pool = data.get("pool")
                key = (hostid, pool)
                # Convertiamo la data; assumiamo formato '%Y-%m-%d %H:%M:%S'
                try:
                    doc_date = pd.to_datetime(data.get("date"), format='%Y-%m-%d %H:%M:%S')
                except Exception as ex:
                    logging.error(f"Error parsing date for capacity_history document {doc.id}: {ex}")
                    continue
                if key not in groups:
                    groups[key] = []
                groups[key].append((doc, doc_date))
            
            # Per ogni gruppo, calcoliamo la data cutoff come max_date - 2 ore ed eliminiamo i documenti antecedenti
            for key, docs in groups.items():
                # Troviamo la data più recente per questo gruppo
                max_date = max(dt for (_, dt) in docs)
                cutoff_dt = max_date - pd.Timedelta(hours=2)
                for (doc, doc_date) in docs:
                    if doc_date < cutoff_dt:
                        doc.reference.delete()
                        logging.info(f"Deleted capacity_history document {doc.id} (date: {doc_date}) for group {key} because it is older than cutoff {cutoff_dt}")
            logging.info("Deletion of capacity_history documents older than cutoff completed")
        except Exception as e:
            logging.error("Error during deletion in capacity_history: {}".format(e))
        # ------------------------------------------------------------------------------

        try:
            # Update Firestore documents for system data
            for idx, row in df_systems.iterrows():
                # Costruisci l'ID del documento basato su hostid e pool
                if pd.isna(row['pool']):
                    doc_id = f"{row['hostid']}"
                else:
                    doc_id = f"{row['hostid']}_{row['pool']}"
                
                # Prepara i dati completi dalla riga del DataFrame
                full_doc_data = row.to_dict()
                
                # Definisci i campi specifici da aggiornare in system_data:
                update_fields = {
                    "used_snap": full_doc_data.get("used_snap"),
                    "used": full_doc_data.get("used"),
                    "sending_telemetry": full_doc_data.get("sending_telemetry"),
                    "perc_used": full_doc_data.get("perc_used"),
                    "perc_snap": full_doc_data.get("perc_snap"),
                    "last_date": full_doc_data.get("last_date"),
                    "avail": full_doc_data.get("avail")
                }
                
                # Ottieni il riferimento al documento Firestore e aggiorna (merge=True per aggiornare solo i campi specificati)
                doc_ref = db.collection("system_data").document(doc_id)
                doc_ref.set(update_fields, merge=True)
                logging.info(f"Firestore document {doc_id} updated with fields: {update_fields}")
            logging.info("Firestore system_data update completed")
        except Exception as e:
            logging.error("Error updating Firestore system_data: {}".format(e))
            raise e
        
        try:
            # Delete documents from "system_data" collection that do not have '_' in their document ID
            docs = db.collection("system_data").stream()
            for doc in docs:
                if "_" not in doc.id:
                    doc.reference.delete()
                    logging.info(f"Deleted document {doc.id} because it does not contain '_'")
            logging.info("Deletion of old system_data documents completed")
        except Exception as e:
            logging.error("Error during deletion in system_data: {}".format(e))
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
