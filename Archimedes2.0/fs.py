import os
import pandas as pd
#import fireducks.pandas as pd
from pydantic import BaseModel, Field
from google.cloud import firestore
from pprint import pprint
from typing import Optional, Dict, Any
import logging
import firebase_admin
from firebase_admin import credentials, firestore


class ArchimedesDB(BaseModel):
    cred_path: str = Field(default= os.path.join(os.getcwd(), "credentials.json"), description="Firebase credentials")
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
    
    # For testing purposes, MongoDB was early implemented
    def connect_to_mongoDB(self):
        pass

    def upload_to_firestore(self, collection_name: str, doc_id: str, document: Dict[str, Any]):
        """Uploads JSON-like data to Firestore collection specified."""
        
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
            logging.error("Firestore connection not established. Cannot upload data.")
            return

        try:
            self.db.collection(collection_name).document(document_id).delete()
            return 
        except Exception as e:
            logging.error(f"Error deleting data from Firestore: {e}")
            return
        
def convert_to_document(data, idx: int) -> dict:
    """Converts a DataFrame to a Firestore document."""
    if isinstance(data, pd.DataFrame):
        return data.iloc[idx].to_dict()
        
def run_archimedesDB(main_dir: str, credential_path: str):
    if credential_path:
        credential_path = os.path.join(main_dir, credential_path)
    else:
        credential_path = os.path.join(os.getcwd(), "credentials.json")
    full_path = os.path.join(main_dir, credential_path)
    archimedes_db = ArchimedesDB() 
    archimedes_db.set_credentials()
    archimedes_db.connect_to_firestore()

    # Uploading data to Firestore
    try:
        results_dir = os.path.join(main_dir, "results")
        capacity_docs = pd.read_csv(os.path.join(results_dir, "capacity_data.csv"))
        #systems_doc = pd.read_csv(os.path.join(results_dir, "systems_data.csv"))
        logging.info(f"Uploading data to Firestore {len(capacity_docs)} documents")
        for i in range(len(capacity_docs)):
            doc = convert_to_document(capacity_docs, i)
            #logging.info(f"Uploading data to Firestore: {doc}")
            hostid = doc.get("hostid")
            pool = doc.get("pool")
            date = doc.get("date")
            if hostid and pool and date:
                docid = doc.get("hostid") + "_" + doc.get("pool") + "_" + doc.get("date") 
                archimedes_db.upload_to_firestore("capacity_trends", docid, doc)
            else:
                logging.error(f"Error uploading data to Firestore: Missing required fields {hostid}-{pool}")
    except Exception as e:
        logging.error(f"Error uploading data to Firestore: {e}")
        raise Exception("Fatal Error: Error uploading data to Firestore.")
    
