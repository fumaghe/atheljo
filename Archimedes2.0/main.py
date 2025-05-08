# main.py – versione aggiornata 2025-05-08
import argparse
import logging
import os
import time
from dotenv import load_dotenv, dotenv_values

import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore, initialize_app

import utils
from db import connect_merlindb
import results
import fs


class Main:
    directory: str = os.getcwd()
    env_file_path: str = os.path.join(directory, ".env")
    last_id_path: str = os.path.join(directory, "last_id.txt")
    config: dict = dotenv_values(env_file_path)

    def run(self):
        # ------------------------------------------------------------------
        # 1 | Config & DB
        # ------------------------------------------------------------------
        self.config = dotenv_values(self.env_file_path)
        raw_data_companies, raw_data_telemetry = connect_merlindb(
            self.config, self.last_id_path
        )
        logging.info("Database connection succeeded")

        # ------------------------------------------------------------------
        # 2 | DataFrames
        # ------------------------------------------------------------------
        df_capacity = results.capacity_trends_table(raw_data_telemetry)
        df_systems = results.systems_data_table(raw_data_companies, raw_data_telemetry)
        df_capacity_dataset = results.capacity_trends_dataset_table(raw_data_telemetry)

        # ------------------------------------------------------------------
        # 2.1 | unit_id mapping per df_capacity_dataset
        # ------------------------------------------------------------------
        base_unit_map = (
            df_systems[
                df_systems["pool"].notna() & ~df_systems["pool"].str.contains("/", na=False)
            ][["hostid", "pool", "unit_id"]]
            .set_index(["hostid", "pool"])["unit_id"]
            .to_dict()
        )

        def map_unit_id(row):
            base_pool = str(row["pool"]).split("/")[0]
            return base_unit_map.get((row["hostid"], base_pool), row["unit_id"])

        df_capacity_dataset["unit_id"] = df_capacity_dataset.apply(map_unit_id, axis=1)

        # ------------------------------------------------------------------
        # 2.2 | Aggregazione perc_snap e used_snap dai dataset
        # ------------------------------------------------------------------
        # Filtra solo i dataset (pool con "/"), estrae base_pool, somma i due campi
        df_datasets = df_systems[df_systems["pool"].str.contains("/", na=False)].copy()
        df_datasets["base_pool"] = df_datasets["pool"].str.split("/", n=1).str[0]
        agg = (
            df_datasets
            .groupby(["hostid", "base_pool"])
            .agg({"perc_snap": "sum", "used_snap": "sum"})
            .rename_axis(index={"base_pool": "pool"})
        )
        # agg è un DataFrame con MultiIndex (hostid, pool) e colonne perc_snap, used_snap

        # ------------------------------------------------------------------
        # 3 | Salvataggio CSV (opzionale)
        # ------------------------------------------------------------------
        if self.config.get("SAVE_TABLES") == "True":
            res_folder = self.config["RESULTS_FOLDER"]
            utils.create_dir(os.path.join(self.directory, res_folder))
            utils.write_results(df_capacity, os.path.join(res_folder, "capacity_data.csv"))
            utils.write_results(
                df_capacity_dataset, os.path.join(res_folder, "capacity_dataset.csv")
            )
            utils.write_results(
                df_systems, os.path.join(res_folder, "systems_data.csv")
            )

        # ------------------------------------------------------------------
        # 4 | Firestore Init
        # ------------------------------------------------------------------
        cred_path = os.environ.get("FIRESTORE_CREDENTIALS_PATH")
        if not (cred_path and os.path.exists(cred_path)):
            cred_path = os.path.join(self.directory, "credentials.json")
            if not os.path.exists(cred_path):
                cred_path = os.path.join(self.directory, "secrets", "credentials.json")
        if not os.path.exists(cred_path):
            raise FileNotFoundError("credentials.json non trovato")
        cred = credentials.Certificate(cred_path)
        if not firebase_admin._apps:
            initialize_app(cred)
        db = firestore.client()

        # ------------------------------------------------------------------
        # 5 | capacity_history  (solo pool senza “/”)
        # ------------------------------------------------------------------
        for _, r in df_capacity.iterrows():
            if pd.isna(r["pool"]) or "/" not in r["pool"]:
                formatted_date = r["date"].replace(" ", "_").replace(":", "-")
                doc_id = f"{r['hostid']}_{r['pool']}_{formatted_date}"
                db.collection("capacity_history").document(doc_id).set(
                    {"hostid": r["hostid"], "pool": r["pool"], "date": r["date"]}
                )
        logging.info("Firestore capacity_history update completed")

        # ---- pulizia vecchi (>2h) ----------------------------------------
        capacity_docs = list(db.collection("capacity_history").stream())
        groups = {}
        for doc in capacity_docs:
            data = doc.to_dict()
            key = (data.get("hostid"), data.get("pool"))
            dt = pd.to_datetime(data.get("date"), errors="coerce")
            groups.setdefault(key, []).append((doc, dt))
        for docs in groups.values():
            cutoff = max(d for _, d in docs) - pd.Timedelta(hours=2)
            for d, dt in docs:
                if dt < cutoff:
                    d.reference.delete()
        logging.info("Old capacity_history cleanup done")

        # ------------------------------------------------------------------
        # 6 | capacity_trends_dataset  (solo pool con “/”)
        # ------------------------------------------------------------------
        for _, r in df_capacity_dataset.iterrows():
            pool_sanitized = str(r["pool"]).replace("/", "-")
            formatted_date = r["date"].replace(" ", "_").replace(":", "-")
            doc_id = f"{r['hostid']}_{pool_sanitized}_{formatted_date}"
            db.collection("capacity_trends_dataset").document(doc_id).set(r.to_dict())
        logging.info("Firestore capacity_trends_dataset update completed")

        # ------------------------------------------------------------------
        # 7 | system_data – salva tutte le colonne (unit_id immutabile)
        # ------------------------------------------------------------------
        for _, r in df_systems.iterrows():
            host = r["hostid"]
            pool = r["pool"]
            # costruisci document ID
            if pd.isna(pool):
                doc_id = f"{host}"
            else:
                doc_id = f"{host}_{str(pool).replace('/', '-')}"
            # dict di tutti i campi
            data = r.to_dict()
            # 7.1: se è pool principale (senza "/"), sovrascrivo perc_snap e used_snap con la somma dei dataset
            if pd.isna(pool) or "/" not in str(pool):
                key = (host, pool)
                if key in agg.index:
                    data["perc_snap"] = float(agg.at[key, "perc_snap"])
                    data["used_snap"] = float(agg.at[key, "used_snap"])
                else:
                    data["perc_snap"] = 0.0
                    data["used_snap"] = 0.0
            # 7.2: rimuovo unit_id per non toccarlo in Firestore
            data.pop("unit_id", None)
            db.collection("system_data").document(doc_id).set(
                data,
                merge=True
            )
        logging.info("Firestore system_data update completed")

        # ---- (opzionale) elimina documenti host-only se non servono -------
        # for doc in db.collection("system_data").stream():
        #     if "_" not in doc.id:
        #         doc.reference.delete()
        # logging.info("Deletion of old system_data documents completed")

        # ------------------------------------------------------------------
        # 8 | ArchimedesDB
        # ------------------------------------------------------------------
        env_value = self.config.get("ENVIRONMENT", "")
        if env_value in ("DEV", "PROD"):
            fs.run_archimedesDB(self.directory, "requirements.json")
        else:
            fs.run_archimedesDB(self.directory)


# ----------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run main cycles")
    parser.add_argument("--cycles", type=int, default=1)
    args = parser.parse_args()

    if not load_dotenv(os.path.join(os.getcwd(), ".env")):
        raise RuntimeError(".env file missing")

    utils.activate_logger(dotenv_values(".env"), os.getcwd())
    logging.info("=== Start of main.py ===")

    runner = Main()
    for n in range(args.cycles):
        try:
            runner.run()
        except Exception as e:
            logging.error(f"Error during iteration {n + 1}: {e}")
        if n < args.cycles - 1:
            time.sleep(20)

    logging.info("=== End of program main.py ===")
