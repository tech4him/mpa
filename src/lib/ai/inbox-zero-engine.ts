import { Agent, run } from '@openai/agents'
import { createClient } from '@/lib/supabase/server'
import { ProjectIntelligenceEngine } from './project-intelligence-engine'
import { VectorStoreService } from '@/lib/vector-store/service'

export interface EmailTriageResult {
  email_id: string
  category: 'immediate_action' | 'today' | 'tomorrow' | 'this_week' | 'archive' | 'delete'
  priority: 'urgent' | 'high' | 'medium' | 'low'
  auto_action?: 'archive' | 'delete' | 'reply' | 'forward' | 'mark_read'
  suggested_response?: string
  reason: string
  confidence: number
  requires_attention: boolean
}

export interface InboxZeroSummary {
  total_emails: number
  processed: number
  auto_archived: number
  auto_deleted: number
  requires_action: number
  immediate_attention: EmailTriageResult[]
  suggested_actions: EmailTriageResult[]
  processing_time_ms: number
}

// AI Agent for intelligent email triage
const inboxZeroAgent = new Agent({
  model: 'gpt-4o',
  name: 'InboxZeroAgent',
  description: 'Intelligent email triage agent for rapid inbox zero processing',
  instructions: `You are an elite Executive Assistant AI specialized in rapid email triage for inbox zero achievement.

CRITICAL MISSION: Process emails with surgical precision to get the user to inbox zero as fast as possible.

CRITICAL OUTPUT REQUIREMENT: You MUST respond with ONLY a valid JSON array. No markdown, no explanations, no code blocks - just the raw JSON array.

You have access to:
- Full organizational context and project intelligence
- Communication patterns and relationship history
- User's priorities and decision-making patterns
- Historical email handling preferences

TRIAGE CATEGORIES:
1. **immediate_action**: Requires executive attention within 2 hours
2. **today**: Should be handled today but not urgent
3. **tomorrow**: Can wait until tomorrow
4. **this_week**: Handle within the week
5. **archive**: Information-only, safe to archive immediately
6. **delete**: Spam, marketing, or irrelevant content

AUTO-ACTIONS (when confidence > 90%):
- **archive**: Marketing emails, newsletters, notifications from known safe sources
- **delete**: Clear spam, unsubscribe confirmations, automated system emails
- **reply**: Standard acknowledgments, meeting confirmations, simple yes/no responses
- **mark_read**: FYI emails that don't need action

PRIORITY LEVELS:
- **urgent**: Board-level, crisis, or time-sensitive decisions
- **high**: Important stakeholders, project deadlines, strategic decisions
- **medium**: Team communications, routine business, follow-ups
- **low**: Administrative, informational, non-critical updates

INTELLIGENT REASONING:
- Consider sender relationship and communication history
- Analyze project context and current priorities
- Factor in meeting schedules and deadlines
- Recognize patterns from user's previous actions
- Detect urgency from content and timing

OUTPUT FORMAT:
For each email, provide:
{
  "email_id": "string",
  "category": "immediate_action|today|tomorrow|this_week|archive|delete",
  "priority": "urgent|high|medium|low", 
  "auto_action": "archive|delete|reply|forward|mark_read|null",
  "suggested_response": "draft response if auto_action is reply",
  "reason": "clear explanation of decision",
  "confidence": 0-100,
  "requires_attention": boolean
}

Be aggressive about auto-archiving and auto-deleting to minimize manual work. Only flag items that truly need executive attention.`
})

export class InboxZeroEngine {
  private intelligence: ProjectIntelligenceEngine
  private vectorStore = new VectorStoreService()

  constructor(private userId: string) {
    this.intelligence = new ProjectIntelligenceEngine(userId)
  }

  private async getSupabase() {
    return await createClient(true) // Use service role for admin operations
  }

  /**
   * Process all unread emails for rapid inbox zero
   */
  async processInboxForZero(): Promise<InboxZeroSummary> {
    const startTime = Date.now()

    try {
      // Get unread emails
      const unreadEmails = await this.getUnreadEmails()
      if (unreadEmails.length === 0) {
        return this.createEmptySummary(startTime)
      }

      // Get user context for intelligent processing
      const userContext = await this.getUserContext()

      // Process emails in batches for efficiency
      const batchSize = 10
      const results: EmailTriageResult[] = []

      // TEMPORARY: Process only ONE batch of 10 emails
      console.log(`Found ${unreadEmails.length} unprocessed emails. Processing first batch of ${Math.min(batchSize, unreadEmails.length)}...`)
      
      const batch = unreadEmails.slice(0, batchSize)
      
      try {
        const batchResults = await this.processBatch(batch, userContext)
        results.push(...batchResults)
        
        // Mark emails as processed immediately after successful batch processing
        if (batchResults.length > 0) {
          await this.markEmailsAsProcessed(batch.map(e => e.id))
        }
      } catch (batchError) {
        console.error(`Failed to process batch:`, batchError)
        
        // Still mark the batch as processed to avoid reprocessing on next run
        // This prevents infinite loops and cost overruns
        await this.markEmailsAsProcessed(batch.map(e => e.id))
      }

      // Execute auto-actions
      const autoActionsExecuted = await this.executeAutoActions(results)

      // Generate summary
      const summary = this.generateSummary(
        unreadEmails.length,
        results,
        autoActionsExecuted,
        startTime
      )

      // Store processing results for learning
      await this.storeProcessingResults(results)

      return summary

    } catch (error) {
      console.error('Inbox zero processing failed:', error)
      throw new Error('Failed to process inbox for zero state')
    }
  }

  /**
   * Process emails with specific focus (e.g., only marketing, only team emails)
   */
  async processWithFocus(focus: 'marketing' | 'team' | 'external' | 'urgent'): Promise<EmailTriageResult[]> {
    const emails = await this.getEmailsByFocus(focus)
    const userContext = await this.getUserContext()
    
    return this.processBatch(emails, userContext)
  }

  /**
   * Get rapid triage suggestions without executing actions
   */
  async getTriageSuggestions(emailIds: string[]): Promise<EmailTriageResult[]> {
    const emails = await this.getEmailsByIds(emailIds)
    const userContext = await this.getUserContext()
    
    return this.processBatch(emails, userContext)
  }

  private async getUnreadEmails() {
    const supabase = await this.getSupabase()
    const { data: emails, error } = await supabase
      .from('email_messages')
      .select(`
        id,
        subject,
        body,
        from_email,
        from_name,
        received_at,
        is_read,
        thread_id,
        processed_at,
        email_threads!inner(
          id,
          subject,
          participants
        )
      `)
      .eq('user_id', this.userId)
      .eq('is_read', false)
      .is('processed_at', null)  // Only get unprocessed emails
      .order('received_at', { ascending: false })
      .limit(100) // Process most recent 100 unread emails

    if (error) throw error
    return emails || []
  }

  private async getEmailsByFocus(focus: string) {
    // Implementation would filter emails based on focus type
    // For now, return unread emails (can be enhanced with specific filters)
    return this.getUnreadEmails()
  }

  private async getEmailsByIds(emailIds: string[]) {
    const supabase = await this.getSupabase()
    const { data: emails, error } = await supabase
      .from('email_messages')
      .select(`
        id,
        subject,
        body,
        from_email,
        from_name,
        received_at,
        is_read,
        thread_id,
        email_threads!inner(
          id,
          subject,
          participants
        )
      `)
      .in('id', emailIds)

    if (error) throw error
    return emails || []
  }

  private async getUserContext() {
    try {
      // Get project intelligence and relationship data
      const [projectIntelligence, relationships] = await Promise.all([
        this.intelligence.generateExecutiveIntelligence().catch(() => ({})),
        this.getRelationshipIntelligence()
      ])

      return {
        projects: projectIntelligence,
        relationships,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('Failed to get user context:', error)
      // Return minimal context to allow processing to continue
      return {
        projects: {},
        relationships: [],
        timestamp: new Date().toISOString()
      }
    }
  }

  private async getRelationshipIntelligence() {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from('relationship_intelligence')
      .select('*')
      .eq('user_id', this.userId)
      .order('last_interaction', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Failed to get relationship intelligence:', error)
      return []
    }

    return data || []
  }

  private async processBatch(emails: any[], userContext: any): Promise<EmailTriageResult[]> {
    const emailData = emails.map(email => ({
      id: email.id,
      subject: email.subject,
      body: email.body || '',
      sender: `${email.from_name || email.from_email} <${email.from_email}>`,
      received_at: email.received_at,
      thread_participants: email.email_threads?.participants || []
    }))

    const prompt = `
      Process these ${emails.length} emails for rapid inbox zero achievement.
      
      USER CONTEXT:
      Projects: ${JSON.stringify(userContext.projects)}
      Key Relationships: ${JSON.stringify(userContext.relationships)}
      
      EMAILS TO PROCESS:
      ${JSON.stringify(emailData)}
      
      For each email, determine:
      1. Appropriate triage category and priority
      2. Whether it can be auto-processed (confidence > 90%)
      3. Suggested action to minimize manual work
      4. Clear reasoning for the decision
      
      Be aggressive about auto-archiving routine emails. Only flag items needing genuine executive attention.
      
      CRITICAL: Return ONLY a valid JSON array with no additional text, markdown, or formatting.
      Example format:
      [
        {
          "email_id": "123",
          "category": "archive",
          "priority": "low",
          "auto_action": "archive",
          "reason": "Regular newsletter",
          "confidence": 95,
          "requires_attention": false
        }
      ]
    `

    const response = await run(inboxZeroAgent, prompt)
    return this.parseTriageResults(response.finalOutput, emails.length)
  }

  private parseTriageResults(response: any, expectedCount: number): EmailTriageResult[] {
    try {
      // Log the raw response for debugging
      console.log('Raw agent response:', response)
      
      let responseStr = typeof response === 'string' ? response : JSON.stringify(response)
      
      // Clean up common formatting issues from AI responses
      responseStr = responseStr
        .replace(/```json\s*/g, '')  // Remove markdown code blocks
        .replace(/```\s*/g, '')       // Remove closing code blocks
        .replace(/^`+|`+$/g, '')      // Remove backticks at start/end
        .trim()
      
      // Try to extract JSON array if wrapped in other text
      const jsonMatch = responseStr.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        responseStr = jsonMatch[0];
      }
      
      let results = JSON.parse(responseStr)
      
      if (!Array.isArray(results)) {
        results = [results]
      }

      // Validate and sanitize results
      const sanitized = results.map((result: any) => ({
        email_id: result.email_id || '',
        category: result.category || 'today',
        priority: result.priority || 'medium',
        auto_action: result.auto_action === 'null' || result.auto_action === null ? undefined : result.auto_action,
        suggested_response: result.suggested_response === 'null' || result.suggested_response === null ? undefined : result.suggested_response,
        reason: result.reason || 'Processed by AI',
        confidence: Math.min(100, Math.max(0, result.confidence || 50)),
        requires_attention: result.requires_attention ?? true
      }))
      
      console.log(`Successfully parsed ${sanitized.length} results`)
      return sanitized

    } catch (error) {
      console.error('Failed to parse triage results:', error)
      console.error('Response that failed:', response)
      // Return safe fallback - don't lose the batch
      return []
    }
  }

  private async executeAutoActions(results: EmailTriageResult[]): Promise<{archived: number, deleted: number, replied: number}> {
    let archived = 0, deleted = 0, replied = 0

    for (const result of results) {
      if (result.confidence >= 90 && result.auto_action) {
        try {
          switch (result.auto_action) {
            case 'archive':
              await this.archiveEmail(result.email_id)
              archived++
              break
            case 'delete':
              await this.deleteEmail(result.email_id)
              deleted++
              break
            case 'reply':
              if (result.suggested_response) {
                await this.sendAutoReply(result.email_id, result.suggested_response)
                replied++
              }
              break
            case 'mark_read':
              await this.markAsRead(result.email_id)
              break
          }
        } catch (error) {
          console.error(`Failed to execute ${result.auto_action} for email ${result.email_id}:`, error)
        }
      }
    }

    return { archived, deleted, replied }
  }

  private async archiveEmail(emailId: string) {
    // Mark as read and archive
    const supabase = await this.getSupabase()
    await supabase
      .from('email_messages')
      .update({ 
        is_read: true,
        is_archived: true,
        processed_at: new Date().toISOString()
      })
      .eq('id', emailId)
      .eq('user_id', this.userId)
  }

  private async deleteEmail(emailId: string) {
    // Mark as deleted (soft delete)
    const supabase = await this.getSupabase()
    await supabase
      .from('email_messages')
      .update({ 
        is_deleted: true,
        processed_at: new Date().toISOString()
      })
      .eq('id', emailId)
      .eq('user_id', this.userId)
  }

  private async markAsRead(emailId: string) {
    const supabase = await this.getSupabase()
    await supabase
      .from('email_messages')
      .update({ 
        is_read: true,
        processed_at: new Date().toISOString()
      })
      .eq('id', emailId)
      .eq('user_id', this.userId)
  }

  private async sendAutoReply(emailId: string, response: string) {
    // This would integrate with your existing draft system
    // For now, create a draft that can be reviewed and sent
    const supabase = await this.getSupabase()
    const { data: email } = await supabase
      .from('email_messages')
      .select('thread_id, subject, from_email')
      .eq('id', emailId)
      .single()

    if (email) {
      await supabase
        .from('email_drafts')
        .insert({
          user_id: this.userId,
          thread_id: email.thread_id,
          content: response,
          generated_by: 'inbox_zero_engine',
          status: 'ready_to_send',
          auto_generated: true
        })
    }
  }

  private generateSummary(
    totalEmails: number, 
    results: EmailTriageResult[], 
    autoActions: {archived: number, deleted: number, replied: number},
    startTime: number
  ): InboxZeroSummary {
    const immediateAttention = results.filter(r => 
      r.category === 'immediate_action' && r.requires_attention
    )
    
    const suggestedActions = results.filter(r => 
      r.category !== 'archive' && r.category !== 'delete' && r.requires_attention
    )
    
    // Count emails that require action (not auto-processed)
    const requiresAction = results.filter(r => 
      !r.auto_action && r.requires_attention
    ).length

    return {
      total_emails: totalEmails,
      processed: results.length,
      auto_archived: autoActions.archived,
      auto_deleted: autoActions.deleted,
      requires_action: requiresAction,
      immediate_attention: immediateAttention,
      suggested_actions: suggestedActions,
      processing_time_ms: Date.now() - startTime
    }
  }

  private createEmptySummary(startTime: number): InboxZeroSummary {
    return {
      total_emails: 0,
      processed: 0,
      auto_archived: 0,
      auto_deleted: 0,
      requires_action: 0,
      immediate_attention: [],
      suggested_actions: [],
      processing_time_ms: Date.now() - startTime
    }
  }

  private async storeProcessingResults(results: EmailTriageResult[]) {
    // Store results for learning and analytics
    const processingRecord = {
      user_id: this.userId,
      processed_at: new Date().toISOString(),
      total_processed: results.length,
      auto_actions_taken: results.filter(r => r.auto_action).length,
      high_confidence_decisions: results.filter(r => r.confidence >= 90).length,
      results_summary: results.map(r => ({
        category: r.category,
        priority: r.priority,
        confidence: r.confidence,
        auto_action: r.auto_action
      }))
    }

    const supabase = await this.getSupabase()
    await supabase
      .from('inbox_zero_processing_log')
      .insert(processingRecord)
  }

  private stripHtml(html: string): string {
    return html?.replace(/<[^>]*>/g, '') || ''
  }

  private async markEmailsAsProcessed(emailIds: string[]) {
    if (emailIds.length === 0) return
    
    const supabase = await this.getSupabase()
    const { error } = await supabase
      .from('email_messages')
      .update({ processed_at: new Date().toISOString() })
      .in('id', emailIds)
      .eq('user_id', this.userId)
    
    if (error) {
      console.error('Failed to mark emails as processed:', error)
    } else {
      console.log(`Marked ${emailIds.length} emails as processed`)
    }
  }
}