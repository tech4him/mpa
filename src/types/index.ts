export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  azure_ad_id?: string
  encrypted_refresh_token?: string
  preferences: Record<string, any>
  created_at: Date
  updated_at: Date
}

export interface EmailAccount {
  id: string
  user_id: string
  email_address: string
  microsoft_subscription_id?: string
  webhook_secret: string
  sync_status: string
  last_sync?: Date
  created_at: Date
}

export interface EmailThread {
  id: string
  user_id: string
  thread_id: string
  subject?: string
  participants: string[]
  category?: string
  priority: number
  status: string
  first_message_date?: Date
  last_message_date?: Date
  message_count: number
  has_attachments: boolean
  is_vip: boolean
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
}

export interface EmailMessage {
  id: string
  thread_id: string
  message_id: string
  sender: string
  recipients: string[]
  cc_recipients?: string[]
  sent_date?: Date
  has_draft: boolean
  processed: boolean
  created_at: Date
  body?: string
  subject?: string
  from_email?: string
  from_name?: string
  to_recipients?: string[]
  bcc_recipients?: string[]
  received_at?: Date
  content_type?: string
}

export interface EmailDraft {
  id: string
  message_id: string
  thread_id: string
  user_id: string
  draft_content: string
  draft_version: number
  ai_confidence?: number
  context_used?: Record<string, any>
  status: string
  created_at: Date
}

export interface LearningSample {
  id: string
  user_id: string
  draft_id?: string
  original_draft: string
  final_sent: string
  diff_analysis: DiffAnalysis
  recipient_domain?: string
  thread_category?: string
  feedback_score?: -1 | 0 | 1
  user_note?: string
  created_at: Date
}

export interface DiffAnalysis {
  additions: string[]
  deletions: string[]
  toneShift?: string
  structureChange?: string
  significantChange: boolean
}

export interface ExtractedTask {
  id: string
  thread_id: string
  user_id: string
  task_description: string
  due_date?: Date
  assigned_to?: string
  status: string
  clickup_task_id?: string
  confidence?: number
  created_at: Date
}

export interface Contact {
  id: string
  user_id: string
  email: string
  name?: string
  organization?: string
  is_vip: boolean
  vip_tier: number
  communication_preferences: Record<string, any>
  total_interactions: number
  last_interaction?: Date
  created_at: Date
}

export interface DailyBriefing {
  id: string
  user_id: string
  briefing_date: Date
  briefing_type: 'morning' | 'evening'
  intelligence_summary: IntelligenceSummary
  actions_recommended: IntelligentAction[]
  actions_taken_automatically: AutomatedAction[]
  priority_score: number
  generated_at: Date
  delivered_at?: Date
  user_feedback?: string
  created_at: Date
  included_action_ids?: string[]
}

export interface IntelligenceSummary {
  need_to_know: {
    title: string
    description: string
    urgency: 'high' | 'medium' | 'low'
    related_threads?: string[]
  }[]
  need_to_do: {
    task: string
    due: Date | null
    priority: number
    source: string
    thread_id?: string
  }[]
  anomalies: {
    type: string
    description: string
    severity: 'critical' | 'warning' | 'info'
    recommendation: string
    related_entity?: string
  }[]
  key_metrics: {
    unread_important: number
    pending_responses: number
    overdue_tasks: number
    vip_threads: number
  }
}

export interface AutomatedAction {
  action_type: string
  description: string
  executed_at: Date
  result: 'success' | 'failed' | 'partial'
  details?: Record<string, any>
}

export interface BriefingContent {
  priority_threads: EmailThread[]
  pending_tasks: ExtractedTask[]
  vip_communications: EmailThread[]
  ai_summary: string
  stats: {
    emails_processed: number
    drafts_generated: number
    tasks_extracted: number
  }
}

export interface ThreadAnalysis {
  requiresAction: boolean
  hasTask: boolean
  isVIP: boolean
  category: string
  priority: number
  suggestedResponse?: string
  extractedTasks?: Array<{
    description: string
    due_date?: string
    assigned_to?: string
  }>
  contextSummary?: string
  projectReferences?: string[]
  relationshipInsights?: string
  confidence?: number
  organizationalContext?: any
  projectContext?: any
  relationshipContext?: any
}

export interface OrganizationalKnowledge {
  id: string
  document_type: 'email' | 'document' | 'meeting' | 'project' | 'decision'
  content: string
  metadata: Record<string, any>
  vector_store_id?: string
  project_id?: string
  created_at: Date
  updated_at: Date
}

export interface ProjectContext {
  id: string
  project_name: string
  description?: string
  status?: string
  team_members?: string[]
  key_documents?: string[]
  timeline?: Record<string, any>
  vector_store_id?: string
  created_at: Date
  updated_at: Date
}

export interface RelationshipIntelligence {
  id: string
  contact_id: string
  interaction_history?: Record<string, any>
  communication_preferences?: Record<string, any>
  project_involvement?: string[]
  decision_history?: Record<string, any>
  created_at: Date
  updated_at: Date
}

export interface OutlookWebhookPayload {
  value: Array<{
    subscriptionId: string
    changeType: "created" | "updated" | "deleted"
    resource: string
    resourceData: {
      id: string
      "@odata.type": string
      "@odata.id": string
    }
  }>
}

export interface IntelligentAction {
  id: string
  user_id: string
  action_type: 'draft_reply' | 'schedule_follow_up' | 'file_document' | 'create_task' | 
               'schedule_meeting' | 'delegate_task' | 'archive_thread' | 'escalate_urgent' | 
               'update_project' | 'send_reminder'
  trigger_context: string
  recommended_action: {
    type: string
    details: Record<string, any>
    draft?: string
    targetDate?: Date
    participants?: string[]
    folder?: string
    taskDetails?: {
      description: string
      due_date?: Date
      assigned_to?: string
      priority?: number
    }
  }
  confidence_score: number
  urgency_level: number
  auto_execute: boolean
  status: 'pending' | 'approved' | 'executed' | 'rejected' | 'expired'
  user_feedback?: string
  executed_at?: Date
  created_at: Date
  expires_at: Date
  thread_id?: string
  contact_id?: string
  project_name?: string
  metadata?: Record<string, any>
}