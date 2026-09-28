import os
import json
import logging
import secrets

from fastapi import FastAPI, Request, Response, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from dotenv import load_dotenv

load_dotenv()
# Load environment variables from .env file if it exists
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not available, continue without .env loading


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Create FastAPI app
app = FastAPI(
    title="Worldcat OCLC API Server",
    description="Standalone version of Worldcat OCLC APIs",
    version="1.0.0"
)


# Configure CORS
#
# When the React development server is running on Vite's default port,
# it normally runs at http://localhost:5173.
#
# You can override this with:
#
# CORS_ORIGINS=http://localhost:5173
#
cors_origins_env = os.environ.get("CORS_ORIGINS", "")

if cors_origins_env.strip():
    allowed_origins = [
        origin.strip()
        for origin in cors_origins_env.split(",")
        if origin.strip()
    ]
else:
    allowed_origins = ["http://localhost:5173"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


if "*" in allowed_origins:
    origins_display = "All"
else:
    origins_display = ", ".join(allowed_origins)


# ---------------------------------------------------------------------------
# Local authentication
# ---------------------------------------------------------------------------

USERNAME = os.environ.get("LOCAL_USERNAME")
PASSWORD = os.environ.get("LOCAL_PASSWORD")

if not USERNAME or not PASSWORD:
    logger.warning(
        "LOCAL_USERNAME and/or LOCAL_PASSWORD are not configured. "
        "Local login will not work until they are set."
    )


# Temporary in-memory session storage.
#
# This is appropriate for local development / a single FastAPI process.
# If this application is later deployed with multiple workers or multiple
# servers, move this to Redis or another shared session store.
sessions = {}


class LoginRequest(BaseModel):
    username: str
    password: str


def require_login(request: Request):
    """
    Require a valid local authentication session.

    Returns the username associated with the session.
    """
    session_id = request.cookies.get("snapicat_session")

    if not session_id:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )

    username = sessions.get(session_id)

    if not username:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )

    return username


def make_user(username: str):
    """
    Create the user object expected by the React authentication context.

    The local authentication system does not have Microsoft's account
    information, so username is used for id, email, and name.
    """
    return {
        "id": username,
        "email": username,
        "name": username,
    }


@app.post("/api/login")
async def login(data: LoginRequest, response: Response):
    """
    Authenticate a local user and create a session.
    """
    if not USERNAME or not PASSWORD:
        logger.error(
            "Login attempted but LOCAL_USERNAME/LOCAL_PASSWORD are not configured."
        )
        raise HTTPException(
            status_code=500,
            detail="Local authentication is not configured on the server."
        )

    username_matches = secrets.compare_digest(
        data.username,
        USERNAME
    )

    password_matches = secrets.compare_digest(
        data.password,
        PASSWORD
    )

    if not username_matches or not password_matches:
        logger.warning(
            "Failed local login attempt for username: %s",
            data.username
        )
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password."
        )

    session_id = secrets.token_urlsafe(32)

    sessions[session_id] = data.username

    response.set_cookie(
        key="snapicat_session",
        value=session_id,
        httponly=True,
        samesite="lax",
        secure=os.environ.get("COOKIE_SECURE", "false").lower() == "true",
        max_age=60 * 60 * 8,
    )

    logger.info(
        "Successful local login for username: %s",
        data.username
    )

    return {
        "authenticated": True,
        "user": make_user(data.username),
    }


@app.get("/api/me")
async def get_current_user(username: str = Depends(require_login)):
    """
    Return the currently authenticated local user.
    """
    return {
        "authenticated": True,
        "user": make_user(username),
    }


@app.post("/api/logout")
async def logout(request: Request, response: Response):
    """
    Destroy the current local authentication session.
    """
    session_id = request.cookies.get("snapicat_session")

    if session_id:
        sessions.pop(session_id, None)

    response.delete_cookie(
        key="snapicat_session",
        httponly=True,
        samesite="lax",
        secure=os.environ.get("COOKIE_SECURE", "false").lower() == "true",
    )

    return {
        "authenticated": False
    }


# ---------------------------------------------------------------------------
# Azure Functions compatibility layer
# ---------------------------------------------------------------------------

class MockHttpRequest:
    """Mock Azure Functions HttpRequest from FastAPI Request."""

    def __init__(self, fastapi_request: Request, body: dict = None):
        self._fastapi_request = fastapi_request
        self._body = body or {}
        self.method = fastapi_request.method
        self.headers = dict(fastapi_request.headers)

    def get_json(self):
        """Return the request body as JSON."""
        return self._body


async def call_azure_handler(request: Request, handler):
    """
    Call an Azure-style handler (main(req)) from FastAPI.

    Handler is imported from src.*.handler.
    """
    try:
        body = {}

        if request.method in ["POST", "PUT", "PATCH"]:
            try:
                body = await request.json()
            except Exception:
                body = {}

        mock_req = MockHttpRequest(request, body)

        response = await handler(mock_req)

        # Convert Azure Functions response to FastAPI response
        if hasattr(response, "status_code") and hasattr(response, "get_body"):
            status_code = response.status_code
            headers = getattr(response, "headers", {})

            body_content = response.get_body()

            if isinstance(body_content, bytes):
                body_content = body_content.decode("utf-8")

            try:
                json_data = json.loads(body_content)

                return JSONResponse(
                    content=json_data,
                    status_code=status_code,
                    headers=headers
                )

            except Exception:
                return Response(
                    content=body_content,
                    status_code=status_code,
                    headers=headers
                )

        return JSONResponse(
            content={"error": "Invalid response format"},
            status_code=500
        )

    except Exception as e:
        logger.error(
            "Error calling handler: %s",
            e,
            exc_info=True
        )

        return JSONResponse(
            content={
                "error": str(e),
                "message": "Internal server error"
            },
            status_code=500
        )


# ---------------------------------------------------------------------------
# Snapicat API endpoints
# ---------------------------------------------------------------------------
@app.post("/api/search_books")
async def search_books(
    request: Request,
    username: str = Depends(require_login)
):
    """
    Search books API endpoint.

    Authentication is handled by FastAPI using the local
    Snapicat session. The underlying search handler is
    responsible only for the OCLC operation.
    """
    from src.search_books.handler import main as handler

    return await call_azure_handler(
        request,
        handler
    )

@app.post("/api/generate_xml")
async def generate_xml(
    request: Request,
    username: str = Depends(require_login)
):
    """
    Generate XML API endpoint.

    Delegates to src.generate_xml.handler.main.
    """
    from src.generate_xml.handler import main as handler

    return await call_azure_handler(request, handler)


# ---------------------------------------------------------------------------
# Health / root endpoints
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "message": "Worldcat OCLC API Server (Standalone)",
        "status": "healthy",
        "framework": "FastAPI",
        "endpoints": [
            "/api/login",
            "/api/me",
            "/api/logout",
            "/api/search_books",
            "/api/generate_xml"
        ]
    }


@app.get("/health")
async def health():
    """Detailed health check."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "framework": "FastAPI (Standalone)",
        "endpoints": [
            "/api/login",
            "/api/me",
            "/api/logout",
            "/api/search_books",
            "/api/generate_xml"
        ],
        "environment": {
            "oclc_wskey": (
                "configured"
                if os.environ.get("OCLC_WSKEY")
                else "missing"
            ),
            "oclc_secret": (
                "configured"
                if os.environ.get("OCLC_SECRET")
                else "missing"
            ),
            "local_username": (
                "configured"
                if os.environ.get("LOCAL_USERNAME")
                else "missing"
            ),
            "local_password": (
                "configured"
                if os.environ.get("LOCAL_PASSWORD")
                else "missing"
            ),
        }
    }


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8080"))
    auto_reload = os.environ.get("AUTO_RELOAD", "true").lower() == "true"

    print("Starting Worldcat OCLC Standalone API Server")
    print(f"Host: {host}")
    print(f"Port: {port}")
    print(f"CORS Origins: {origins_display}")

    uvicorn.run(
        "app:app",
        host=host,
        port=port,
        reload=auto_reload,
        log_level="info"
    )