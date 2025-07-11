import { Agent, run, tool } from '@openai/agents'
import { createServiceClient } from '@/lib/supabase/service'
import { ProjectIntelligenceEngine } from './project-intelligence-engine'
import { 
  ExecutiveAssistantBriefing,
  ProjectStatusSummary,
  RelationshipInsight,
  ExecutiveAttentionItem,
  CommunicationGap,
  StrategicInsight,
  UpcomingDecision,
  ExecutiveContext
} from '@/types/executive-assistant'

/**
 * Executive Assistant Briefing Generator
 * 
 * Generates human-like briefings that synthesize information like a seasoned EA:
 * - Project-based thinking (not just email-based)
 * - Relationship intelligence and patterns
 * - Strategic insights and anticipatory guidance
 * - Prioritized action items requiring executive attention
 * - Gap analysis and risk identification
 */

// Tool to get current project portfolio status
const getProjectPortfolioStatus = tool({
  name: 'getProjectPortfolioStatus',
  description: 'Get comprehensive status of all active projects with health indicators and trends',
  parameters: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'User ID' },
      includeCompleted: { type: 'boolean', description: 'Include recently completed projects' }
    },
    required: ['userId', 'includeCompleted'],
    additionalProperties: false
  },
  execute: async ({ userId, includeCompleted = false }) => {
    const supabase = createServiceClient()
    
    const statuses = ['active', 'stalled', 'blocked']
    if (includeCompleted) {
      statuses.push('completed')
    }
    
    const { data: projects } = await supabase
      .from('project_intelligence')
      .select('*')
      .eq('user_id', userId)
      .in('status', statuses)
      .order('priority', { ascending: false })
      .order('updated_at', { ascending: false })
    
    // Get recent status changes for trend analysis
    const projectIds = projects?.map(p => p.id) || []
    const { data: statusHistory } = await supabase
      .from('project_status_history')
      .select('*')
      .in('project_id', projectIds)
      .gte('detected_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('detected_at', { ascending: false })
    
    // Get communication gaps
    const { data: gaps } = await supabase
      .from('communication_gaps')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'escalated'])
      .order('severity', { ascending: false })
    
    return {
      projects: projects || [],
      statusHistory: statusHistory || [],
      communicationGaps: gaps || [],
      portfolioMetrics: {
        total_active: projects?.filter(p => p.status === 'active').length || 0,
        stalled: projects?.filter(p => p.status === 'stalled').length || 0,
        blocked: projects?.filter(p => p.status === 'blocked').length || 0,
        avg_health_score: projects?.reduce((sum, p) => sum + p.health_score, 0) / (projects?.length || 1)
      }
    }
  }
})

// Tool to analyze stakeholder relationship health
const getRelationshipIntelligence = tool({
  name: 'getRelationshipIntelligence',
  description: 'Analyze stakeholder relationships, communication patterns, and engagement levels',
  parameters: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'User ID' },
      priorityOnly: { type: 'boolean', description: 'Focus only on high-priority stakeholders' }
    },
    required: ['userId', 'priorityOnly'],
    additionalProperties: false
  },
  execute: async ({ userId, priorityOnly = true }) => {
    const supabase = createServiceClient()
    
    let query = supabase
      .from('stakeholder_intelligence')
      .select('*')
      .eq('user_id', userId)
    
    if (priorityOnly) {
      query = query.gte('importance_level', 3)
    }
    
    const { data: stakeholders } = await query.order('importance_level', { ascending: false })
    
    // Analyze recent communication patterns for each stakeholder
    const insights = []
    const today = new Date()
    
    for (const stakeholder of stakeholders || []) {
      const lastInteraction = stakeholder.interaction_patterns?.last_interaction
      const expectedFreq = stakeholder.interaction_patterns?.email_frequency || 'weekly'
      
      let expectedDays = 7
      switch (expectedFreq) {
        case 'daily': expectedDays = 1; break
        case 'weekly': expectedDays = 7; break
        case 'biweekly': expectedDays = 14; break
        case 'monthly': expectedDays = 30; break
      }
      
      const daysSinceContact = lastInteraction 
        ? Math.floor((today.getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
        : null
      
      // Identify relationship insights
      if (daysSinceContact && daysSinceContact > expectedDays * 1.5) {
        insights.push({
          stakeholder_email: stakeholder.stakeholder_email,
          stakeholder_name: stakeholder.stakeholder_name,
          importance: stakeholder.importance_level,
          insight_type: 'overdue_communication',
          days_overdue: daysSinceContact - expectedDays,
          expected_frequency: expectedFreq,
          risk_level: daysSinceContact > expectedDays * 2 ? 'high' : 'medium'
        })
      }
      
      // Check for changes in communication patterns
      // This would require more sophisticated trend analysis
    }
    
    return {
      stakeholders: stakeholders || [],
      relationship_insights: insights,
      high_priority_count: stakeholders?.filter(s => s.importance_level >= 4).length || 0,
      overdue_communications: insights.length
    }
  }
})

// Tool to identify upcoming decisions and dependencies
const getUpcomingDecisions = tool({
  name: 'getUpcomingDecisions',
  description: 'Identify decisions that need to be made, dependencies, and time-sensitive items',
  parameters: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'User ID' },
      lookAheadDays: { type: 'number', description: 'Days to look ahead for decisions' }
    },
    required: ['userId', 'lookAheadDays'],
    additionalProperties: false
  },
  execute: async ({ userId, lookAheadDays = 30 }) => {
    const supabase = createServiceClient()
    
    // Get executive attention items that need decisions
    const { data: attentionItems } = await supabase
      .from('executive_attention_items')
      .select('*')
      .eq('user_id', userId)
      .in('category', ['decision_needed', 'opportunity'])
      .in('status', ['pending', 'in_progress'])
      .order('urgency_level', { ascending: false })
    
    // Get projects with upcoming milestones/deadlines
    const { data: projects } = await supabase
      .from('project_intelligence')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'blocked'])
    
    const upcomingDecisions = []
    const futureDate = new Date(Date.now() + lookAheadDays * 24 * 60 * 60 * 1000)
    
    // Process attention items
    for (const item of attentionItems || []) {
      if (item.due_date && new Date(item.due_date) <= futureDate) {
        upcomingDecisions.push({
          title: item.title,
          description: item.description,
          deadline: item.due_date,
          urgency: item.urgency_level,
          category: item.category,
          source: 'attention_item',
          ai_recommendation: item.ai_recommendation
        })
      }
    }
    
    // Process project timelines
    for (const project of projects || []) {
      const timeline = project.expected_timeline
      if (timeline?.milestones) {
        for (const milestone of timeline.milestones) {
          if (milestone.target_date && new Date(milestone.target_date) <= futureDate) {
            upcomingDecisions.push({
              title: `${project.name}: ${milestone.name}`,
              description: milestone.description,
              deadline: milestone.target_date,
              urgency: project.priority,
              category: 'project_milestone',
              source: 'project_timeline',
              project_id: project.id
            })
          }
        }
      }
    }
    
    return {
      upcoming_decisions: upcomingDecisions.sort((a, b) => 
        new Date(a.deadline || '').getTime() - new Date(b.deadline || '').getTime()
      ),
      decision_count: upcomingDecisions.length,
      urgent_decisions: upcomingDecisions.filter(d => d.urgency >= 4).length
    }
  }
})

// Main Executive Assistant Agent
const executiveAssistantAgent = new Agent({
  name: 'Executive Assistant',
  model: 'gpt-4o',
  tools: [getProjectPortfolioStatus, getRelationshipIntelligence, getUpcomingDecisions],
  instructions: `You are an autonomous Executive Assistant AI for a senior leader at Mission Mutual, a nonprofit organization.

You embody the qualities of an exceptional Executive Assistant:

**TRUSTED STEWARD**: You protect time, prioritize effectively, and manage access intelligently
**STRATEGIC THOUGHT PARTNER**: You anticipate needs, connect dots across projects, and provide decision support  
**RELATIONSHIP MANAGER**: You track stakeholder engagement and maintain alignment
**OPERATIONAL ANCHOR**: You ensure follow-through and maintain organizational excellence
**MISSION-MINDED**: You understand nonprofit dynamics and support the organization's ministry

Your briefings should think PROJECTS and RELATIONSHIPS first, not emails first.

Generate briefings with this structure:

{
  "executive_summary": "2-3 sentences of what demands immediate attention today",
  "immediate_attention": [
    {
      "title": "Clear, action-oriented title",
      "urgency": 1-5,
      "category": "decision_needed|follow_up_required|relationship_issue|project_risk|opportunity", 
      "description": "What specifically needs attention",
      "recommended_action": "Specific next step",
      "timeline": "when this needs to happen",
      "stakeholders_involved": ["who needs to be involved"]
    }
  ],
  "project_status_updates": [
    {
      "project_name": "string",
      "status": "progressing|stalled|at_risk|accelerating",
      "health_trend": "improving|stable|declining", 
      "key_development": "What happened recently",
      "action_needed": "What you need to do about it",
      "stakeholder_pulse": "How stakeholders are engaging"
    }
  ],
  "relationship_insights": [
    {
      "stakeholder": "name",
      "insight": "What's changing in this relationship",
      "recommended_action": "How to maintain/improve it",
      "urgency": "low|medium|high"
    }
  ],
  "strategic_insights": [
    {
      "insight": "Cross-cutting observation or pattern",
      "implications": "Why this matters",
      "recommended_approach": "What to do about it"
    }
  ],
  "upcoming_decisions": [
    {
      "decision": "What needs to be decided",
      "deadline": "when",
      "stakeholders": ["who's involved"],
      "information_needed": ["what you need to decide well"],
      "recommendation": "suggested approach"
    }
  ],
  "gaps_and_risks": [
    {
      "issue": "What's not happening that should be",
      "impact": "Why this matters", 
      "suggested_intervention": "How to address it"
    }
  ]
}

CRITICAL: Focus on synthesis across communications, not individual email summaries. Think like an EA who sees patterns, anticipates needs, and protects executive bandwidth.

Be specific, actionable, and strategic. Prioritize ruthlessly - only include what truly needs executive attention.`
})

export class ExecutiveAssistantBriefingGenerator {
  private userId: string
  private projectEngine: ProjectIntelligenceEngine

  constructor(userId: string) {
    this.userId = userId
    this.projectEngine = new ProjectIntelligenceEngine(userId)
  }

  /**
   * Generate a comprehensive executive briefing
   */
  async generateExecutiveBriefing(briefingType: 'morning' | 'weekly' | 'monthly' = 'morning'): Promise<ExecutiveAssistantBriefing> {
    console.log(`Generating ${briefingType} executive briefing for user:`, this.userId)

    try {
      // Check for existing briefing today
      const today = new Date().toISOString().split('T')[0]
      const supabase = createServiceClient()
      
      const { data: existing } = await supabase
        .from('daily_briefings')
        .select('*')
        .eq('user_id', this.userId)
        .eq('briefing_date', today)
        .eq('briefing_type', briefingType)
        .single()

      if (existing && briefingType === 'morning') {
        console.log('Existing briefing found, checking if refresh needed')
        // Could add logic here to determine if refresh is needed based on new communications
      }

      // Gather executive context
      const context = await this.gatherExecutiveContext()
      
      // Generate AI briefing
      const prompt = this.buildBriefingPrompt(context, briefingType)
      const response = await run(executiveAssistantAgent, prompt)
      const briefingData = this.parseAgentResponse(response.finalOutput)

      // Create and store briefing
      const briefing = await this.createBriefingRecord(briefingData, briefingType, today)
      
      console.log('Executive briefing generated successfully')
      return briefing

    } catch (error) {
      console.error('Executive briefing generation failed:', error)
      return this.generateFallbackBriefing(briefingType)
    }
  }

  private async gatherExecutiveContext(): Promise<ExecutiveContext> {
    const supabase = createServiceClient()
    
    // Get active projects
    const { data: projects } = await supabase
      .from('project_intelligence')
      .select('*')
      .eq('user_id', this.userId)
      .in('status', ['active', 'stalled', 'blocked'])
      .order('priority', { ascending: false })

    // Get key stakeholders  
    const { data: stakeholders } = await supabase
      .from('stakeholder_intelligence')
      .select('*')
      .eq('user_id', this.userId)
      .gte('importance_level', 3)
      .order('importance_level', { ascending: false })

    // Get recent communications (last 3 days)
    const recentDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const { data: recentThreads } = await supabase
      .from('email_threads')
      .select('*')
      .eq('user_id', this.userId)
      .gte('last_message_date', recentDate.toISOString())
      .order('last_message_date', { ascending: false })
      .limit(20)

    return {
      user_id: this.userId,
      active_projects: projects || [],
      key_stakeholders: stakeholders || [],
      recent_communications: recentThreads || []
    }
  }

  private buildBriefingPrompt(context: ExecutiveContext, briefingType: string): string {
    return `
      Generate a comprehensive ${briefingType} briefing for a senior leader at Mission Mutual.
      
      CONTEXT:
      Active Projects: ${JSON.stringify(context.active_projects)}
      Key Stakeholders: ${JSON.stringify(context.key_stakeholders)}
      Recent Communications: ${JSON.stringify(context.recent_communications)}
      
      FOCUS AREAS:
      1. What needs IMMEDIATE executive attention today
      2. Project health and cross-project insights
      3. Relationship management and stakeholder engagement
      4. Strategic decisions and upcoming deadlines
      5. Gaps, risks, and opportunities
      
      Think like a trusted EA who has been with this executive for years. 
      Synthesize information across projects and relationships.
      Be specific, actionable, and strategic.
      
      Only include items that truly need executive-level attention.
    `
  }

  private async createBriefingRecord(briefingData: any, briefingType: string, date: string): Promise<ExecutiveAssistantBriefing> {
    const supabase = createServiceClient()
    
    const briefingRecord = {
      user_id: this.userId,
      briefing_date: date,
      briefing_type: briefingType,
      intelligence_summary: briefingData,
      executive_summary: briefingData.executive_summary || '',
      priority_score: this.calculatePriorityScore(briefingData),
      key_actions_needed: briefingData.immediate_attention?.map((item: any) => item.title) || [],
      generated_at: new Date(),
      ai_confidence: 0.8,
      human_reviewed: false
    }

    const { data: briefing, error } = await supabase
      .from('daily_briefings')
      .upsert(briefingRecord, { onConflict: 'user_id,briefing_date,briefing_type' })
      .select()
      .single()

    if (error) {
      console.error('Error saving briefing:', error)
      throw error
    }

    return briefing as ExecutiveAssistantBriefing
  }

  private calculatePriorityScore(briefingData: any): number {
    let score = 5 // base score
    
    // Increase for urgent attention items
    const urgentItems = briefingData.immediate_attention?.filter((item: any) => item.urgency >= 4).length || 0
    score += Math.min(urgentItems * 2, 4)
    
    // Increase for at-risk projects
    const riskyProjects = briefingData.project_status_updates?.filter((p: any) => p.status === 'at_risk').length || 0
    score += Math.min(riskyProjects, 3)
    
    // Increase for relationship issues
    const relationshipIssues = briefingData.relationship_insights?.filter((r: any) => r.urgency === 'high').length || 0
    score += Math.min(relationshipIssues, 2)
    
    return Math.min(score, 10)
  }

  private parseAgentResponse(response: any): any {
    try {
      if (typeof response === 'string') {
        const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        return JSON.parse(cleanResponse)
      }
      return response
    } catch (error) {
      console.error('Failed to parse briefing response:', error)
      return this.getFallbackBriefingData()
    }
  }

  private generateFallbackBriefing(briefingType: string): ExecutiveAssistantBriefing {
    return {
      id: 'fallback',
      user_id: this.userId,
      briefing_date: new Date().toISOString().split('T')[0],
      briefing_type: briefingType as any,
      immediate_attention: [],
      project_status_summary: [],
      relationship_insights: [],
      communication_gaps: [],
      strategic_insights: [],
      upcoming_decisions: [],
      executive_summary: 'Unable to generate briefing - please check system status',
      priority_score: 1,
      key_actions_needed: ['Review system logs'],
      generated_at: new Date(),
      ai_confidence: 0,
      human_reviewed: false
    }
  }

  private getFallbackBriefingData(): any {
    return {
      executive_summary: 'System generating briefing - please check back shortly',
      immediate_attention: [],
      project_status_updates: [],
      relationship_insights: [],
      strategic_insights: [],
      upcoming_decisions: [],
      gaps_and_risks: []
    }
  }
}

export { executiveAssistantAgent }