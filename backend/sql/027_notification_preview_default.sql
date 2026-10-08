-- Le anteprime dettagliate delle notifiche sono attive di default.
-- L'utente puo' comunque disattivarle dalle impostazioni: un false esplicito viene rispettato.
ALTER TABLE users
  ALTER COLUMN notification_preferences
  SET DEFAULT '{"previewContent": true}'::jsonb;

UPDATE users
   SET notification_preferences = jsonb_set(
         COALESCE(notification_preferences, '{}'::jsonb),
         '{previewContent}',
         'true'::jsonb,
         true
       ),
       updated_at = NOW()
 WHERE NOT (COALESCE(notification_preferences, '{}'::jsonb) ? 'previewContent');
