CREATE OR REPLACE FUNCTION duecase_notify_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_notify('duecase_changes', COALESCE(NEW.family_id, OLD.family_id)::text);
 RETURN COALESCE(NEW,OLD);
END $$;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['messages','message_read_receipts','family_agreements','family_events','expenses','expense_payments','custody_turns','custody_weekly_patterns','custody_alternating_weekends','custody_exceptions','documents','children','in_app_notifications','swap_requests'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS duecase_live_change ON %I',t);
  EXECUTE format('CREATE TRIGGER duecase_live_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION duecase_notify_change()',t);
 END LOOP;
END $$;
