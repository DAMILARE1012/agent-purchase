"""
Sending email over SMTP. The sandbox sends to Mailpit (every email appears at
http://localhost:8025); production points SMTP_* at Gmail or a transactional
mail service (see .env.example).
"""

import smtplib
from email.message import EmailMessage

from app.config import get_settings
from app.errors import ApiError


def configured() -> bool:
    return bool(get_settings().smtp_host)


def send(to: str, subject: str, text: str, html: str | None = None) -> None:
    s = get_settings()
    if not s.smtp_host:
        raise ApiError(503, "email_unavailable", "Email isn't set up on this platform. Use your passkey instead.")
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = s.mail_from, to, subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        client = smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, timeout=10) if s.smtp_ssl else smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=10)
        with client:
            if s.smtp_starttls and not s.smtp_ssl:
                client.starttls()
            if s.smtp_username:
                client.login(s.smtp_username, s.smtp_password)
            client.send_message(msg)
    except (OSError, smtplib.SMTPException) as exc:
        raise ApiError(503, "email_unavailable", "We couldn't send the email just now. Try again, or use your passkey.") from exc
