"""HTTP-ендпоінти авторизації (Google OAuth + JWT)."""

from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .oauth_google import (
    GoogleAccountConflictError,
    GoogleOAuthError,
    sync_user_from_google,
    verify_google_id_token,
)
from .serializers import UserProfileSerializer, UserSerializer
from .serializers_auth import GoogleIdTokenSerializer, RefreshLogoutSerializer

_REFRESH_ERROR = 'Невалідний або прострочений refresh-токен.'
_LOGOUT_SUCCESS = {'message': 'Вихід виконано успішно.'}


class GoogleAuthView(APIView):
    """
    POST /api/auth/google/

    Тіло: {"id_token": "<JWT від Google>"}
    Відповідь: access, refresh, user, profile.
    """

    permission_classes = [AllowAny]
    throttle_classes = [UserRateThrottle]

    def post(self, request, *args, **kwargs):
        ser = GoogleIdTokenSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        raw = ser.validated_data['id_token']

        try:
            info = verify_google_id_token(raw)
            user, profile, _created = sync_user_from_google(info)
            if not user.is_active:
                return Response(
                    {'error': 'Обліковий запис неактивний. Зверніться до підтримки.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except GoogleOAuthError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except GoogleAccountConflictError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_409_CONFLICT)

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': UserSerializer(user).data,
                'profile': UserProfileSerializer(profile).data,
            },
            status=status.HTTP_200_OK,
        )


class TokenRefreshView(APIView):
    """
    POST /api/auth/token/refresh/

    Тіло: {"refresh": "<refresh JWT>"}
    Відповідь: {"access": "...", "refresh": "..."} — новий refresh при ротації.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        body = RefreshLogoutSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        serializer = TokenRefreshSerializer(data=body.validated_data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError:
            return Response(
                {'error': _REFRESH_ERROR},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except AuthenticationFailed:
            return Response(
                {'error': 'Обліковий запис неактивний або не знайдений.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """
    POST /api/auth/logout/

    Тіло: {"refresh": "<refresh JWT>"}
    Додає refresh у blacklist (rest_framework_simplejwt.token_blacklist).
    Повторний виклик з тим самим refresh також успішний (idempotent).
    Access залишається дійсним до закінчення ACCESS_TOKEN_LIFETIME — клієнт
    повинен видалити обидва токени локально.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        ser = RefreshLogoutSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        try:
            token = RefreshToken(ser.validated_data['refresh'], verify=False)
            token.verify_token_type()
        except TokenError:
            return Response(
                {'error': _REFRESH_ERROR},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token.blacklist()

        return Response(_LOGOUT_SUCCESS, status=status.HTTP_205_RESET_CONTENT)
