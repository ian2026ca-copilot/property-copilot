from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ANTHROPIC_API_KEY: str = ""
    DOCUSIGN_INTEGRATION_KEY: str = ""
    DOCUSIGN_ACCOUNT_ID: str = ""
    DOCUSIGN_USER_ID: str = ""
    DOCUSIGN_PRIVATE_KEY: str = ""
    DOCUSIGN_BASE_PATH: str = "https://demo.docusign.net/restapi"
    DOCUSIGN_AUTH_SERVER: str = "account-d.docusign.com"

    class Config:
        env_file = ".env"


settings = Settings()
