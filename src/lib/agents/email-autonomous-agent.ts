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
        participants,
        latest_message_preview,
        category,
        is_processed,
        email_messages!inner(
          id,
          thread_id,
          subject,
          body,
          from_email,
          from_name,
          sender,
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
    return threads?.map(thread => {
      const message = thread.email_messages[0]
      
      // Use multiple fallbacks to get sender information
      // Priority: message.from_email > message.sender > thread.from_email > first participant
      const fromEmail = message?.from_email || 
                       message?.sender || 
                       thread.from_email || 
                       (thread.participants && thread.participants.length > 0 ? thread.participants[0] : '') ||
                       ''
      
      // Debug logging to understand what sender data we have
      if (!thread.subject || thread.subject.trim() === '') {
        console.warn(`[${this.config.name}] Empty subject detected for thread ID: ${thread.id}`, {
          threadFromEmail: thread.from_email,
          messageFromEmail: message?.from_email,
          messageSender: message?.sender,
          messageFromName: message?.from_name,
          messageSubject: message?.subject,
          finalFromEmail: fromEmail,
          participants: thread.participants
        })
      }
      
      // Use message subject as fallback if thread subject is empty
      let finalSubject = thread.subject || message?.subject || '(No Subject)'
      
      // Clean up very long or corrupted subjects 
      if (finalSubject.length > 200) {
        finalSubject = finalSubject.substring(0, 200) + '...'
        console.warn(`[${this.config.name}] Truncated long subject for thread ${thread.id}: ${finalSubject}`)
      }
      
      return {
        id: thread.id,
        thread_id: thread.id,
        subject: finalSubject,
        from_email: fromEmail,
        body: message?.body || thread.latest_message_preview,
        category: thread.category,
        is_processed: thread.is_processed
      }
    }) || []
  }

  protected async processItem(email: EmailItem): Promise<void> {
    console.log(`[${this.config.name}] Processing email: ${email.subject}`)

    // Check if already processed (race condition protection)
    if (email.is_processed) {
      console.log(`[${this.config.name}] Email already processed: ${email.subject}`)
      return
    }

    // Step 1: Analyze the email
    const analysis = await this.analyzeEmail(email)
    
    // Step 2: Make decision based on analysis
    const decision = await this.makeDecision(email, analysis)
    
    // Step 3: Check if we should process based on autonomy level
    const shouldProcess = await this.shouldProcess(email, decision)
    
    if (!shouldProcess) {
      console.log(`[${this.config.name}] Email requires approval: ${email.subject}`)
      // Mark as processed to prevent reprocessing while waiting for approval
      await this.markAsProcessed(email)
      return
    }

    // Step 4: Execute the decision
    await this.executeDecision(email, decision)
    
    // Step 5: Mark as processed (if not already marked above)
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
    // First, try to use AI to make intelligent decisions with learning context
    const intelligentDecision = await this.makeIntelligentDecision(email, analysis)
    if (intelligentDecision) {
      console.log(`[${this.config.name}] Using AI decision: ${intelligentDecision.action} (confidence: ${intelligentDecision.confidence})`)
      return intelligentDecision
    }

    console.log(`[${this.config.name}] AI decision failed, falling back to rule-based decision`)
    
    // Fallback to rule-based decision tree if AI fails
    if (analysis.category === 'SPAM' || analysis.category === 'MARKETING') {
      return {
        action: 'archive',
        confidence: 0.95,
        reasoning: 'Marketing or spam email can be auto-archived',
        requiresApproval: false,
        context: { category: analysis.category }
      }
    } else if (analysis.category === 'FYI_ONLY' && !analysis.requiresAction) {
      return {
        action: 'mark_read',
        confidence: 0.9,
        reasoning: 'Informational email with no action required',
        requiresApproval: false,
        context: { category: analysis.category }
      }
    } else if (analysis.category === 'ROUTINE_ADMIN') {
      return {
        action: 'draft_routine_response',
        confidence: 0.85,
        reasoning: 'Routine administrative email can be handled with template',
        requiresApproval: this.config.autonomyLevel !== 'fully-autonomous',
        context: { category: analysis.category, template: 'routine_acknowledgment' }
      }
    } else if (analysis.requiresAction) {
      return {
        action: 'flag_for_review',
        confidence: 0.95,
        reasoning: 'Email requires specific action or decision',
        requiresApproval: true,
        context: { category: analysis.category, priority: analysis.priority }
      }
    }

    // Default fallback
    return {
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
      
      case 'file_receipt':
        await this.fileReceipt(email, decision.context.folder)
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
    try {
      // Generate draft using existing agent
      const draft = await generateDraftWithAgent({
        threadId: email.thread_id,
        userId: this.config.userId,
        draftType: 'reply',
        context: `Routine ${template} response`
      })
      
      console.log(`[${this.config.name}] Successfully generated draft for: ${email.subject}`)

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
        try {
          console.log(`[${this.config.name}] Sending high-confidence email: ${email.subject}`)
          
          const result = await sendEmail(this.config.userId, {
            to: email.replyTo ? [email.replyTo] : [email.from],
            subject: draft.subject,
            body: draft.content,
            isHtml: true,
            inReplyToId: email.id,
            threadId: email.threadId
          })

          if (result.success) {
          console.log(`[${this.config.name}] Successfully sent email: ${email.subject}`)
          
          // Update draft status to sent
          await supabase
            .from('email_drafts')
            .update({ 
              status: 'sent',
              sent_at: new Date().toISOString(),
              sent_message_id: result.messageId
            })
            .eq('id', draftResult.data.id)
            
          // Log the action
          await this.logAction({
            action_type: 'send_email',
            email_id: email.id,
            description: `Automatically sent high-confidence reply to: ${email.subject}`,
            metadata: {
              confidence: draft.confidence,
              messageId: result.messageId,
              draftId: draftResult.data.id
            }
          })
        } else {
          console.error(`[${this.config.name}] Failed to send email:`, result.error)
          
          // Update draft status to failed
          await supabase
            .from('email_drafts')
            .update({ 
              status: 'failed',
              error_message: result.error
            })
            .eq('id', draftResult.data.id)
        }
      } catch (error) {
        console.error(`[${this.config.name}] Error in autonomous email sending:`, error)
        
        // Update draft status to failed
        await supabase
          .from('email_drafts')
          .update({ 
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })
          .eq('id', draftResult.data.id)
      }
    }
    } catch (error: any) {
      console.error(`[${this.config.name}] Draft generation failed for ${email.subject}:`, error.message)
      
      // Don't fail the entire email processing if draft generation fails
      // The email will still be marked as processed to prevent reprocessing
      await this.flagForReview(email, 2)
      console.log(`[${this.config.name}] Flagged email for manual review due to draft generation failure`)
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

  // AI-powered decision making with learning context
  private async makeIntelligentDecision(email: EmailItem, analysis: any): Promise<AgentDecision | null> {
    try {
      // Get learning context from previous decisions and user feedback
      const learningContext = await this.getLearningContext(email)
      
      // Use AI agent to make contextual decision
      const decision = await this.analyzeWithLearningContext(email, analysis, learningContext)
      
      return decision
    } catch (error) {
      console.error(`[${this.config.name}] Failed to make intelligent decision:`, error)
      return null
    }
  }

  // Get learning context from previous similar emails and user feedback
  private async getLearningContext(email: EmailItem): Promise<string> {
    const supabase = await createClient()
    
    // Get recent agent decisions and user feedback
    const { data: recentDecisions } = await supabase
      .from('agent_actions')
      .select(`
        action_type,
        description,
        metadata,
        created_at
      `)
      .eq('agent_id', this.config.id)
      .eq('user_id', this.config.userId)
      .order('created_at', { ascending: false })
      .limit(20)

    // Get user feedback on agent approvals (rejected/approved)
    const { data: userFeedback } = await supabase
      .from('agent_approvals')
      .select(`
        decision,
        status,
        user_feedback,
        item_data,
        created_at
      `)
      .eq('agent_id', this.config.id)
      .eq('user_id', this.config.userId)
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10)

    // Get similar emails by sender domain - handle null/undefined from_email
    const senderEmail = email.from_email || ''
    const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : ''
    console.log(`[${this.config.name}] Looking for similar emails from domain: ${senderDomain} (from: ${senderEmail}) for email: ${email.subject}`)
    
    // Build query for similar emails
    let similarEmailsQuery = supabase
      .from('email_threads')
      .select(`
        subject,
        from_email,
        category,
        metadata,
        latest_message_time
      `)
      .eq('user_id', this.config.userId)
      .neq('id', email.thread_id) // Exclude current email
      .eq('is_processed', true) // Only show processed emails as examples
      .not('category', 'is', null) // Only emails that have been categorized

    // Add domain filter only if we have a valid domain
    if (senderDomain && senderDomain.length > 0) {
      similarEmailsQuery = similarEmailsQuery.like('from_email', `%${senderDomain}%`)
    }

    const { data: similarEmails, error: similarError } = await similarEmailsQuery
      .order('latest_message_time', { ascending: false })
      .limit(5)

    if (similarError) {
      console.error(`[${this.config.name}] Error fetching similar emails:`, similarError)
    }

    // Debug: Check what emails exist in the database
    const { data: allEmails, error: debugError } = await supabase
      .from('email_threads')
      .select('id, subject, from_email, category, is_processed')
      .eq('user_id', this.config.userId)
      .limit(10)
    
    console.log(`[${this.config.name}] Database debug - Total emails for user:`, {
      totalEmails: allEmails?.length || 0,
      processedEmails: allEmails?.filter(e => e.is_processed).length || 0,
      categorizedEmails: allEmails?.filter(e => e.category).length || 0,
      processedAndCategorized: allEmails?.filter(e => e.is_processed && e.category).length || 0,
      sampleEmails: allEmails?.slice(0, 3).map(e => ({
        subject: e.subject,
        from_email: e.from_email,
        category: e.category,
        is_processed: e.is_processed
      }))
    })

    // Build learning context
    let context = `Previous decisions and patterns:\n`
    
    if (recentDecisions?.length) {
      context += `Recent agent actions:\n`
      recentDecisions.forEach(decision => {
        context += `- ${decision.action_type}: ${decision.description}\n`
      })
    }

    if (userFeedback?.length) {
      context += `\nUser feedback on similar decisions:\n`
      userFeedback.forEach(feedback => {
        const emailSubject = feedback.item_data?.subject || 'Unknown'
        context += `- Email "${emailSubject}": ${feedback.status} (${feedback.user_feedback || 'no feedback'})\n`
      })
    }

    // Debug: Log what we found
    console.log(`[${this.config.name}] Learning context for ${email.subject}:`, {
      senderDomain,
      similarEmailsCount: similarEmails?.length || 0,
      recentDecisionsCount: recentDecisions?.length || 0,
      userFeedbackCount: userFeedback?.length || 0
    })

    if (similarEmails?.length) {
      context += `\nSimilar emails from ${senderDomain}:\n`
      similarEmails.forEach(similar => {
        context += `- "${similar.subject}" - Category: ${similar.category || 'Unknown'}\n`
      })
    } else {
      console.log(`[${this.config.name}] No similar emails found from domain, trying fallback queries`)
      
      // If no similar emails from domain, try broader queries
      // First try: any processed emails (with or without category)
      const { data: recentProcessed } = await supabase
        .from('email_threads')
        .select('subject, from_email, category, metadata')
        .eq('user_id', this.config.userId)
        .neq('id', email.thread_id)
        .eq('is_processed', true)
        .order('latest_message_time', { ascending: false })
        .limit(5)

      if (recentProcessed?.length) {
        context += `\nRecent processed emails:\n`
        recentProcessed.forEach(recent => {
          const domain = recent.from_email?.split('@')[1] || 'unknown'
          context += `- "${recent.subject}" from ${domain} - Category: ${recent.category || 'Uncategorized'}\n`
        })
      } else {
        // Last resort: any emails at all
        const { data: anyEmails } = await supabase
          .from('email_threads')
          .select('subject, from_email, category')
          .eq('user_id', this.config.userId)
          .neq('id', email.thread_id)
          .order('latest_message_time', { ascending: false })
          .limit(3)

        if (anyEmails?.length) {
          context += `\nRecent emails (any status):\n`
          anyEmails.forEach(recent => {
            const domain = recent.from_email?.split('@')[1] || 'unknown'
            context += `- "${recent.subject}" from ${domain} - Category: ${recent.category || 'Unprocessed'}\n`
          })
        } else {
          context += `\nNo similar emails found in database.\n`
        }
      }
    }

    return context
  }

  // Use AI to analyze email with learning context
  private async analyzeWithLearningContext(
    email: EmailItem, 
    analysis: any, 
    learningContext: string
  ): Promise<AgentDecision | null> {
    const { run } = await import('@openai/agents')
    const { simpleEmailAgent } = await import('@/lib/agents/simple-email-agent')

    const prompt = `Analyze this email and determine the best action based on past learning:

EMAIL DETAILS:
Subject: ${email.subject}
From: ${email.from_email}
Body: ${email.body?.substring(0, 500)}...

INITIAL ANALYSIS:
Category: ${analysis.category}
Requires Action: ${analysis.requiresAction}
Priority: ${analysis.priority}

LEARNING CONTEXT:
${learningContext}

Based on the email content, initial analysis, and learning from past decisions/feedback, what is the most appropriate action?

Available actions:
- archive: For marketing, spam, or unimportant emails
- mark_read: For informational emails that don't need responses
- file_receipt: For invoices, receipts, payment confirmations that should be filed
- draft_routine_response: For emails that need a standard response
- flag_for_review: For emails requiring human attention

Respond with a JSON object:
{
  "action": "action_name",
  "confidence": 0.85,
  "reasoning": "Detailed explanation of why this action is appropriate based on learning context",
  "requiresApproval": true/false,
  "context": {
    "category": "inferred_category",
    "folder": "folder_name_if_filing",
    "template": "template_name_if_drafting"
  }
}`

    try {
      console.log(`[${this.config.name}] Starting AI analysis with prompt length: ${prompt.length}`)
      const response = await run(simpleEmailAgent, prompt)
      console.log(`[${this.config.name}] AI analysis completed, processing response...`)
      
      // Debug: Log the full response structure
      console.log(`[${this.config.name}] AI Response structure:`, {
        type: typeof response,
        isString: typeof response === 'string',
        hasContent: !!response?.content,
        hasFinalOutput: !!response?.finalOutput,
        finalOutputType: typeof response?.finalOutput,
        contentType: typeof response?.content,
        keys: response && typeof response === 'object' ? Object.keys(response) : 'not an object',
        hasState: !!response?.state,
        hasLastTurnResponse: !!response?.state?._lastTurnResponse,
        stateKeys: response?.state ? Object.keys(response.state) : 'no state'
      })
      
      // If it's a RunResult, let's explore more deeply
      if (response && response.state) {
        console.log(`[${this.config.name}] Exploring RunResult state:`, {
          stateType: typeof response.state,
          hasModelResponses: !!response.state._modelResponses,
          modelResponsesLength: response.state._modelResponses ? response.state._modelResponses.length : 0,
          hasLastProcessedResponse: !!response.state._lastProcessedResponse,
          hasCurrentStep: !!response.state._currentStep
        })
      }
      
      let responseText: string
      
      // Handle different response formats - OpenAI Agents framework returns RunResult objects
      if (typeof response === 'string') {
        responseText = response
      } else if (response && response.finalOutput) {
        // This is the correct property for OpenAI Agents JS framework
        responseText = response.finalOutput
        console.log(`[${this.config.name}] Extracted from finalOutput:`, responseText)
      } else if (response && typeof response === 'object' && response.text) {
        responseText = response.text
      } else if (response && typeof response === 'object' && response.content) {
        responseText = response.content
      } else if (response && response.state && response.state._lastTurnResponse) {
        // Extract from OpenAI Agents RunResult state
        const lastResponse = response.state._lastTurnResponse
        console.log(`[${this.config.name}] LastTurnResponse structure:`, {
          keys: Object.keys(lastResponse),
          hasText: !!lastResponse.text,
          hasContent: !!lastResponse.content,
          hasMessage: !!lastResponse.message,
          hasChoices: !!lastResponse.choices,
          type: typeof lastResponse,
          full: lastResponse
        })
        
        // Try different property paths
        responseText = lastResponse.text || 
                     lastResponse.content || 
                     lastResponse.message ||
                     (lastResponse.choices && lastResponse.choices[0]?.message?.content) ||
                     (lastResponse.choices && lastResponse.choices[0]?.text) ||
                     ''
        console.log(`[${this.config.name}] Extracted from RunResult:`, responseText)
      } else if (response && response.state && response.state._modelResponses) {
        // Try to extract from model responses array
        const modelResponses = response.state._modelResponses
        console.log(`[${this.config.name}] Checking model responses:`, {
          length: modelResponses.length,
          lastResponse: modelResponses[modelResponses.length - 1]
        })
        
        const lastModelResponse = modelResponses[modelResponses.length - 1]
        if (lastModelResponse) {
          responseText = lastModelResponse.text || 
                       lastModelResponse.content || 
                       lastModelResponse.message ||
                       (lastModelResponse.choices && lastModelResponse.choices[0]?.message?.content) ||
                       ''
        } else {
          responseText = ''
        }
        console.log(`[${this.config.name}] Extracted from model responses:`, responseText)
      } else if (response && response.state && response.state._lastProcessedResponse) {
        // Try to extract from last processed response
        const lastProcessed = response.state._lastProcessedResponse
        console.log(`[${this.config.name}] Checking last processed response:`, lastProcessed)
        responseText = lastProcessed.text || lastProcessed.content || lastProcessed.message || ''
        console.log(`[${this.config.name}] Extracted from last processed:`, responseText)
      } else {
        console.error(`[${this.config.name}] AI response is empty or malformed - trying to extract any text`)
        // Try to extract any text content from the complex object
        const responseStr = JSON.stringify(response)
        if (responseStr.includes('"action"') && responseStr.includes('"confidence"')) {
          // Look for JSON in the stringified response
          const jsonMatch = responseStr.match(/\{[^}]*"action"[^}]*"confidence"[^}]*\}/)
          if (jsonMatch) {
            responseText = jsonMatch[0].replace(/\\"/g, '"')
            console.log(`[${this.config.name}] Extracted JSON from object:`, responseText)
          } else {
            return null
          }
        } else {
          return null
        }
      }
      
      if (!responseText || responseText.trim() === '') {
        console.error(`[${this.config.name}] AI response text is empty`)
        return null
      }
      
      // Try to extract JSON from the response
      let jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.error(`[${this.config.name}] No JSON found in response:`, responseText)
        return null
      }
      
      const decision = JSON.parse(jsonMatch[0])
      
      // Validate the decision structure
      if (decision.action && typeof decision.confidence === 'number' && decision.reasoning) {
        return decision as AgentDecision
      } else {
        console.error(`[${this.config.name}] Invalid decision structure:`, decision)
        return null
      }
    } catch (error) {
      console.error(`[${this.config.name}] Failed to parse AI decision:`, error)
    }

    return null
  }

  // Helper method to file receipts
  private async fileReceipt(email: EmailItem, folder: string): Promise<void> {
    try {
      console.log(`[${this.config.name}] Filing receipt in ${folder} folder: ${email.subject}`)
      
      // Move to receipts folder and mark as read
      await this.moveToFolder(email, folder)
      await this.markAsRead(email)
      
      // Log the action
      await this.logAction({
        action_type: 'file_receipt',
        email_id: email.id,
        thread_id: email.thread_id,
        description: `Filed receipt/invoice in ${folder} folder: ${email.subject}`,
        metadata: {
          folder: folder,
          from: email.from_email,
          subject: email.subject
        }
      })
      
    } catch (error) {
      console.error(`[${this.config.name}] Failed to file receipt:`, error)
      throw error
    }
  }

  // Helper method to move email to folder (placeholder - implement based on your email service)
  private async moveToFolder(email: EmailItem, folder: string): Promise<void> {
    // This would integrate with Microsoft Graph API to move the email
    console.log(`[${this.config.name}] Moving email to ${folder} folder: ${email.subject}`)
    
    // TODO: Implement actual folder move via Microsoft Graph API
    // For now, we'll just log the action
  }
}