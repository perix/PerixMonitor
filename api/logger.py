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

class ConditionalFileFilter(logging.Filter):
    def filter(self, record):
        # 1. ALWAYS log WARNING and ERROR
        if record.levelno >= logging.WARNING:
            return True
            
        # 2. If Global Logging is ENABLED, log everything
        if ENABLE_FILE_LOGGING:
            return True
        
        # 3. If Disabled, ONLY log "Macroscopic" events
        # We identify them by prefixes (Tags)
        msg = record.getMessage()
        
        # Macroscopic Tags List
        macro_tags = [
            "[AUDIT]", 
            "[SYSTEM]", 
            "[STARTUP]", 
            "[DASHBOARD_SUMMARY]", 
            "[DASHBOARD_HISTORY]",
            "[SYNC]",
            "[RESET_DB]",
            "[SYSTEM_RESET]"
        ]
        
        # Exception: We specifically EXCLUDE detailed diagnostics even if they look like tags, 
        # unless they are in the macro list. 
        # For example [MWR_DIAG] is very verbose, so we exclude it by omission from macro_tags.
        
        for tag in macro_tags:
            if msg.startswith(tag):
                return True
                
        return False

def _ensure_file_handler():
    """Ensure the file handler exists and has the filter attached."""
    global logger
    
    # Check if exists
    for h in logger.handlers:
        if isinstance(h, logging.FileHandler):
            return h

    # Create if missing
    try:
        log_dir = os.path.dirname(LOG_FILE_PATH)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir)

        fh = logging.FileHandler(LOG_FILE_PATH, encoding='utf-8')
        fh.setLevel(logging.DEBUG) # We capture all, filter decides
        
        # Attach Filter
        fh.addFilter(ConditionalFileFilter())
        
        file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        fh.setFormatter(file_formatter)
        logger.addHandler(fh)
        return fh
    except Exception as e:
        print(f"Failed to create file logger: {e}") # Fallback to stdout
        return None

def configure_file_logging(enabled: bool):
    """
    Dynamically enable or disable DETAILED file logging.
    Macroscopic logs and Warnings/Errors are always enabled via Filter.
    """
    global ENABLE_FILE_LOGGING
    
    # Update state
    if enabled != ENABLE_FILE_LOGGING:
        ENABLE_FILE_LOGGING = enabled
        status = "ENABLED" if enabled else "DISABLED"
        logger.info(f"[SYSTEM] Detailed file logging {status} dynamically.")
    
    # Ensure handler is always present
    _ensure_file_handler()

# Initialize Handler (It will default to Disabled restricted mode if env var is False)
_ensure_file_handler()

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

