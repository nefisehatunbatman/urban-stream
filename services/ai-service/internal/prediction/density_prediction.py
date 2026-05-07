import logging

from internal.prediction.forecast_engine import build_forecast
from internal.repository.clickhouse_reader import read_density
from internal.repository.clickhouse_writer import write_predictions

logger = logging.getLogger(__name__)


def run_density_prediction():
    """Create 14 days of 3-hour vehicle density forecasts."""
    logger.info("Density forecast started")

    forecast = build_forecast(read_density(), "avg_vehicles", lower_bound=0)
    if forecast.empty:
        return

    write_predictions(forecast, channel="density", metric="avg_vehicles")
    logger.info("Density forecast finished: %s points", len(forecast))


def run_speed_prediction():
    """Create 14 days of 3-hour average speed forecasts."""
    logger.info("Speed forecast started")

    forecast = build_forecast(read_density(), "avg_speed", lower_bound=0)
    if forecast.empty:
        return

    write_predictions(forecast, channel="density", metric="avg_speed")
    logger.info("Speed forecast finished: %s points", len(forecast))
