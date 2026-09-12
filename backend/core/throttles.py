"""Окремі rate limits для створення публічних оцінок."""

from rest_framework.throttling import SimpleRateThrottle


class ReviewCreateIPThrottle(SimpleRateThrottle):
    scope = 'review_create_ip'

    def get_cache_key(self, request, view):
        if request.method != 'POST':
            return None
        return self.cache_format % {
            'scope': self.scope,
            'ident': self.get_ident(request),
        }


class ReviewCreateDeviceThrottle(SimpleRateThrottle):
    scope = 'review_create_device'

    def get_cache_key(self, request, view):
        if request.method != 'POST':
            return None
        device_id = request.headers.get('X-Device-ID') or request.data.get('temp_user_id')
        if not device_id:
            return None
        return self.cache_format % {
            'scope': self.scope,
            'ident': str(device_id)[:100],
        }
