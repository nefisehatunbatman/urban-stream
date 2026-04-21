import logging
from internal.repository.clickhouse_reader import read_speed_violations
from internal.repository.clickhouse_writer import write_analysis_report

logger = logging.getLogger(__name__)


def run_violations_analysis():
    """
    Hız ihlali analizi:
    - Günlük ortalama ihlal sayısı
    - En yüksek hız
    - Trend (artıyor mu azalıyor mu)
    """
    logger.info("Hız ihlali analizi başlıyor...")

    df = read_speed_violations()
    if df.empty:
        logger.warning("Hız ihlali verisi bulunamadı")
        return

    avg_violations = df["violation_count"].mean()
    max_violations = df["violation_count"].max()
    avg_speed = df["avg_speed"].mean()
    max_speed = df["max_speed"].max()

    write_analysis_report("speed_violations", "avg_daily_violations", avg_violations, "Günlük Ortalama İhlal")
    write_analysis_report("speed_violations", "max_daily_violations", max_violations, "Günlük Maksimum İhlal")
    write_analysis_report("speed_violations", "avg_violation_speed", avg_speed, "Ortalama İhlal Hızı")
    write_analysis_report("speed_violations", "max_speed_recorded", max_speed, "Kaydedilen En Yüksek Hız")

    # Trend analizi — son 7 gün vs önceki 7 gün
    if len(df) >= 14:
        recent = df.tail(7)["violation_count"].mean()
        previous = df.iloc[-14:-7]["violation_count"].mean()
        trend = ((recent - previous) / previous) * 100 if previous > 0 else 0

        write_analysis_report(
            "speed_violations",
            "weekly_trend",
            trend,
            f"Haftalık Trend: {'Artış' if trend > 0 else 'Düşüş'} %{abs(trend):.1f}"
        )
        logger.info(f"Haftalık trend: %{trend:.1f}")

    logger.info("Hız ihlali analizi tamamlandı")