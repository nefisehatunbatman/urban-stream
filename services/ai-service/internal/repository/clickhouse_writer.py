from clickhouse_driver import Client
from internal.config.config import Config
import pandas as pd
import logging

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
    """Tahmin ve analiz tablolarını oluşturur"""
    client = get_client()

    # Tahmin sonuçları tablosu
    client.execute("""
        CREATE TABLE IF NOT EXISTS predictions (
            id          UUID DEFAULT generateUUIDv4(),
            channel     String,
            ds          Date,
            yhat        Float64,
            yhat_lower  Float64,
            yhat_upper  Float64,
            metric      String,
            created_at  DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (channel, ds, metric)
    """)

    # Saatlik yoğunluk analizi tablosu
    client.execute("""
        CREATE TABLE IF NOT EXISTS hourly_analysis (
            id           UUID DEFAULT generateUUIDv4(),
            day_of_week  Int32,
            hour         Int32,
            avg_vehicles Float64,
            created_at   DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (day_of_week, hour)
    """)

    # Genel analiz raporu tablosu
    client.execute("""
        CREATE TABLE IF NOT EXISTS analysis_reports (
            id          UUID DEFAULT generateUUIDv4(),
            channel     String,
            metric      String,
            value       Float64,
            label       String,
            created_at  DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (channel, metric, created_at)
    """)

    logger.info("Tablolar oluşturuldu")


def write_predictions(df: pd.DataFrame, channel: str, metric: str):
    """Tahmin sonuçlarını ClickHouse'a yazar"""
    client = get_client()

    # Önce bu kanal + metric için eski tahminleri sil
    client.execute(
        "ALTER TABLE predictions DELETE WHERE channel = %(channel)s AND metric = %(metric)s",
        {"channel": channel, "metric": metric},
    )

    rows = []
    for _, row in df.iterrows():
        rows.append({
            "channel": channel,
            "ds": row["ds"],
            "yhat": float(row["yhat"]),
            "yhat_lower": float(row["yhat_lower"]),
            "yhat_upper": float(row["yhat_upper"]),
            "metric": metric,
        })

    if rows:
        client.execute(
            """
            INSERT INTO predictions
            (channel, ds, yhat, yhat_lower, yhat_upper, metric)
            VALUES
            """,
            rows,
        )
        logger.info(f"Tahmin yazıldı: {channel} / {metric} → {len(rows)} satır")


def write_hourly_analysis(df: pd.DataFrame):
    """Saatlik yoğunluk analizini ClickHouse'a yazar"""
    client = get_client()

    client.execute("ALTER TABLE hourly_analysis DELETE WHERE 1=1")

    rows = []
    for _, row in df.iterrows():
        rows.append({
            "day_of_week": int(row["day_of_week"]),
            "hour": int(row["hour"]),
            "avg_vehicles": float(row["avg_vehicles"]),
        })

    if rows:
        client.execute(
            """
            INSERT INTO hourly_analysis
            (day_of_week, hour, avg_vehicles)
            VALUES
            """,
            rows,
        )
        logger.info(f"Saatlik analiz yazıldı: {len(rows)} satır")


def write_analysis_report(channel: str, metric: str, value: float, label: str):
    """Analiz raporu yazar"""
    client = get_client()

    client.execute(
        """
        INSERT INTO analysis_reports (channel, metric, value, label)
        VALUES
        """,
        [{"channel": channel, "metric": metric, "value": value, "label": label}],
    )