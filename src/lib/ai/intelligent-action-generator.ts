import { createClient } from '@/lib/supabase/server'
import { IntelligentAction, EmailThread, ExtractedTask } from '@/types'
import { Anomaly } from './anomaly-detector'

export interface ActionGenerationContext {
  userId: string
  threads: EmailThread[]
  tasks: ExtractedTask[]
  anomalies: Anomaly[]
}

interface ActionToCreate {
  user_id: string
  action_type: string
  trigger_context: string
  recommended_action: any
  confidence_score: number
  urgency_level: number
  auto_execute: boolean
  status: string
  created_at: Date
  expires_at: Date
  thread_id?: string
  contact_id?: string
  project_name?: string
  metadata?: Record<string, any>
}

export async function generateIntelligentActions(context: ActionGenerationContext): Promise<IntelligentAction[]> {
  const supabase = await createClient()
  const actionsToCreate: ActionToCreate[] = []
  
  // 1. Generate draft reply actions for high-priority threads
  const draftActions = await generateDraftActions(context)
  actionsToCreate.push(...draftActions)
  
  // 2. Generate follow-up actions for overdue tasks
  const followupActions = await generateFollowupActions(context)
  actionsToCreate.push(...followupActions)
  
  // 3. Generate meeting scheduling actions
  const meetingActions = await generateMeetingActions(context)
  actionsToCreate.push(...meetingActions)
  
  // 4. Generate filing/organization actions
  const filingActions = await generateFilingActions(context)
  actionsToCreate.push(...filingActions)
  
  // 5. Generate task creation actions
  const taskActions = await generateTaskActions(context)
  actionsToCreate.push(...taskActions)
  
  // 6. Generate escalation actions based on anomalies
  const escalationActions = await generateEscalationActions(context)
  actionsToCreate.push(...escalationActions)

  // Save actions to database
  const savedActions: IntelligentAction[] = []
  for (const actionData of actionsToCreate) {
    const { data, error } = await supabase
      .from('intelligent_actions')
      .insert(actionData)
      .select()
      .single()
    
    if (error) {
      console.error('Error saving intelligent action:', error)
    } else if (data) {
      savedActions.push(data as IntelligentAction)
    }
  }
  
  return savedActions
}

async function generateDraftActions(context: ActionGenerationContext): Promise<ActionToCreate[]> {
  const actions: ActionToCreate[] = []
  
  // Find threads that need responses
  const threadsNeedingResponse = context.threads.filter(thread => {
    return thread.priority >= 3 && 
           thread.status === 'active' &&
           !thread.metadata?.has_pending_draft
  })
  
  for (const thread of threadsNeedingResponse.slice(0, 5)) { // Limit to top 5
    const urgency = calculateUrgencyFromPriority(thread.priority)
    const confidence = calculateDraftConfidence(thread)
    
    actions.push({
      user_id: context.userId,
      action_type: 'draft_reply',
      trigger_context: `Thread "${thread.subject}" requires response (Priority: ${thread.priority})`,
      recommended_action: {
        type: 'draft_reply',
        details: {
          thread_id: thread.id,
          subject: thread.subject,
          participants: thread.participants,
          context: thread.category
        }
      },
      confidence_score: confidence,
      urgency_level: urgency,
      auto_execute: false, // Always require approval for drafts
      status: 'pending',
      created_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      thread_id: thread.id,
      metadata: {
        thread_category: thread.category,
        participant_count: thread.participants.length
      }
    })
  }
  
  return actions
}

async function generateFollowupActions(context: ActionGenerationContext): Promise<ActionToCreate[]> {
  const actions: ActionToCreate[] = []
  const now = new Date()
  
  // Find overdue tasks
  const overdueTasks = context.tasks.filter(task => {
    if (!task.due_date) return false
    return new Date(task.due_date) < now
  })
  
  for (const task of overdueTasks) {
    const daysPast = task.due_date ? (now.getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24) : 0
    const urgency = Math.min(10, 5 + Math.floor(daysPast))
    
    actions.push({
      user_id: context.userId,
      action_type: 'schedule_follow_up',
      trigger_context: `Task "${task.task_description}" is ${Math.round(daysPast)} days overdue`,
      recommended_action: {
        type: 'schedule_follow_up',
        details: {
          task_id: task.id,
          task_description: task.task_description,
          days_overdue: Math.round(daysPast),
          assigned_to: task.assigned_to
        },
        targetDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
      },
      confidence_score: 0.8,
      urgency_level: urgency,
      auto_execute: false,
      status: 'pending',
      created_at: new Date(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      thread_id: task.thread_id,
      metadata: {
        original_due_date: task.due_date,
        days_overdue: daysPast
      }
    })
  }
  
  return actions
}

async function generateMeetingActions(context: ActionGenerationContext): Promise<ActionToCreate[]> {
  const actions: ActionToCreate[] = []
  
  // Find threads with multiple participants that might need meetings
  const meetingCandidates = context.threads.filter(thread => {
    return thread.participants.length >= 3 &&
           thread.priority >= 3 &&
           thread.message_count >= 5 &&
           thread.category === 'ACTION_REQUIRED'
  })
  
  for (const thread of meetingCandidates.slice(0, 2)) { // Limit to 2
    actions.push({
      user_id: context.userId,
      action_type: 'schedule_meeting',
      trigger_context: `Thread "${thread.subject}" has ${thread.participants.length} participants and ${thread.message_count} messages - may benefit from meeting`,
      recommended_action: {
        type: 'schedule_meeting',
        details: {
          thread_id: thread.id,
          subject: `Meeting: ${thread.subject}`,
          suggested_duration: 30,
          agenda_items: [`Discuss: ${thread.subject}`]
        },
        participants: thread.participants,
        targetDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days from now
      },
      confidence_score: 0.6,
      urgency_level: 6,
      auto_execute: false,
      status: 'pending',
      created_at: new Date(),
      expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
      thread_id: thread.id,
      metadata: {
        participant_count: thread.participants.length,
        message_count: thread.message_count
      }
    })
  }
  
  return actions
}

async function generateFilingActions(context: ActionGenerationContext): Promise<ActionToCreate[]> {
  const actions: ActionToCreate[] = []
  
  // Find completed/archived threads that can be filed
  const completedThreads = context.threads.filter(thread => {
    return thread.status === 'completed' || 
           (thread.category === 'FYI_ONLY' && thread.priority <= 2)
  })
  
  for (const thread of completedThreads.slice(0, 3)) { // Limit to 3
    const suggestedFolder = determineFolderFromCategory(thread.category || 'GENERAL')
    
    actions.push({
      user_id: context.userId,
      action_type: 'file_document',
      trigger_context: `Thread "${thread.subject}" appears to be completed and can be archived`,
      recommended_action: {
        type: 'file_document',
        details: {
          thread_id: thread.id,
          suggested_folder: suggestedFolder,
          reason: 'Thread appears completed'
        },
        folder: suggestedFolder
      },
      confidence_score: 0.7,
      urgency_level: 2,
      auto_execute: true, // Can auto-execute filing
      status: 'pending',
      created_at: new Date(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      thread_id: thread.id,
      metadata: {
        thread_category: thread.category,
        thread_status: thread.status
      }
    })
  }
  
  return actions
}

async function generateTaskActions(context: ActionGenerationContext): Promise<ActionToCreate[]> {
  const actions: ActionToCreate[] = []
  
  // Find threads that might need tasks created
  const taskCandidates = context.threads.filter(thread => {
    return thread.category === 'ACTION_REQUIRED' &&
           thread.priority >= 3 &&
           !context.tasks.some(task => task.thread_id === thread.id)
  })
  
  for (const thread of taskCandidates.slice(0, 3)) { // Limit to 3
    actions.push({
      user_id: context.userId,
      action_type: 'create_task',
      trigger_context: `Thread "${thread.subject}" marked as ACTION_REQUIRED but no tasks exist`,
      recommended_action: {
        type: 'create_task',
        details: {
          thread_id: thread.id,
          description: `Follow up on: ${thread.subject}`,
          priority: thread.priority
        },
        taskDetails: {
          description: `Follow up on: ${thread.subject}`,
          due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
          priority: thread.priority
        }
      },
      confidence_score: 0.65,
      urgency_level: thread.priority,
      auto_execute: false,
      status: 'pending',
      created_at: new Date(),
      expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days
      thread_id: thread.id,
      metadata: {
        thread_priority: thread.priority
      }
    })
  }
  
  return actions
}

async function generateEscalationActions(context: ActionGenerationContext): Promise<ActionToCreate[]> {
  const actions: ActionToCreate[] = []
  
  // Find critical anomalies that need escalation
  const criticalAnomalies = context.anomalies.filter(anomaly => 
    anomaly.severity === 'critical'
  )
  
  for (const anomaly of criticalAnomalies) {
    actions.push({
      user_id: context.userId,
      action_type: 'escalate_urgent',
      trigger_context: `Critical anomaly detected: ${anomaly.description}`,
      recommended_action: {
        type: 'escalate_urgent',
        details: {
          anomaly_type: anomaly.type,
          description: anomaly.description,
          recommendation: anomaly.recommendation,
          related_entity: anomaly.related_entity
        }
      },
      confidence_score: anomaly.confidence,
      urgency_level: 9,
      auto_execute: false,
      status: 'pending',
      created_at: new Date(),
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
      metadata: {
        anomaly_type: anomaly.type,
        anomaly_severity: anomaly.severity
      }
    })
  }
  
  return actions
}

function calculateUrgencyFromPriority(priority: number): number {
  // Map priority (1-5) to urgency (1-10)
  return Math.min(10, priority * 2)
}

function calculateDraftConfidence(thread: EmailThread): number {
  let confidence = 0.6 // Base confidence
  
  // Higher confidence for familiar patterns
  if (thread.category === 'FINANCIAL') confidence += 0.1
  if (thread.is_vip) confidence += 0.1
  if (thread.priority >= 4) confidence += 0.1
  
  // Lower confidence for complex threads
  if (thread.participants.length > 3) confidence -= 0.1
  if (thread.message_count > 10) confidence -= 0.1
  
  return Math.max(0.3, Math.min(0.9, confidence))
}

function determineFolderFromCategory(category: string): string {
  const folderMap: Record<string, string> = {
    'FINANCIAL': 'Finance',
    'LEGAL': 'Legal',
    'PROMOTIONAL': 'Marketing',
    'ADMINISTRATIVE': 'Admin',
    'FYI_ONLY': 'Archive'
  }
  
  return folderMap[category] || 'General'
}