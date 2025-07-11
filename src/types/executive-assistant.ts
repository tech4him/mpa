// Types for the Autonomous Executive Assistant System
// Strategic thought partner, relationship manager, and operational anchor

export interface ProjectIntelligence {
  id: string
  user_id: string
  name: string
  description?: string
  category: 'financial' | 'personnel' | 'technical' | 'legal' | 'strategic' | 'operational'
  status: 'active' | 'stalled' | 'completed' | 'blocked' | 'on_hold'
  priority: 1 | 2 | 3 | 4 | 5 // 5 = highest priority
  stakeholders: ProjectStakeholder[]
  expected_timeline: ProjectTimeline
  communication_cadence: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'adhoc'
  last_meaningful_update?: Date
  last_communication_date?: Date
  health_score: number // 1-10, where 10 = perfectly healthy
  risk_factors: string[]
  success_metrics: Record<string, any>
  created_at: Date
  updated_at: Date
  created_by: string
}

export interface ProjectStakeholder {
  name: string
  email: string
  role: 'owner' | 'contributor' | 'stakeholder' | 'decision_maker' | 'observer'
  importance: 1 | 2 | 3 | 4 | 5 // 5 = most important
}

export interface ProjectTimeline {
  milestones: ProjectMilestone[]
  deadlines: ProjectDeadline[]
}

export interface ProjectMilestone {
  name: string
  description?: string
  target_date: Date
  completion_date?: Date
  status: 'pending' | 'in_progress' | 'completed' | 'delayed'
}

export interface ProjectDeadline {
  name: string
  date: Date
  type: 'hard' | 'soft' | 'preferred'
  consequences_if_missed?: string
}

export interface ProjectThread {
  id: string
  project_id: string
  thread_id: string
  relevance_score: number // 0-1
  relationship_type: 'primary' | 'related' | 'tangential' | 'blocking' | 'dependency'
  detected_at: Date
  confidence_score: number // 0-1
}

export interface ProjectStatusHistory {
  id: string
  project_id: string
  previous_status?: string
  new_status: string
  trigger_event: 'email_received' | 'deadline_passed' | 'manual_update' | 'ai_detected'
  trigger_thread_id?: string
  trigger_message_id?: string
  change_reason?: string
  detected_at: Date
  confidence_score: number
  ai_reasoning?: string
}

export interface StakeholderIntelligence {
  id: string
  user_id: string
  stakeholder_email: string
  stakeholder_name?: string
  role_title?: string
  organization?: string
  relationship_type: 'board_member' | 'direct_report' | 'peer' | 'external_partner' | 'vendor' | 'client' | 'colleague'
  importance_level: 1 | 2 | 3 | 4 | 5
  communication_style: {
    preferred_frequency?: string
    response_time_avg?: number // hours
    formality_level?: 'formal' | 'professional' | 'casual'
  }
  interaction_patterns: {
    meeting_frequency?: string
    email_frequency?: string
    last_interaction?: Date
  }
  preferences: {
    meeting_times?: string[]
    communication_preferences?: string[]
    topics_of_interest?: string[]
  }
  projects: string[] // project IDs
  risk_indicators: string[]
  created_at: Date
  updated_at: Date
}

export interface ExecutiveAttentionItem {
  id: string
  user_id: string
  title: string
  description?: string
  urgency_level: 1 | 2 | 3 | 4 | 5 // 5 = most urgent
  category: 'decision_needed' | 'follow_up_required' | 'relationship_issue' | 'project_risk' | 'opportunity'
  project_id?: string
  stakeholder_email?: string
  source_thread_id?: string
  source_message_id?: string
  due_date?: Date
  status: 'pending' | 'in_progress' | 'resolved' | 'delegated'
  assigned_to?: string
  ai_recommendation?: string
  human_notes?: string
  created_at: Date
  resolved_at?: Date
}

export interface CommunicationGap {
  id: string
  user_id: string
  gap_type: 'project_update_overdue' | 'stakeholder_silent' | 'decision_pending' | 'follow_up_missed'
  project_id?: string
  stakeholder_email?: string
  expected_communication_date?: Date
  days_overdue?: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  ai_suggested_action?: string
  status: 'active' | 'escalated' | 'resolved' | 'ignored'
  detected_at: Date
  resolved_at?: Date
}

export interface StrategicInsight {
  id: string
  user_id: string
  insight_type: 'trend_detected' | 'risk_identified' | 'opportunity_spotted' | 'pattern_change'
  title: string
  description?: string
  confidence_score: number // 0-1
  impact_level: 'low' | 'medium' | 'high' | 'critical'
  related_projects: string[]
  related_stakeholders: string[]
  supporting_evidence: string[] // thread IDs, message IDs
  ai_reasoning?: string
  recommended_action?: string
  status: 'new' | 'reviewed' | 'acting_on' | 'resolved' | 'dismissed'
  human_feedback?: string
  created_at: Date
  reviewed_at?: Date
}

// Executive Assistant Briefing - the main output
export interface ExecutiveAssistantBriefing {
  id: string
  user_id: string
  briefing_date: string
  briefing_type: 'morning' | 'weekly' | 'monthly' | 'ad_hoc'
  
  // Core briefing sections
  immediate_attention: ExecutiveAttentionItem[]
  project_status_summary: ProjectStatusSummary[]
  relationship_insights: RelationshipInsight[]
  communication_gaps: CommunicationGap[]
  strategic_insights: StrategicInsight[]
  upcoming_decisions: UpcomingDecision[]
  
  // Executive summary
  executive_summary: string
  priority_score: number // 1-10
  key_actions_needed: string[]
  
  // Metadata
  generated_at: Date
  ai_confidence: number // 0-1
  human_reviewed: boolean
}

export interface ProjectStatusSummary {
  project: ProjectIntelligence
  current_health: number
  health_trend: 'improving' | 'stable' | 'declining'
  days_since_last_update: number
  key_developments: string[]
  risks_identified: string[]
  next_expected_actions: string[]
  stakeholder_engagement: 'high' | 'medium' | 'low'
}

export interface RelationshipInsight {
  stakeholder: StakeholderIntelligence
  insight_type: 'communication_pattern_change' | 'engagement_increase' | 'engagement_decrease' | 'new_priority' | 'potential_issue'
  description: string
  recommended_action?: string
  urgency: 'low' | 'medium' | 'high'
}

export interface UpcomingDecision {
  title: string
  description: string
  deadline?: Date
  stakeholders_involved: string[]
  project_impact: string[]
  information_needed: string[]
  recommended_approach?: string
  urgency: 'low' | 'medium' | 'high'
}

// Analysis context for AI agents
export interface ExecutiveContext {
  user_id: string
  active_projects: ProjectIntelligence[]
  key_stakeholders: StakeholderIntelligence[]
  recent_communications: any[] // email threads/messages
  calendar_context?: any // future integration
  organization_context?: {
    size: string
    industry: string
    key_priorities: string[]
  }
  personal_preferences?: {
    communication_style: string
    decision_making_style: string
    priority_focus_areas: string[]
  }
}

// AI Agent responses
export interface ProjectAnalysisResult {
  project_id: string
  health_assessment: {
    current_score: number
    trend: 'improving' | 'stable' | 'declining'
    risk_factors: string[]
    positive_indicators: string[]
  }
  communication_analysis: {
    frequency_assessment: string
    stakeholder_engagement: string
    gaps_identified: CommunicationGap[]
  }
  timeline_analysis: {
    on_track_milestones: number
    at_risk_milestones: number
    overdue_items: string[]
  }
  recommended_actions: string[]
}

export interface CrossProjectInsight {
  insight_type: 'resource_conflict' | 'stakeholder_overlap' | 'timeline_dependency' | 'strategic_alignment'
  affected_projects: string[]
  description: string
  impact_assessment: string
  recommended_resolution: string
  urgency: 'low' | 'medium' | 'high'
}