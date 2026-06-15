from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    AIS_API_KEY: str = ""
    GOLEMIO_API_KEY: str = ""
    OPENSKY_CLIENT_ID: str = ""
    OPENSKY_CLIENT_SECRET: str = ""

    class Config:
        env_file = ".env"

settings = Settings()