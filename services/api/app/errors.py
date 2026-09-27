from fastapi import Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    """An error with a stable code and a message that can be shown to the user."""

    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}  # Extra JSON fields, e.g. the gate's checks when it refuses a payment.


async def api_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return JSONResponse(status_code=exc.status, content={**exc.details, "error": exc.code, "message": exc.message})
