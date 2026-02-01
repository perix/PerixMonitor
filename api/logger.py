import os
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

# --- Configuration ---
LOG_FILE_PATH = os.environ.get('LOG_FILE_PATH', '/tmp/perix_monitor.log')
ENABLE_FILE_LOGGING = os.environ.get('ENABLE_FILE_LOGGING', 'False').lower() == 'true'

# Create Custom Logger
logger = logging.getLogger("perix_monitor")
logger.setLevel(logging.DEBUG)

# Console Handler (Standard Output)
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)
logger.addHandler(ch)

# --- File Logging Management ---

def _get_file_handler():
    """Helper to find existing file handler."""
    for h in logger.handlers:
        if isinstance(h, logging.FileHandler):
            return h
    return None

def configure_file_logging(enabled: bool):
    """
    Dynamically enable or disable file logging based on user config.
    """
    global ENABLE_FILE_LOGGING
    
    file_handler = _get_file_handler()
    
    if enabled:
        ENABLE_FILE_LOGGING = True
        if not file_handler:
            try:
                log_dir = os.path.dirname(LOG_FILE_PATH)
                if log_dir and not os.path.exists(log_dir):
                    os.makedirs(log_dir)

                fh = logging.FileHandler(LOG_FILE_PATH, encoding='utf-8')
                fh.setLevel(logging.DEBUG) # File gets everything (Audit + Debug)
                file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
                fh.setFormatter(file_formatter)
                logger.addHandler(fh)
                logger.info(f"[SYSTEM] File logging ENABLED dynamically.")
            except Exception as e:
                logger.error(f"[SYSTEM] Failed to enable file logging: {e}")
    else:
        ENABLE_FILE_LOGGING = False
        if file_handler:
            logger.info(f"[SYSTEM] File logging DISABLED dynamically.")
            file_handler.close()
            logger.removeHandler(file_handler)

# Verify initial state
if ENABLE_FILE_LOGGING:
    configure_file_logging(True)


# --- Audit & Helper Functions ---

def log_audit(event_type: str, details: str):
    """
    Log high-level audit events (INGESTION, SYNC, ADMIN actions).
    These are printed to Console (INFO) and File (if enabled).
    """
    msg = f"[AUDIT] {event_type.upper()} | {details}"
    logger.info(msg)

def log_ingestion_start(filename):
    log_audit("INGEST_START", f"File: {filename}")

def log_ingestion_summary(total_rows, delta_count, missing_count, extra=None):
    details = f"Rows processed: {total_rows}, Updates: {delta_count}, Missing: {missing_count}"
    if extra:
        details += f" | {extra}"
    log_audit("INGEST_END", details)

def clear_log_file():
    """
    Clear the log file content safely.
    """
    if ENABLE_FILE_LOGGING and LOG_FILE_PATH:
        try:
            file_handler = _get_file_handler()
            
            # Temporarily close handler to release lock
            if file_handler:
                file_handler.close()
                logger.removeHandler(file_handler)

            # Truncate
            with open(LOG_FILE_PATH, 'w', encoding='utf-8'):
                pass
            
            # Restore handler
            if file_handler:
                configure_file_logging(True)
                
            log_audit("SYSTEM", "Log file cleared manually.")
        except Exception as e:
            logger.error(f"Failed to clear log file: {e}")

# --- Email Notification ---

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
        # We use simple logger info here, not Audit, to avoid spamming Audit log with body
        logger.info(f"EMAIL SIMULATION to {recipient_email} | Subject: {subject}")
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
        log_audit("EMAIL_SENT", f"Password reset email sent to {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {recipient_email}: {e}")
        return False

