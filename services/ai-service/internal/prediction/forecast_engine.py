import logging
from datetime import datetime, time, timedelta

import numpy as np
import pandas as pd
from prophet import Prophet

from internal.config.config import Config

logger = logging.getLogger(__name__)

FORECAST_HOURS = (0, 3, 6, 9, 12, 15, 18, 21)


def build_forecast(
    source: pd.DataFrame,
    value_column: str,
    *,
    forecast_days: int = Config.FORECAST_DAYS,
    lower_bound: float = 0.0,
    upper_bound: float | None = None,
) -> pd.DataFrame:
    """
    Builds exactly 8 forecast points per day for the next 14 days.

    Prophet is the primary AI/ML forecasting model. If the incoming data is too
    sparse or Prophet fails, a seasonal statistical baseline is used as fallback
    so the dashboard does not go empty.
    """
    prophet_forecast = build_prophet_forecast(
        source,
        value_column,
        forecast_days=forecast_days,
        lower_bound=lower_bound,
        upper_bound=upper_bound,
    )
    if not prophet_forecast.empty:
        return prophet_forecast

    logger.warning("Falling back to seasonal baseline for column: %s", value_column)
    return build_baseline_forecast(
        source,
        value_column,
        forecast_days=forecast_days,
        lower_bound=lower_bound,
        upper_bound=upper_bound,
    )


def prepare_history(source: pd.DataFrame, value_column: str) -> pd.DataFrame:
    if source.empty or "ds" not in source.columns or value_column not in source.columns:
        logger.warning("No source data for forecast column: %s", value_column)
        return empty_forecast()

    history = source[["ds", value_column]].rename(columns={value_column: "y"}).copy()
    history["ds"] = pd.to_datetime(history["ds"], errors="coerce")
    history["y"] = pd.to_numeric(history["y"], errors="coerce")
    history = history.dropna(subset=["ds", "y"]).sort_values("ds")

    if history.empty:
        logger.warning("No clean source data for forecast column: %s", value_column)
        return empty_forecast()

    return history


def build_prophet_forecast(
    source: pd.DataFrame,
    value_column: str,
    *,
    forecast_days: int,
    lower_bound: float,
    upper_bound: float | None,
) -> pd.DataFrame:
    history = prepare_history(source, value_column)
    if history.empty:
        return empty_forecast()

    if len(history) < 24 or history["ds"].nunique() < 12:
        logger.warning("Not enough data for Prophet forecast column: %s", value_column)
        return empty_forecast()

    prophet_df = history[["ds", "y"]].copy()

    try:
        model = Prophet(
            yearly_seasonality=False,
            weekly_seasonality=True,
            daily_seasonality=True,
            interval_width=0.95,
        )
        model.fit(prophet_df)

        future = pd.DataFrame({"ds": forecast_timestamps(forecast_days)})
        forecast = model.predict(future)[["ds", "yhat", "yhat_lower", "yhat_upper"]].copy()
        forecast["yhat"] = forecast["yhat"].apply(lambda v: clamp(float(v), lower_bound, upper_bound))
        forecast["yhat_lower"] = forecast["yhat_lower"].apply(lambda v: clamp(float(v), lower_bound, upper_bound))
        forecast["yhat_upper"] = forecast["yhat_upper"].apply(lambda v: clamp(float(v), lower_bound, upper_bound))
        logger.info("Prophet forecast generated for column: %s", value_column)
        return forecast
    except Exception as exc:
        logger.warning("Prophet forecast failed for column %s: %s", value_column, exc)
        return empty_forecast()


def build_baseline_forecast(
    source: pd.DataFrame,
    value_column: str,
    *,
    forecast_days: int,
    lower_bound: float,
    upper_bound: float | None,
) -> pd.DataFrame:
    history = prepare_history(source, value_column)
    if history.empty:
        return empty_forecast()

    history["hour"] = history["ds"].dt.hour
    history["day_of_week"] = history["ds"].dt.dayofweek

    global_mean = float(history["y"].mean())
    global_std = float(history["y"].std(ddof=0) or max(global_mean * 0.12, 1.0))
    slot_means = history.groupby(["day_of_week", "hour"])["y"].mean()
    hour_means = history.groupby("hour")["y"].mean()

    recent_cutoff = history["ds"].max() - pd.Timedelta(days=min(7, Config.HISTORY_DAYS))
    recent_mean = float(history.loc[history["ds"] >= recent_cutoff, "y"].mean())
    if np.isnan(recent_mean):
        recent_mean = global_mean

    level_adjustment = 0.25 * (recent_mean - global_mean)

    rows = []
    for ds in forecast_timestamps(forecast_days):
        baseline = slot_means.get((ds.weekday(), ds.hour), np.nan)
        if pd.isna(baseline):
            baseline = hour_means.get(ds.hour, np.nan)
        if pd.isna(baseline):
            baseline = global_mean

        yhat = float(baseline + level_adjustment)
        spread = max(global_std * 0.35, abs(yhat) * 0.08, 1.0)
        rows.append(
            {
                "ds": ds,
                "yhat": clamp(yhat, lower_bound, upper_bound),
                "yhat_lower": clamp(yhat - spread, lower_bound, upper_bound),
                "yhat_upper": clamp(yhat + spread, lower_bound, upper_bound),
            }
        )

    return pd.DataFrame(rows)


def forecast_timestamps(forecast_days: int) -> list[datetime]:
    start = datetime.combine(datetime.now().date() + timedelta(days=1), time.min)
    return [
        start + timedelta(days=day, hours=hour)
        for day in range(forecast_days)
        for hour in FORECAST_HOURS
    ]


def clamp(value: float, lower_bound: float, upper_bound: float | None) -> float:
    value = max(value, lower_bound)
    if upper_bound is not None:
        value = min(value, upper_bound)
    return value


def empty_forecast() -> pd.DataFrame:
    return pd.DataFrame(columns=["ds", "yhat", "yhat_lower", "yhat_upper"])
