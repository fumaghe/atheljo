import os
import pandas as pd
from pydantic import BaseModel, Field
from google.cloud import firestore
from typing import Optional, Dict, Any
import logging
import firebase_admin
from firebase_admin import credentials, firestore

def get_credentials_path(main_dir: str) -> str:
    const_env = os.environ.get("FIRESTORE_CREDENTIALS_PATH")
    if const_env and os.path.exists(const_env):
        return const_env
    local_path = os.path.join(main_dir, "credentials.json")
    if os.path.exists(local_path):
        return local_path
    secrets_path = os.path.join(main_dir, "secrets", "credentials.json")
    if os.path.exists(secrets_path):
        return secrets_path
    raise FileNotFoundError(
        "credentials.json file not found. Check if FIRESTORE_CREDENTIALS_PATH is set "
        "or if the file exists as 'credentials.json' or in 'secrets/credentials.json'."
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
        try:
            if not firebase_admin._apps:
                firebase_admin.initialize_app(self.cred)
            self.db = firestore.client()
        except Exception as e:
            logging.error(f"Error connecting to Firestore: {e}")
            raise Exception("Fatal Error: Error connecting to Firestore.")
    
    def upload_to_firestore(self, collection_name: str, doc_id: str, document: Dict[str, Any]):
        if self.db is None:
            logging.error("Firestore connection not established. Cannot upload data.")
            raise Exception("Fatal Error: Firestore connection not established.")
        try:
            doc_ref = self.db.collection(collection_name).document(doc_id)
            doc_ref.set(document)
        except Exception as e:
            logging.error(f"Error uploading data to Firestore: {e}")
            raise Exception("Fatal Error: Error uploading data to Firestore.")

def convert_to_document(data, idx: int) -> dict:
    if isinstance(data, pd.DataFrame):
        return data.iloc[idx].to_dict()
        
def run_archimedesDB(main_dir: str, credential_path: str = None):
    if credential_path:
        candidate_path = os.path.join(main_dir, credential_path)
        if os.path.exists(candidate_path):
            cred_full_path = candidate_path
        else:
            cred_full_path = get_credentials_path(main_dir)
    else:
        cred_full_path = get_credentials_path(main_dir)

    archimedes_db = ArchimedesDB(cred_path=cred_full_path) 
    archimedes_db.set_credentials()
    archimedes_db.connect_to_firestore()

    try:
        results_dir = os.path.join(main_dir, "results")
        capacity_docs = pd.read_csv(os.path.join(results_dir, "capacity_data.csv"))
        print(f"Loaded {len(capacity_docs)} documents from capacity_data.csv")
        uploaded_count = 0
        for i in range(len(capacity_docs)):
            doc = convert_to_document(capacity_docs, i)
            hostid = doc.get("hostid")
            pool = doc.get("pool")
            date = doc.get("date")
            if hostid and pool and date:
                docid = f"{hostid}_{pool}_{date}"
                archimedes_db.upload_to_firestore("capacity_trends", docid, doc)
                uploaded_count += 1
            else:
                logging.error(f"Error uploading data: missing fields (hostid: {hostid}, pool: {pool})")
        print(f"Uploaded {uploaded_count} documents to Firestore")
    except Exception as e:
        logging.error(f"Error uploading data to Firestore: {e}")
        raise Exception("Fatal Error: Error uploading data to Firestore.")
    print("fs.run_archimedesDB executed")
