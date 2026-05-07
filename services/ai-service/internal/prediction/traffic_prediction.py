import logging

from internal.prediction.forecast_engine import build_forecast
from internal.repository.clickhouse_reader import read_traffic_lights
from internal.repository.clickhouse_writer import write_predictions

logger = logging.getLogger(__name__)


def run_traffic_prediction():
    """Create 14 days of 3-hour traffic light malfunction forecasts."""
    logger.info("Traffic light forecast started")

    forecast = build_forecast(
        read_traffic_lights(),
        "malfunction_rate",
        lower_bound=0,
        upper_bound=1,
    )
    if forecast.empty:
        return

    write_predictions(forecast, channel="traffic_lights", metric="malfunction_rate")
    logger.info("Traffic light forecast finished: %s points", len(forecast))
