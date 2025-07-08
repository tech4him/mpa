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
  content: BriefingContent
  delivered_at?: Date
  opened_at?: Date
  created_at: Date
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