"""
Конфігурація додатку Core.

Цей додаток містить основні моделі, серіалізатори та view для API.
"""

from django.apps import AppConfig


class CoreConfig(AppConfig):
    """Конфігурація додатку Core."""
    
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'
    verbose_name = 'Основне API'

    def ready(self):
        # Registers the receivers that keep Borsch's denormalised ratings in
        # step with Review on every write path, not just the API one.
        from . import signals  # noqa: F401
