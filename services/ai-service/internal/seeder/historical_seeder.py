import logging
import random
import math
from datetime import datetime, timedelta
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


def seed_historical_data(days: int = 30):
    """
    Son 30 günlük fake geçmiş veri üretir.
    Prophet'in anlamlı tahmin yapabilmesi için gerekli.
    """
    client = get_client()

    # Zaten veri varsa seed etme
    result = client.execute("SELECT count() FROM density")[0][0]
    if result > 10000:
        logger.info(f"Zaten {result} satır density verisi var, seed atlanıyor")
        return

    logger.info(f"Son {days} günlük geçmiş veri üretiliyor...")

    now = datetime.utcnow()
    density_rows = []
    violations_rows = []
    traffic_rows = []

    zones = ["Zone-A", "Zone-B", "Zone-C", "Zone-D"]
    directions = ["North", "South", "East", "West", "North-East"]

    for day_offset in range(days, 0, -1):
        day = now - timedelta(days=day_offset)

        # Her gün için 24 saat, her saat için birkaç kayıt
        for hour in range(24):
            timestamp = day.replace(hour=hour, minute=0, second=0)

            # Sabah ve akşam rush hour simülasyonu
            # Saat 8-9 ve 17-18 arası yoğun
            rush_factor = 1.0
            if 7 <= hour <= 9 or 16 <= hour <= 18:
                rush_factor = 2.0
            elif 0 <= hour <= 5:
                rush_factor = 0.3

            # Hafta sonu daha az yoğun
            weekday = timestamp.weekday()
            if weekday >= 5:
                rush_factor *= 0.6

            # Her saat için 10 kayıt
            for _ in range(10):
                buses = random.randint(0, int(10 * rush_factor))
                bikes = random.randint(0, int(30 * rush_factor))
                cars = random.randint(0, int(200 * rush_factor))
                total = buses + bikes + cars

                density_ratio = total / 250.0
                speed = max(5.0, 50.0 * (1 - density_ratio) + random.uniform(-5, 5))

                density_rows.append({
                    "zone_id": random.choice(zones),
                    "vehicle_count": total,
                    "pedestrian_count": random.randint(0, int(100 * rush_factor)),
                    "avg_speed": round(speed, 2),
                    "bus": buses,
                    "car": cars,
                    "bike": bikes,
                    "lat": 37.850 + random.random() * 0.050,
                    "lng": 32.450 + random.random() * 0.050,
                    "timestamp": timestamp,
                    "created_at": timestamp,
                })

                # Hız ihlalleri — rush hour'da daha fazla
                if random.random() < 0.3 * rush_factor:
                    limit = 82
                    speed_val = limit + random.randint(1, 50)
                    violations_rows.append({
                        "vehicle_id": f"42-ABC-{random.randint(0, 999):03d}",
                        "speed": float(speed_val),
                        "speed_limit": float(limit),
                        "lane_id": random.randint(1, 4),
                        "direction": random.choice(directions),
                        "lat": 37.850 + random.random() * 0.050,
                        "lng": 32.450 + random.random() * 0.050,
                        "created_at": timestamp,
                    })

                # Trafik lambası
                is_malfunction = random.random() < 0.05
                statuses = ["red", "green", "yellow"]
                traffic_rows.append({
                    "lamp_id": f"TL-{random.randint(0, 999):03d}",
                    "status": random.choice(statuses),
                    "timing_remains": random.randint(3, 60),
                    "is_malfunctioning": 1 if is_malfunction else 0,
                    "intersection_id": f"INT-{random.randint(0, 250):03d}",
                    "lat": 37.850 + random.random() * 0.050,
                    "lng": 32.450 + random.random() * 0.050,
                    "created_at": timestamp,
                })

    # Toplu insert
    logger.info(f"Density: {len(density_rows)} satır yazılıyor...")
    client.execute(
        """
        INSERT INTO density
        (zone_id, vehicle_count, pedestrian_count, avg_speed, bus, car, bike, lat, lng, timestamp, created_at)
        VALUES
        """,
        density_rows,
    )

    logger.info(f"Speed violations: {len(violations_rows)} satır yazılıyor...")
    client.execute(
        """
        INSERT INTO speed_violations
        (vehicle_id, speed, speed_limit, lane_id, direction, lat, lng, created_at)
        VALUES
        """,
        violations_rows,
    )

    logger.info(f"Traffic lights: {len(traffic_rows)} satır yazılıyor...")
    client.execute(
        """
        INSERT INTO traffic_lights
        (lamp_id, status, timing_remains, is_malfunctioning, intersection_id, lat, lng, created_at)
        VALUES
        """,
        traffic_rows,
    )

    logger.info("Geçmiş veri seed işlemi tamamlandı")