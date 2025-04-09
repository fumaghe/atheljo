import pandas as pd
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
    Process telemetry data and return the 'capacity_trends' table.
    
    Input:
        raw_data_telemetry: pd.DataFrame with columns [hostid, editdate, ref_time, pool, avail, used, snap, ratio]
    Output:
        pd.DataFrame with columns (in order):
        ["date", "day", "hostid", "perc_snap", "perc_used", "pool", "snap", "total_space", "unit_id", "used"]
    """
    raw_df = raw_data_telemetry.copy()
    
    # Filter out pools that contain '/'
    df = raw_df[~raw_df['pool'].str.contains('/')]
    
    df["date"] = pd.to_datetime(df["editdate"])
    df["day"] = df["date"].dt.strftime('%Y-%m-%d')
    df["date"] = df["date"].dt.strftime('%Y-%m-%d %H:%M:%S')
    
    # For testing, unit_id is set as "hostid-pool"
    df["unit_id"] = df.apply(lambda row: f"{row['hostid']}-{row['pool']}", axis=1)
    
    df["total"] = df["avail"] + df["used"]
    df["total_space"] = df["total"].apply(lambda x: utils.byte_to_giga(x))
    
    # Temporary columns for calculation
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
    
    # Remove duplicate rows based on certain columns
    df_filtered = df.drop_duplicates(subset=[
        'day',        
        'hostid',
        'perc_snap',
        'pool',
        'snap',
    ], inplace=False)
    
    logging.info(f"Filtering telemetry values: skipped {df.shape[0] - df_filtered.shape[0]} rows")
    
    return df_filtered


def systems_data_table(raw_data_companies: pd.DataFrame, raw_data_telemetry: pd.DataFrame) -> pd.DataFrame:
    """ 
    Process companies data and telemetry data to create the 'systems_data' table.
    
    For each system (identified by hostid), a left join is performed with telemetry data
    to include systems that are not currently sending telemetry. In such cases, metrics are set to default values.
    
    Output:
        pd.DataFrame with columns (in order):
        ["MUP", "avail", "avg_speed", "avg_time", "company", "first_date", "hostid", "last_date",
         "name", "perc_snap", "perc_used", "pool", "sending_telemetry", "type", "unit_id", "used", "used_snap"]
    """
    # Copy input dataframes
    df_companies = raw_data_companies.copy()
    df_telemetry = raw_data_telemetry.copy()
    
    # Filter telemetry rows where pool does NOT contain '/'
    df_telemetry = df_telemetry[~df_telemetry['pool'].str.contains('/')].copy()
    df_telemetry['editdate_dt'] = pd.to_datetime(df_telemetry['editdate'], errors='coerce')
    
    # Calculate average time difference (in minutes) between telemetry transmissions per (hostid, pool)
    df_telemetry = df_telemetry.sort_values(by='editdate_dt')
    def avg_time_diff(group):
        diffs = group['editdate_dt'].diff().dropna()
        return diffs.mean().total_seconds() / 60.0 if not diffs.empty else 0.0
    avg_times = df_telemetry.groupby(['hostid', 'pool']).apply(avg_time_diff).to_frame(name='avg_time').reset_index()
    avg_times['avg_time'] = avg_times['avg_time'].round(2)
    
    # Left join companies data with telemetry data to include all systems
    df = pd.merge(df_companies, df_telemetry, on="hostid", how="left", suffixes=('', '_tele'))
    
    # Convert editdate to datetime for proper ordering
    df['editdate_dt'] = pd.to_datetime(df['editdate'], errors='coerce')
    
    # For duplicate telemetry records, select the one with the latest editdate
    df_latest = df.sort_values(by='editdate_dt').groupby(['hostid', 'pool'], dropna=False).last().reset_index()
    
    # For systems without telemetry data, fill missing values with 0
    for col in ['avail', 'used', 'snap', 'ratio']:
        df_latest[col] = df_latest[col].fillna(0)
    
    # Set unit_id: if "pool" is missing, use only hostid; otherwise hostid-pool
    df_latest["unit_id"] = df_latest.apply(
        lambda row: f"{row['hostid']}-{row['pool']}" if pd.notnull(row['pool']) else str(row['hostid']),
        axis=1
    )
    
    # Set "name" using the hostname from companies data
    df_latest["name"] = df_latest["hostname"]
    
    # Set the "type" field based on the version, if available
    df_latest["type"] = df_latest['version'].apply(
        lambda x: f"AiRE {'.'.join(x.split('.')[:2])}" if pd.notnull(x) else None
    )
    
    # Calculate total space and percentage fields (if telemetry data exists)
    df_latest["total_space"] = df_latest["avail"] + df_latest["used"]
    df_latest["used_over_total"] = df_latest.apply(
        lambda row: row["used"] / row["total_space"] if row["total_space"] > 0 else 0,
        axis=1
    )
    df_latest["snap_over_total"] = df_latest.apply(
        lambda row: row["snap"] / row["total_space"] if row["total_space"] > 0 else 0,
        axis=1
    )
    df_latest["perc_used"] = df_latest["used_over_total"].apply(lambda x: utils.set_to_percentage(x))
    df_latest["perc_snap"] = df_latest["snap_over_total"].apply(lambda x: utils.set_to_percentage(x))
    
    # Convert byte values to gigabytes
    df_latest["avail"] = df_latest["avail"].apply(lambda x: utils.byte_to_giga(x))
    df_latest["used"] = df_latest["used"].apply(lambda x: utils.byte_to_giga(x))
    df_latest["used_snap"] = df_latest["snap"].apply(lambda x: utils.byte_to_giga(x))
    
    # Process last_date (from companies data) to determine if telemetry is currently being sent
    df_latest["last_date"] = pd.to_datetime(df_latest["last_date"], errors='coerce')
    is_sending = (pd.Timestamp.now() - df_latest["last_date"]) <= pd.Timedelta(hours=MAX_TIMEFRAME_HOURS)
    df_latest["sending_telemetry"] = is_sending.fillna(False).map({True: "True", False: "False"})
    
    # Merge in the average time information
    df_latest = pd.merge(df_latest, avg_times, on=['hostid', 'pool'], how='left')
    df_latest["avg_speed"] = df_latest["avg_time"]
    
    # Placeholder for the "MUP" field
    df_latest["MUP"] = pd.NA
    
    # Format "first_date" and "last_date" fields as strings
    df_latest["first_date"] = pd.to_datetime(df_latest["first_date"], errors='coerce').dt.strftime('%Y-%m-%d %H:%M:%S')
    df_latest["last_date"] = df_latest["last_date"].dt.strftime('%Y-%m-%d %H:%M:%S')
    
    # Reorder columns according to the specified schema
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
            "used_snap"
        ]
    ]
    
    return df_final
