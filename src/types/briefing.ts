export interface EmailBriefingItem {
  id: string
  thread_id: string
  subject: string
  from: {
    email: string
    name?: string
  }
  preview: string
  received_at: Date
  status: 'unread' | 'read' | 'replied'
  priority: number
  actions?: EmailAction[]
}

export interface EmailAction {
  type: 'mark_done' | 'draft_reply' | 'file' | 'delegate' | 'snooze'
  label: string
  icon?: string
  handler?: () => Promise<void>
}

export interface TopicGroup {
  title: string
  description?: string
  priority: 'high' | 'medium' | 'low'
  count: number
  emails: EmailBriefingItem[]
  suggestedActions?: string[]
}

export interface EnhancedBriefingSummary {
  need_to_know: Array<{
    title: string
    description: string
    urgency: 'high' | 'medium' | 'low'
    related_threads?: string[]
  }>
  need_to_do: Array<{
    task: string
    due: Date | null
    priority: number
    source: string
    thread_id?: string
  }>
  topics: TopicGroup[]
  anomalies: Array<{
    type: string
    description: string
    severity: 'critical' | 'warning' | 'info'
    recommendation: string
    related_entity?: string
  }>
  key_metrics: {
    unread_important: number
    pending_responses: number
    overdue_tasks: number
    vip_threads: number
  }
}