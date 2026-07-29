import os


def send_sms(to_phone: str, body: str) -> None:
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    from_number = os.getenv("TWILIO_FROM_NUMBER", "")

    if not account_sid or not auth_token or not from_number:
        print(f"\n[SMS] To: {to_phone}\n{body}\n", flush=True)
        return

    from twilio.rest import Client

    client = Client(account_sid, auth_token)
    client.messages.create(to=to_phone, from_=from_number, body=body)
