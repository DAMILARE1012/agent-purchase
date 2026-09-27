from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    """
    One session per request. Endpoints that write call `db.commit()` themselves
    before returning, so a success response always means the write is durable.
    Anything left uncommitted (errors included) is rolled back on close.
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
