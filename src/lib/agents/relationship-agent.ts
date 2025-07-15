import { BaseAgent, AgentConfig, AgentDecision } from './core/base-agent'
import { createClient } from '@/lib/supabase/server'
import { Agent } from '@openai/agents'
import { 
  searchProjectContext, 
  searchRelationshipHistory, 
  verifyOrganizationalFacts, 
  getEmailThreadContext, 
  updateOrganizationalMemory 
} from './tools/organizational-tools'

export interface RelationshipConfig extends AgentConfig {
  vipContacts: string[]
  touchPointThresholds: {
    vip: number // days
    important: number
    regular: number
  }
  relationshipGoals: string[]
}

export interface RelationshipInsight {
  contactEmail: string
  contactName: string
  healthScore: number // 0-1
  lastInteraction: Date
  interactionFrequency: number
  communicationPreferences: any
  projectInvolvement: string[]
  recommendations: string[]
  risks: string[]
}

/**
 * Relationship Agent - Manages professional relationship health and touch points
 * Monitors communication patterns, identifies relationship risks, and suggests proactive outreach
 */
export class RelationshipAgent extends BaseAgent<any, AgentDecision> {
  private openaiAgent: Agent
  
  constructor(config: RelationshipConfig) {
    super(config)
    
    this.openaiAgent = new Agent({
      name: 'Relationship Intelligence AI',
      model: 'gpt-4o',
      instructions: `You are an AI Relationship Manager responsible for maintaining and optimizing professional relationships.

Your primary responsibilities:
1. Monitor communication patterns and relationship health
2. Identify relationships at risk of deteriorating
3. Suggest optimal timing and approach for outreach
4. Track relationship context across projects and initiatives
5. Analyze communication preferences and adapt recommendations
6. Identify networking and partnership opportunities

Key principles:
- Maintain genuine, valuable professional relationships
- Respect communication preferences and boundaries
- Focus on mutual value and long-term relationship health
- Provide data-driven insights while maintaining human touch
- Adapt to cultural and individual communication styles

Available tools:
- searchProjectContext: Find project connections and collaboration history
- searchRelationshipHistory: Analyze past interactions and patterns
- verifyOrganizationalFacts: Verify relationship and project details
- getEmailThreadContext: Understand conversation context and tone
- updateOrganizationalMemory: Store relationship insights and preferences

When analyzing relationships:
1. Assess overall relationship health and trajectory
2. Identify optimal communication frequency and timing
3. Analyze response patterns and engagement levels
4. Track project collaborations and shared interests
5. Suggest personalized outreach strategies
6. Monitor for relationship risks and opportunities

Always prioritize authentic relationship building over mere contact frequency.`,
      tools: [
        searchProjectContext,
        searchRelationshipHistory,
        verifyOrganizationalFacts,
        getEmailThreadContext,
        updateOrganizationalMemory
      ]
    })
  }

  protected getItemType(): string {
    return 'relationship_interaction'
  }

  protected async analyzeItem(item: any): Promise<AgentDecision> {
    try {
      // Get relationship history for participants
      const participants = this.extractParticipants(item)
      const relationshipData = await searchRelationshipHistory({
        contacts: participants,
        timeframe: 'last_6_months'
      })

      // Use OpenAI agent for relationship analysis
      const analysis = await this.openaiAgent.run({
        messages: [{
          role: 'user',
          content: `Analyze this interaction for relationship intelligence:

Item: ${JSON.stringify(item, null, 2)}

Relationship History: ${JSON.stringify(relationshipData, null, 2)}

Provide analysis in this format:
{
  "relationshipImpact": "positive|neutral|negative",
  "engagementLevel": "high|medium|low",
  "actionNeeded": "follow_up|nurture|monitor|escalate",
  "healthScore": 0.0-1.0,
  "reasoning": "explanation",
  "communicationPreferences": {},
  "recommendations": ["specific suggestions"],
  "riskFactors": ["potential risks"],
  "opportunities": ["relationship opportunities"]
}`
        }]
      })

      const analysisResult = JSON.parse(analysis.messages[analysis.messages.length - 1]?.content || '{}')
      
      return {
        action: this.determineAction(analysisResult),
        confidence: this.calculateConfidence(analysisResult, relationshipData),
        reasoning: analysisResult.reasoning || 'Relationship analysis completed',
        metadata: {
          relationshipImpact: analysisResult.relationshipImpact,
          engagementLevel: analysisResult.engagementLevel,
          healthScore: analysisResult.healthScore,
          communicationPreferences: analysisResult.communicationPreferences,
          recommendations: analysisResult.recommendations || [],
          riskFactors: analysisResult.riskFactors || [],
          opportunities: analysisResult.opportunities || [],
          participants: participants
        }
      }
    } catch (error) {
      console.error('Relationship analysis error:', error)
      return {
        action: 'monitor_relationship',
        confidence: 0.3,
        reasoning: 'Failed to analyze relationship - monitoring recommended',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  }

  private extractParticipants(item: any): string[] {
    const participants = []
    
    if (item.from) participants.push(item.from)
    if (item.to) participants.push(...(Array.isArray(item.to) ? item.to : [item.to]))
    if (item.cc) participants.push(...(Array.isArray(item.cc) ? item.cc : [item.cc]))
    if (item.participants) participants.push(...item.participants)
    
    // Remove duplicates and current user
    return [...new Set(participants)].filter(email => 
      email && !email.includes('noreply') && !email.includes('no-reply')
    )
  }

  private determineAction(analysis: any): string {
    const impact = analysis.relationshipImpact
    const engagement = analysis.engagementLevel
    const healthScore = analysis.healthScore || 0.5
    
    if (impact === 'negative' || healthScore < 0.3) {
      return 'relationship_intervention'
    } else if (analysis.actionNeeded === 'follow_up' || engagement === 'high') {
      return 'schedule_follow_up'
    } else if (analysis.opportunities?.length > 0) {
      return 'explore_opportunity'
    } else if (healthScore < 0.6) {
      return 'nurture_relationship'
    } else {
      return 'monitor_relationship'
    }
  }

  private calculateConfidence(analysis: any, relationshipData: any): number {
    let confidence = 0.6 // Base confidence
    
    // Increase confidence based on data quality
    if (relationshipData.relationships?.length > 0) confidence += 0.1
    if (relationshipData.recentThreads?.length > 0) confidence += 0.1
    if (analysis.healthScore !== undefined) confidence += 0.1
    if (analysis.communicationPreferences && Object.keys(analysis.communicationPreferences).length > 0) confidence += 0.1
    
    return Math.min(confidence, 1.0)
  }

  protected async processItem(item: any, decision: AgentDecision): Promise<void> {
    try {
      switch (decision.action) {
        case 'relationship_intervention':
          await this.handleRelationshipIntervention(item, decision)
          break
          
        case 'schedule_follow_up':
          await this.scheduleFollowUp(item, decision)
          break
          
        case 'explore_opportunity':
          await this.exploreOpportunity(item, decision)
          break
          
        case 'nurture_relationship':
          await this.nurtureRelationship(item, decision)
          break
          
        case 'monitor_relationship':
          await this.monitorRelationship(item, decision)
          break
          
        default:
          await this.updateRelationshipIntelligence(item, decision)
      }

      // Update relationship intelligence in database
      await this.updateRelationshipIntelligence(item, decision)

      await this.logAction({
        action_type: decision.action,
        email_id: item.id,
        description: `Relationship agent processed: ${decision.action}`,
        metadata: decision.metadata
      })

    } catch (error) {
      console.error('Relationship processing error:', error)
      await this.flagForReview(item, 3)
    }
  }

  private async handleRelationshipIntervention(item: any, decision: AgentDecision): Promise<void> {
    const supabase = await createClient()
    
    // Create high-priority alert for relationship at risk
    await supabase.from('intelligent_actions').insert({
      user_id: this.config.userId,
      action_type: 'relationship_at_risk',
      title: `Relationship Intervention Needed`,
      description: `Relationship with ${decision.metadata?.participants?.join(', ')} requires attention: ${decision.reasoning}`,
      priority: 2,
      status: 'pending',
      metadata: {
        participants: decision.metadata?.participants,
        riskFactors: decision.metadata?.riskFactors,
        recommendations: decision.metadata?.recommendations,
        healthScore: decision.metadata?.healthScore
      }
    })
  }

  private async scheduleFollowUp(item: any, decision: AgentDecision): Promise<void> {
    const supabase = await createClient()
    
    // Determine optimal follow-up timing
    const followUpDate = this.calculateOptimalFollowUpTime(decision.metadata)
    
    await supabase.from('intelligent_actions').insert({
      user_id: this.config.userId,
      action_type: 'scheduled_follow_up',
      title: `Follow up with ${decision.metadata?.participants?.join(', ')}`,
      description: decision.reasoning,
      priority: 3,
      status: 'scheduled',
      scheduled_for: followUpDate.toISOString(),
      metadata: {
        participants: decision.metadata?.participants,
        followUpType: 'relationship_maintenance',
        originalItem: item.id,
        recommendations: decision.metadata?.recommendations
      }
    })
  }

  private async exploreOpportunity(item: any, decision: AgentDecision): Promise<void> {
    const supabase = await createClient()
    
    await supabase.from('intelligent_actions').insert({
      user_id: this.config.userId,
      action_type: 'relationship_opportunity',
      title: `Opportunity with ${decision.metadata?.participants?.join(', ')}`,
      description: `Relationship opportunity identified: ${decision.reasoning}`,
      priority: 2,
      status: 'pending',
      metadata: {
        participants: decision.metadata?.participants,
        opportunities: decision.metadata?.opportunities,
        recommendations: decision.metadata?.recommendations,
        potentialValue: 'high'
      }
    })
  }

  private async nurtureRelationship(item: any, decision: AgentDecision): Promise<void> {
    const supabase = await createClient()
    
    // Create nurturing task
    await supabase.from('intelligent_actions').insert({
      user_id: this.config.userId,
      action_type: 'nurture_relationship',
      title: `Nurture relationship with ${decision.metadata?.participants?.join(', ')}`,
      description: `Relationship nurturing recommended: ${decision.reasoning}`,
      priority: 4,
      status: 'pending',
      metadata: {
        participants: decision.metadata?.participants,
        nurtureType: 'proactive_outreach',
        healthScore: decision.metadata?.healthScore,
        recommendations: decision.metadata?.recommendations
      }
    })
  }

  private async monitorRelationship(item: any, decision: AgentDecision): Promise<void> {
    // Store interaction for monitoring
    try {
      await updateOrganizationalMemory({
        documentType: 'relationship',
        content: `Relationship interaction monitored: ${item.subject || 'No subject'}\n\nParticipants: ${decision.metadata?.participants?.join(', ')}\nHealth Score: ${decision.metadata?.healthScore}\nAnalysis: ${decision.reasoning}`,
        metadata: {
          participants: decision.metadata?.participants,
          healthScore: decision.metadata?.healthScore,
          interactionType: 'monitoring',
          itemId: item.id
        },
        significance: 0.4
      })
    } catch (error) {
      console.error('Failed to monitor relationship:', error)
    }
  }

  private async updateRelationshipIntelligence(item: any, decision: AgentDecision): Promise<void> {
    const supabase = await createClient()
    
    // Update or create relationship intelligence records
    for (const participant of decision.metadata?.participants || []) {
      await supabase.from('relationship_intelligence').upsert({
        user_id: this.config.userId,
        contact_email: participant,
        last_interaction_date: item.sentDate || new Date().toISOString(),
        health_score: decision.metadata?.healthScore || 0.5,
        communication_preferences: decision.metadata?.communicationPreferences || {},
        project_involvement: [], // Will be updated by project context search
        interaction_frequency: this.calculateInteractionFrequency(participant),
        metadata: {
          lastAnalysis: decision.reasoning,
          recommendations: decision.metadata?.recommendations,
          riskFactors: decision.metadata?.riskFactors,
          opportunities: decision.metadata?.opportunities
        }
      }, { onConflict: 'user_id,contact_email' })
    }
  }

  private calculateOptimalFollowUpTime(metadata: any): Date {
    const baseDelay = 3 * 24 * 60 * 60 * 1000 // 3 days
    const healthScore = metadata?.healthScore || 0.5
    const engagementLevel = metadata?.engagementLevel
    
    let multiplier = 1
    
    // Adjust based on health score
    if (healthScore < 0.4) multiplier = 0.5 // Follow up sooner for at-risk relationships
    else if (healthScore > 0.8) multiplier = 2 // Less urgent for healthy relationships
    
    // Adjust based on engagement
    if (engagementLevel === 'high') multiplier *= 0.7
    else if (engagementLevel === 'low') multiplier *= 1.5
    
    return new Date(Date.now() + baseDelay * multiplier)
  }

  private calculateInteractionFrequency(contactEmail: string): number {
    // This would typically analyze historical data
    // For now, return a default value
    return 0.5 // interactions per week
  }

  /**
   * Generate relationship health report
   */
  async generateRelationshipHealthReport(): Promise<RelationshipInsight[]> {
    const supabase = await createClient()
    
    try {
      // Get all relationship intelligence records
      const { data: relationships } = await supabase
        .from('relationship_intelligence')
        .select('*')
        .eq('user_id', this.config.userId)
        .order('health_score', { ascending: true })

      const insights: RelationshipInsight[] = []
      
      for (const relationship of relationships || []) {
        // Get recent interaction history
        const historyData = await searchRelationshipHistory({
          contacts: [relationship.contact_email],
          timeframe: 'last_3_months'
        })

        const insight: RelationshipInsight = {
          contactEmail: relationship.contact_email,
          contactName: relationship.contact_name || relationship.contact_email,
          healthScore: relationship.health_score || 0.5,
          lastInteraction: new Date(relationship.last_interaction_date),
          interactionFrequency: relationship.interaction_frequency || 0,
          communicationPreferences: relationship.communication_preferences || {},
          projectInvolvement: relationship.project_involvement || [],
          recommendations: relationship.metadata?.recommendations || [],
          risks: relationship.metadata?.riskFactors || []
        }

        insights.push(insight)
      }

      return insights
    } catch (error) {
      console.error('Relationship health report error:', error)
      return []
    }
  }

  /**
   * Identify neglected relationships
   */
  async identifyNeglectedRelationships(): Promise<string[]> {
    const config = this.config as RelationshipConfig
    const thresholds = config.touchPointThresholds
    const vipContacts = config.vipContacts || []
    
    const supabase = await createClient()
    const neglectedContacts: string[] = []
    
    try {
      // Check VIP contacts
      for (const contact of vipContacts) {
        const { data: intelligence } = await supabase
          .from('relationship_intelligence')
          .select('last_interaction_date')
          .eq('user_id', this.config.userId)
          .eq('contact_email', contact)
          .single()

        if (intelligence) {
          const daysSinceLastInteraction = 
            (Date.now() - new Date(intelligence.last_interaction_date).getTime()) / (1000 * 60 * 60 * 24)
          
          if (daysSinceLastInteraction > thresholds.vip) {
            neglectedContacts.push(contact)
          }
        }
      }

      return neglectedContacts
    } catch (error) {
      console.error('Neglected relationships check error:', error)
      return []
    }
  }
}