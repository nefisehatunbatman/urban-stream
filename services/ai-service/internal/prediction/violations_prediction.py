import logging
import pandas as pd
from prophet import Prophet
from internal.repository.clickhouse_reader import read_speed_violations
from internal.repository.clickhouse_writer import write_predictions
from internal.config.config import Config

logger = logging.getLogger(__name__)


def run_violations_prediction():
    """
    Prophet ile saatlik hız ihlali tahmini:
    - Saatlik ihlal sayısını okur
    - 14 günlük (336 saatlik) tahmin üretir
    """
    logger.info("Hız ihlali tahmini başlıyor...")

    df = read_speed_violations()
    if df.empty or len(df) < 48:
        logger.warning("Yeterli hız ihlali verisi yok (min 48 saat), tahmin atlanıyor")
        return

    prophet_df = df[["ds", "violation_count"]].rename(columns={"violation_count": "y"})
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])

    model = Prophet(
        weekly_seasonality=True,
        daily_seasonality=True,
        yearly_seasonality=False,
        interval_width=0.95,
    )
    model.fit(prophet_df)

    # 3 saatlik granülarite: her gün 8 nokta (00:00, 03:00, 06:00, ..., 21:00)
    future = model.make_future_dataframe(
        periods=Config.FORECAST_DAYS * 8,
        freq="3h"
    )
    forecast = model.predict(future)

    last_date = prophet_df["ds"].max()
    future_forecast = forecast[forecast["ds"] > last_date][["ds", "yhat", "yhat_lower", "yhat_upper"]].copy()
    # Sadece 3'e bölünen saatleri tut (00, 03, 06, 09, 12, 15, 18, 21)
    future_forecast = future_forecast[future_forecast["ds"].dt.hour % 3 == 0].copy()

    # Negatif tahmin olmamalı
    future_forecast["yhat"] = future_forecast["yhat"].clip(lower=0)
    future_forecast["yhat_lower"] = future_forecast["yhat_lower"].clip(lower=0)

    write_predictions(future_forecast, channel="speed_violations", metric="violation_count")
    logger.info(f"Hız ihlali tahmini tamamlandı: {len(future_forecast)} nokta (3 saatlik)")