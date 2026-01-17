import os
import logging
from datetime import datetime

# Configure Logging
LOG_FILE_PATH = os.environ.get('LOG_FILE_PATH', '/tmp/perix_monitor.log')
ENABLE_FILE_LOGGING = os.environ.get('ENABLE_FILE_LOGGING', 'False').lower() == 'true'

logger = logging.getLogger("perix_monitor")
logger.setLevel(logging.DEBUG)

# Console Handler
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)
logger.addHandler(ch)

# File Handler (Optional via Flag)
if ENABLE_FILE_LOGGING:
    # Ensure directory exists if not in /tmp
    log_dir = os.path.dirname(LOG_FILE_PATH)
    if log_dir and not os.path.exists(log_dir):
        try:
            os.makedirs(log_dir)
        except Exception as e:
            print(f"Failed to create log dir: {e}")

    fh = logging.FileHandler(LOG_FILE_PATH)
    fh.setLevel(logging.DEBUG) # Detail log in file
    file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    fh.setFormatter(file_formatter)
    logger.addHandler(fh)

def log_ingestion_start(filename):
    logger.info(f"STARTED Ingestion for file: {filename}")

def log_ingestion_item(isin, status, details):
    """
    Log every ISIN processing step during ingestion.
    """
    if ENABLE_FILE_LOGGING:
        logger.debug(f"INGESTION ROW: ISIN={isin} STATUS={status} DETAILS={details}")

def log_ingestion_summary(total_rows, delta_count, missing_count):
    logger.info(f"COMPLETED Ingestion. Total={total_rows}, Updates={delta_count}, Missing={missing_count}")

def log_final_state(all_isins):
    """
    Log all ISINs stored in DB at the end of process.
    """
    if ENABLE_FILE_LOGGING:
        logger.info("FINAL DB STATE DUMP:")
        for item in all_isins:
            logger.info(f"DB_DUMP: {item}")
