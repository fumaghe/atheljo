import pandas as pd
# import fireducks.pandas as pd  # (Eventualmente da rimuovere o scommentare se serve)
from pydantic import BaseModel, Field
from typing import List, Optional
import datetime
import logging
from scipy.constants import giga
from datetime import datetime, timedelta
import numpy as np

import utils 

MAX_TIMEFRAME_HOURS = 4

def capacity_trends_table(raw_data_telemetry: pd.DataFrame) -> pd.DataFrame:
    """ 
    Reads the telemetry data and returns the 'capacity_trends' table in the correct format.
    
    Input (raw_data_telemetry): 
        pd.DataFrame con colonne: [hostid, editdate, ref_time, pool, avail, used, snap, ratio]
    Output: pd.DataFrame (columns in this order):
        [
            "date",
            "day",
            "hostid",
            "perc_snap",
            "perc_used",
            "pool",
            "snap",
            "total_space",
            "unit_id",
            "used"
        ]
    """

    raw_df = raw_data_telemetry.copy()
    
    # To filter for pools only we look for pools that do not contain '/' 
    df = raw_df[~raw_df['pool'].str.contains('/')]
    
    df["date"] = pd.to_datetime(df["editdate"])
    df["day"] = df["date"].dt.strftime('%Y-%m-%d')
    df["date"] = df["date"].dt.strftime('%Y-%m-%d %H:%M:%S')
    
    # For testing purposes we set unit_id to hostid
    df["unit_id"] = df.apply(lambda row: f"{row['hostid']}-{row['pool']}", axis=1)
    
    df["total"] = df["avail"] + df["used"]
    df["total_space"] = df["total"].apply(lambda x: utils.byte_to_giga(x))
    
    # Temp columns for easier calculations
    df["used_over_total"] = df["used"] / df["total"]
    df["snap_over_total"] = (df["snap"] / df["total"]).mask(df["snap"] / df["total"] < 0.01, 0.0)
    df["perc_used"] = df.apply(lambda row: utils.set_to_percentage(row["used_over_total"]), axis=1)
    df["perc_snap"] = df.apply(lambda row: utils.set_to_percentage(row["snap_over_total"]), axis=1)
    
    df["used"] = df["used"].apply(lambda x: utils.byte_to_giga(x))
    df["snap"] = df["snap"].apply(lambda x: utils.byte_to_giga(x))
    
    df = df[
        [
            "date",
            "day",
            "hostid",
            "perc_snap",
            "perc_used",
            "pool",
            "snap",
            "total_space",
            "unit_id",
            "used"
        ]
    ]
    
    # Filtering data to retrieve more important columns
    df_filtered = df.drop_duplicates(subset=[
        'day',        
        'hostid',
        'perc_snap',
        'pool',
        'snap',
    ], inplace=False)
    
    logging.info(f"Filtering telemetry values: skipped {df.shape[0] - df_filtered.shape[0]} columns")
    
    return df_filtered


def systems_data_table(raw_data_companies: pd.DataFrame, raw_data_telemetry: pd.DataFrame) -> pd.DataFrame:
    """ 
    Reads telemetry data and companies data to create the 'systems_data' table in the correct format.
    Per ogni combinazione di hostid e pool (escludendo quelli che contengono '/'),
    viene selezionato il record di telemetria più recente, aggiornando i valori.
    
    Input (raw_data_companies): 
        pd.DataFrame con colonne: [company, hostid, hostname, version, first_date, last_date]
    Input (raw_data_telemetry):
        pd.DataFrame con colonne: [hostid, editdate, ref_time, pool, avail, used, snap, ratio]
    
    Output: pd.DataFrame con le seguenti colonne (in quest’ordine):
        [
            "MUP",
            "avail",
            "avg_speed",
            "avg_time",
            "company",
            "first_date",
            "hostid",
            "last_date",
            "name",
            "perc_snap",
            "perc_used",
            "pool",
            "sending_telemetry",
            "type",
            "unit_id",
            "used",
            "used_snap"
        ]
    """
    import pandas as pd
    import logging
    from datetime import datetime, timedelta

    
    # Copia dei DataFrame di input
    df_companies = raw_data_companies.copy()
    df_telemetry = raw_data_telemetry.copy()
    
    # Filtra solo le righe di telemetria con pool che non contengono '/'
    df_telemetry = df_telemetry[~df_telemetry['pool'].str.contains('/')].copy()
    df_telemetry['editdate_dt'] = pd.to_datetime(df_telemetry['editdate'])
    
    # Calcola la media del tempo (in minuti) tra invii per ogni (hostid, pool)
    df_telemetry = df_telemetry.sort_values(by='editdate_dt')
    def avg_time_diff(group):
        diffs = group['editdate_dt'].diff().dropna()
        return diffs.mean().total_seconds() / 60.0 if not diffs.empty else 0.0
    # Utilizza to_frame() per creare una colonna "avg_time" e resetta l'indice
    avg_times = df_telemetry.groupby(['hostid', 'pool']).apply(avg_time_diff).to_frame(name='avg_time').reset_index()
    avg_times['avg_time'] = avg_times['avg_time'].round(2)
    
    # Unisci la telemetria con i dati delle aziende
    df = pd.merge(df_telemetry, df_companies, on="hostid", how="left")
    
    # Seleziona il record più recente per ogni (hostid, pool)
    df["editdate_dt"] = pd.to_datetime(df["editdate"])
    latest_idx = df.groupby(['hostid', 'pool'])['editdate_dt'].idxmax()
    df_latest = df.loc[latest_idx].copy()
    
    # Calcola le colonne aggiuntive basate sul record più recente
    df_latest["ref_time"] = pd.to_datetime(df_latest["ref_time"])
    df_latest["unit_id"] = df_latest["hostid"]  # oppure f"{hostid}-{pool}" se preferisci
    df_latest["name"] = df_latest["hostname"]
    df_latest["type"] = df_latest['version'].apply(lambda x: f"AiRE {'.'.join(x.split('.')[:2])}" if pd.notnull(x) else None)
    df_latest["total_space"] = df_latest["avail"] + df_latest["used"]
    df_latest["used_over_total"] = df_latest["used"] / df_latest["total_space"]
    df_latest["snap_over_total"] = (df_latest["snap"] / df_latest["total_space"]).mask(df_latest["snap"] / df_latest["total_space"] < 0.01, 0.0)
    df_latest["perc_used"] = df_latest.apply(lambda row: utils.set_to_percentage(row["used_over_total"]), axis=1)
    df_latest["perc_snap"] = df_latest.apply(lambda row: utils.set_to_percentage(row["snap_over_total"]), axis=1)
    
    # Converti i valori di bytes in giga
    df_latest["avail"] = df_latest["avail"].apply(lambda x: utils.byte_to_giga(x))
    df_latest["used"] = df_latest["used"].apply(lambda x: utils.byte_to_giga(x))
    df_latest["used_snap"] = df_latest["snap"].apply(lambda x: utils.byte_to_giga(x))
    
    # Gestione delle date e verifica se il sistema sta inviando telemetria
    df_latest["last_date"] = pd.to_datetime(df_latest["last_date"])
    is_sending = (datetime.now() - df_latest["last_date"]) <= timedelta(hours=4)  # MAX_TIMEFRAME_HOURS
    df_latest["sending_telemetry"] = is_sending.map({True: "True", False: "False"})
    
    # Unisci i valori medi calcolati (avg_time) per ogni (hostid, pool)
    df_latest = pd.merge(df_latest, avg_times, on=['hostid', 'pool'], how='left')
    # Imposta avg_speed uguale ad avg_time
    df_latest["avg_speed"] = df_latest["avg_time"]
    
    # Placeholder per MUP (da calcolare con altri algoritmi, se necessario)
    df_latest["MUP"] = pd.NA
    
    # Converti first_date e last_date in stringhe
    df_latest["first_date"] = pd.to_datetime(df_latest["first_date"]).dt.strftime('%Y-%m-%d %H:%M:%S')
    df_latest["last_date"] = df_latest["last_date"].dt.strftime('%Y-%m-%d %H:%M:%S')
    
    # Riordina le colonne secondo lo schema richiesto
    df_final = df_latest[
        [
            "MUP",            # null (TBA)
            "avail",          # float
            "avg_speed",      # media in minuti del tempo tra invii di telemetria
            "avg_time",       # media in minuti del tempo tra invii di telemetria
            "company",        # string
            "first_date",     # string
            "hostid",         # string
            "last_date",      # string
            "name",           # string (hostname)
            "perc_snap",      # float
            "perc_used",      # float
            "pool",           # string
            "sending_telemetry",  # "True"/"False"
            "type",           # string (partner)
            "unit_id",        # string (hostid)
            "used",           # float
            "used_snap"       # float
        ]
    ]
    
    return df_final
