"""
Keep a borsch's denormalised ratings in step with its reviews, on every path.

See `core.ratings` for why this is needed rather than relying on the viewset.
"""

from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import Borsch, Review
from .ratings import recalculate_borsch_ratings


def _refresh(borsch_id):
    """
    Recalculate one borsch, if it is still there.

    Deleting a borsch cascades to its reviews, so `post_delete` fires for rows
    whose parent is already gone — reading `instance.borsch` then raises. There
    is also nothing to keep in sync in that case.
    """
    if not borsch_id:
        return
    borsch = Borsch.objects.filter(pk=borsch_id).first()
    if borsch is not None:
        recalculate_borsch_ratings(borsch)


@receiver(pre_save, sender=Review)
def remember_previous_borsch(sender, instance, **kwargs):
    """
    A review can be moved to a different borsch in the admin. Without this the
    borsch it left keeps counting a review it no longer has.
    """
    if not instance.pk:
        instance._previous_borsch_id = None
        return
    instance._previous_borsch_id = (
        Review.objects.filter(pk=instance.pk)
        .values_list('borsch_id', flat=True)
        .first()
    )


@receiver(post_save, sender=Review)
def refresh_on_review_save(sender, instance, **kwargs):
    previous_id = getattr(instance, '_previous_borsch_id', None)
    if previous_id and previous_id != instance.borsch_id:
        _refresh(previous_id)
    _refresh(instance.borsch_id)


@receiver(post_delete, sender=Review)
def refresh_on_review_delete(sender, instance, **kwargs):
    _refresh(instance.borsch_id)
