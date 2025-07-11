-- Inbox Zero Engine Database Schema
-- Add columns to existing email_messages table for inbox zero functionality

-- Add inbox zero processing columns to email_messages
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS is_snoozed BOOLEAN DEFAULT FALSE;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS ai_category TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS ai_priority TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS ai_confidence INTEGER;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS auto_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP WITH TIME ZONE;

-- Create inbox zero processing log table
CREATE TABLE IF NOT EXISTS inbox_zero_processing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_processed INTEGER NOT NULL DEFAULT 0,
  auto_actions_taken INTEGER NOT NULL DEFAULT 0,
  high_confidence_decisions INTEGER NOT NULL DEFAULT 0,
  processing_time_ms INTEGER,
  results_summary JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create inbox zero settings table for user preferences
CREATE TABLE IF NOT EXISTS inbox_zero_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auto_archive_marketing BOOLEAN DEFAULT TRUE,
  auto_delete_spam BOOLEAN DEFAULT TRUE,
  auto_reply_threshold INTEGER DEFAULT 95, -- confidence threshold for auto-replies
  processing_schedule TEXT DEFAULT 'manual', -- manual, hourly, daily
  custom_rules JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create email triage results table for tracking AI decisions
CREATE TABLE IF NOT EXISTS email_triage_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- immediate_action, today, tomorrow, this_week, archive, delete
  priority TEXT NOT NULL, -- urgent, high, medium, low
  auto_action TEXT, -- archive, delete, reply, forward, mark_read
  suggested_response TEXT,
  reason TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  requires_attention BOOLEAN DEFAULT TRUE,
  user_action TEXT, -- accepted, rejected, modified
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(email_id, user_id)
);

-- Add RLS policies for inbox zero tables
ALTER TABLE inbox_zero_processing_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_zero_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_triage_results ENABLE ROW LEVEL SECURITY;

-- Processing log policies
CREATE POLICY "Users can view their own processing logs" ON inbox_zero_processing_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own processing logs" ON inbox_zero_processing_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Settings policies
CREATE POLICY "Users can view their own inbox zero settings" ON inbox_zero_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own inbox zero settings" ON inbox_zero_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own inbox zero settings" ON inbox_zero_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Triage results policies
CREATE POLICY "Users can view their own triage results" ON email_triage_results
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own triage results" ON email_triage_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own triage results" ON email_triage_results
  FOR UPDATE USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_messages_user_unread ON email_messages(user_id, is_read, is_deleted) WHERE is_read = FALSE AND is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_messages_archived ON email_messages(user_id, is_archived) WHERE is_archived = TRUE;
CREATE INDEX IF NOT EXISTS idx_email_messages_snoozed ON email_messages(user_id, is_snoozed, snooze_until) WHERE is_snoozed = TRUE;
CREATE INDEX IF NOT EXISTS idx_inbox_zero_log_user_date ON inbox_zero_processing_log(user_id, processed_at);
CREATE INDEX IF NOT EXISTS idx_email_triage_user_email ON email_triage_results(user_id, email_id);

-- Create function to automatically unsnoozle emails
CREATE OR REPLACE FUNCTION unsnoozle_emails()
RETURNS void AS $$
BEGIN
  UPDATE email_messages 
  SET is_snoozed = FALSE, snooze_until = NULL
  WHERE is_snoozed = TRUE 
    AND snooze_until IS NOT NULL 
    AND snooze_until <= NOW();
END;
$$ LANGUAGE plpgsql;

-- Create function to get inbox zero stats
CREATE OR REPLACE FUNCTION get_inbox_zero_stats(user_uuid UUID)
RETURNS TABLE (
  total_unread INTEGER,
  total_archived_today INTEGER,
  total_processed_today INTEGER,
  avg_processing_time_ms NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM email_messages 
     WHERE user_id = user_uuid AND is_read = FALSE AND is_deleted = FALSE) as total_unread,
    (SELECT COUNT(*)::INTEGER FROM email_messages 
     WHERE user_id = user_uuid AND is_archived = TRUE AND DATE(processed_at) = CURRENT_DATE) as total_archived_today,
    (SELECT COALESCE(SUM(total_processed), 0)::INTEGER FROM inbox_zero_processing_log 
     WHERE user_id = user_uuid AND DATE(processed_at) = CURRENT_DATE) as total_processed_today,
    (SELECT COALESCE(AVG(processing_time_ms), 0) FROM inbox_zero_processing_log 
     WHERE user_id = user_uuid AND DATE(processed_at) = CURRENT_DATE) as avg_processing_time_ms;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default settings for existing users
INSERT INTO inbox_zero_settings (user_id)
SELECT id FROM users 
WHERE id NOT IN (SELECT user_id FROM inbox_zero_settings)
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE inbox_zero_processing_log IS 'Tracks inbox zero processing sessions and results';
COMMENT ON TABLE inbox_zero_settings IS 'User preferences for inbox zero automation';
COMMENT ON TABLE email_triage_results IS 'AI triage decisions and user feedback for learning';
COMMENT ON FUNCTION get_inbox_zero_stats IS 'Returns comprehensive inbox zero statistics for a user';