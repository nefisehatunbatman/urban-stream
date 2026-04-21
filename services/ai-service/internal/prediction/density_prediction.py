import logging
import pandas as pd
from prophet import Prophet
from internal.repository.clickhouse_reader import read_density
from internal.repository.clickhouse_writer import write_predictions
from internal.config.config import Config

logger = logging.getLogger(__name__)


def run_density_prediction():
    """
    Prophet ile yoğunluk tahmini:
    - Geçmiş araç yoğunluğunu okur
    - 14 günlük tahmin üretir
    - ClickHouse'a yazar
    """
    logger.info("Yoğunluk tahmini başlıyor...")

    df = read_density()
    if df.empty or len(df) < 7:
        logger.warning("Yeterli yoğunluk verisi yok, tahmin atlanıyor")
        return

    # Prophet formatı: ds (tarih) ve y (değer) kolonları zorunlu
    prophet_df = df[["ds", "avg_vehicles"]].rename(columns={"avg_vehicles": "y"})
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])

    model = Prophet(
        yearly_seasonality=False,   # 30 günlük veriyle yıllık pattern çıkmaz
        weekly_seasonality=True,    # Haftalık pattern önemli
        daily_seasonality=False,
        interval_width=0.95,        # %95 güven aralığı
    )
    model.fit(prophet_df)

    # Gelecek 14 günlük dataframe oluştur
    future = model.make_future_dataframe(periods=Config.FORECAST_DAYS)
    forecast = model.predict(future)

    # Sadece gelecek tahminleri al (geçmişi değil)
    last_date = prophet_df["ds"].max()
    future_forecast = forecast[forecast["ds"] > last_date][["ds", "yhat", "yhat_lower", "yhat_upper"]]
    future_forecast = future_forecast.copy()
    future_forecast["ds"] = future_forecast["ds"].dt.date

    write_predictions(future_forecast, channel="density", metric="avg_vehicles")
    logger.info(f"Yoğunluk tahmini tamamlandı: {len(future_forecast)} gün")


def run_speed_prediction():
    """Ortalama hız tahmini"""
    logger.info("Hız tahmini başlıyor...")

    df = read_density()
    if df.empty or len(df) < 7:
        logger.warning("Yeterli veri yok")
        return

    prophet_df = df[["ds", "avg_speed"]].rename(columns={"avg_speed": "y"})
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])

    model = Prophet(weekly_seasonality=True, yearly_seasonality=False, interval_width=0.95)
    model.fit(prophet_df)

    future = model.make_future_dataframe(periods=Config.FORECAST_DAYS)
    forecast = model.predict(future)

    last_date = prophet_df["ds"].max()
    future_forecast = forecast[forecast["ds"] > last_date][["ds", "yhat", "yhat_lower", "yhat_upper"]]
    future_forecast = future_forecast.copy()
    future_forecast["ds"] = future_forecast["ds"].dt.date

    write_predictions(future_forecast, channel="density", metric="avg_speed")
    logger.info(f"Hız tahmini tamamlandı: {len(future_forecast)} gün")