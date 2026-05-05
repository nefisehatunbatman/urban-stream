import logging
import pandas as pd
from prophet import Prophet
from internal.repository.clickhouse_reader import read_density
from internal.repository.clickhouse_writer import write_predictions
from internal.config.config import Config

logger = logging.getLogger(__name__)


def run_density_prediction():
    """
    Prophet ile saatlik yoğunluk tahmini:
    - Geçmiş saatlik araç yoğunluğunu okur
    - 14 günlük (336 saatlik) tahmin üretir
    - ClickHouse'a yazar
    """
    logger.info("Yoğunluk tahmini başlıyor...")

    df = read_density()
    if df.empty or len(df) < 48:
        logger.warning("Yeterli yoğunluk verisi yok (min 48 saat), tahmin atlanıyor")
        return

    prophet_df = df[["ds", "avg_vehicles"]].rename(columns={"avg_vehicles": "y"})
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])

    model = Prophet(
        yearly_seasonality=False,
        weekly_seasonality=True,   # Haftalık pattern (Pazartesi vs Cumartesi)
        daily_seasonality=True,    # Günlük pattern (rush hour vs gece)
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
    future_forecast["yhat"] = future_forecast["yhat"].clip(lower=0)
    future_forecast["yhat_lower"] = future_forecast["yhat_lower"].clip(lower=0)

    write_predictions(future_forecast, channel="density", metric="avg_vehicles")
    logger.info(f"Yoğunluk tahmini tamamlandı: {len(future_forecast)} nokta (3 saatlik)")


def run_speed_prediction():
    """Saatlik ortalama hız tahmini"""
    logger.info("Hız tahmini başlıyor...")

    df = read_density()
    if df.empty or len(df) < 48:
        logger.warning("Yeterli veri yok")
        return

    prophet_df = df[["ds", "avg_speed"]].rename(columns={"avg_speed": "y"})
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
    future_forecast["yhat"] = future_forecast["yhat"].clip(lower=0)
    future_forecast["yhat_lower"] = future_forecast["yhat_lower"].clip(lower=0)

    write_predictions(future_forecast, channel="density", metric="avg_speed")
    logger.info(f"Hız tahmini tamamlandı: {len(future_forecast)} nokta (3 saatlik)")