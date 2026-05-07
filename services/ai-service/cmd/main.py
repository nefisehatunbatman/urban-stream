import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from internal.config.config import Config
from internal.repository.clickhouse_writer import create_tables
from scheduler import start_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)


def main():
    logger.info("AI Service starting")
    logger.info("ClickHouse: %s:%s", Config.CLICKHOUSE_HOST, Config.CLICKHOUSE_PORT)
    logger.info("History window: %s days", Config.HISTORY_DAYS)
    logger.info("Forecast window: %s days", Config.FORECAST_DAYS)

    create_tables()

    # Startup fake data generation was removed. Forecasts now use only incoming data.
    start_scheduler()


if __name__ == "__main__":
    main()
