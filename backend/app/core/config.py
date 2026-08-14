from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 48  # 48 hours; revoked instantly via token_version on logout
    ANTHROPIC_API_KEY: str = ""
    DOCUSIGN_INTEGRATION_KEY: str = ""
    DOCUSIGN_ACCOUNT_ID: str = ""
    DOCUSIGN_USER_ID: str = ""
    DOCUSIGN_PRIVATE_KEY: str = ""
    DOCUSIGN_BASE_PATH: str = "https://demo.docusign.net/restapi"
    DOCUSIGN_AUTH_SERVER: str = "account-d.docusign.com"
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_ID: str = ""
    STRIPE_PRICE_ID_YEARLY: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
