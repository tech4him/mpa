import { createClient } from '@/lib/supabase/server'
import { EmailProcessingRulesService, EmailProcessingRule } from './processing-rules'

export interface ProcessingResult {
  isProcessed: boolean
  reason?: string
  actions?: string[]
  appliedRules?: EmailProcessingRule[]
  ruleBasedProcessing?: boolean
}

export class EmailProcessingService {
  private rulesService: EmailProcessingRulesService

  constructor() {
    this.rulesService = new EmailProcessingRulesService()
  }

  private async getSupabase() {
    return await createClient()
  }

  /**
   * Determine if an email thread is fully processed and should be hidden
   */
  async checkThreadProcessingStatus(threadId: string, userId: string): Promise<ProcessingResult> {
    const supabase = await this.getSupabase()

    // Get thread with related data including messages for rule matching
    const { data: thread } = await supabase
      .from('email_threads')
      .select(`
        *,
        email_drafts!inner(
          id,
          status,
          mailbox_draft_id,
          draft_type
        ),
        extracted_tasks(
          id,
          status,
          task_description
        ),
        email_messages(
          id,
          subject,
          body,
          from_email,
          from_name,
          received_at
        )
      `)
      .eq('id', threadId)
      .eq('user_id', userId)
      .single()

    if (!thread) {
      return { isProcessed: false }
    }

    // First, check if any user-defined rules apply
    const matchingRules = await this.rulesService.findMatchingRules(userId, thread)
    
    if (matchingRules.length > 0) {
      // Apply the highest confidence rule
      const bestRule = matchingRules[0]
      
      if (bestRule.actions.auto_process) {
        // Apply the rule
        await this.rulesService.applyRule(userId, bestRule, threadId)
        
        return {
          isProcessed: true,
          reason: `rule_applied: ${bestRule.name}`,
          actions: this.formatRuleActions(bestRule.actions),
          appliedRules: [bestRule],
          ruleBasedProcessing: true
        }
      }
    }

    // Fall back to default processing logic
    switch (thread.category) {
      case 'SPAM':
        return { isProcessed: true, reason: 'spam_filtered' }

      case 'VIP_CRITICAL':
      case 'ACTION_REQUIRED':
        return this.checkActionRequiredCompletion(thread)

      case 'MEETING_REQUEST':
        return this.checkMeetingCompletion(thread)

      case 'FINANCIAL':
        return this.checkFinancialCompletion(thread)

      case 'FYI_ONLY':
        return this.checkFYICompletion(thread)

      default:
        return this.checkGenericCompletion(thread)
    }
  }

  /**
   * Format rule actions for display
   */
  private formatRuleActions(actions: any): string[] {
    const formatted: string[] = []
    
    if (actions.auto_process) {
      formatted.push('Auto-processed by rule')
    }
    
    if (actions.move_to_folder) {
      formatted.push(`Moved to folder: ${actions.move_to_folder}`)
    }
    
    if (actions.response_style) {
      formatted.push(`Response style: ${actions.response_style}`)
    }
    
    if (actions.priority) {
      formatted.push(`Priority set to: ${actions.priority}`)
    }
    
    return formatted
  }

  private checkActionRequiredCompletion(thread: any): ProcessingResult {
    const drafts = thread.email_drafts || []
    const tasks = thread.extracted_tasks || []

    // Check if we have sent drafts or drafts created in mailbox
    const hasCompletedDraft = drafts.some((draft: any) => 
      draft.status === 'sent' || 
      (draft.status === 'in_mailbox' && draft.mailbox_draft_id)
    )

    if (hasCompletedDraft) {
      return { 
        isProcessed: true, 
        reason: 'draft_completed',
        actions: ['Draft reply created/sent']
      }
    }

    // Check if all extracted tasks are completed
    if (tasks.length > 0) {
      const completedTasks = tasks.filter((task: any) => task.status === 'completed')
      if (completedTasks.length === tasks.length) {
        return { 
          isProcessed: true, 
          reason: 'tasks_completed',
          actions: [`All ${tasks.length} tasks completed`]
        }
      }
    }

    return { isProcessed: false }
  }

  private checkMeetingCompletion(thread: any): ProcessingResult {
    // For now, consider meeting requests processed if we have a draft response
    // In future, could integrate with calendar API to check if meeting was scheduled
    const drafts = thread.email_drafts || []
    const hasResponse = drafts.some((draft: any) => 
      draft.status === 'sent' || 
      (draft.status === 'in_mailbox' && draft.mailbox_draft_id)
    )

    if (hasResponse) {
      return { 
        isProcessed: true, 
        reason: 'meeting_responded',
        actions: ['Meeting response sent']
      }
    }

    return { isProcessed: false }
  }

  private checkFinancialCompletion(thread: any): ProcessingResult {
    // Financial emails often need manual review, similar to action required
    return this.checkActionRequiredCompletion(thread)
  }

  private checkFYICompletion(thread: any): ProcessingResult {
    // FYI emails can be auto-processed after a certain time period if read
    const daysSinceLastMessage = thread.last_message_date 
      ? Math.floor((Date.now() - new Date(thread.last_message_date).getTime()) / (1000 * 60 * 60 * 24))
      : 0

    // Auto-hide FYI emails after 7 days if marked as read
    if (!thread.has_unread && daysSinceLastMessage >= 7) {
      return { 
        isProcessed: true, 
        reason: 'fyi_auto_archived',
        actions: ['Auto-archived after 7 days']
      }
    }

    return { isProcessed: false }
  }

  private checkGenericCompletion(thread: any): ProcessingResult {
    // For uncategorized emails, check if there's been any engagement
    const drafts = thread.email_drafts || []
    const tasks = thread.extracted_tasks || []

    if (drafts.length > 0 || tasks.length > 0) {
      // If we've engaged with it, use action required logic
      return this.checkActionRequiredCompletion(thread)
    }

    // Otherwise treat like FYI
    return this.checkFYICompletion(thread)
  }

  /**
   * Mark a thread as processed
   */
  async markThreadAsProcessed(
    threadId: string, 
    userId: string, 
    reason: string,
    isHidden: boolean = true
  ): Promise<boolean> {
    const supabase = await this.getSupabase()

    const { error } = await supabase
      .from('email_threads')
      .update({
        is_processed: true,
        is_hidden: isHidden,
        processed_at: new Date().toISOString(),
        processing_reason: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', threadId)
      .eq('user_id', userId)

    return !error
  }

  /**
   * Unmark a thread as processed (bring it back to active view)
   */
  async unmarkThreadAsProcessed(threadId: string, userId: string): Promise<boolean> {
    const supabase = await this.getSupabase()

    const { error } = await supabase
      .from('email_threads')
      .update({
        is_processed: false,
        is_hidden: false,
        processed_at: null,
        processing_reason: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', threadId)
      .eq('user_id', userId)

    return !error
  }

  /**
   * Auto-process threads that meet completion criteria
   */
  async autoProcessThreads(userId: string): Promise<number> {
    const supabase = await this.getSupabase()

    // Get all active threads for user
    const { data: threads } = await supabase
      .from('email_threads')
      .select('id, category, is_processed')
      .eq('user_id', userId)
      .eq('is_processed', false)

    if (!threads) return 0

    let processedCount = 0

    for (const thread of threads) {
      const result = await this.checkThreadProcessingStatus(thread.id, userId)
      
      if (result.isProcessed && result.reason) {
        const success = await this.markThreadAsProcessed(
          thread.id, 
          userId, 
          result.reason
        )
        
        if (success) {
          processedCount++
          console.log(`Auto-processed thread ${thread.id}: ${result.reason}`)
        }
      }
    }

    return processedCount
  }

  /**
   * Get processing statistics for a user
   */
  async getProcessingStats(userId: string) {
    const supabase = await this.getSupabase()

    const { data: stats } = await supabase
      .from('email_threads')
      .select('is_processed, processing_reason, category')
      .eq('user_id', userId)

    if (!stats) return null

    const total = stats.length
    const processed = stats.filter(s => s.is_processed).length
    const active = total - processed

    const processingReasons = stats
      .filter(s => s.is_processed && s.processing_reason)
      .reduce((acc: any, curr) => {
        acc[curr.processing_reason] = (acc[curr.processing_reason] || 0) + 1
        return acc
      }, {})

    return {
      total,
      active, 
      processed,
      processingReasons
    }
  }

  /**
   * Create a processing rule from user instruction
   */
  async createRuleFromInstruction(
    userId: string,
    instruction: string,
    threadExample?: any
  ): Promise<EmailProcessingRule> {
    return await this.rulesService.createRuleFromInstruction(userId, instruction, threadExample)
  }

  /**
   * Get all processing rules for a user
   */
  async getUserRules(userId: string): Promise<EmailProcessingRule[]> {
    return await this.rulesService.getUserRules(userId)
  }

  /**
   * Provide feedback on a rule application
   */
  async provideFeedback(
    userId: string,
    applicationId: string,
    feedback: 'correct' | 'incorrect' | 'partially_correct',
    notes?: string
  ): Promise<void> {
    return await this.rulesService.provideFeedback(userId, applicationId, feedback, notes)
  }

  /**
   * Delete a processing rule
   */
  async deleteRule(userId: string, ruleId: string): Promise<void> {
    return await this.rulesService.deleteRule(userId, ruleId)
  }

  /**
   * Toggle a rule's active status
   */
  async toggleRule(userId: string, ruleId: string, isActive: boolean): Promise<void> {
    return await this.rulesService.toggleRule(userId, ruleId, isActive)
  }
}