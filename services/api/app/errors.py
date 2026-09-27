from fastapi import Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    """An error with a stable code and a message that can be shown to the user."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


async def api_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return JSONResponse(status_code=exc.status, content={"error": exc.code, "message": exc.message})
