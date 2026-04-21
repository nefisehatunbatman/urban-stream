import logging
import sys
import os

# Python'un internal klasörü bulabilmesi için path ekle
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from internal.config.config import Config
from internal.repository.clickhouse_writer import create_tables
from internal.seeder.historical_seeder import seed_historical_data
from scheduler import start_scheduler

# Logging ayarla
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)


def main():
    logger.info("AI Service başlatılıyor...")
    logger.info(f"ClickHouse: {Config.CLICKHOUSE_HOST}:{Config.CLICKHOUSE_PORT}")
    logger.info(f"Geçmiş veri: {Config.HISTORY_DAYS} gün")
    logger.info(f"Tahmin: {Config.FORECAST_DAYS} gün")

    # 1. Tabloları oluştur
    create_tables()

    # 2. Geçmiş veri yoksa seed et
    seed_historical_data(days=Config.HISTORY_DAYS)

    # 3. Scheduler'ı başlat
    start_scheduler()


if __name__ == "__main__":
    main()