import logging
from internal.repository.clickhouse_reader import read_density, read_hourly_density
from internal.repository.clickhouse_writer import write_hourly_analysis, write_analysis_report

logger = logging.getLogger(__name__)


def run_density_analysis():
    """
    Yoğunluk analizi:
    - En yoğun saatleri tespit eder
    - En yoğun bölgeleri belirler
    - Saatlik pattern çıkarır
    """
    logger.info("Yoğunluk analizi başlıyor...")

    # Günlük özet veriyi oku
    df = read_density()
    if df.empty:
        logger.warning("Yoğunluk verisi bulunamadı")
        return

    # Genel istatistikler
    avg_vehicles = df["avg_vehicles"].mean()
    max_vehicles = df["avg_vehicles"].max()
    min_vehicles = df["avg_vehicles"].min()

    write_analysis_report("density", "avg_vehicles", avg_vehicles, "Ortalama Araç Sayısı")
    write_analysis_report("density", "max_vehicles", max_vehicles, "Maksimum Araç Sayısı")
    write_analysis_report("density", "min_vehicles", min_vehicles, "Minimum Araç Sayısı")

    # Saatlik pattern analizi
    hourly_df = read_hourly_density()
    if not hourly_df.empty:
        write_hourly_analysis(hourly_df)

        # En yoğun saat
        peak_row = hourly_df.loc[hourly_df["avg_vehicles"].idxmax()]
        peak_hour = int(peak_row["hour"])
        peak_vehicles = float(peak_row["avg_vehicles"])

        write_analysis_report(
            "density",
            "peak_hour",
            peak_hour,
            f"En Yoğun Saat: {peak_hour:02d}:00 ({peak_vehicles:.0f} araç)"
        )

        logger.info(f"En yoğun saat: {peak_hour:02d}:00 → {peak_vehicles:.0f} araç")

    logger.info("Yoğunluk analizi tamamlandı")