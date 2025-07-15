import { createClient } from '@/lib/supabase/server'

export interface LearningContext {
  emailSubject?: string
  emailFrom?: string
  emailCategory?: string
  emailPriority?: string
  senderRelationship?: string
  timeOfDay?: string
  dayOfWeek?: string
}

export interface AgentLearning {
  originalAction: string
  userPreferredAction: string
  reasoning: string
  context: LearningContext
  confidence: number
  similarity: number
}

export class AgentLearningService {
  private async getSupabase() {
    return await createClient()
  }

  /**
   * Get learning samples for an agent to inform decision-making
   */
  async getLearningForDecision(
    userId: string,
    agentId: string,
    context: LearningContext,
    proposedAction: string
  ): Promise<AgentLearning[]> {
    try {
      const supabase = await this.getSupabase()
      const { data: learningSamples, error } = await supabase
        .from('learning_samples')
        .select('*')
        .eq('user_id', userId)
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(50) // Get recent samples

      if (error) {
        console.error('Error fetching learning samples:', error)
        return []
      }

      if (!learningSamples?.length) return []

      // Score and filter relevant learning samples
      const relevantLearning = learningSamples
        .map(sample => this.calculateRelevance(sample, context, proposedAction))
        .filter(learning => learning.similarity > 0.3) // Only include somewhat relevant samples
        .sort((a, b) => b.similarity - a.similarity) // Sort by relevance
        .slice(0, 10) // Take top 10 most relevant

      return relevantLearning
    } catch (error) {
      console.error('Error in getLearningForDecision:', error)
      return []
    }
  }

  /**
   * Get patterns from learning data to help with confidence adjustment
   */
  async getConfidencePatterns(
    userId: string,
    agentId: string,
    context: LearningContext
  ): Promise<{
    shouldBeMoreCautious: boolean
    shouldBeMoreConfident: boolean
    averageUserSatisfaction: number
    commonMistakes: string[]
  }> {
    try {
      const supabase = await this.getSupabase()
      const { data: samples, error } = await supabase
        .from('learning_samples')
        .select('*')
        .eq('user_id', userId)
        .eq('agent_id', agentId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
        .order('created_at', { ascending: false })

      if (error || !samples?.length) {
        return {
          shouldBeMoreCautious: false,
          shouldBeMoreConfident: false,
          averageUserSatisfaction: 0.5,
          commonMistakes: []
        }
      }

      // Analyze patterns
      const mistakes = samples.filter(s => s.user_preferred_action !== s.original_decision?.action)
      const mistakeRate = mistakes.length / samples.length

      // Find common mistake patterns
      const mistakeReasons = mistakes.map(m => m.reasoning).filter(Boolean)
      const reasonCounts: { [key: string]: number } = {}
      mistakeReasons.forEach(reason => {
        const key = reason.toLowerCase()
        reasonCounts[key] = (reasonCounts[key] || 0) + 1
      })

      const commonMistakes = Object.entries(reasonCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([reason]) => reason)

      return {
        shouldBeMoreCautious: mistakeRate > 0.3, // If making mistakes more than 30% of the time
        shouldBeMoreConfident: mistakeRate < 0.1, // If making mistakes less than 10% of the time
        averageUserSatisfaction: 1 - mistakeRate,
        commonMistakes
      }
    } catch (error) {
      console.error('Error getting confidence patterns:', error)
      return {
        shouldBeMoreCautious: false,
        shouldBeMoreConfident: false,
        averageUserSatisfaction: 0.5,
        commonMistakes: []
      }
    }
  }

  /**
   * Get specific learning for similar email patterns
   */
  async getEmailPatternLearning(
    userId: string,
    agentId: string,
    emailFrom: string,
    emailSubject: string
  ): Promise<{
    hasSpecificLearning: boolean
    preferredAction?: string
    reasoning?: string
    confidence: number
  }> {
    try {
      const supabase = await this.getSupabase()
      // First, look for exact sender matches
      const { data: senderSamples, error: senderError } = await supabase
        .from('learning_samples')
        .select('*')
        .eq('user_id', userId)
        .eq('agent_id', agentId)
        .eq('email_from', emailFrom)
        .order('created_at', { ascending: false })
        .limit(5)

      if (senderError) {
        console.error('Error fetching sender samples:', senderError)
      }

      if (senderSamples?.length) {
        const mostRecent = senderSamples[0]
        const consistency = senderSamples.filter(s => 
          s.user_preferred_action === mostRecent.user_preferred_action
        ).length / senderSamples.length

        return {
          hasSpecificLearning: true,
          preferredAction: mostRecent.user_preferred_action,
          reasoning: `Based on ${senderSamples.length} previous interactions with ${emailFrom}`,
          confidence: consistency
        }
      }

      // Then look for subject pattern matches
      const subjectKeywords = emailSubject.toLowerCase().split(' ').filter(word => word.length > 3)
      if (subjectKeywords.length > 0) {
        const { data: subjectSamples, error: subjectError } = await supabase
          .from('learning_samples')
          .select('*')
          .eq('user_id', userId)
          .eq('agent_id', agentId)
          .ilike('email_subject', `%${subjectKeywords[0]}%`)
          .order('created_at', { ascending: false })
          .limit(10)

        if (!subjectError && subjectSamples?.length) {
          const actionCounts: { [key: string]: number } = {}
          subjectSamples.forEach(sample => {
            const action = sample.user_preferred_action
            actionCounts[action] = (actionCounts[action] || 0) + 1
          })

          const mostCommonAction = Object.entries(actionCounts)
            .sort(([,a], [,b]) => b - a)[0]

          if (mostCommonAction && mostCommonAction[1] > 1) {
            return {
              hasSpecificLearning: true,
              preferredAction: mostCommonAction[0],
              reasoning: `Based on ${mostCommonAction[1]} similar emails with subject containing "${subjectKeywords[0]}"`,
              confidence: mostCommonAction[1] / subjectSamples.length
            }
          }
        }
      }

      return {
        hasSpecificLearning: false,
        confidence: 0
      }
    } catch (error) {
      console.error('Error getting email pattern learning:', error)
      return {
        hasSpecificLearning: false,
        confidence: 0
      }
    }
  }

  /**
   * Calculate relevance between a learning sample and current context
   */
  private calculateRelevance(
    sample: any,
    context: LearningContext,
    proposedAction: string
  ): AgentLearning {
    let similarity = 0
    const weights = {
      emailFrom: 0.3,
      emailCategory: 0.2,
      emailPriority: 0.15,
      proposedAction: 0.2,
      timeContext: 0.15
    }

    // Email from similarity
    if (sample.email_from && context.emailFrom) {
      if (sample.email_from === context.emailFrom) {
        similarity += weights.emailFrom
      } else if (sample.email_from.includes('@') && context.emailFrom.includes('@')) {
        const sampleDomain = sample.email_from.split('@')[1]
        const contextDomain = context.emailFrom.split('@')[1]
        if (sampleDomain === contextDomain) {
          similarity += weights.emailFrom * 0.5
        }
      }
    }

    // Category similarity
    if (sample.context?.emailCategory && context.emailCategory) {
      if (sample.context.emailCategory === context.emailCategory) {
        similarity += weights.emailCategory
      }
    }

    // Priority similarity
    if (sample.context?.emailPriority && context.emailPriority) {
      if (sample.context.emailPriority === context.emailPriority) {
        similarity += weights.emailPriority
      }
    }

    // Action similarity (if agent is proposing something similar to what was wrong before)
    if (sample.original_decision?.action === proposedAction) {
      similarity += weights.proposedAction
    }

    // Time context (day of week, time of day)
    if (sample.context?.timeOfDay && context.timeOfDay) {
      const sampleHour = parseInt(sample.context.timeOfDay)
      const contextHour = parseInt(context.timeOfDay)
      if (Math.abs(sampleHour - contextHour) <= 2) {
        similarity += weights.timeContext * 0.5
      }
    }

    if (sample.context?.dayOfWeek && context.dayOfWeek) {
      if (sample.context.dayOfWeek === context.dayOfWeek) {
        similarity += weights.timeContext * 0.5
      }
    }

    return {
      originalAction: sample.original_decision?.action || '',
      userPreferredAction: sample.user_preferred_action,
      reasoning: sample.reasoning,
      context: sample.context || {},
      confidence: sample.original_decision?.confidence || 0,
      similarity
    }
  }

  /**
   * Generate learning-informed suggestions for agents
   */
  async getActionSuggestions(
    userId: string,
    agentId: string,
    context: LearningContext,
    proposedAction: string,
    proposedConfidence: number
  ): Promise<{
    adjustedAction?: string
    adjustedConfidence: number
    learningInsights: string[]
    warnings: string[]
  }> {
    const [
      relevantLearning,
      confidencePatterns,
      emailPatterns
    ] = await Promise.all([
      this.getLearningForDecision(userId, agentId, context, proposedAction),
      this.getConfidencePatterns(userId, agentId, context),
      context.emailFrom ? this.getEmailPatternLearning(userId, agentId, context.emailFrom, context.emailSubject || '') : Promise.resolve({ hasSpecificLearning: false, confidence: 0 })
    ])

    const insights: string[] = []
    const warnings: string[] = []
    let adjustedConfidence = proposedConfidence
    let adjustedAction = proposedAction

    // Apply email-specific learning
    if (emailPatterns.hasSpecificLearning && emailPatterns.preferredAction) {
      if (emailPatterns.preferredAction !== proposedAction) {
        adjustedAction = emailPatterns.preferredAction
        insights.push(`Based on past interactions: ${emailPatterns.reasoning}`)
      }
      adjustedConfidence = Math.max(adjustedConfidence, emailPatterns.confidence * 0.8)
    }

    // Apply general learning patterns
    if (relevantLearning.length > 0) {
      const strongMatches = relevantLearning.filter(l => l.similarity > 0.7)
      
      if (strongMatches.length > 0) {
        const actionVotes: { [key: string]: number } = {}
        strongMatches.forEach(match => {
          actionVotes[match.userPreferredAction] = (actionVotes[match.userPreferredAction] || 0) + match.similarity
        })

        const bestAction = Object.entries(actionVotes).sort(([,a], [,b]) => b - a)[0]
        if (bestAction[0] !== proposedAction && bestAction[1] > 1.5) {
          warnings.push(`Previous similar situations suggest "${bestAction[0]}" instead of "${proposedAction}"`)
        }
      }

      insights.push(`Found ${relevantLearning.length} similar past decisions for reference`)
    }

    // Apply confidence adjustments
    if (confidencePatterns.shouldBeMoreCautious) {
      adjustedConfidence = Math.min(adjustedConfidence, 0.6)
      warnings.push('Recent feedback suggests being more cautious with similar decisions')
    }

    if (confidencePatterns.shouldBeMoreConfident && adjustedConfidence < 0.8) {
      adjustedConfidence = Math.min(adjustedConfidence + 0.2, 0.9)
      insights.push('Your recent performance suggests you can be more confident')
    }

    // Add common mistake warnings
    if (confidencePatterns.commonMistakes.length > 0) {
      insights.push(`Common improvement areas: ${confidencePatterns.commonMistakes.slice(0, 2).join(', ')}`)
    }

    return {
      adjustedAction: adjustedAction !== proposedAction ? adjustedAction : undefined,
      adjustedConfidence: Math.max(0.1, Math.min(0.95, adjustedConfidence)),
      learningInsights: insights,
      warnings
    }
  }
}

// Export a singleton instance
export const agentLearningService = new AgentLearningService()