#!/usr/bin/env python3
"""
firestore_capacity_trends_cleanup.py

Questo script si connette a Firestore e applica la logica di "clean capacity trends":
- Per i dati più vecchi di una settimana: raggruppa per hostid, pool e day e mantiene, per ogni gruppo,
  il record il cui "perc_used" è il più vicino alla media giornaliera.
- Per i dati della settimana precedente (>= one_week_ago): per ogni combinazione hostid e pool,
  ordina i record per data e mantiene solo i record in cui "perc_used" varia di almeno 0.01
  rispetto al record precedente mantenuto.

Vengono eliminati da Firestore i documenti che non risultano nella versione pulita.
Le informazioni sui documenti eliminati vengono salvate in un file Parquet in modo incrementale.

Utilizzo:
    python firestore_capacity_trends_cleanup.py
"""

import os
import logging
import argparse
from datetime import datetime, timedelta

import pandas as pd
from firebase_admin import credentials, firestore, initialize_app
import firebase_admin
import pyarrow as pa
import pyarrow.parquet as pq

# Configura il logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# Definisco il path del file Parquet per salvare i documenti eliminati
PARQUET_FILE = "deleted_docs.parquet"

def connect_firestore():
    """
    Stabilisce la connessione a Firestore.
    Cerca le credenziali nella variabile d'ambiente FIRESTORE_CREDENTIALS_PATH oppure
    nel file "credentials.json" (nella directory corrente o nella cartella "secrets").
    
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
            "Credentials file not found. Controlla FIRESTORE_CREDENTIALS_PATH o la presenza di 'credentials.json' in directory o in 'secrets'."
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
    Scarica tutti i documenti dalla collezione e li trasforma in un DataFrame.
    
    Si assume che ogni documento contenga i seguenti campi:
        - "date"       : stringa, ad es. "2025-04-10 19:46:44"
        - "hostid"     : stringa, ad es. "3caf01f0"
        - "pool"       : stringa, ad es. "sp0"
        - "perc_snap"  : numero (float)
        - "perc_used"  : numero (float)
        - "snap"       : numero (float)
        - "total_space": numero (float)
        - "unit_id"    : stringa, ad es. "3caf01f0-sp0"
        - "used"       : numero (float)
        - "day"        : stringa, ad es. "2025-04-10"
    
    Vengono aggiunte anche colonne derivate:
        - "date_dt"    : datetime ottenuto da "date"
    """
    docs = list(db.collection(collection_name).stream())
    records = []
    for doc in docs:
        data = doc.to_dict()
        data["doc_id"] = doc.id  # conserva l'ID per riferimento
        try:
            dt = datetime.strptime(data["date"], "%Y-%m-%d %H:%M:%S")
        except Exception as e:
            logging.error("Errore nella conversione della data per il documento %s: %s", doc.id, e)
            continue
        data["date_dt"] = dt
        # Se il campo "day" non esiste, lo creiamo dalla data
        if "day" not in data or not data["day"]:
            data["day"] = dt.strftime("%Y-%m-%d")
        records.append(data)
    df = pd.DataFrame(records)
    logging.info("Scaricati %d documenti dalla collezione '%s'.", len(df), collection_name)
    return df


def clean_capacity_trends(df: pd.DataFrame) -> pd.DataFrame:
    """
    Applica la logica di pulizia basata su hostid, pool e day.
    
    1. Per i dati più vecchi di una settimana:
       Raggruppa per [hostid, pool, day] e, per ciascun gruppo,
       mantiene il record il cui "perc_used" è il più vicino alla media del gruppo.
       
    2. Per i dati della settimana precedente (>= one_week_ago):
       Raggruppa per [hostid, pool] e, all'interno di ciascun gruppo,
       ordina per "date_dt" e mantiene solo i record in cui la variazione di "perc_used"
       rispetto al record precedente è >= 0.01.
       
    Restituisce il DataFrame pulito.
    """
    today = pd.Timestamp.now()
    one_week_ago = today - timedelta(weeks=1)
    
    # Separa i record: dati vecchi e dati recenti
    df_old = df[df["date_dt"] < one_week_ago].copy()
    df_recent = df[df["date_dt"] >= one_week_ago].copy()

    # Regola 1: per i record vecchi, raggruppa per [hostid, pool, day]
    def get_record_closest_to_avg(group: pd.DataFrame) -> pd.Series:
        avg_perc = group["perc_used"].mean()
        group["diff"] = (group["perc_used"] - avg_perc).abs()
        # Se il gruppo ha più record, seleziona quello con differenza minima
        return group.loc[group["diff"].idxmin()]

    if not df_old.empty:
        df_old_clean = df_old.groupby(["hostid", "pool", "day"]).apply(get_record_closest_to_avg).reset_index(drop=True)
    else:
        df_old_clean = pd.DataFrame(columns=df.columns)

    # Regola 2: per i record recenti, raggruppa per [hostid, pool] e filtra per variazioni significative
    def filter_recent(group: pd.DataFrame) -> pd.DataFrame:
        group = group.sort_values("date_dt")
        kept = []
        last_kept_value = None
        for _, row in group.iterrows():
            if last_kept_value is None:
                kept.append(row)
                last_kept_value = row["perc_used"]
            else:
                # Mantieni il record solo se la variazione è >= 0.01
                if abs(row["perc_used"] - last_kept_value) >= 0.01:
                    kept.append(row)
                    last_kept_value = row["perc_used"]
        return pd.DataFrame(kept)
    
    if not df_recent.empty:
        df_recent_clean = df_recent.groupby(["hostid", "pool"]).apply(filter_recent)
    else:
        df_recent_clean = pd.DataFrame(columns=df.columns)

    # Combina i record puliti e ordina per data
    df_clean = pd.concat([df_old_clean, df_recent_clean], ignore_index=True)
    df_clean = df_clean.sort_values("date_dt").reset_index(drop=True)
    # Rimuove eventuali colonne temporanee
    df_clean.drop(columns=["diff"], errors="ignore", inplace=True)
    
    logging.info("Pulizia completata: %d documenti mantenuti su %d", len(df_clean), len(df))
    return df_clean


def delete_unwanted_docs(db, df_original: pd.DataFrame, df_clean: pd.DataFrame, collection_name="capacity_trends"):
    """
    Confronta l'elenco degli ID dei documenti originali con quelli del DataFrame pulito.
    Elimina da Firestore i documenti il cui ID non è presente in df_clean.

    Durante la cancellazione, le informazioni dei documenti eliminati vengono
    scritte in modo incrementale in un file Parquet per evitare l'accumulo in memoria.
    
    Ogni 500 eliminazioni viene stampato un messaggio in log.
    """
    kept_ids = set(df_clean["doc_id"].tolist())
    all_ids = set(df_original["doc_id"].tolist())
    ids_to_delete = list(all_ids - kept_ids)
    deleted_count = 0

    # Definisco lo schema per il file Parquet
    schema = pa.schema([
        ("doc_id", pa.string()),
        ("deleted_at", pa.string())
    ])

    # Creo il writer per il file Parquet
    writer = pq.ParquetWriter(PARQUET_FILE, schema)
    batch = []  # batch temporaneo per accumulare record
    batch_size = 500  # definisco la dimensione del batch

    for doc_id in ids_to_delete:
        try:
            db.collection(collection_name).document(doc_id).delete()
            deletion_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            batch.append({"doc_id": doc_id, "deleted_at": deletion_timestamp})
            deleted_count += 1

            if deleted_count % 500 == 0:
                logging.info("HO ELIMINATO 500 DOCUMENTI")
            
            # Quando il batch raggiunge la dimensione definita, lo scrive sul file Parquet
            if len(batch) >= batch_size:
                df_batch = pd.DataFrame(batch)
                table = pa.Table.from_pandas(df_batch, preserve_index=False)
                writer.write_table(table)
                batch = []  # svuota il batch
                
        except Exception as e:
            logging.error("Errore nell'eliminazione del documento %s: %s", doc_id, e)
    
    # Se rimangono record nel batch, li scrivo
    if batch:
        df_batch = pd.DataFrame(batch)
        table = pa.Table.from_pandas(df_batch, preserve_index=False)
        writer.write_table(table)
    writer.close()

    logging.info("Eliminazione completata: %d documenti eliminati dalla collezione '%s'.", deleted_count, collection_name)


def main():
    parser = argparse.ArgumentParser(
        description="Firestore Capacity Trends Cleanup Tool: elimina i documenti non conformi alla logica di cleaning."
    )
    parser.add_argument(
        "--collection", type=str, default="capacity_trends",
        help="Nome della collezione Firestore (default: capacity_trends)"
    )
    args = parser.parse_args()

    try:
        db = connect_firestore()
    except Exception as e:
        logging.error("Errore nella connessione a Firestore: %s", e)
        return

    # Carica i dati della collezione in un DataFrame
    df_all = load_capacity_trends(db, args.collection)
    if df_all.empty:
        logging.info("Nessun documento trovato nella collezione '%s'.", args.collection)
        return

    # Applica la logica di cleaning basata su hostid, pool e day
    df_clean = clean_capacity_trends(df_all)

    # Elimina da Firestore tutti i documenti che non compaiono nel DataFrame pulito
    delete_unwanted_docs(db, df_all, df_clean, args.collection)


if __name__ == "__main__":
    main()
