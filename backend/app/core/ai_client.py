"""Unified multi-provider AI text/vision generation.

OpenAI, DeepSeek, and Grok are all OpenAI-compatible chat-completions APIs —
same SDK, just a different base_url/model/key — so they share one code path.
Gemini keeps its own SDK since it isn't OpenAI-compatible. Which provider is
"active" is chosen on the admin AI settings page (mirrored into the
ACTIVE_AI_PROVIDER env var by app.core.ai_keys) and applies platform-wide to
every AI call site in the app.
"""
import base64
import os

_OPENAI_COMPATIBLE = {
    "openai": {"base_url": None, "env_var": "OPENAI_API_KEY", "model": "gpt-4o-mini", "label": "OpenAI"},
    "deepseek": {"base_url": "https://api.deepseek.com", "env_var": "DEEPSEEK_API_KEY", "model": "deepseek-chat", "label": "DeepSeek"},
    "grok": {"base_url": "https://api.x.ai/v1", "env_var": "GROK_API_KEY", "model": "grok-4", "label": "Grok"},
}


def active_provider() -> str:
    return os.environ.get("ACTIVE_AI_PROVIDER", "gemini")


def generate_ai_text(prompt: str, images: list[dict] | None = None) -> str:
    """images: optional list of {"mime_type": str, "data": bytes}. Raises
    RuntimeError with a caller-safe message on missing config or provider
    failure — every call site already wraps this in try/except and turns it
    into an HTTPException, so this intentionally doesn't catch anything."""
    provider = active_provider()
    if provider == "gemini":
        return _generate_gemini(prompt, images)
    if provider in _OPENAI_COMPATIBLE:
        return _generate_openai_compatible(provider, prompt, images)
    raise RuntimeError(f"Unknown AI provider configured: {provider}")


def _generate_gemini(prompt: str, images: list[dict] | None) -> str:
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("Gemini API key not configured")
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash")
    content = [prompt, *images] if images else prompt
    response = model.generate_content(content)
    return response.text or ""


def _generate_openai_compatible(provider: str, prompt: str, images: list[dict] | None) -> str:
    cfg = _OPENAI_COMPATIBLE[provider]
    api_key = os.environ.get(cfg["env_var"], "")
    if not api_key:
        raise RuntimeError(f"{cfg['label']} API key not configured")
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url=cfg["base_url"])

    if images:
        content: list[dict] = [{"type": "text", "text": prompt}]
        for img in images:
            b64 = base64.b64encode(img["data"]).decode("ascii")
            content.append({"type": "image_url", "image_url": {"url": f"data:{img['mime_type']};base64,{b64}"}})
        messages = [{"role": "user", "content": content}]
    else:
        messages = [{"role": "user", "content": prompt}]

    response = client.chat.completions.create(model=cfg["model"], messages=messages)
    return response.choices[0].message.content or ""
