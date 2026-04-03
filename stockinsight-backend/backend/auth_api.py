import os
import re
import time
from typing import Any

import requests
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.middleware.csrf import get_token
from ninja import Router, Schema

router = Router(tags=["auth"])


class LoginPayload(Schema):
    identifier: str
    password: str


class SignupPayload(Schema):
    username: str
    email: str = ""
    password: str
    confirmPassword: str


class GoogleAuthPayload(Schema):
    credential: str


def _serialize_user(user) -> dict[str, object]:
    return {
        "id": user.pk,
        "username": user.get_username(),
        "email": user.email or "",
    }


def _error(message: str, status: int = 400) -> JsonResponse:
    return JsonResponse({"error": message}, status=status)


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _verify_google_credential(credential: str) -> tuple[dict[str, Any] | None, str | None]:
    google_client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if not google_client_id:
        return None, "Google sign-in is not configured on this server."

    try:
        response = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": credential},
            timeout=8,
        )
    except requests.RequestException:
        return None, "Google sign-in is temporarily unavailable. Please try again."

    try:
        payload = response.json()
    except ValueError:
        payload = {}

    if response.status_code != 200:
        detail = str(payload.get("error_description") or payload.get("error") or "").strip()
        if detail:
            return None, f"Google authentication failed: {detail}."
        return None, "Google authentication failed."

    audience = str(payload.get("aud", "")).strip()
    if audience != google_client_id:
        return None, "Google credential was issued for a different application."

    issuer = str(payload.get("iss", "")).strip()
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        return None, "Google credential issuer is invalid."

    expires_at_raw = str(payload.get("exp", "")).strip()
    try:
        expires_at = int(expires_at_raw)
    except (TypeError, ValueError):
        expires_at = 0
    if expires_at <= int(time.time()):
        return None, "Google credential expired. Please try again."

    email = str(payload.get("email", "")).strip()
    if not email:
        return None, "Google account email is missing."
    if not _to_bool(payload.get("email_verified")):
        return None, "Google account email is not verified."

    return payload, None


def _slug_username(seed: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_]+", "_", seed).strip("_").lower()
    return normalized or "user"


def _next_available_username(email: str) -> str:
    user_model = get_user_model()
    local_part = email.split("@", 1)[0]
    base = _slug_username(local_part)[:150]
    if not base:
        base = "user"

    if not user_model.objects.filter(username__iexact=base).exists():
        return base

    for index in range(1, 10000):
        suffix = f"_{index}"
        room = max(1, 150 - len(suffix))
        candidate = f"{base[:room]}{suffix}"
        if not user_model.objects.filter(username__iexact=candidate).exists():
            return candidate

    return f"user_{int(time.time())}"


def _find_user_by_identifier(identifier: str):
    clean_identifier = identifier.strip()
    if not clean_identifier:
        return None

    user_model = get_user_model()
    user = user_model.objects.filter(username__iexact=clean_identifier).first()
    email_field_name = getattr(user_model, "EMAIL_FIELD", None)
    if user is None and email_field_name and "@" in clean_identifier:
        user = user_model.objects.filter(
            **{f"{email_field_name}__iexact": clean_identifier}
        ).first()
    return user


def _authenticate_user(identifier: str, password: str):
    clean_identifier = identifier.strip()
    if not clean_identifier or not password:
        return None

    user = authenticate(username=clean_identifier, password=password)
    if user is not None:
        return user

    matched_user = _find_user_by_identifier(clean_identifier)
    if matched_user is None:
        return None

    return authenticate(username=matched_user.get_username(), password=password)


@router.get("/csrf")
def auth_csrf(request):
    return JsonResponse({"csrfToken": get_token(request)})


@router.get("/me")
def auth_me(request):
    get_token(request)
    user = request.user
    return JsonResponse(
        {
            "authenticated": bool(user.is_authenticated),
            "user": _serialize_user(user) if user.is_authenticated else None,
        }
    )


@router.get("/google/client-id")
def auth_google_client_id(request):
    return JsonResponse({"clientId": os.getenv("GOOGLE_CLIENT_ID", "").strip()})


@router.post("/login")
def auth_login(request, payload: LoginPayload):
    identifier = payload.identifier.strip()
    password = payload.password
    if not identifier or not password:
        return _error("Username or email and password are required.")

    user = _authenticate_user(identifier, password)
    if user is None:
        return _error("Invalid username, email, or password.", status=401)

    login(request, user)
    return JsonResponse({"user": _serialize_user(user)})


@router.post("/signup")
def auth_signup(request, payload: SignupPayload):
    username = payload.username.strip()
    email = payload.email.strip()

    if not username:
        return _error("Username is required.")
    if not payload.password:
        return _error("Password is required.")
    if payload.password != payload.confirmPassword:
        return _error("Password confirmation does not match.")

    user_model = get_user_model()

    if user_model.objects.filter(username__iexact=username).exists():
        return _error("That username is already in use.")
    if email and user_model.objects.filter(email__iexact=email).exists():
        return _error("That email is already in use.")

    prospective_user = user_model(username=username, email=email)
    try:
        validate_password(payload.password, user=prospective_user)
    except ValidationError as exc:
        return _error(" ".join(exc.messages))

    user = user_model.objects.create_user(
        username=username,
        email=email,
        password=payload.password,
    )
    login(request, user)
    return JsonResponse({"user": _serialize_user(user)}, status=201)


@router.post("/google")
def auth_google(request, payload: GoogleAuthPayload):
    credential = payload.credential.strip()
    if not credential:
        return _error("Google credential is required.")

    google_payload, token_error = _verify_google_credential(credential)
    if google_payload is None:
        status = 401
        if token_error and "not configured" in token_error.lower():
            status = 500
        elif token_error and "temporarily unavailable" in token_error.lower():
            status = 503
        return _error(token_error or "Google authentication failed.", status=status)

    email = str(google_payload.get("email", "")).strip()
    user_model = get_user_model()
    user = user_model.objects.filter(email__iexact=email).first()

    if user is None:
        user = user_model.objects.create_user(
            username=_next_available_username(email),
            email=email,
            first_name=str(google_payload.get("given_name", "")).strip(),
            last_name=str(google_payload.get("family_name", "")).strip(),
        )

    if not user.is_active:
        return _error("This account is disabled.", status=403)

    login(request, user)
    return JsonResponse({"user": _serialize_user(user)})


@router.post("/logout")
def auth_logout(request):
    if request.user.is_authenticated:
        logout(request)
    get_token(request)
    return JsonResponse({"success": True})
