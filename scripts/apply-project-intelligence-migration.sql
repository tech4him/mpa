-- Quick script to apply the Project Intelligence migration
-- Run this in your Supabase SQL editor

-- Apply the migration
\i supabase/migrations/20250711_project_intelligence.sql

-- Optional: Add some sample data for testing
-- (Uncomment if you want to test with sample data)

/*
-- Sample project for testing
INSERT INTO project_intelligence (
  user_id,
  name,
  description,
  category,
  status,
  priority,
  stakeholders,
  expected_timeline,
  communication_cadence,
  health_score,
  created_by
) VALUES (
  auth.uid(), -- Replace with actual user ID
  'Meraki License Renewal',
  'Annual renewal of Meraki networking licenses - critical for IT operations',
  'technical',
  'active',
  5,
  '[
    {"name": "Tom", "email": "tom@missionmutual.org", "role": "owner", "importance": 5},
    {"name": "Finance Team", "email": "finance@missionmutual.org", "role": "contributor", "importance": 4},
    {"name": "IT Director", "email": "it@missionmutual.org", "role": "stakeholder", "importance": 4}
  ]'::jsonb,
  '{
    "milestones": [
      {"name": "Budget Approval", "target_date": "2025-08-01", "status": "pending"},
      {"name": "Contract Renewal", "target_date": "2025-09-01", "status": "pending"}
    ],
    "deadlines": [
      {"name": "License Expiration", "date": "2025-09-30", "type": "hard"}
    ]
  }'::jsonb,
  'weekly',
  6,
  'sample_data'
);

-- Sample stakeholder intelligence
INSERT INTO stakeholder_intelligence (
  user_id,
  stakeholder_email,
  stakeholder_name,
  role_title,
  relationship_type,
  importance_level,
  communication_style,
  interaction_patterns
) VALUES (
  auth.uid(), -- Replace with actual user ID
  'finance@missionmutual.org',
  'Finance Team',
  'Financial Operations',
  'colleague',
  4,
  '{"preferred_frequency": "weekly", "response_time_avg": 24, "formality_level": "professional"}'::jsonb,
  '{"meeting_frequency": "monthly", "email_frequency": "weekly", "last_interaction": "2025-07-10"}'::jsonb
);
*/