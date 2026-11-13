"""Read-only database adapter. The caller owns the session and transaction."""
from sqlalchemy import text
from services.platform_common.serialization import clean


class OperationsRepository:
    def __init__(self, session):
        self.session = session

    def rows(self, sql, **params):
        return [clean(dict(row)) for row in self.session.execute(text(sql), params).mappings()]

    def one(self, sql, **params):
        return next(iter(self.rows(sql, **params)), None)

    def scalar(self, sql, params):
        return self.session.execute(text(sql), params).scalar()

    def check_database(self):
        self.session.execute(text('SELECT 1'))
