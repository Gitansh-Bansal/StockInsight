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


def _serialize_user(user) -> dict[str, object]:
    return {
        "id": user.pk,
        "username": user.get_username(),
        "email": user.email or "",
    }


def _error(message: str, status: int = 400) -> JsonResponse:
    return JsonResponse({"error": message}, status=status)


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


@router.post("/logout")
def auth_logout(request):
    if request.user.is_authenticated:
        logout(request)
    get_token(request)
    return JsonResponse({"success": True})
