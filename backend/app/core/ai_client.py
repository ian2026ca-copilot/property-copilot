"""Unified multi-provider AI text/vision generation.

OpenAI, DeepSeek, and Grok are all OpenAI-compatible chat-completions APIs —
same SDK, just a different base_url/model/key — so they share one code path.
Gemini keeps its own SDK since it isn't OpenAI-compatible. Which provider is
"active" is chosen on the admin AI settings page (mirrored into the
ACTIVE_AI_PROVIDER env var by app.core.ai_keys) and applies platform-wide to
every AI call site in the app. Each provider's base_url/model can also be
overridden from that same page — falls back to the defaults below when unset.
"""
import base64
import os

PROVIDER_DEFAULTS = {
    "openai": {"base_url": None, "model": "gpt-4o-mini", "env_var": "OPENAI_API_KEY", "label": "OpenAI"},
    "deepseek": {"base_url": "https://api.deepseek.com", "model": "deepseek-chat", "env_var": "DEEPSEEK_API_KEY", "label": "DeepSeek"},
    "gemini": {"base_url": None, "model": "gemini-2.5-flash", "env_var": "GEMINI_API_KEY", "label": "Gemini"},
    "grok": {"base_url": "https://api.x.ai/v1", "model": "grok-4", "env_var": "GROK_API_KEY", "label": "Grok"},
}


def active_provider() -> str:
    return os.environ.get("ACTIVE_AI_PROVIDER", "gemini")


def _resolved(provider: str) -> tuple[str | None, str]:
    """(base_url, model) — env override if set, else the hardcoded default."""
    defaults = PROVIDER_DEFAULTS[provider]
    base_url = os.environ.get(f"{provider.upper()}_BASE_URL", "") or defaults["base_url"]
    model = os.environ.get(f"{provider.upper()}_MODEL", "") or defaults["model"]
    return base_url, model


def generate_ai_text(prompt: str, images: list[dict] | None = None) -> str:
    """images: optional list of {"mime_type": str, "data": bytes}. Raises
    RuntimeError with a caller-safe message on missing config or provider
    failure — every call site already wraps this in try/except and turns it
    into an HTTPException, so this intentionally doesn't catch anything."""
    provider = active_provider()
    if provider not in PROVIDER_DEFAULTS:
        raise RuntimeError(f"Unknown AI provider configured: {provider}")
    if provider == "gemini":
        return _generate_gemini(prompt, images)
    return _generate_openai_compatible(provider, prompt, images)


def _generate_gemini(prompt: str, images: list[dict] | None) -> str:
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("Gemini API key not configured")
    import google.generativeai as genai

    base_url, model_name = _resolved("gemini")
    client_options = {"api_endpoint": base_url} if base_url else None
    genai.configure(api_key=api_key, client_options=client_options)
    model = genai.GenerativeModel(model_name)
    content = [prompt, *images] if images else prompt
    response = model.generate_content(content)
    return response.text or ""


def _generate_openai_compatible(provider: str, prompt: str, images: list[dict] | None) -> str:
    defaults = PROVIDER_DEFAULTS[provider]
    api_key = os.environ.get(defaults["env_var"], "")
    if not api_key:
        raise RuntimeError(f"{defaults['label']} API key not configured")
    from openai import OpenAI

    base_url, model_name = _resolved(provider)
    client = OpenAI(api_key=api_key, base_url=base_url)

    if images:
        content: list[dict] = [{"type": "text", "text": prompt}]
        for img in images:
            b64 = base64.b64encode(img["data"]).decode("ascii")
            content.append({"type": "image_url", "image_url": {"url": f"data:{img['mime_type']};base64,{b64}"}})
        messages = [{"role": "user", "content": content}]
    else:
        messages = [{"role": "user", "content": prompt}]

    response = client.chat.completions.create(model=model_name, messages=messages)
    return response.choices[0].message.content or ""
