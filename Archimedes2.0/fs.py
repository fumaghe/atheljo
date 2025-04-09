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
    Determines the credentials file path by checking:
      1. If the environment variable FIRESTORE_CREDENTIALS_PATH is set and exists.
      2. If the "credentials.json" file exists in the main directory.
      3. If the "credentials.json" file exists in the 'secrets' subfolder.
    Raises an exception if the file is not found.
    """
    # 1. Check environment variable
    cred_env = os.environ.get("FIRESTORE_CREDENTIALS_PATH")
    if cred_env and os.path.exists(cred_env):
        # Removed non-critical logging
        return cred_env

    # 2. Check if file exists in the main directory
    local_path = os.path.join(main_dir, "credentials.json")
    if os.path.exists(local_path):
        # Removed non-critical logging
        return local_path

    # 3. Check if file exists in the 'secrets' folder
    secrets_path = os.path.join(main_dir, "secrets", "credentials.json")
    if os.path.exists(secrets_path):
        # Removed non-critical logging
        return secrets_path

    raise FileNotFoundError(
        "credentials.json file not found. Check if FIRESTORE_CREDENTIALS_PATH is set or if the file exists in the main directory or in 'secrets/credentials.json'."
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
    
    # For testing, MongoDB implementation (not currently used)
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
    Uploads data to Firestore using a centrally determined credentials path.
    If a 'credential_path' is provided, it is verified; otherwise the get_credentials_path() function is used.
    """
    if credential_path:
        candidate_path = os.path.join(main_dir, credential_path)
        if os.path.exists(candidate_path):
            cred_full_path = candidate_path
        else:
            logging.warning(f"The provided path {candidate_path} does not exist. Trying an alternative path.")
            cred_full_path = get_credentials_path(main_dir)
    else:
        cred_full_path = get_credentials_path(main_dir)

    logging.info(f"Using credentials file: {cred_full_path}")
    archimedes_db = ArchimedesDB(cred_path=cred_full_path) 
    archimedes_db.set_credentials()
    archimedes_db.connect_to_firestore()

    # Upload data to Firestore
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
