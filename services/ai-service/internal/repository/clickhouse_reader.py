from clickhouse_driver import Client
from internal.config.config import Config
import pandas as pd


def get_client() -> Client:
    return Client(
        host=Config.CLICKHOUSE_HOST,
        port=Config.CLICKHOUSE_PORT,
        user=Config.CLICKHOUSE_USER,
        password=Config.CLICKHOUSE_PASSWORD,
        database=Config.CLICKHOUSE_DB,
    )


def read_density(days: int = Config.HISTORY_DAYS) -> pd.DataFrame:
    """Son N günlük saatlik density verisini okur"""
    client = get_client()

    rows, columns = client.execute(
        f"""
        SELECT
            toStartOfHour(created_at)   AS ds,
            avg(vehicle_count)          AS avg_vehicles,
            avg(avg_speed)              AS avg_speed,
            avg(pedestrian_count)       AS avg_pedestrians,
            count()                     AS total_records
        FROM density
        WHERE created_at >= now() - INTERVAL {days} DAY
        GROUP BY ds
        ORDER BY ds
        """,
        with_column_types=True,
    )

    col_names = [col[0] for col in columns]
    return pd.DataFrame(rows, columns=col_names)


def read_speed_violations(days: int = Config.HISTORY_DAYS) -> pd.DataFrame:
    """Son N günlük saatlik speed_violations verisini okur"""
    client = get_client()

    rows, columns = client.execute(
        f"""
        SELECT
            toStartOfHour(created_at)   AS ds,
            count()                     AS violation_count,
            avg(speed)                  AS avg_speed,
            max(speed)                  AS max_speed
        FROM speed_violations
        WHERE created_at >= now() - INTERVAL {days} DAY
        GROUP BY ds
        ORDER BY ds
        """,
        with_column_types=True,
    )

    col_names = [col[0] for col in columns]
    return pd.DataFrame(rows, columns=col_names)


def read_traffic_lights(days: int = Config.HISTORY_DAYS) -> pd.DataFrame:
    """Son N günlük saatlik traffic_lights verisini okur"""
    client = get_client()

    rows, columns = client.execute(
        f"""
        SELECT
            toStartOfHour(created_at)                   AS ds,
            count()                                     AS total_count,
            countIf(is_malfunctioning = 1)              AS malfunction_count,
            countIf(is_malfunctioning = 1) / count()   AS malfunction_rate
        FROM traffic_lights
        WHERE created_at >= now() - INTERVAL {days} DAY
        GROUP BY ds
        ORDER BY ds
        """,
        with_column_types=True,
    )

    col_names = [col[0] for col in columns]
    return pd.DataFrame(rows, columns=col_names)


def read_hourly_density(days: int = Config.HISTORY_DAYS) -> pd.DataFrame:
    """Saatlik yoğunluk analizi için veri okur"""
    client = get_client()

    rows, columns = client.execute(
        f"""
        SELECT
            toDayOfWeek(created_at)  AS day_of_week,
            toHour(created_at)       AS hour,
            avg(vehicle_count)       AS avg_vehicles
        FROM density
        WHERE created_at >= now() - INTERVAL {days} DAY
        GROUP BY day_of_week, hour
        ORDER BY day_of_week, hour
        """,
        with_column_types=True,
    )

    col_names = [col[0] for col in columns]
    return pd.DataFrame(rows, columns=col_names)


def read_predictions(channel: str, metric: str) -> pd.DataFrame:
    """
    En son tahmin sonuçlarını okur.
    max(created_at) - 1 dakika toleransıyla en güncel batch'i çeker.
    Sadece 3'e bölünen saatler döner (00, 03, 06, 09, 12, 15, 18, 21).
    """
    client = get_client()

    rows, columns = client.execute(
        """
        SELECT ds, yhat, yhat_lower, yhat_upper
        FROM predictions
        WHERE channel = %(channel)s AND metric = %(metric)s
          AND created_at >= (
              SELECT max(created_at) - INTERVAL 1 MINUTE
              FROM predictions
              WHERE channel = %(channel)s AND metric = %(metric)s
          )
          AND toHour(ds) % 3 = 0
        ORDER BY ds
        """,
        {"channel": channel, "metric": metric},
        with_column_types=True,
    )

    col_names = [col[0] for col in columns]
    return pd.DataFrame(rows, columns=col_names)