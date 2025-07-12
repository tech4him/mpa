-- Agent Architecture Database Migration
-- This adds the necessary tables for autonomous agents

-- Agent configurations table
CREATE TABLE IF NOT EXISTS agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  agent_type VARCHAR(100) NOT NULL,
  description TEXT,
  autonomy_level VARCHAR(50) NOT NULL DEFAULT 'supervised' CHECK (autonomy_level IN ('supervised', 'semi-autonomous', 'fully-autonomous')),
  enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, agent_type)
);

-- Agent actions audit trail
CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,
  context JSONB DEFAULT '{}' NOT NULL,
  outcome VARCHAR(50) CHECK (outcome IN ('success', 'failure')),
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent events for communication
CREATE TABLE IF NOT EXISTS agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB DEFAULT '{}' NOT NULL,
  processed_by JSONB DEFAULT '[]' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent approval queue
CREATE TABLE IF NOT EXISTS agent_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  item_type VARCHAR(100) NOT NULL,
  item_data JSONB NOT NULL,
  decision JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent metrics and monitoring
CREATE TABLE IF NOT EXISTS agent_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  metric_type VARCHAR(100) NOT NULL,
  value NUMERIC NOT NULL,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_configs_user_id ON agent_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_user_type ON agent_configs(user_id, agent_type);

CREATE INDEX IF NOT EXISTS idx_agent_actions_agent_id ON agent_actions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_user_id ON agent_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_created_at ON agent_actions(created_at);

CREATE INDEX IF NOT EXISTS idx_agent_events_agent_id ON agent_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_user_id ON agent_events(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(event_type);
CREATE INDEX IF NOT EXISTS idx_agent_events_created_at ON agent_events(created_at);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_user_id ON agent_approvals(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_status ON agent_approvals(status);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_created_at ON agent_approvals(created_at);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_id ON agent_metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_type ON agent_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_recorded_at ON agent_metrics(recorded_at);

-- Add RLS policies for security
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies for agent_configs
CREATE POLICY "Users can view their own agent configs" ON agent_configs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own agent configs" ON agent_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agent configs" ON agent_configs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own agent configs" ON agent_configs
  FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for agent_actions
CREATE POLICY "Users can view their own agent actions" ON agent_actions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert agent actions" ON agent_actions
  FOR INSERT WITH CHECK (true); -- Agents can log actions

-- RLS policies for agent_events
CREATE POLICY "Users can view their own agent events" ON agent_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert agent events" ON agent_events
  FOR INSERT WITH CHECK (true); -- Agents can emit events

-- RLS policies for agent_approvals
CREATE POLICY "Users can view their own agent approvals" ON agent_approvals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own agent approvals" ON agent_approvals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can insert agent approvals" ON agent_approvals
  FOR INSERT WITH CHECK (true); -- Agents can request approvals

-- RLS policies for agent_metrics
CREATE POLICY "Users can view their own agent metrics" ON agent_metrics
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert agent metrics" ON agent_metrics
  FOR INSERT WITH CHECK (true); -- Agents can record metrics

-- Add email thread fields for agent processing
ALTER TABLE email_threads 
ADD COLUMN IF NOT EXISTS processed_by_agent VARCHAR(255),
ADD COLUMN IF NOT EXISTS processing_status VARCHAR(100),
ADD COLUMN IF NOT EXISTS agent_confidence NUMERIC,
ADD COLUMN IF NOT EXISTS agent_reasoning TEXT;

-- Insert default agent configurations for existing users
INSERT INTO agent_configs (user_id, agent_type, description, autonomy_level, config)
SELECT 
  id as user_id,
  'Email Agent' as agent_type,
  'Autonomous email processing agent' as description,
  'semi-autonomous' as autonomy_level,
  jsonb_build_object(
    'checkInterval', 60000,
    'rules', jsonb_build_array(
      jsonb_build_object('condition', 'email.from.vip', 'action', 'notify'),
      jsonb_build_object('condition', 'email.contains.financial', 'action', 'block'),
      jsonb_build_object('condition', 'confidence < 0.8', 'action', 'block', 'threshold', 0.8)
    )
  ) as config
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM agent_configs 
  WHERE agent_configs.user_id = users.id 
  AND agent_configs.agent_type = 'Email Agent'
);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_agent_configs_updated_at 
  BEFORE UPDATE ON agent_configs 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE agent_configs IS 'Configuration settings for autonomous agents per user';
COMMENT ON TABLE agent_actions IS 'Audit trail of all agent actions and their outcomes';
COMMENT ON TABLE agent_events IS 'Event stream for agent communication and monitoring';
COMMENT ON TABLE agent_approvals IS 'Queue of agent actions requiring user approval';
COMMENT ON TABLE agent_metrics IS 'Performance and operational metrics for agents';