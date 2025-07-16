import { createClient } from '@/lib/supabase/server'

interface LearningPattern {
  from_domain: string
  from_email: string
  subject_keywords: string[]
  body_keywords: string[]
  action_taken: 'do' | 'delegate' | 'defer' | 'delete'
  confidence: number
  frequency: number
}

interface EmailAnalysis {
  from_email: string
  subject: string
  body: string
  estimated_time_seconds: number
}

interface ActionSuggestion {
  action: 'do' | 'delegate' | 'defer' | 'delete'
  confidence: number
  reason: string
  auto_draft?: boolean
}

export class InboxZeroLearningEngine {
  private supabase: any
  private userId: string

  constructor(supabase: any, userId: string) {
    this.supabase = supabase
    this.userId = userId
  }

  async recordAction(emailId: string, action: 'do' | 'delegate' | 'defer' | 'delete', emailData: EmailAnalysis) {
    try {
      // Record the learning sample
      await this.supabase
        .from('learning_samples')
        .insert({
          user_id: this.userId,
          email_thread_id: emailId,
          action_taken: action,
          action_timestamp: new Date().toISOString(),
          source: 'inbox_zero',
          context: {
            from_email: emailData.from_email || '',
            subject: emailData.subject || '',
            body_preview: (emailData.body || '').substring(0, 500),
            estimated_time: emailData.estimated_time_seconds || 0,
            from_domain: emailData.from_email ? emailData.from_email.split('@')[1] : 'unknown',
            subject_keywords: this.extractKeywords(emailData.subject || ''),
            body_keywords: this.extractKeywords(emailData.body || '')
          }
        })

      console.log(`[Learning] Recorded ${action} action for email ${emailId}`)
    } catch (error) {
      console.error('Failed to record learning sample:', error)
    }
  }

  async suggestAction(emailData: EmailAnalysis): Promise<ActionSuggestion> {
    try {
      // Get historical patterns for this user
      const patterns = await this.getUserPatterns(emailData)
      
      // Apply learned patterns
      const learnedSuggestion = this.applyLearningPatterns(emailData, patterns)
      
      // If we have high confidence from learning, use that
      if (learnedSuggestion.confidence > 80) {
        return learnedSuggestion
      }

      // Otherwise, use rule-based fallback with some learning influence
      const ruleBased = this.getRuleBasedSuggestion(emailData)
      
      // Combine learned and rule-based suggestions
      return this.combinesuggestions(learnedSuggestion, ruleBased)
    } catch (error) {
      console.error('Error in suggestion engine:', error)
      return this.getRuleBasedSuggestion(emailData)
    }
  }

  private async getUserPatterns(emailData: EmailAnalysis): Promise<LearningPattern[]> {
    const fromDomain = emailData.from_email.split('@')[1]
    const subjectKeywords = this.extractKeywords(emailData.subject)
    const bodyKeywords = this.extractKeywords(emailData.body)

    // Get learning samples from the last 90 days
    const { data: samples } = await this.supabase
      .from('learning_samples')
      .select('*')
      .eq('user_id', this.userId)
      .gte('action_timestamp', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order('action_timestamp', { ascending: false })
      .limit(200)

    if (!samples || samples.length === 0) {
      return []
    }

    // Group by patterns and calculate confidence
    const patterns: { [key: string]: LearningPattern } = {}

    samples.forEach(sample => {
      const context = sample.context || {}
      const key = `${context.from_domain || 'unknown'}_${sample.action_taken}`
      
      if (!patterns[key]) {
        patterns[key] = {
          from_domain: context.from_domain || 'unknown',
          from_email: context.from_email || 'unknown',
          subject_keywords: [],
          body_keywords: [],
          action_taken: sample.action_taken,
          confidence: 0,
          frequency: 0
        }
      }
      
      patterns[key].frequency++
      patterns[key].subject_keywords.push(...(context.subject_keywords || []))
      patterns[key].body_keywords.push(...(context.body_keywords || []))
    })

    // Calculate confidence scores
    Object.values(patterns).forEach(pattern => {
      const totalFromDomain = samples.filter(s => s.context?.from_domain === pattern.from_domain).length
      pattern.confidence = Math.min(95, (pattern.frequency / totalFromDomain) * 100)
    })

    return Object.values(patterns).filter(p => p.confidence > 30)
  }

  private applyLearningPatterns(emailData: EmailAnalysis, patterns: LearningPattern[]): ActionSuggestion {
    const fromDomain = emailData.from_email.split('@')[1]
    const subjectKeywords = this.extractKeywords(emailData.subject)
    const bodyKeywords = this.extractKeywords(emailData.body)

    let bestMatch: { pattern: LearningPattern; score: number } | null = null

    patterns.forEach(pattern => {
      let score = 0

      // Domain match (highest weight)
      if (pattern.from_domain === fromDomain) {
        score += 50
      }

      // Subject keyword matches
      const subjectMatches = subjectKeywords.filter(k => pattern.subject_keywords.includes(k)).length
      score += subjectMatches * 10

      // Body keyword matches
      const bodyMatches = bodyKeywords.filter(k => pattern.body_keywords.includes(k)).length
      score += bodyMatches * 5

      // Frequency bonus
      score += Math.min(pattern.frequency * 2, 20)

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { pattern, score }
      }
    })

    if (bestMatch && bestMatch.score > 60) {
      return {
        action: bestMatch.pattern.action_taken,
        confidence: Math.min(bestMatch.pattern.confidence, 90),
        reason: `Based on ${bestMatch.pattern.frequency} similar emails from ${bestMatch.pattern.from_domain}, you usually ${bestMatch.pattern.action_taken.toUpperCase()} these.`,
        auto_draft: bestMatch.pattern.action_taken === 'do' || bestMatch.pattern.action_taken === 'delegate'
      }
    }

    return {
      action: 'defer',
      confidence: 20,
      reason: 'No strong learning pattern found',
      auto_draft: false
    }
  }

  private getRuleBasedSuggestion(emailData: EmailAnalysis): ActionSuggestion {
    const contentLower = emailData.body.toLowerCase()
    const subjectLower = emailData.subject.toLowerCase()
    const fromDomain = emailData.from_email.split('@')[1]

    // DELETE patterns
    if (contentLower.includes('unsubscribe') || 
        contentLower.includes('newsletter') ||
        contentLower.includes('promotional') ||
        contentLower.includes('marketing') ||
        subjectLower.includes('newsletter') ||
        fromDomain.includes('noreply') ||
        fromDomain.includes('no-reply')) {
      return {
        action: 'delete',
        confidence: 85,
        reason: 'Appears to be promotional/marketing content',
        auto_draft: false
      }
    }

    // DO patterns (quick actions)
    if (emailData.estimated_time_seconds < 120) { // 2 minutes
      if (contentLower.includes('quick question') ||
          contentLower.includes('yes/no') ||
          contentLower.includes('confirm') ||
          contentLower.includes('approve') ||
          subjectLower.includes('fyi') ||
          subjectLower.includes('quick')) {
        return {
          action: 'do',
          confidence: 80,
          reason: 'Quick response required (< 2 minutes)',
          auto_draft: true
        }
      }
    }

    // DELEGATE patterns
    if (contentLower.includes('can you ask') ||
        contentLower.includes('please have someone') ||
        contentLower.includes('need help with') ||
        contentLower.includes('assign to') ||
        contentLower.includes('forward to')) {
      return {
        action: 'delegate',
        confidence: 75,
        reason: 'Request can be handled by someone else',
        auto_draft: true
      }
    }

    // DEFER patterns
    if (contentLower.includes('when you have time') ||
        contentLower.includes('next week') ||
        contentLower.includes('later') ||
        contentLower.includes('meeting request') ||
        emailData.estimated_time_seconds > 300) { // 5 minutes
      return {
        action: 'defer',
        confidence: 70,
        reason: 'Requires dedicated time or future action',
        auto_draft: false
      }
    }

    // Default to DO for actionable items
    if (contentLower.includes('?') || 
        contentLower.includes('please') ||
        contentLower.includes('need') ||
        contentLower.includes('request')) {
      return {
        action: 'do',
        confidence: 60,
        reason: 'Contains actionable request',
        auto_draft: true
      }
    }

    // Default to defer if unsure
    return {
      action: 'defer',
      confidence: 50,
      reason: 'Requires review to determine action',
      auto_draft: false
    }
  }

  private combinesuggestions(learned: ActionSuggestion, ruleBased: ActionSuggestion): ActionSuggestion {
    // If learned has moderate confidence, use it
    if (learned.confidence > 60) {
      return learned
    }

    // If rule-based has high confidence, use it
    if (ruleBased.confidence > 80) {
      return ruleBased
    }

    // Combine them
    return {
      action: learned.confidence > ruleBased.confidence ? learned.action : ruleBased.action,
      confidence: Math.max(learned.confidence, ruleBased.confidence),
      reason: `${ruleBased.reason} (${learned.confidence}% from learning)`,
      auto_draft: ruleBased.auto_draft || learned.auto_draft
    }
  }

  private extractKeywords(text: string): string[] {
    if (!text) return []
    
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must', 'shall', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them']
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .slice(0, 10) // Top 10 keywords
  }
}