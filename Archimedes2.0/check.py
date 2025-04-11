#!/usr/bin/env python3
"""
print_latest_date_by_group.py

Questo script si connette a Firestore, carica i documenti dalla collection "capacity_trends"
e, per ogni combinazione di hostid e pool, recupera l'ultimo documento (basato sul campo "date_dt")
e aggiorna, nella collection "system_data", il campo "last_date" del documento corrispondente
salvandolo come stringa nel formato "YYYY-MM-DD HH:MM:SS".

Utilizzo:
    python print_latest_date_by_group.py
"""

import os
import logging
from datetime import datetime

import pandas as pd
from firebase_admin import credentials, firestore, initialize_app
import firebase_admin

# Configura il logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

def connect_firestore():
    """
    Stabilisce la connessione a Firestore cercando le credenziali nella variabile d'ambiente
    FIRESTORE_CREDENTIALS_PATH oppure nel file "credentials.json" (o nella cartella "secrets").
    
    Ritorna:
        db: il client Firestore
    """
    cred_path = os.environ.get("FIRESTORE_CREDENTIALS_PATH")
    if cred_path and os.path.exists(cred_path):
        logging.info("Using FIRESTORE_CREDENTIALS_PATH from environment: %s", cred_path)
    else:
        base_dir = os.getcwd()
        cred_path = os.path.join(base_dir, "credentials.json")
        if not os.path.exists(cred_path):
            cred_path = os.path.join(base_dir, "secrets", "credentials.json")
    if not os.path.exists(cred_path):
        raise FileNotFoundError(
            "File delle credenziali non trovato. Verifica FIRESTORE_CREDENTIALS_PATH o la presenza di 'credentials.json' in directory o in 'secrets'."
        )
    
    try:
        cred = credentials.Certificate(cred_path)
    except Exception as e:
        logging.error("Errore nel caricamento delle credenziali: %s", e)
        raise e

    if not firebase_admin._apps:
        initialize_app(cred)
        logging.info("Firebase Admin inizializzato")
    else:
        logging.info("Firebase Admin già inizializzato")

    db = firestore.client()
    logging.info("Connessione a Firestore stabilita")
    return db

def load_capacity_trends(db, collection_name="capacity_trends"):
    """
    Scarica tutti i documenti dalla collezione specificata e li trasforma in un DataFrame.
    
    Si assume che ogni documento contenga almeno i seguenti campi:
        - "date"    : stringa, es. "2025-04-10 19:46:44"
        - "hostid"  : stringa, es. "3caf01f0"
        - "pool"    : stringa, es. "sp0"
        - "date_dt" : stringa oppure oggetto datetime (se non è datetime, viene convertito)
    
    Viene aggiunto il campo "doc_id" per poter tenere traccia dell'ID del documento.
    """
    docs = list(db.collection(collection_name).stream())
    records = []
    for doc in docs:
        data = doc.to_dict()
        data["doc_id"] = doc.id
        # Converti "date_dt" se necessario; se non esiste, usa "date"
        if "date_dt" in data:
            try:
                if not isinstance(data["date_dt"], datetime):
                    data["date_dt"] = datetime.strptime(data["date_dt"], "%Y-%m-%d %H:%M:%S")
            except Exception:
                try:
                    data["date_dt"] = datetime.strptime(data["date"], "%Y-%m-%d %H:%M:%S")
                except Exception as e:
                    logging.error("Errore di conversione data per il documento %s: %s", doc.id, e)
                    continue
        else:
            try:
                data["date_dt"] = datetime.strptime(data["date"], "%Y-%m-%d %H:%M:%S")
            except Exception as e:
                logging.error("Errore di conversione data per il documento %s: %s", doc.id, e)
                continue
        records.append(data)
    
    df = pd.DataFrame(records)
    logging.info("Scaricati %d documenti dalla collezione '%s'.", len(df), collection_name)
    return df

def format_date_as_string(date_value):
    """
    Assicura che la data venga formattata come stringa nel formato "YYYY-MM-DD HH:MM:SS".
    
    Se date_value è una stringa già formattata, viene riprocessata per garantire la correttezza.
    Se è un oggetto datetime, viene formattato.
    """
    if isinstance(date_value, datetime):
        return date_value.strftime("%Y-%m-%d %H:%M:%S")
    try:
        # Prova a convertire la stringa in datetime e poi formattala
        dt = datetime.strptime(date_value, "%Y-%m-%d %H:%M:%S")
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        # Se la conversione fallisce, restituisci comunque il valore originale
        return date_value

def update_system_data_from_capacity_trends(db, df: pd.DataFrame):
    """
    Raggruppa il DataFrame per hostid e pool, identifica per ciascun gruppo l'ultimo documento (basato su date_dt)
    e aggiorna nella collection "system_data" il campo "last_date" dei documenti che corrispondono alla stessa combinazione.
    Assicura che il valore salvato sia una stringa nel formato corretto.
    """
    if df.empty:
        logging.info("Nessun documento da elaborare in capacity_trends.")
        return

    # Raggruppa per hostid e pool e trova l'indice del documento con il massimo date_dt per ciascun gruppo.
    latest_docs = df.loc[df.groupby(["hostid", "pool"])["date_dt"].idxmax()]

    for idx, row in latest_docs.iterrows():
        hostid = row.get("hostid")
        pool = row.get("pool")
        new_last_date = row.get("date")
        # Assicura che la data sia una stringa formattata correttamente
        formatted_date = format_date_as_string(new_last_date)
        logging.info("Ultimo documento per Hostid: %s, Pool: %s -> last_date = %s", hostid, pool, formatted_date)

        # Cerca nella collection "system_data" i documenti con lo stesso hostid e pool
        system_docs = db.collection("system_data") \
                        .where("hostid", "==", hostid) \
                        .where("pool", "==", pool) \
                        .stream()

        updated_any = False
        for doc in system_docs:
            try:
                db.collection("system_data").document(doc.id).update({"last_date": formatted_date})
                logging.info("Aggiornato documento [%s] in system_data per Hostid: %s, Pool: %s con last_date: %s",
                             doc.id, hostid, pool, formatted_date)
                updated_any = True
            except Exception as e:
                logging.error("Errore aggiornando il documento system_data %s: %s", doc.id, e)

        if not updated_any:
            logging.info("Nessun documento in system_data trovato per Hostid: %s, Pool: %s", hostid, pool)

def main():
    try:
        db = connect_firestore()
    except Exception as e:
        logging.error("Errore nella connessione a Firestore: %s", e)
        return

    df = load_capacity_trends(db, collection_name="capacity_trends")
    update_system_data_from_capacity_trends(db, df)

if __name__ == "__main__":
    main()
