import logging

import pandas as pd
from clickhouse_driver import Client

from internal.config.config import Config

logger = logging.getLogger(__name__)


def get_client() -> Client:
    return Client(
        host=Config.CLICKHOUSE_HOST,
        port=Config.CLICKHOUSE_PORT,
        user=Config.CLICKHOUSE_USER,
        password=Config.CLICKHOUSE_PASSWORD,
        database=Config.CLICKHOUSE_DB,
    )


def create_tables():
    """Create AI output tables."""
    client = get_client()

    _create_predictions_table(client)
    _ensure_prediction_datetime_schema(client)

    client.execute(
        """
        CREATE TABLE IF NOT EXISTS hourly_analysis (
            id           UUID DEFAULT generateUUIDv4(),
            day_of_week  Int32,
            hour         Int32,
            avg_vehicles Float64,
            created_at   DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (day_of_week, hour)
        """
    )

    client.execute(
        """
        CREATE TABLE IF NOT EXISTS analysis_reports (
            id          UUID DEFAULT generateUUIDv4(),
            channel     String,
            metric      String,
            value       Float64,
            label       String,
            created_at  DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (channel, metric, created_at)
        """
    )

    logger.info("AI tables are ready")


def _create_predictions_table(client: Client):
    client.execute(
        """
        CREATE TABLE IF NOT EXISTS predictions (
            id          UUID DEFAULT generateUUIDv4(),
            channel     String,
            ds          DateTime,
            yhat        Float64,
            yhat_lower  Float64,
            yhat_upper  Float64,
            metric      String,
            created_at  DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (channel, metric, ds)
        TTL created_at + INTERVAL 30 DAY
        """
    )


def _ensure_prediction_datetime_schema(client: Client):
    rows = client.execute(
        """
        SELECT type
        FROM system.columns
        WHERE database = currentDatabase()
          AND table = 'predictions'
          AND name = 'ds'
        """
    )
    if not rows:
        return

    ds_type = rows[0][0]
    if ds_type == "DateTime":
        return

    if ds_type == "Date":
        backup_name = f"predictions_legacy_{pd.Timestamp.utcnow().strftime('%Y%m%d%H%M%S')}"
        logger.warning(
            "Old predictions.ds Date schema detected; backing up as %s and creating DateTime table",
            backup_name,
        )
        client.execute(f"RENAME TABLE predictions TO {backup_name}")
        _create_predictions_table(client)
        return

    try:
        client.execute("ALTER TABLE predictions MODIFY COLUMN ds DateTime")
    except Exception as exc:
        logger.warning("predictions.ds DateTime migration skipped: %s", exc)


def write_predictions(df: pd.DataFrame, channel: str, metric: str):
    """Replace the current forecast batch for one channel/metric."""
    if df.empty:
        logger.warning("No forecast rows to write: %s / %s", channel, metric)
        return

    client = get_client()
    batch_created_at = pd.Timestamp.utcnow().to_pydatetime().replace(tzinfo=None)

    client.execute(
        """
        ALTER TABLE predictions
        DELETE WHERE channel = %(channel)s AND metric = %(metric)s
        """,
        {"channel": channel, "metric": metric},
    )

    rows = []
    for _, row in df.iterrows():
        rows.append(
            {
                "channel": channel,
                "ds": pd.Timestamp(row["ds"]).to_pydatetime(),
                "yhat": float(row["yhat"]),
                "yhat_lower": float(row["yhat_lower"]),
                "yhat_upper": float(row["yhat_upper"]),
                "metric": metric,
                "created_at": batch_created_at,
            }
        )

    client.execute(
        """
        INSERT INTO predictions
        (channel, ds, yhat, yhat_lower, yhat_upper, metric, created_at)
        VALUES
        """,
        rows,
    )
    logger.info("Forecast written: %s / %s -> %s rows", channel, metric, len(rows))


def write_hourly_analysis(df: pd.DataFrame):
    """Write hourly density analysis."""
    client = get_client()

    client.execute("ALTER TABLE hourly_analysis DELETE WHERE 1=1")

    rows = []
    for _, row in df.iterrows():
        rows.append(
            {
                "day_of_week": int(row["day_of_week"]),
                "hour": int(row["hour"]),
                "avg_vehicles": float(row["avg_vehicles"]),
            }
        )

    if rows:
        client.execute(
            """
            INSERT INTO hourly_analysis
            (day_of_week, hour, avg_vehicles)
            VALUES
            """,
            rows,
        )
        logger.info("Hourly analysis written: %s rows", len(rows))


def write_analysis_report(channel: str, metric: str, value: float, label: str):
    """Write one analysis report row."""
    client = get_client()

    client.execute(
        """
        INSERT INTO analysis_reports (channel, metric, value, label)
        VALUES
        """,
        [{"channel": channel, "metric": metric, "value": value, "label": label}],
    )
