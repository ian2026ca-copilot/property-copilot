import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def _smtp_send(to_email: str, subject: str, html: str) -> None:
    smtp_host = os.getenv("SMTP_HOST", "")
    if not smtp_host:
        return  # dev fallback: caller prints to log before calling this

    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    from_email = os.getenv("FROM_EMAIL", smtp_user)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html"))

    if smtp_port == 465:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
            server.login(smtp_user, smtp_password)
            server.sendmail(from_email, to_email, msg.as_string())
    else:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(from_email, to_email, msg.as_string())


def _logo_block() -> str:
    return """
    <div style="margin-bottom:28px">
      <span style="background:#000;color:#fff;padding:6px 14px;border-radius:6px;
                   font-weight:700;font-size:14px;letter-spacing:.5px">
        Property Copilot
      </span>
    </div>
    """


def send_reset_email(to_email: str, reset_link: str, full_name: str = "") -> None:
    greeting = f"Hi {full_name}," if full_name else "Hi,"
    if not os.getenv("SMTP_HOST"):
        print(f"\n[Password Reset] To: {to_email}\nLink: {reset_link}\n", flush=True)
        return

    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px 24px;color:#111">
      {_logo_block()}
      <h2 style="margin:0 0 8px;font-size:22px">Reset your password</h2>
      <p style="color:#555;margin:0 0 28px;line-height:1.6">{greeting}<br>
        We received a request to reset your password.
        Click the button below — this link expires in <strong>1 hour</strong>.
      </p>
      <a href="{reset_link}"
         style="display:inline-block;padding:13px 30px;background:#000;color:#fff;
                text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;margin-bottom:28px">
        Reset password →
      </a>
      <p style="color:#999;font-size:12px;margin:0;line-height:1.6">
        If you didn't request this, you can safely ignore this email — your password won't change.<br>
        Or paste: <span style="color:#555;word-break:break-all">{reset_link}</span>
      </p>
    </div>
    """
    _smtp_send(to_email, "Reset your Property Copilot password", html)


def send_welcome_email(to_email: str, full_name: str, org_name: str, role: str, dashboard_url: str) -> None:
    first = full_name.split()[0] if full_name else "there"
    role_label = {
        "OWNER": "Property Owner",
        "TENANT": "Tenant",
    }.get(role, role.title())

    if not os.getenv("SMTP_HOST"):
        print(f"\n[Welcome Email] To: {to_email} ({full_name}) — {org_name}\n", flush=True)
        return

    html = f"""
    <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:32px 24px;color:#111">
      {_logo_block()}

      <h2 style="margin:0 0 6px;font-size:24px">Welcome to Property Copilot, {first}! 🎉</h2>
      <p style="color:#555;margin:0 0 24px;line-height:1.6">
        Your account for <strong>{org_name}</strong> is ready.
        You're set up as a <strong>{role_label}</strong> — here's everything you can do from day one.
      </p>

      <!-- Quick-start steps -->
      <div style="background:#f8f8f8;border-radius:10px;padding:20px 24px;margin-bottom:28px">
        <p style="font-weight:700;margin:0 0 14px;font-size:14px;text-transform:uppercase;
                  letter-spacing:.6px;color:#888">Get started in 3 steps</p>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:8px 0;vertical-align:top;width:28px">
              <span style="background:#000;color:#fff;border-radius:50%;width:22px;height:22px;
                           display:inline-flex;align-items:center;justify-content:center;
                           font-size:11px;font-weight:700">1</span>
            </td>
            <td style="padding:8px 0 8px 10px;color:#333;font-size:14px;line-height:1.5">
              <strong>Add your first property</strong><br>
              <span style="color:#777">Go to Properties → Add property. Add address, type, and units.</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;vertical-align:top;width:28px">
              <span style="background:#000;color:#fff;border-radius:50%;width:22px;height:22px;
                           display:inline-flex;align-items:center;justify-content:center;
                           font-size:11px;font-weight:700">2</span>
            </td>
            <td style="padding:8px 0 8px 10px;color:#333;font-size:14px;line-height:1.5">
              <strong>Invite your first tenant</strong><br>
              <span style="color:#777">Go to Tenants → Add tenant. They'll get portal access automatically.</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;vertical-align:top;width:28px">
              <span style="background:#000;color:#fff;border-radius:50%;width:22px;height:22px;
                           display:inline-flex;align-items:center;justify-content:center;
                           font-size:11px;font-weight:700">3</span>
            </td>
            <td style="padding:8px 0 8px 10px;color:#333;font-size:14px;line-height:1.5">
              <strong>Explore your dashboard</strong><br>
              <span style="color:#777">Track occupancy, rent collection, and maintenance all in one place.</span>
            </td>
          </tr>
        </table>
      </div>

      <a href="{dashboard_url}"
         style="display:inline-block;padding:13px 30px;background:#000;color:#fff;
                text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;margin-bottom:32px">
        Open my dashboard →
      </a>

      <!-- Onboarding questions -->
      <div style="border-top:1px solid #eee;padding-top:24px;margin-bottom:8px">
        <p style="font-weight:700;margin:0 0 6px;font-size:15px">
          One quick question before you dive in 👇
        </p>
        <p style="color:#555;margin:0 0 18px;font-size:14px;line-height:1.6">
          We'd love to know a bit more about you so we can tailor Property Copilot to your needs.
          Just reply to this email — it goes straight to our team.
        </p>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px">
          <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#92400e">
            🏠 How many properties do you currently manage?
          </p>
          <p style="margin:0 0 14px;font-size:13px;color:#78716c">
            a) Just 1–2 (getting started)<br>
            b) 3–10 (growing portfolio)<br>
            c) 11–50 (mid-size operation)<br>
            d) 50+ (large portfolio)
          </p>
          <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#92400e">
            🎯 What's your biggest challenge right now?
          </p>
          <p style="margin:0;font-size:13px;color:#78716c">
            a) Tracking rent payments and late fees<br>
            b) Managing maintenance requests<br>
            c) Finding and screening tenants<br>
            d) Keeping my team organised<br>
            e) Something else — I'll tell you!
          </p>
        </div>
        <p style="color:#999;font-size:12px;margin:12px 0 0">
          Reply with your answers (e.g. "b, a") and we'll set up your account for exactly what you need.
        </p>
      </div>
    </div>
    """
    _smtp_send(to_email, f"Welcome to Property Copilot, {first}! 🎉", html)
