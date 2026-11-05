# Plain-text email over SMTP (settings in .env).

import logging
import smtplib
from email.message import EmailMessage

from app.config import get_settings

log = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> None:
    s = get_settings()
    if not s.smtp_host:
        log.warning("SMTP_HOST is not set, so an email was not sent")
        return
    msg = EmailMessage()
    msg["From"] = s.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    smtp_class = smtplib.SMTP_SSL if s.smtp_security == "ssl" else smtplib.SMTP
    try:
        with smtp_class(s.smtp_host, s.smtp_port, timeout=15) as smtp:
            if s.smtp_security == "starttls":
                smtp.starttls()
            if s.smtp_username:
                smtp.login(s.smtp_username, s.smtp_password)
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as e:
        # Never log the message body: it contains a one-time link.
        log.error("Could not send email: %s", type(e).__name__)
