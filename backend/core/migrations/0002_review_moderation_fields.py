from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0001_initial')]

    operations = [
        migrations.AddField(
            model_name='review',
            name='is_flagged',
            field=models.BooleanField(
                db_index=True,
                default=False,
                verbose_name='Потребує модерації',
            ),
        ),
        migrations.AddField(
            model_name='review',
            name='moderation_reason',
            field=models.CharField(
                blank=True,
                max_length=255,
                verbose_name='Причина модерації',
            ),
        ),
    ]
