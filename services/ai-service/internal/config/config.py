import os


class Config:
    CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "clickhouse")
    CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", "9000"))
    CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "default")
    CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "urban123")
    CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "default")

    # Kaç günlük geçmiş veri kullanılacak
    HISTORY_DAYS = int(os.getenv("HISTORY_DAYS", "30"))

    # Kaç günlük tahmin üretilecek
    FORECAST_DAYS = int(os.getenv("FORECAST_DAYS", "14"))

    # Scheduler her gece saat kaçta çalışacak
    SCHEDULER_HOUR = int(os.getenv("SCHEDULER_HOUR", "0"))
    SCHEDULER_MINUTE = int(os.getenv("SCHEDULER_MINUTE", "0"))