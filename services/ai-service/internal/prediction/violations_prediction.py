import logging

from internal.prediction.forecast_engine import build_forecast
from internal.repository.clickhouse_reader import read_speed_violations
from internal.repository.clickhouse_writer import write_predictions

logger = logging.getLogger(__name__)


def run_violations_prediction():
    """Create 14 days of 3-hour speed violation forecasts."""
    logger.info("Speed violation forecast started")

    forecast = build_forecast(read_speed_violations(), "violation_count", lower_bound=0)
    if forecast.empty:
        return

    write_predictions(forecast, channel="speed_violations", metric="violation_count")
    logger.info("Speed violation forecast finished: %s points", len(forecast))
