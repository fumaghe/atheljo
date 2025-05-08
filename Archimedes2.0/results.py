# results.py  – versione FIX 2025-05-08
import pandas as pd
import logging
from datetime import timedelta
import utils

MAX_TIMEFRAME_HOURS = 24


# --------------------------------------------------------------------------
# CAPACITY TRENDS – SOLO POOL SENZA “/”
# --------------------------------------------------------------------------
def capacity_trends_table(raw_data_telemetry: pd.DataFrame) -> pd.DataFrame:
    """
    Ritorna il dataframe per la tabella *capacity_trends*,
    ESCLUDENDO le pool che contengono “/”.
    """
    raw_df = raw_data_telemetry.copy()
    df = raw_df[~raw_df["pool"].str.contains("/", na=False)].copy()

    # date
    df["date"] = pd.to_datetime(df["editdate"])
    df["day"] = df["date"].dt.strftime("%Y-%m-%d")
    df["date"] = df["date"].dt.strftime("%Y-%m-%d %H:%M:%S")

    # unit_id
    df["unit_id"] = df.apply(lambda r: f"{r['hostid']}-{r['pool']}", axis=1)

    # capacità
    df["total"] = df["avail"] + df["used"]
    df["total_space"] = df["total"].apply(utils.byte_to_giga)
    df["used_over_total"] = df["used"] / df["total"]
    df["snap_over_total"] = (df["snap"] / df["total"]).mask(
        df["snap"] / df["total"] < 0.01, 0.0
    )
    df["perc_used"] = df["used_over_total"].apply(utils.set_to_percentage)
    df["perc_snap"] = df["snap_over_total"].apply(utils.set_to_percentage)

    df["used"] = df["used"].apply(utils.byte_to_giga)
    df["snap"] = df["snap"].apply(utils.byte_to_giga)

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
            "used",
        ]
    ]

    df_filtered = df.drop_duplicates(
        subset=["day", "hostid", "perc_snap", "pool", "snap"], inplace=False
    )
    skipped = df.shape[0] - df_filtered.shape[0]
    logging.info(f"Filtering telemetry values: skipped {skipped} rows")
    return df_filtered


# --------------------------------------------------------------------------
# CAPACITY TRENDS DATASET – SOLO POOL CON “/”
# --------------------------------------------------------------------------
def capacity_trends_dataset_table(raw_data_telemetry: pd.DataFrame) -> pd.DataFrame:
    """
    Ritorna il dataframe per la tabella *capacity_trends_dataset*,
    CONTENENTE esclusivamente le pool che includono “/”.
    """
    raw_df = raw_data_telemetry.copy()
    df = raw_df[raw_df["pool"].str.contains("/", na=False)].copy()

    df["date"] = pd.to_datetime(df["editdate"])
    df["day"] = df["date"].dt.strftime("%Y-%m-%d")
    df["date"] = df["date"].dt.strftime("%Y-%m-%d %H:%M:%S")

    # unit_id provvisorio
    df["unit_id"] = df.apply(lambda r: f"{r['hostid']}-{r['pool']}", axis=1)

    df["total"] = df["avail"] + df["used"]
    df["total_space"] = df["total"].apply(utils.byte_to_giga)
    df["used_over_total"] = df["used"] / df["total"]
    df["snap_over_total"] = (df["snap"] / df["total"]).mask(
        df["snap"] / df["total"] < 0.01, 0.0
    )
    df["perc_used"] = df["used_over_total"].apply(utils.set_to_percentage)
    df["perc_snap"] = df["snap_over_total"].apply(utils.set_to_percentage)

    df["used"] = df["used"].apply(utils.byte_to_giga)
    df["snap"] = df["snap"].apply(utils.byte_to_giga)

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
            "used",
        ]
    ]

    df_filtered = df.drop_duplicates(
        subset=["day", "hostid", "perc_snap", "pool", "snap"], inplace=False
    )
    return df_filtered


# --------------------------------------------------------------------------
# SYSTEMS DATA
# --------------------------------------------------------------------------
def systems_data_table(
    raw_data_companies: pd.DataFrame, raw_data_telemetry: pd.DataFrame
) -> pd.DataFrame:
    """
    Crea la tabella *systems_data*.
    INCLUDE anche le pool con “/” e mappa il loro unit_id
    su quello della pool “base”.
    """
    df_companies = raw_data_companies.copy()
    df_tel = raw_data_telemetry.copy()
    df_tel["editdate_dt"] = pd.to_datetime(df_tel["editdate"], errors="coerce")

    # avg_time fra trasmissioni
    df_tel = df_tel.sort_values("editdate_dt")
    def avg_time_diff(g):
        d = g["editdate_dt"].diff().dropna()
        return d.mean().total_seconds() / 60.0 if not d.empty else 0.0

    avg_times = (
        df_tel.groupby(["hostid", "pool"])
        .apply(avg_time_diff)
        .to_frame("avg_time")
        .reset_index()
    )
    avg_times["avg_time"] = avg_times["avg_time"].round(2)

    # merge companies + telemetry
    df = pd.merge(df_companies, df_tel, on="hostid", how="left", suffixes=("", "_t"))
    df["editdate_dt"] = pd.to_datetime(df["editdate"], errors="coerce")

    df_latest = (
        df.sort_values("editdate_dt")
        .groupby(["hostid", "pool"], dropna=False)
        .last()
        .reset_index()
    )
    for c in ["avail", "used", "snap", "ratio"]:
        df_latest[c] = df_latest[c].fillna(0)

    # unit_id di default
    df_latest["unit_id"] = df_latest.apply(
        lambda r: f"{r['hostid']}-{r['pool']}" if pd.notnull(r["pool"]) else str(r["hostid"]),
        axis=1,
    )

    # mappa pool con “/”
    base_map = (
        df_latest[ df_latest["pool"].notna() & ~df_latest["pool"].str.contains("/", na=False) ]
        .set_index(["hostid", "pool"])["unit_id"]
        .to_dict()
    )
    def map_u(r):
        if pd.isna(r["pool"]) or "/" not in str(r["pool"]):
            return r["unit_id"]
        base = str(r["pool"]).split("/")[0]
        return base_map.get((r["hostid"], base), r["unit_id"])
    df_latest["unit_id"] = df_latest.apply(map_u, axis=1)

    # calcoli di capacità
    df_latest["total_space"] = df_latest["avail"] + df_latest["used"]
    df_latest["used_over_total"] = df_latest.apply(
        lambda r: r["used"] / r["total_space"] if r["total_space"] > 0 else 0, axis=1
    )
    df_latest["snap_over_total"] = df_latest.apply(
        lambda r: r["snap"] / r["total_space"] if r["total_space"] > 0 else 0, axis=1
    )
    df_latest["perc_used"] = df_latest["used_over_total"].apply(utils.set_to_percentage)
    df_latest["perc_snap"] = df_latest["snap_over_total"].apply(utils.set_to_percentage)

    df_latest["avail"] = df_latest["avail"].apply(utils.byte_to_giga)
    df_latest["used"] = df_latest["used"].apply(utils.byte_to_giga)
    df_latest["used_snap"] = df_latest["snap"].apply(utils.byte_to_giga)

    # sending_telemetry
    df_latest["last_date"] = pd.to_datetime(df_latest["last_date"], errors="coerce")
    is_sending = (pd.Timestamp.now() - df_latest["last_date"]) <= timedelta(hours=MAX_TIMEFRAME_HOURS)
    df_latest["sending_telemetry"] = is_sending.fillna(False).map({True: "True", False: "False"})

    # merge avg_time
    df_latest = pd.merge(df_latest, avg_times, on=["hostid", "pool"], how="left")
    df_latest["avg_speed"] = df_latest["avg_time"]

    # **qui** uso None invece di pd.NA per non creare pandas.NAType
    df_latest["MUP"] = None

    df_latest["first_date"] = (
        pd.to_datetime(df_latest["first_date"], errors="coerce")
        .dt.strftime("%Y-%m-%d %H:%M:%S")
    )
    df_latest["last_date"] = df_latest["last_date"].dt.strftime("%Y-%m-%d %H:%M:%S")
    df_latest["name"] = df_latest["hostname"]
    df_latest["type"] = df_latest["version"].apply(
        lambda v: f"AiRE {'.'.join(v.split('.')[:2])}" if pd.notnull(v) else None
    )

    df_final = df_latest[
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
            "used_snap",
        ]
    ]
    return df_final
