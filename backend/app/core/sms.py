import os
import re


def _normalize_phone(phone: str) -> str:
    """Ensure the number is in E.164 format. Adds +1 (Canada/US) if no country code."""
    digits = re.sub(r"\D", "", phone)
    if phone.startswith("+"):
        return "+" + digits
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    return "+" + digits


def send_sms(to_phone: str, body: str) -> None:
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    from_number = os.getenv("TWILIO_FROM_NUMBER", "")
    normalized = _normalize_phone(to_phone)

    if not account_sid or not auth_token or not from_number:
        print(f"\n[SMS] To: {normalized}\n{body}\n", flush=True)
        return

    from twilio.rest import Client

    client = Client(account_sid, auth_token)
    client.messages.create(to=normalized, from_=from_number, body=body)
