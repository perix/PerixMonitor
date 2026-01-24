import os
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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

def send_password_reset_email(recipient_email, new_password):
    """
    Sends an email with the new password.
    Falls back to logging if SMTP is not configured.
    """
    subject = "[PerixMonitor] Reset Password"
    body = f"""
    Ciao,
    
    La tua password per PerixMonitor è stata resettata da un amministratore.
    
    Nuova password temporanea: {new_password}
    
    Per motivi di sicurezza, ti verrà chiesto di cambiare questa password al tuo prossimo accesso.
    
    Saluti,
    Team PerixMonitor
    """

    smtp_host = os.environ.get('SMTP_HOST')
    smtp_port = os.environ.get('SMTP_PORT')
    smtp_user = os.environ.get('SMTP_USER')
    smtp_pass = os.environ.get('SMTP_PASS')

    if not all([smtp_host, smtp_port, smtp_user, smtp_pass]):
        logger.warning("SMTP not fully configured. Logging email content instead.")
        logger.info(f"EMAIL SIMULATION to {recipient_email}:")
        logger.info(f"Subject: {subject}")
        logger.info(f"Body: {body}")
        # Also print to stdout for visibility
        print("="*60)
        print(f"📧 EMAIL SIMULATION (SMTP non configurato)")
        print(f"To: {recipient_email}")
        print(f"Subject: {subject}")
        print(f"Body: {body}")
        print("="*60)
        return True

    try:
        msg = MIMEMultipart()
        msg['From'] = smtp_user
        msg['To'] = recipient_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))

        server = smtplib.SMTP(smtp_host, int(smtp_port))
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        logger.info(f"Email successfully sent to {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {recipient_email}: {e}")
        return False

def clear_log_file():
    """
    Clear the log file content.
    Handles Windows file locking by closing the handler temporarily.
    """
    if ENABLE_FILE_LOGGING and LOG_FILE_PATH:
        try:
            # 1. Find and close the FileHandler
            file_handler = None
            for h in logger.handlers:
                if isinstance(h, logging.FileHandler):
                    file_handler = h
                    break
            
            if file_handler:
                file_handler.close()
                logger.removeHandler(file_handler)

            # 2. Truncate the file
            with open(LOG_FILE_PATH, 'w'):
                pass
            
            # 3. Restore the FileHandler
            if file_handler:
                # Re-create handler to reopen the file
                new_handler = logging.FileHandler(LOG_FILE_PATH)
                new_handler.setLevel(logging.DEBUG)
                new_handler.setFormatter(file_formatter)
                logger.addHandler(new_handler)
                
            logger.info("Log file cleared successfully.")
        except Exception as e:
            # Fallback log to console if file log fails
            print(f"Failed to clear log file: {e}")
