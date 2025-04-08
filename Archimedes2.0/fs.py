import os
import pandas as pd
from pydantic import BaseModel, Field
from google.cloud import firestore
from typing import Optional, Dict, Any
import logging
import firebase_admin
from firebase_admin import credentials, firestore

def get_credentials_path(main_dir: str) -> str:
    """
    Determina il percorso del file delle credentials verificando:
      1. Se la variabile d’ambiente FIRESTORE_CREDENTIALS_PATH è impostata ed esiste.
      2. Se il file "credentials.json" esiste nella directory principale.
      3. Se il file "credentials.json" esiste nella sottocartella "secrets".
    Se il file non viene trovato, viene sollevata un'eccezione.
    """
    # 1. Controlla la variabile d'ambiente
    cred_env = os.environ.get("FIRESTORE_CREDENTIALS_PATH")
    if cred_env and os.path.exists(cred_env):
        logging.info(f"Utilizzo di FIRESTORE_CREDENTIALS_PATH da ambiente: {cred_env}")
        return cred_env

    # 2. Controlla se il file esiste nella directory principale
    local_path = os.path.join(main_dir, "credentials.json")
    if os.path.exists(local_path):
        logging.info(f"Utilizzo di credentials.json nella directory principale: {local_path}")
        return local_path

    # 3. Controlla se il file esiste nella cartella 'secrets'
    secrets_path = os.path.join(main_dir, "secrets", "credentials.json")
    if os.path.exists(secrets_path):
        logging.info(f"Utilizzo di credentials.json nella cartella secrets: {secrets_path}")
        return secrets_path

    raise FileNotFoundError(
        "File credentials.json non trovato. Verifica se FIRESTORE_CREDENTIALS_PATH è impostato "
        "o se il file esiste in 'credentials.json' o in 'secrets/credentials.json'."
    )

class ArchimedesDB(BaseModel):
    cred_path: str = Field(default=os.path.join(os.getcwd(), "credentials.json"), description="Firebase credentials")
    db: Optional[firestore.Client] = Field(default=None, description="Firestore client")
    cred: Optional[credentials.Certificate] = Field(default=None, description="Firebase credentials")

    class Config:
        arbitrary_types_allowed = True
    
    def set_credentials(self) -> credentials.Certificate:
        self.cred = credentials.Certificate(self.cred_path)
        return self.cred

    def connect_to_firestore(self):
        """Connects to Firestore using the provided credentials."""
        try:
            if not firebase_admin._apps:
                firebase_admin.initialize_app(self.cred)
            self.db = firestore.client()
        except Exception as e:
            logging.error(f"Error connecting to Firestore: {e}")
            raise Exception("Fatal Error: Error connecting to Firestore.")
    
    # Per testing, implementazione per MongoDB (non utilizzata al momento)
    def connect_to_mongoDB(self):
        pass

    def upload_to_firestore(self, collection_name: str, doc_id: str, document: Dict[str, Any]):
        """Uploads JSON-like data to the specified Firestore collection."""
        if self.db is None:
            logging.error("Firestore connection not established. Cannot upload data.")
            raise Exception("Fatal Error: Firestore connection not established.")
        
        try:
            doc_ref = self.db.collection(collection_name).document(doc_id)
            doc_ref.set(document)
        except Exception as e:
            logging.error(f"Error uploading data to Firestore: {e}")
            raise Exception("Fatal Error: Error uploading data to Firestore.")
    
    def _delete_firestore_documents(self, collection_name: str, document_id: str):
        """Deletes a document from Firestore."""
        if self.db is None:
            logging.error("Firestore connection not established. Cannot delete data.")
            return
        try:
            self.db.collection(collection_name).document(document_id).delete()
        except Exception as e:
            logging.error(f"Error deleting data from Firestore: {e}")

def convert_to_document(data, idx: int) -> dict:
    """Converts a DataFrame row to a Firestore document."""
    if isinstance(data, pd.DataFrame):
        return data.iloc[idx].to_dict()
        
def run_archimedesDB(main_dir: str, credential_path: str = None):
    """
    Esegue l'upload dei dati su Firestore utilizzando il percorso delle credentials determinato centralmente.
    Se viene fornito un 'credential_path', lo verifica; altrimenti usa la funzione get_credentials_path().
    """
    if credential_path:
        candidate_path = os.path.join(main_dir, credential_path)
        if os.path.exists(candidate_path):
            cred_full_path = candidate_path
        else:
            logging.warning(f"Il percorso fornito {candidate_path} non esiste. Verrà cercato il percorso alternativo.")
            cred_full_path = get_credentials_path(main_dir)
    else:
        cred_full_path = get_credentials_path(main_dir)

    logging.info(f"Utilizzo del file delle credentials: {cred_full_path}")
    archimedes_db = ArchimedesDB(cred_path=cred_full_path) 
    archimedes_db.set_credentials()
    archimedes_db.connect_to_firestore()

    # Upload dei dati su Firestore
    try:
        results_dir = os.path.join(main_dir, "results")
        capacity_docs = pd.read_csv(os.path.join(results_dir, "capacity_data.csv"))
        logging.info(f"Uploading data to Firestore {len(capacity_docs)} documents")
        for i in range(len(capacity_docs)):
            doc = convert_to_document(capacity_docs, i)
            hostid = doc.get("hostid")
            pool = doc.get("pool")
            date = doc.get("date")
            if hostid and pool and date:
                docid = f"{hostid}_{pool}_{date}"
                archimedes_db.upload_to_firestore("capacity_trends", docid, doc)
            else:
                logging.error(f"Error uploading data to Firestore: Missing required fields {hostid}-{pool}")
    except Exception as e:
        logging.error(f"Error uploading data to Firestore: {e}")
        raise Exception("Fatal Error: Error uploading data to Firestore.")
