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

    # ------------------------------------------------------------------
    def run(self):
        # --------------------------------------------------------------
        # 1 | Config & DB
        # --------------------------------------------------------------
        self.config = dotenv_values(self.env_file_path)

        raw_data_companies, raw_data_telemetry = connect_merlindb(
            self.config, self.last_id_path
        )
        logging.info("Database connection succeeded")

        # --------------------------------------------------------------
        # 2 | DataFrames
        # --------------------------------------------------------------
        df_capacity = results.capacity_trends_table(raw_data_telemetry)
        df_systems = results.systems_data_table(raw_data_companies, raw_data_telemetry)
        df_capacity_dataset = results.capacity_trends_dataset_table(raw_data_telemetry)

        # --------------------------------------------------------------
        # 2.1 | unit_id mapping per df_capacity_dataset
        # --------------------------------------------------------------
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

        # --------------------------------------------------------------
        # 3 | Salvataggio CSV (opzionale)
        # --------------------------------------------------------------
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

        # --------------------------------------------------------------
        # 4 | Firestore
        # --------------------------------------------------------------
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

        # --------------------------------------------------------------
        # 5 | capacity_history  (solo pool senza “/”)
        # --------------------------------------------------------------
        for _, r in df_capacity.iterrows():
            if pd.isna(r["pool"]) or "/" not in r["pool"]:
                formatted_date = r["date"].replace(" ", "_").replace(":", "-")
                doc_id = f"{r['hostid']}_{r['pool']}_{formatted_date}"
                db.collection("capacity_history").document(doc_id).set(
                    {"hostid": r["hostid"], "pool": r["pool"], "date": r["date"]}
                )
        logging.info("Firestore capacity_history update completed")

        # ---- pulizia vecchi (>2h) ------------------------------------
        capacity_docs = list(db.collection("capacity_history").stream())
        groups = {}
        for doc in capacity_docs:
            data = doc.to_dict()
            key = (data.get("hostid"), data.get("pool"))
            doc_date = pd.to_datetime(data.get("date"), errors="coerce")
            groups.setdefault(key, []).append((doc, doc_date))

        for docs in groups.values():
            cutoff = max(d for _, d in docs) - pd.Timedelta(hours=2)
            for d, dt in docs:
                if dt < cutoff:
                    d.reference.delete()
        logging.info("Deletion of capacity_history documents older than cutoff completed")

        # --------------------------------------------------------------
        # 6 | capacity_trends_dataset  (solo pool con “/”)
        # --------------------------------------------------------------
        for _, r in df_capacity_dataset.iterrows():
            pool_sanitized = str(r["pool"]).replace("/", "-")
            formatted_date = r["date"].replace(" ", "_").replace(":", "-")
            doc_id = f"{r['hostid']}_{pool_sanitized}_{formatted_date}"
            db.collection("capacity_trends_dataset").document(doc_id).set(r.to_dict())
        logging.info("Firestore capacity_trends_dataset update completed")

        # --------------------------------------------------------------
        # 7 | system_data
        # --------------------------------------------------------------
        for _, r in df_systems.iterrows():
            if pd.isna(r["pool"]):
                doc_id = f"{r['hostid']}"
            else:
                doc_id = f"{r['hostid']}_{str(r['pool']).replace('/', '-')}"
            update_fields = {
                "unit_id": r["unit_id"],
                "used_snap": r["used_snap"],
                "used": r["used"],
                "sending_telemetry": r["sending_telemetry"],
                "perc_used": r["perc_used"],
                "perc_snap": r["perc_snap"],
                "last_date": r["last_date"],
                "avail": r["avail"],
            }
            db.collection("system_data").document(doc_id).set(update_fields, merge=True)
        logging.info("Firestore system_data update completed")

        # ---- elimina documenti orfani -------------------------------
        for doc in db.collection("system_data").stream():
            if "_" not in doc.id:
                doc.reference.delete()
        logging.info("Deletion of old system_data documents completed")

        # --------------------------------------------------------------
        # 8 | ArchimedesDB
        # --------------------------------------------------------------
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
