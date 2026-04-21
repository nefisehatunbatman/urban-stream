import logging
import schedule
import time
from internal.config.config import Config
from internal.analysis.density_analysis import run_density_analysis
from internal.analysis.violations_analysis import run_violations_analysis
from internal.analysis.traffic_analysis import run_traffic_analysis
from internal.prediction.density_prediction import run_density_prediction, run_speed_prediction
from internal.prediction.violations_prediction import run_violations_prediction
from internal.prediction.traffic_prediction import run_traffic_prediction

logger = logging.getLogger(__name__)


def run_all():
    """Tüm analiz ve tahminleri sırayla çalıştırır"""
    logger.info("=" * 50)
    logger.info("Günlük analiz ve tahmin döngüsü başlıyor...")
    logger.info("=" * 50)

    try:
        # 1. Analizler
        run_density_analysis()
        run_violations_analysis()
        run_traffic_analysis()

        # 2. Tahminler
        run_density_prediction()
        run_speed_prediction()
        run_violations_prediction()
        run_traffic_prediction()

        logger.info("Tüm işlemler tamamlandı")

    except Exception as e:
        logger.error(f"Analiz/tahmin hatası: {e}", exc_info=True)


def start_scheduler():
    """Scheduler'ı başlatır — her gece Config'de belirtilen saatte çalışır"""

    # İlk çalışmada hemen bir kez çalıştır
    logger.info("İlk çalışma başlatılıyor...")
    run_all()

    # Sonrasında her gece belirtilen saatte çalıştır
    schedule_time = f"{Config.SCHEDULER_HOUR:02d}:{Config.SCHEDULER_MINUTE:02d}"
    schedule.every().day.at(schedule_time).do(run_all)

    logger.info(f"Scheduler kuruldu: her gece {schedule_time}'de çalışacak")

    while True:
        schedule.run_pending()
        time.sleep(60)