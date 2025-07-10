import { createClient } from '@/lib/supabase/server'

export interface EmailProcessingRule {
  id: string
  user_id: string
  name: string
  description?: string
  is_active: boolean
  matching_criteria: MatchingCriteria
  actions: RuleActions
  confidence_score: number
  times_applied: number
  times_correct: number
  times_incorrect: number
  created_at: string
  updated_at: string
  last_applied_at?: string
}

export interface MatchingCriteria {
  // Sender-based matching
  sender_domain?: string[]
  sender_email?: string[]
  sender_contains?: string[]
  
  // Subject-based matching
  subject_contains?: string[]
  subject_pattern?: string
  subject_exact?: string[]
  
  // Content-based matching
  body_contains?: string[]
  body_pattern?: string
  
  // Thread characteristics
  category?: string[]
  priority?: number[]
  participants_include?: string[]
  participants_exclude?: string[]
  
  // Frequency patterns
  is_recurring?: boolean
  frequency_pattern?: 'daily' | 'weekly' | 'monthly'
  
  // Time-based
  time_of_day?: { start: string, end: string }
  day_of_week?: number[]
}

export interface RuleActions {
  // Processing actions
  auto_process?: boolean
  move_to_folder?: string
  priority?: 'low' | 'normal' | 'high'
  
  // Response instructions
  response_style?: 'none' | 'brief' | 'detailed' | 'formal' | 'casual'
  response_template?: string
  auto_respond?: boolean
  
  // Workflow actions
  create_task?: boolean
  notify_user?: boolean
  forward_to?: string[]
  
  // Learning metadata
  learning_note?: string
}

export interface RuleApplication {
  id: string
  user_id: string
  rule_id: string
  thread_id: string
  actions_taken: RuleActions
  user_feedback?: 'correct' | 'incorrect' | 'partially_correct'
  user_notes?: string
  applied_at: string
  feedback_at?: string
}

export class EmailProcessingRulesService {
  private supabase: any

  constructor() {
    this.supabase = null
  }

  async initialize() {
    this.supabase = await createClient()
  }

  /**
   * Create a new processing rule from user instruction
   */
  async createRuleFromInstruction(
    userId: string, 
    instruction: string, 
    threadExample?: any
  ): Promise<EmailProcessingRule> {
    await this.initialize()
    
    // Parse the instruction to extract criteria and actions
    const parsed = this.parseUserInstruction(instruction, threadExample)
    
    const { data, error } = await this.supabase
      .from('email_processing_rules')
      .insert({
        user_id: userId,
        name: parsed.name,
        description: instruction,
        matching_criteria: parsed.criteria,
        actions: parsed.actions,
        confidence_score: parsed.confidence || 0.8 // Start with high confidence for explicit instructions
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create rule: ${error.message}`)
    }

    return data
  }

  /**
   * Parse user instruction into rule components
   */
  private parseUserInstruction(instruction: string, threadExample?: any): {
    name: string
    criteria: MatchingCriteria
    actions: RuleActions
    confidence: number
  } {
    const lower = instruction.toLowerCase()
    const criteria: MatchingCriteria = {}
    const actions: RuleActions = {}
    let name = 'Custom Rule'
    let confidence = 0.9 // Higher confidence when we have thread context

    // Extract context from thread example if available
    if (threadExample) {
      // Use actual thread characteristics to build better criteria
      const subject = threadExample.subject?.toLowerCase() || ''
      const participants = threadExample.participants || []
      const category = threadExample.category
      const firstMessage = threadExample.email_messages?.[0]
      const fromEmail = firstMessage?.from_email?.toLowerCase() || ''
      const fromDomain = fromEmail.split('@')[1] || ''

      // Extract keywords from the actual subject for better matching
      const subjectWords = subject.split(/\s+/).filter(word => 
        word.length > 3 && 
        !['the', 'and', 'or', 'but', 'for', 'with', 'from', 'this', 'that', 'your', 'have', 'will', 'been'].includes(word.toLowerCase())
      )

      if (subjectWords.length > 0) {
        criteria.subject_contains = subjectWords.slice(0, 3) // Top 3 meaningful words
      }

      // Add sender domain if it's not a common provider
      if (fromDomain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(fromDomain)) {
        criteria.sender_domain = [fromDomain]
      }

      // Add category matching
      if (category && category !== 'SPAM') {
        criteria.category = [category]
      }

      // Generate contextual name from thread
      if (subject) {
        const cleanSubject = subject.replace(/^(re:|fwd?:|fw:)\s*/i, '').trim()
        const firstPart = cleanSubject.split(/[:\-,]/)[0].trim()
        if (firstPart.length > 5 && firstPart.length < 40) {
          name = this.titleCase(firstPart)
        }
      }

      // If still generic, use domain name
      if (name === 'Custom Rule' && fromDomain) {
        name = `${this.titleCase(fromDomain.split('.')[0])} Emails`
      }
    }

    // Parse instruction-based rules (these can override or supplement thread context)
    if (lower.includes('admin') || lower.includes('administrator')) {
      criteria.sender_contains = [...(criteria.sender_contains || []), 'admin', 'noreply', 'no-reply']
      if (name === 'Custom Rule') name = 'Admin Notifications'
    }

    if (lower.includes('automated') || lower.includes('notification')) {
      criteria.subject_contains = [...(criteria.subject_contains || []), 'notification', 'automated', 'alert', 'reminder']
      if (name === 'Custom Rule') name = 'Automated Notifications'
    }

    // Parse content-based rules
    if (lower.includes('internal') && lower.includes('conversation')) {
      criteria.participants_include = threadExample?.participants || []
      if (name === 'Custom Rule') name = 'Internal Conversations'
    }

    if (lower.includes('resource') && lower.includes('admin')) {
      criteria.subject_contains = [...(criteria.subject_contains || []), 'resource', 'admin', 'access', 'permission']
      if (name === 'Custom Rule') name = 'Resource Admin Messages'
    }

    // Parse action instructions
    if (lower.includes('no action') || lower.includes('require no action')) {
      actions.auto_process = true
      actions.priority = 'low'
      actions.response_style = 'none'
    }

    if (lower.includes('move') && lower.includes('folder')) {
      actions.move_to_folder = this.extractFolderName(instruction, threadExample)
      actions.auto_process = true
    }

    if (lower.includes('mark as processed') || lower.includes('mark as done')) {
      actions.auto_process = true
    }

    if (lower.includes('short') && lower.includes('succinct')) {
      actions.response_style = 'brief'
    }

    if (lower.includes("don't need to waste time")) {
      actions.auto_process = true
      actions.priority = 'low'
      actions.notify_user = false
    }

    // Extract specific folder mentions
    const folderMatch = instruction.match(/move.*to.*"([^"]+)"/i) || 
                       instruction.match(/move.*to.*'([^']+)'/i) ||
                       instruction.match(/move.*to\s+([\w\s]+?)(?:\s+and|\s*$)/i)
    if (folderMatch) {
      actions.move_to_folder = folderMatch[1].trim()
    }

    // Extract topic-based criteria
    const topicMatch = instruction.match(/about\s+([\w\s]+?)(?:\s+topic|\s*$)/i) ||
                      instruction.match(/"([^"]+)"\s+topic/i)
    if (topicMatch) {
      criteria.subject_contains = criteria.subject_contains || []
      criteria.subject_contains.push(topicMatch[1].trim().toLowerCase())
      name = `${topicMatch[1].trim()} Topic`
    }

    return { name, criteria, actions, confidence }
  }

  /**
   * Convert string to title case
   */
  private titleCase(str: string): string {
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    )
  }

  /**
   * Extract folder name from instruction or thread context
   */
  private extractFolderName(instruction: string, threadExample?: any): string {
    // Look for explicit folder mentions
    const explicitFolder = instruction.match(/(?:move|file|put).*(?:to|in)\s+["']?([^"'\n]+)["']?/i)
    if (explicitFolder) {
      return explicitFolder[1].trim()
    }

    // Use subject-based naming
    if (threadExample?.subject) {
      const subject = threadExample.subject.toLowerCase()
      if (subject.includes('admin')) return 'Admin Notifications'
      if (subject.includes('resource')) return 'Resource Management'
      if (subject.includes('internal')) return 'Internal Communications'
    }

    return 'Processed Items'
  }

  /**
   * Find matching rules for an email thread
   */
  async findMatchingRules(userId: string, thread: any): Promise<EmailProcessingRule[]> {
    await this.initialize()

    const { data: rules, error } = await this.supabase
      .from('email_processing_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('confidence_score', { ascending: false })

    if (error) {
      console.error('Error fetching rules:', error)
      return []
    }

    return rules.filter(rule => this.ruleMatches(rule, thread))
  }

  /**
   * Check if a rule matches a thread
   */
  private ruleMatches(rule: EmailProcessingRule, thread: any): boolean {
    const criteria = rule.matching_criteria
    const firstMessage = thread.email_messages?.[0]
    
    if (!firstMessage) return false

    const subject = (thread.subject || '').toLowerCase()
    const body = (firstMessage.body || '').toLowerCase()
    const fromEmail = (firstMessage.from_email || '').toLowerCase()
    const fromDomain = fromEmail.split('@')[1] || ''

    // Check sender criteria
    if (criteria.sender_domain && !criteria.sender_domain.some(domain => 
      fromDomain.includes(domain.toLowerCase())
    )) return false

    if (criteria.sender_email && !criteria.sender_email.some(email => 
      fromEmail.includes(email.toLowerCase())
    )) return false

    if (criteria.sender_contains && !criteria.sender_contains.some(text => 
      fromEmail.includes(text.toLowerCase())
    )) return false

    // Check subject criteria
    if (criteria.subject_contains && !criteria.subject_contains.some(text => 
      subject.includes(text.toLowerCase())
    )) return false

    if (criteria.subject_pattern) {
      const regex = new RegExp(criteria.subject_pattern, 'i')
      if (!regex.test(subject)) return false
    }

    if (criteria.subject_exact && !criteria.subject_exact.some(exact => 
      subject === exact.toLowerCase()
    )) return false

    // Check body criteria
    if (criteria.body_contains && !criteria.body_contains.some(text => 
      body.includes(text.toLowerCase())
    )) return false

    if (criteria.body_pattern) {
      const regex = new RegExp(criteria.body_pattern, 'i')
      if (!regex.test(body)) return false
    }

    // Check thread characteristics
    if (criteria.category && !criteria.category.includes(thread.category)) return false

    if (criteria.priority && !criteria.priority.includes(thread.priority)) return false

    if (criteria.participants_include && !criteria.participants_include.some(email => 
      thread.participants?.includes(email)
    )) return false

    if (criteria.participants_exclude && criteria.participants_exclude.some(email => 
      thread.participants?.includes(email)
    )) return false

    return true
  }

  /**
   * Apply a rule to a thread
   */
  async applyRule(
    userId: string, 
    rule: EmailProcessingRule, 
    threadId: string
  ): Promise<RuleApplication> {
    await this.initialize()

    // Record the application
    const { data: application, error } = await this.supabase
      .from('email_rule_applications')
      .insert({
        user_id: userId,
        rule_id: rule.id,
        thread_id: threadId,
        actions_taken: rule.actions
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to record rule application: ${error.message}`)
    }

    // Update rule statistics
    await this.supabase
      .from('email_processing_rules')
      .update({
        times_applied: rule.times_applied + 1,
        last_applied_at: new Date().toISOString()
      })
      .eq('id', rule.id)

    return application
  }

  /**
   * Get user's processing rules
   */
  async getUserRules(userId: string): Promise<EmailProcessingRule[]> {
    await this.initialize()

    const { data, error } = await this.supabase
      .from('email_processing_rules')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch rules: ${error.message}`)
    }

    return data || []
  }

  /**
   * Update rule based on user feedback
   */
  async provideFeedback(
    userId: string,
    applicationId: string,
    feedback: 'correct' | 'incorrect' | 'partially_correct',
    notes?: string
  ): Promise<void> {
    await this.initialize()

    const { error } = await this.supabase
      .from('email_rule_applications')
      .update({
        user_feedback: feedback,
        user_notes: notes,
        feedback_at: new Date().toISOString()
      })
      .eq('id', applicationId)
      .eq('user_id', userId)

    if (error) {
      throw new Error(`Failed to update feedback: ${error.message}`)
    }
  }

  /**
   * Delete a rule
   */
  async deleteRule(userId: string, ruleId: string): Promise<void> {
    await this.initialize()

    const { error } = await this.supabase
      .from('email_processing_rules')
      .delete()
      .eq('id', ruleId)
      .eq('user_id', userId)

    if (error) {
      throw new Error(`Failed to delete rule: ${error.message}`)
    }
  }

  /**
   * Toggle rule active status
   */
  async toggleRule(userId: string, ruleId: string, isActive: boolean): Promise<void> {
    await this.initialize()

    const { error } = await this.supabase
      .from('email_processing_rules')
      .update({ is_active: isActive })
      .eq('id', ruleId)
      .eq('user_id', userId)

    if (error) {
      throw new Error(`Failed to toggle rule: ${error.message}`)
    }
  }
}