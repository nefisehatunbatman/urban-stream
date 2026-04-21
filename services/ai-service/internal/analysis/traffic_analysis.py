import logging
from internal.repository.clickhouse_reader import read_traffic_lights
from internal.repository.clickhouse_writer import write_analysis_report

logger = logging.getLogger(__name__)


def run_traffic_analysis():
    """
    Trafik lambası analizi:
    - Arıza oranı
    - Günlük arıza trendi
    """
    logger.info("Trafik lambası analizi başlıyor...")

    df = read_traffic_lights()
    if df.empty:
        logger.warning("Trafik lambası verisi bulunamadı")
        return

    avg_malfunction_rate = df["malfunction_rate"].mean() * 100
    max_malfunction_rate = df["malfunction_rate"].max() * 100
    total_malfunctions = df["malfunction_count"].sum()

    write_analysis_report(
        "traffic_lights", "avg_malfunction_rate",
        avg_malfunction_rate, f"Ortalama Arıza Oranı: %{avg_malfunction_rate:.2f}"
    )
    write_analysis_report(
        "traffic_lights", "max_malfunction_rate",
        max_malfunction_rate, f"Maksimum Arıza Oranı: %{max_malfunction_rate:.2f}"
    )
    write_analysis_report(
        "traffic_lights", "total_malfunctions",
        float(total_malfunctions), f"Toplam Arıza: {total_malfunctions}"
    )

    logger.info(f"Ortalama arıza oranı: %{avg_malfunction_rate:.2f}")
    logger.info("Trafik lambası analizi tamamlandı")