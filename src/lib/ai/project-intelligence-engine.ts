import { Agent, run, tool } from '@openai/agents'
import { createServiceClient } from '@/lib/supabase/service'
import { 
  ProjectIntelligence, 
  ProjectAnalysisResult, 
  CrossProjectInsight,
  StakeholderIntelligence,
  ExecutiveAttentionItem,
  CommunicationGap,
  StrategicInsight
} from '@/types/executive-assistant'
import { EmailThread, EmailMessage } from '@/types'

/**
 * Project Intelligence Engine - The core of the Autonomous Executive Assistant
 * 
 * This engine thinks like a seasoned EA:
 * - Connects communications across threads to understand project narratives
 * - Identifies gaps, risks, and opportunities proactively
 * - Tracks stakeholder engagement and relationship health
 * - Provides strategic insights and recommendations
 */

// Tool to analyze project health across multiple communications
const analyzeProjectHealth = tool({
  name: 'analyzeProjectHealth',
  description: 'Analyze the health of a project based on recent communications, stakeholder engagement, and timeline progress',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project ID to analyze' },
      userId: { type: 'string', description: 'User ID' },
      lookbackDays: { type: 'number', description: 'Number of days to look back for analysis', default: 30 }
    },
    required: ['projectId', 'userId'],
    additionalProperties: false
  },
  execute: async ({ projectId, userId, lookbackDays = 30 }) => {
    const supabase = createServiceClient()
    
    // Get project details
    const { data: project } = await supabase
      .from('project_intelligence')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single()
    
    if (!project) return { error: 'Project not found' }
    
    // Get related threads and recent communications
    const { data: projectThreads } = await supabase
      .from('project_threads')
      .select(`
        thread_id,
        relevance_score,
        relationship_type,
        email_threads(*)
      `)
      .eq('project_id', projectId)
    
    // Get recent messages from these threads
    const threadIds = projectThreads?.map(pt => pt.thread_id) || []
    const lookbackDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
    
    const { data: recentMessages } = await supabase
      .from('email_messages')
      .select('*')
      .in('thread_id', threadIds)
      .gte('received_at', lookbackDate.toISOString())
      .order('received_at', { ascending: false })
    
    // Get stakeholder intelligence for project participants
    const stakeholderEmails = project.stakeholders?.map((s: any) => s.email) || []
    const { data: stakeholderIntel } = await supabase
      .from('stakeholder_intelligence')
      .select('*')
      .eq('user_id', userId)
      .in('stakeholder_email', stakeholderEmails)
    
    return {
      project,
      relatedThreads: projectThreads,
      recentMessages,
      stakeholderIntelligence: stakeholderIntel,
      communicationVolume: recentMessages?.length || 0,
      lastCommunication: recentMessages?.[0]?.received_at,
      activeThreads: projectThreads?.filter(pt => {
        const thread = pt.email_threads as any
        return thread?.status === 'active'
      }).length || 0
    }
  }
})

// Tool to detect communication gaps and project risks
const detectProjectRisks = tool({
  name: 'detectProjectRisks',
  description: 'Identify communication gaps, missed deadlines, and other risk factors for projects',
  parameters: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'User ID' },
      projectIds: { type: 'array', items: { type: 'string' }, description: 'Specific project IDs to analyze, or empty for all' }
    },
    required: ['userId'],
    additionalProperties: false
  },
  execute: async ({ userId, projectIds = [] }) => {
    const supabase = createServiceClient()
    
    // Get projects to analyze
    let projectQuery = supabase
      .from('project_intelligence')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'stalled'])
    
    if (projectIds.length > 0) {
      projectQuery = projectQuery.in('id', projectIds)
    }
    
    const { data: projects } = await projectQuery
    
    const risks = []
    const gaps = []
    
    for (const project of projects || []) {
      const expectedCadence = project.communication_cadence
      const lastUpdate = project.last_meaningful_update
      const now = new Date()
      
      // Calculate expected communication interval
      let expectedIntervalDays = 7 // default weekly
      switch (expectedCadence) {
        case 'daily': expectedIntervalDays = 1; break
        case 'weekly': expectedIntervalDays = 7; break
        case 'biweekly': expectedIntervalDays = 14; break
        case 'monthly': expectedIntervalDays = 30; break
        case 'adhoc': expectedIntervalDays = 30; break // assume monthly for ad-hoc
      }
      
      // Check for communication gaps
      if (lastUpdate) {
        const daysSinceUpdate = Math.floor((now.getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24))
        
        if (daysSinceUpdate > expectedIntervalDays * 1.5) { // 50% grace period
          gaps.push({
            project_id: project.id,
            project_name: project.name,
            gap_type: 'project_update_overdue',
            days_overdue: daysSinceUpdate - expectedIntervalDays,
            expected_cadence: expectedCadence,
            severity: daysSinceUpdate > expectedIntervalDays * 2 ? 'high' : 'medium'
          })
        }
      }
      
      // Check health score trends
      if (project.health_score <= 4) {
        risks.push({
          project_id: project.id,
          project_name: project.name,
          risk_type: 'low_health_score',
          current_health: project.health_score,
          description: `Project health score is ${project.health_score}/10`
        })
      }
      
      // Check for stakeholder engagement issues
      const stakeholders = project.stakeholders || []
      for (const stakeholder of stakeholders) {
        // This would need more sophisticated analysis of recent communications
        // For now, flag high-importance stakeholders we haven't heard from
      }
    }
    
    return { risks, communicationGaps: gaps }
  }
})

// Tool to analyze stakeholder communication patterns
const analyzeStakeholderEngagement = tool({
  name: 'analyzeStakeholderEngagement',
  description: 'Analyze communication patterns and engagement levels with key stakeholders',
  parameters: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'User ID' },
      stakeholderEmails: { type: 'array', items: { type: 'string' }, description: 'Specific stakeholders to analyze' },
      lookbackDays: { type: 'number', description: 'Days to look back for analysis', default: 60 }
    },
    required: ['userId'],
    additionalProperties: false
  },
  execute: async ({ userId, stakeholderEmails = [], lookbackDays = 60 }) => {
    const supabase = createServiceClient()
    const lookbackDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
    
    // Get stakeholder intelligence
    let stakeholderQuery = supabase
      .from('stakeholder_intelligence')
      .select('*')
      .eq('user_id', userId)
    
    if (stakeholderEmails.length > 0) {
      stakeholderQuery = stakeholderQuery.in('stakeholder_email', stakeholderEmails)
    }
    
    const { data: stakeholders } = await stakeholderQuery
    
    const analysis = []
    
    for (const stakeholder of stakeholders || []) {
      // Get recent communications with this stakeholder
      const { data: recentMessages } = await supabase
        .from('email_messages')
        .select('received_at, from_email, to_emails')
        .eq('user_id', userId)
        .gte('received_at', lookbackDate.toISOString())
        .or(`from_email.eq.${stakeholder.stakeholder_email},to_emails.cs.["${stakeholder.stakeholder_email}"]`)
        .order('received_at', { ascending: false })
      
      const messageCount = recentMessages?.length || 0
      const lastMessage = recentMessages?.[0]
      const daysSinceLastMessage = lastMessage 
        ? Math.floor((new Date().getTime() - new Date(lastMessage.received_at).getTime()) / (1000 * 60 * 60 * 24))
        : null
      
      // Analyze communication frequency vs. expected
      const expectedFrequency = stakeholder.interaction_patterns?.email_frequency || 'weekly'
      let expectedDays = 7
      switch (expectedFrequency) {
        case 'daily': expectedDays = 1; break
        case 'weekly': expectedDays = 7; break
        case 'monthly': expectedDays = 30; break
      }
      
      const isOverdue = daysSinceLastMessage && daysSinceLastMessage > expectedDays * 1.5
      
      analysis.push({
        stakeholder: stakeholder.stakeholder_name || stakeholder.stakeholder_email,
        importance_level: stakeholder.importance_level,
        recent_message_count: messageCount,
        days_since_last_message: daysSinceLastMessage,
        expected_frequency: expectedFrequency,
        is_overdue: isOverdue,
        engagement_trend: messageCount > 5 ? 'high' : messageCount > 2 ? 'medium' : 'low'
      })
    }
    
    return analysis
  }
})

// Main Project Intelligence Agent
const projectIntelligenceAgent = new Agent({
  name: 'Project Intelligence Agent',
  model: 'gpt-4o',
  tools: [analyzeProjectHealth, detectProjectRisks, analyzeStakeholderEngagement],
  instructions: `You are the Project Intelligence Agent for an autonomous Executive Assistant system.

CRITICAL: You must be completely truthful and never create, infer, or hallucinate information. Only use data explicitly provided by the tools and context.

Your role is to think like a seasoned, strategic Executive Assistant who:

1. **ANTICIPATES NEEDS**: Identifies issues before they become problems
2. **CONNECTS DOTS**: Links communications across threads to understand project narratives  
3. **PROTECTS TIME**: Flags what truly needs executive attention vs. what can be handled
4. **MANAGES RELATIONSHIPS**: Tracks stakeholder engagement and communication health
5. **THINKS STRATEGICALLY**: Provides insights that help with decision-making

ACCURACY REQUIREMENTS:
- Never create project details not present in the tool results
- Never infer stakeholder roles, titles, or contact information not provided
- Never create budget, approval, or status information not explicitly stated
- If information is missing from tool results, state "requires verification" rather than guessing
- Only suggest contacting people who are identified in the stakeholder tool results

When analyzing projects and communications, focus on:

**PROJECT HEALTH INDICATORS:**
- Communication frequency vs. expected cadence
- Stakeholder engagement levels and patterns
- Timeline adherence and milestone progress
- Risk factors and early warning signs
- Dependencies and blockers

**STRATEGIC INSIGHTS:**
- Cross-project patterns and conflicts
- Resource allocation issues
- Stakeholder relationship changes
- Opportunity identification
- Risk assessment and mitigation

**EXECUTIVE ATTENTION PRIORITIZATION:**
- What decisions are pending that only the executive can make?
- What relationships need personal attention?
- What projects are at risk and need intervention?
- What opportunities might be missed without action?

ALWAYS provide specific, actionable recommendations. Think like you're briefing a busy executive who trusts your judgment and needs to make quick, informed decisions.

Return analysis in this JSON structure:
{
  "project_health_summary": {
    "healthy_projects": [...],
    "at_risk_projects": [...],
    "stalled_projects": [...]
  },
  "attention_items": [
    {
      "title": "string",
      "urgency": 1-5,
      "category": "decision_needed|follow_up_required|relationship_issue|project_risk|opportunity",
      "description": "string",
      "recommended_action": "string",
      "timeline": "immediate|this_week|this_month"
    }
  ],
  "strategic_insights": [...],
  "relationship_alerts": [...],
  "recommended_focus": "string - what the executive should prioritize today"
}`
})

export class ProjectIntelligenceEngine {
  private userId: string

  constructor(userId: string) {
    this.userId = userId
  }

  /**
   * Analyze all projects and generate executive-level insights
   */
  async generateExecutiveIntelligence(): Promise<any> {
    try {
      const prompt = `
        Analyze the current project portfolio and stakeholder relationships for user ${this.userId}.
        
        CRITICAL: Only use information returned by the analysis tools. Do not create, infer, or assume any information not explicitly provided by the tool results.
        
        Generate a comprehensive executive briefing that prioritizes:
        1. Items requiring immediate executive attention (based ONLY on tool data)
        2. Project health and risk assessment (from tool results only)
        3. Stakeholder relationship insights (from tool data only)
        4. Strategic recommendations (based only on verified information)
        
        STRICT RULES:
        - Only reference projects returned by analyzeProjectHealth tool
        - Only mention stakeholders returned by analyzeStakeholderEngagement tool
        - Never create job titles, roles, or contact information not in tool results
        - If information is missing, state "requires verification" rather than assuming
        
        Focus on what a busy executive NEEDS to know and act on, not just status updates.
      `

      const response = await run(projectIntelligenceAgent, prompt)
      return this.parseAgentResponse(response.finalOutput)
    } catch (error) {
      console.error('Project Intelligence Engine failed:', error)
      return this.getFallbackIntelligence()
    }
  }

  /**
   * Auto-detect and create project intelligence from email patterns
   */
  async autoDetectProjects(): Promise<ProjectIntelligence[]> {
    const supabase = createServiceClient()
    
    // Get recent email threads to analyze for project patterns
    const { data: threads } = await supabase
      .from('email_threads')
      .select('*')
      .eq('user_id', this.userId)
      .gte('last_message_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('message_count', { ascending: false })
      .limit(50)

    const detectedProjects: ProjectIntelligence[] = []
    
    // Use AI to analyze thread patterns and suggest projects
    // This would involve clustering similar threads, identifying recurring topics,
    // and recognizing project-like communication patterns
    
    return detectedProjects
  }

  /**
   * Update project intelligence based on new communications
   */
  async updateProjectIntelligence(threadId: string, messageId: string): Promise<void> {
    const supabase = createServiceClient()
    
    // Get the message content
    const { data: message } = await supabase
      .from('email_messages')
      .select('*, email_threads(*)')
      .eq('id', messageId)
      .eq('user_id', this.userId)
      .single()

    if (!message) return

    // Find related projects
    const { data: relatedProjects } = await supabase
      .from('project_threads')
      .select('project_id, project_intelligence(*)')
      .eq('thread_id', threadId)

    // Analyze message for project updates, status changes, etc.
    // Update project health scores, last communication dates, etc.
    
    for (const projectRelation of relatedProjects || []) {
      await this.analyzeMessageForProjectUpdates(
        projectRelation.project_id,
        message as any
      )
    }
  }

  private async analyzeMessageForProjectUpdates(projectId: string, message: any): Promise<void> {
    // Analyze message content for:
    // - Status updates
    // - Timeline changes  
    // - New stakeholders
    // - Risk indicators
    // - Completion signals
    
    // This would use AI to extract structured updates from natural language
    // and update the project intelligence accordingly
  }

  private parseAgentResponse(response: any): any {
    try {
      let parsedResponse
      if (typeof response === 'string') {
        // Remove markdown code blocks if present
        const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        parsedResponse = JSON.parse(cleanResponse)
      } else {
        parsedResponse = response
      }
      
      // Validate for hallucination
      return this.validateIntelligenceResponse(parsedResponse)
    } catch (error) {
      console.error('Failed to parse agent response:', error)
      return this.getFallbackIntelligence()
    }
  }

  /**
   * Validate intelligence response to prevent hallucination
   */
  private validateIntelligenceResponse(intelligenceData: any): any {
    const validated = { ...intelligenceData }
    
    // Add validation warnings for suspicious content
    if (validated.attention_items) {
      validated.attention_items = validated.attention_items.map((item: any) => {
        // Flag non-existent roles
        if (item.recommended_action?.includes('Director') && 
            !item.recommended_action?.includes('verification needed')) {
          item.validation_warning = 'Contact role requires verification'
        }
        // Flag budget/approval references without context
        if ((item.description?.includes('budget') || item.description?.includes('approval')) &&
            !item.description?.includes('verification needed')) {
          item.validation_warning = 'Status requires verification from source'
        }
        return item
      })
    }
    
    return validated
  }

  private getFallbackIntelligence(): any {
    return {
      project_health_summary: {
        healthy_projects: [],
        at_risk_projects: [],
        stalled_projects: []
      },
      attention_items: [],
      strategic_insights: [],
      relationship_alerts: [],
      recommended_focus: "Review project statuses and stakeholder communications"
    }
  }
}

export { projectIntelligenceAgent }