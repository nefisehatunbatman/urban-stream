import logging
import time

import schedule

from internal.analysis.density_analysis import run_density_analysis
from internal.analysis.traffic_analysis import run_traffic_analysis
from internal.analysis.violations_analysis import run_violations_analysis
from internal.config.config import Config
from internal.prediction.density_prediction import run_density_prediction, run_speed_prediction
from internal.prediction.traffic_prediction import run_traffic_prediction
from internal.prediction.violations_prediction import run_violations_prediction

logger = logging.getLogger(__name__)


def run_all():
    """Run daily analysis and forecast jobs."""
    logger.info("=" * 50)
    logger.info("Daily analysis and forecast cycle started")
    logger.info("=" * 50)

    try:
        run_density_analysis()
        run_violations_analysis()
        run_traffic_analysis()

        run_density_prediction()
        run_speed_prediction()
        run_violations_prediction()
        run_traffic_prediction()

        logger.info("Daily analysis and forecast cycle finished")

    except Exception as exc:
        logger.error("Analysis/forecast error: %s", exc, exc_info=True)


def start_scheduler():
    """Start the scheduler; forecasts are refreshed at the configured time."""
    schedule_time = f"{Config.SCHEDULER_HOUR:02d}:{Config.SCHEDULER_MINUTE:02d}"
    schedule.every().day.at(schedule_time).do(run_all)

    logger.info("Scheduler ready: daily at %s", schedule_time)

    if Config.RUN_ON_STARTUP:
        logger.info("Startup forecast refresh enabled; running once now")
        run_all()

    while True:
        schedule.run_pending()
        time.sleep(60)
