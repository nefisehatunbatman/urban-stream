import logging
import pandas as pd
from prophet import Prophet
from internal.repository.clickhouse_reader import read_speed_violations
from internal.repository.clickhouse_writer import write_predictions
from internal.config.config import Config

logger = logging.getLogger(__name__)


def run_violations_prediction():
    """
    Prophet ile hız ihlali tahmini:
    - Günlük ihlal sayısını okur
    - 14 günlük tahmin üretir
    """
    logger.info("Hız ihlali tahmini başlıyor...")

    df = read_speed_violations()
    if df.empty or len(df) < 7:
        logger.warning("Yeterli hız ihlali verisi yok, tahmin atlanıyor")
        return

    prophet_df = df[["ds", "violation_count"]].rename(columns={"violation_count": "y"})
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])

    model = Prophet(
        weekly_seasonality=True,
        yearly_seasonality=False,
        interval_width=0.95,
    )
    model.fit(prophet_df)

    future = model.make_future_dataframe(periods=Config.FORECAST_DAYS)
    forecast = model.predict(future)

    last_date = prophet_df["ds"].max()
    future_forecast = forecast[forecast["ds"] > last_date][["ds", "yhat", "yhat_lower", "yhat_upper"]]
    future_forecast = future_forecast.copy()
    future_forecast["ds"] = future_forecast["ds"].dt.date

    # Negatif tahmin olmamalı
    future_forecast["yhat"] = future_forecast["yhat"].clip(lower=0)
    future_forecast["yhat_lower"] = future_forecast["yhat_lower"].clip(lower=0)

    write_predictions(future_forecast, channel="speed_violations", metric="violation_count")
    logger.info(f"Hız ihlali tahmini tamamlandı: {len(future_forecast)} gün")