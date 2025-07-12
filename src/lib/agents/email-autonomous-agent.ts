import { BaseAgent, AgentConfig, AgentDecision } from './core/base-agent'
import { createClient } from '@/lib/supabase/server'
import { generateDraftWithAgent } from './draft-generator-agent'
import { analyzeEmailWithAgent } from './simple-email-agent'
import { sendEmail } from '@/lib/microsoft-graph/email'

interface EmailItem {
  id: string
  thread_id: string
  subject: string
  from_email: string
  body: string
  category?: string
  is_processed: boolean
}

export class EmailAutonomousAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super({
      ...config,
      name: 'Email Autonomous Agent',
      description: 'Autonomously processes emails based on configured rules'
    })
  }

  protected async run(): Promise<void> {
    console.log(`[${this.config.name}] Agent started in ${this.config.autonomyLevel} mode`)
    
    while (this.isActive) {
      try {
        if (this.status === 'paused') {
          await this.sleep(5000)
          continue
        }

        // Get unprocessed emails
        const items = await this.getItemsToProcess()
        
        if (items.length > 0) {
          console.log(`[${this.config.name}] Found ${items.length} emails to process`)
          this.metrics.pending = items.length
        }

        // Process each email
        for (const item of items) {
          if (!this.isActive || this.status === 'paused') break
          
          try {
            await this.processItem(item)
          } catch (error) {
            console.error(`[${this.config.name}] Error processing email ${item.id}:`, error)
            await this.recordAction('process_email', { emailId: item.id, error }, 'failure')
          }
        }

        // Wait before next check
        await this.sleep(this.config.checkInterval)
        
      } catch (error) {
        console.error(`[${this.config.name}] Error in run loop:`, error)
        await this.sleep(30000) // Wait 30s on error
      }
    }
  }

  protected async getItemsToProcess(): Promise<EmailItem[]> {
    const supabase = await createClient()
    
    // Get unprocessed emails for this user
    const { data: threads, error } = await supabase
      .from('email_threads')
      .select(`
        id,
        subject,
        from_email,
        latest_message_preview,
        category,
        is_processed,
        email_messages!inner(
          id,
          thread_id,
          body,
          from_email,
          received_at
        )
      `)
      .eq('user_id', this.config.userId)
      .eq('is_processed', false)
      .order('latest_message_time', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Error fetching emails:', error)
      return []
    }

    // Transform to email items
    return threads?.map(thread => ({
      id: thread.id,
      thread_id: thread.id,
      subject: thread.subject,
      from_email: thread.from_email,
      body: thread.email_messages[0]?.body || thread.latest_message_preview,
      category: thread.category,
      is_processed: thread.is_processed
    })) || []
  }

  protected async processItem(email: EmailItem): Promise<void> {
    console.log(`[${this.config.name}] Processing email: ${email.subject}`)

    // Step 1: Analyze the email
    const analysis = await this.analyzeEmail(email)
    
    // Step 2: Make decision based on analysis
    const decision = await this.makeDecision(email, analysis)
    
    // Step 3: Check if we should process based on autonomy level
    const shouldProcess = await this.shouldProcess(email, decision)
    
    if (!shouldProcess) {
      console.log(`[${this.config.name}] Email requires approval: ${email.subject}`)
      return
    }

    // Step 4: Execute the decision
    await this.executeDecision(email, decision)
    
    // Step 5: Mark as processed
    await this.markAsProcessed(email)
    
    // Record successful action
    await this.recordAction('process_email', {
      emailId: email.id,
      subject: email.subject,
      decision: decision.action,
      confidence: decision.confidence
    }, 'success')
  }

  private async analyzeEmail(email: EmailItem): Promise<any> {
    // Use existing analysis function
    const threadContext = `Subject: ${email.subject}\nFrom: ${email.from_email}`
    return await analyzeEmailWithAgent(email.body, threadContext)
  }

  private async makeDecision(email: EmailItem, analysis: any): Promise<AgentDecision> {
    const decisions: AgentDecision[] = []

    // Decision tree based on email category and content
    if (analysis.category === 'SPAM' || analysis.category === 'MARKETING') {
      decisions.push({
        action: 'archive',
        confidence: 0.95,
        reasoning: 'Marketing or spam email can be auto-archived',
        requiresApproval: false,
        context: { category: analysis.category }
      })
    } else if (analysis.category === 'FYI_ONLY' && !analysis.requiresAction) {
      decisions.push({
        action: 'mark_read',
        confidence: 0.9,
        reasoning: 'Informational email with no action required',
        requiresApproval: false,
        context: { category: analysis.category }
      })
    } else if (analysis.category === 'ROUTINE_ADMIN') {
      // Generate and potentially send routine response
      decisions.push({
        action: 'draft_routine_response',
        confidence: 0.85,
        reasoning: 'Routine administrative email can be handled with template',
        requiresApproval: this.config.autonomyLevel !== 'fully-autonomous',
        context: { category: analysis.category, template: 'routine_acknowledgment' }
      })
    } else if (analysis.requiresAction) {
      // Requires human attention
      decisions.push({
        action: 'flag_for_review',
        confidence: 0.95,
        reasoning: 'Email requires specific action or decision',
        requiresApproval: true,
        context: { category: analysis.category, priority: analysis.priority }
      })
    }

    // Return the highest confidence decision
    return decisions.sort((a, b) => b.confidence - a.confidence)[0] || {
      action: 'flag_for_review',
      confidence: 0.5,
      reasoning: 'Unable to determine appropriate action',
      requiresApproval: true,
      context: { analysis }
    }
  }

  private async executeDecision(email: EmailItem, decision: AgentDecision): Promise<void> {
    console.log(`[${this.config.name}] Executing decision: ${decision.action} for ${email.subject}`)

    switch (decision.action) {
      case 'archive':
        await this.archiveEmail(email)
        break
      
      case 'mark_read':
        await this.markAsRead(email)
        break
      
      case 'draft_routine_response':
        await this.draftRoutineResponse(email, decision.context.template)
        break
      
      case 'flag_for_review':
        await this.flagForReview(email, decision.context.priority)
        break
      
      default:
        console.warn(`[${this.config.name}] Unknown action: ${decision.action}`)
    }

    // Emit event about the action taken
    await this.emitEvent({
      type: 'agent.email_processed',
      agentId: this.config.id,
      userId: this.config.userId,
      payload: {
        emailId: email.id,
        subject: email.subject,
        action: decision.action,
        confidence: decision.confidence,
        reasoning: decision.reasoning
      },
      timestamp: new Date()
    })
  }

  private async archiveEmail(email: EmailItem): Promise<void> {
    const supabase = await createClient()
    await supabase
      .from('email_threads')
      .update({ 
        is_processed: true,
        processing_status: 'archived',
        processed_at: new Date().toISOString(),
        processing_reason: 'Auto-archived by AI agent'
      })
      .eq('id', email.thread_id)
  }

  private async markAsRead(email: EmailItem): Promise<void> {
    const supabase = await createClient()
    await supabase
      .from('email_threads')
      .update({ 
        has_unread: false,
        is_processed: true,
        processing_status: 'read',
        processed_at: new Date().toISOString(),
        processing_reason: 'Marked as read by AI agent (FYI only)'
      })
      .eq('id', email.thread_id)
  }

  private async draftRoutineResponse(email: EmailItem, template: string): Promise<void> {
    // Generate draft using existing agent
    const draft = await generateDraftWithAgent({
      threadId: email.thread_id,
      userId: this.config.userId,
      draftType: 'reply',
      context: `Routine ${template} response`
    })

    // Store draft
    const supabase = await createClient()
    await supabase.from('email_drafts').insert({
      thread_id: email.thread_id,
      user_id: this.config.userId,
      subject: `Re: ${email.subject}`,
      body: draft.content,
      confidence_score: draft.confidence,
      reasoning: draft.reasoning,
      status: this.config.autonomyLevel === 'fully-autonomous' ? 'ready_to_send' : 'pending_approval',
      generated_by: 'autonomous_agent'
    })

    // If fully autonomous and high confidence, send it
    if (this.config.autonomyLevel === 'fully-autonomous' && draft.confidence > 0.9) {
      // TODO: Implement actual sending via Microsoft Graph
      console.log(`[${this.config.name}] Would send email: ${email.subject}`)
    }
  }

  private async flagForReview(email: EmailItem, priority: number): Promise<void> {
    const supabase = await createClient()
    await supabase
      .from('email_threads')
      .update({ 
        is_action_required: true,
        priority_score: priority,
        processing_status: 'needs_review',
        processing_reason: 'Flagged for human review by AI agent'
      })
      .eq('id', email.thread_id)
  }

  private async markAsProcessed(email: EmailItem): Promise<void> {
    const supabase = await createClient()
    await supabase
      .from('email_threads')
      .update({ 
        is_processed: true,
        processed_by_agent: this.config.id,
        processed_at: new Date().toISOString()
      })
      .eq('id', email.thread_id)
  }

  protected evaluateRule(rule: any, decision: AgentDecision): boolean {
    // Custom rule evaluation for emails
    if (rule.condition === 'email.from.vip' && decision.context?.fromVIP) {
      return true
    }
    if (rule.condition === 'email.contains.financial' && decision.context?.hasFinancialContent) {
      return true
    }
    if (rule.condition.includes('confidence') && rule.threshold) {
      return decision.confidence < rule.threshold
    }
    return super.evaluateRule(rule, decision)
  }

  getItemType(): string {
    return 'email'
  }
}