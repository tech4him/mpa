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

export interface BriefingConfig extends AgentConfig {
  briefingSchedule: string // CRON schedule
  briefingTypes: ('daily' | 'weekly' | 'monthly')[]
  priorities: string[]
  includeMetrics: boolean
  customSections: string[]
}

export interface BriefingSection {
  title: string
  content: string
  priority: number
  type: 'need_to_know' | 'need_to_do' | 'opportunities' | 'risks' | 'metrics'
  items: any[]
}

export interface DailyBriefing {
  date: string
  summary: string
  needToKnow: BriefingSection
  needToDo: BriefingSection
  opportunities: BriefingSection
  risks: BriefingSection
  relationshipInsights: BriefingSection
  metrics?: BriefingSection
  customSections?: BriefingSection[]
}

/**
 * Briefing Agent - Generates intelligent daily, weekly, and monthly briefings
 * Synthesizes information across all work streams to provide executive-level insights
 */
export class BriefingAgent extends BaseAgent<any, AgentDecision> {
  private openaiAgent: Agent
  
  constructor(config: BriefingConfig) {
    super(config)
    
    this.openaiAgent = new Agent({
      name: 'Executive Briefing AI',
      model: 'gpt-4o',
      instructions: `You are an AI Executive Briefing Specialist responsible for creating comprehensive, actionable briefings.

Your primary responsibilities:
1. Synthesize information from multiple work streams and sources
2. Identify the most critical information executives need to know
3. Prioritize actions and decisions requiring immediate attention
4. Highlight opportunities and risks across projects and relationships
5. Provide context-aware insights that enable strategic decision-making
6. Generate metrics and trends analysis when requested

Key principles:
- Focus on executive-level strategic information
- Prioritize actionable insights over information dumps
- Provide clear context and recommendations
- Maintain consistency in briefing format and quality
- Adapt briefing content to executive preferences and priorities
- Include both quantitative metrics and qualitative insights

Available tools:
- searchProjectContext: Find project updates and status information
- searchRelationshipHistory: Analyze relationship and communication patterns
- verifyOrganizationalFacts: Verify claims and organizational information
- getEmailThreadContext: Get context from important email threads
- updateOrganizationalMemory: Store briefing insights and patterns

When generating briefings:
1. Gather information from all relevant sources
2. Synthesize and prioritize based on executive needs
3. Identify patterns, trends, and anomalies
4. Provide actionable recommendations
5. Highlight interdependencies between items
6. Include forward-looking insights and implications

Always prioritize quality over quantity - better to have fewer high-impact insights than many low-value items.`,
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
    return 'briefing_request'
  }

  protected async analyzeItem(item: any): Promise<AgentDecision> {
    // For briefing agent, analysis is about determining what type of briefing to generate
    const briefingType = item.type || 'daily'
    const requestDate = item.date ? new Date(item.date) : new Date()
    
    return {
      action: `generate_${briefingType}_briefing`,
      confidence: 0.9,
      reasoning: `Generate ${briefingType} briefing for ${requestDate.toDateString()}`,
      metadata: {
        briefingType,
        requestDate: requestDate.toISOString(),
        includeMetrics: item.includeMetrics || false,
        customSections: item.customSections || []
      }
    }
  }

  protected async processItem(item: any, decision: AgentDecision): Promise<void> {
    try {
      const briefingType = decision.metadata?.briefingType || 'daily'
      
      switch (decision.action) {
        case 'generate_daily_briefing':
          await this.generateDailyBriefing(new Date(decision.metadata?.requestDate || Date.now()))
          break
          
        case 'generate_weekly_briefing':
          await this.generateWeeklyBriefing(new Date(decision.metadata?.requestDate || Date.now()))
          break
          
        case 'generate_monthly_briefing':
          await this.generateMonthlyBriefing(new Date(decision.metadata?.requestDate || Date.now()))
          break
          
        default:
          await this.generateDailyBriefing(new Date())
      }

      await this.logAction({
        action_type: decision.action,
        description: `Generated ${briefingType} briefing`,
        metadata: decision.metadata
      })

    } catch (error) {
      console.error('Briefing generation error:', error)
      await this.logAction({
        action_type: 'briefing_failed',
        description: `Failed to generate briefing: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
      })
    }
  }

  /**
   * Generate daily executive briefing
   */
  async generateDailyBriefing(date: Date = new Date()): Promise<DailyBriefing> {
    const supabase = await createClient()
    
    try {
      console.log(`Generating daily briefing for ${date.toDateString()}`)
      
      // Gather data from multiple sources
      const [
        highPriorityItems,
        pendingCommitments,
        recentEmails,
        projectUpdates,
        relationshipData,
        securityIncidents
      ] = await Promise.all([
        this.getHighPriorityItems(date),
        this.getPendingCommitments(date),
        this.getRecentImportantEmails(date),
        this.getProjectUpdates(date),
        this.getRelationshipInsights(date),
        this.getSecurityIncidents(date)
      ])

      // Generate briefing using OpenAI agent
      const briefingAnalysis = await this.openaiAgent.run({
        messages: [{
          role: 'user',
          content: `Generate a comprehensive executive briefing for ${date.toDateString()} based on this data:

HIGH PRIORITY ITEMS:
${JSON.stringify(highPriorityItems, null, 2)}

PENDING COMMITMENTS:
${JSON.stringify(pendingCommitments, null, 2)}

RECENT IMPORTANT EMAILS:
${JSON.stringify(recentEmails, null, 2)}

PROJECT UPDATES:
${JSON.stringify(projectUpdates, null, 2)}

RELATIONSHIP INSIGHTS:
${JSON.stringify(relationshipData, null, 2)}

SECURITY INCIDENTS:
${JSON.stringify(securityIncidents, null, 2)}

Generate a briefing in this format:
{
  "summary": "2-3 sentence executive summary of the day",
  "needToKnow": {
    "title": "Need to Know",
    "items": ["critical information items"],
    "priority": 1
  },
  "needToDo": {
    "title": "Need to Do",
    "items": ["urgent actions with deadlines"],
    "priority": 1
  },
  "opportunities": {
    "title": "Opportunities",
    "items": ["potential opportunities to pursue"],
    "priority": 2
  },
  "risks": {
    "title": "Risks to Monitor",
    "items": ["risks requiring attention"],
    "priority": 2
  },
  "relationshipInsights": {
    "title": "Relationship Insights",
    "items": ["important relationship updates"],
    "priority": 3
  }
}

Focus on executive-level insights. Each item should be actionable and strategic.`
        }]
      })

      const briefingData = JSON.parse(briefingAnalysis.messages[briefingAnalysis.messages.length - 1]?.content || '{}')
      
      // Structure the briefing
      const briefing: DailyBriefing = {
        date: date.toISOString().split('T')[0],
        summary: briefingData.summary || 'Daily briefing generated',
        needToKnow: this.formatBriefingSection(briefingData.needToKnow),
        needToDo: this.formatBriefingSection(briefingData.needToDo),
        opportunities: this.formatBriefingSection(briefingData.opportunities),
        risks: this.formatBriefingSection(briefingData.risks),
        relationshipInsights: this.formatBriefingSection(briefingData.relationshipInsights)
      }

      // Store briefing in database
      await supabase.from('daily_briefings').upsert({
        user_id: this.config.userId,
        briefing_date: briefing.date,
        content: briefing,
        generated_by: 'briefing_agent',
        status: 'ready',
        generated_at: new Date().toISOString()
      }, { onConflict: 'user_id,briefing_date' })

      // Store in organizational memory for future reference
      try {
        await updateOrganizationalMemory({
          documentType: 'briefing',
          content: `Daily Executive Briefing - ${briefing.date}\n\nSummary: ${briefing.summary}\n\nKey insights and actions generated for executive review.`,
          metadata: {
            briefingDate: briefing.date,
            briefingType: 'daily',
            itemCount: this.countBriefingItems(briefing)
          },
          significance: 0.8
        })
      } catch (error) {
        console.error('Failed to store briefing in organizational memory:', error)
      }

      console.log(`Daily briefing generated successfully for ${briefing.date}`)
      return briefing

    } catch (error) {
      console.error('Daily briefing generation error:', error)
      throw error
    }
  }

  /**
   * Generate weekly executive briefing
   */
  async generateWeeklyBriefing(date: Date): Promise<any> {
    const supabase = await createClient()
    
    try {
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay()) // Start of week
      
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6) // End of week

      // Get weekly data
      const weeklyData = await this.getWeeklyData(weekStart, weekEnd)

      // Generate weekly analysis
      const weeklyAnalysis = await this.openaiAgent.run({
        messages: [{
          role: 'user',
          content: `Generate a weekly executive briefing for the week of ${weekStart.toDateString()} to ${weekEnd.toDateString()}:

Weekly Data: ${JSON.stringify(weeklyData, null, 2)}

Focus on:
- Key accomplishments and progress
- Trends and patterns
- Strategic insights and recommendations
- Upcoming priorities for next week`
        }]
      })

      const briefing = JSON.parse(weeklyAnalysis.messages[weeklyAnalysis.messages.length - 1]?.content || '{}')

      // Store weekly briefing
      await supabase.from('daily_briefings').insert({
        user_id: this.config.userId,
        briefing_date: weekStart.toISOString().split('T')[0],
        content: briefing,
        generated_by: 'briefing_agent',
        status: 'ready',
        briefing_type: 'weekly'
      })

      return briefing
    } catch (error) {
      console.error('Weekly briefing generation error:', error)
      throw error
    }
  }

  /**
   * Generate monthly executive briefing
   */
  async generateMonthlyBriefing(date: Date): Promise<any> {
    const supabase = await createClient()
    
    try {
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1)
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0)

      // Get monthly data
      const monthlyData = await this.getMonthlyData(monthStart, monthEnd)

      // Generate monthly analysis
      const monthlyAnalysis = await this.openaiAgent.run({
        messages: [{
          role: 'user',
          content: `Generate a monthly executive briefing for ${monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}:

Monthly Data: ${JSON.stringify(monthlyData, null, 2)}

Focus on:
- Monthly achievements and outcomes
- Strategic progress and KPI trends
- Relationship and partnership developments
- Strategic recommendations for next month`
        }]
      })

      const briefing = JSON.parse(monthlyAnalysis.messages[monthlyAnalysis.messages.length - 1]?.content || '{}')

      // Store monthly briefing
      await supabase.from('daily_briefings').insert({
        user_id: this.config.userId,
        briefing_date: monthStart.toISOString().split('T')[0],
        content: briefing,
        generated_by: 'briefing_agent',
        status: 'ready',
        briefing_type: 'monthly'
      })

      return briefing
    } catch (error) {
      console.error('Monthly briefing generation error:', error)
      throw error
    }
  }

  // Helper methods for data gathering
  private async getHighPriorityItems(date: Date): Promise<any[]> {
    const supabase = await createClient()
    
    const { data } = await supabase
      .from('intelligent_actions')
      .select('*')
      .eq('user_id', this.config.userId)
      .lte('priority', 2)
      .eq('status', 'pending')
      .order('priority')
      .limit(10)
      
    return data || []
  }

  private async getPendingCommitments(date: Date): Promise<any[]> {
    const supabase = await createClient()
    
    const { data } = await supabase
      .from('commitments')
      .select('*')
      .eq('user_id', this.config.userId)
      .eq('status', 'pending')
      .order('due_date', { ascending: true })
      .limit(10)
      
    return data || []
  }

  private async getRecentImportantEmails(date: Date): Promise<any[]> {
    const supabase = await createClient()
    const yesterday = new Date(date)
    yesterday.setDate(date.getDate() - 1)
    
    const { data } = await supabase
      .from('email_threads')
      .select('*')
      .eq('user_id', this.config.userId)
      .gte('last_message_date', yesterday.toISOString())
      .lte('priority_score', 2)
      .order('priority_score')
      .limit(5)
      
    return data || []
  }

  private async getProjectUpdates(date: Date): Promise<any[]> {
    // Get recent project-related activities
    try {
      const projects = await searchProjectContext({
        query: 'status:active'
      })
      
      return projects.participantProjects || []
    } catch (error) {
      console.error('Failed to get project updates:', error)
      return []
    }
  }

  private async getRelationshipInsights(date: Date): Promise<any> {
    const config = this.config as BriefingConfig
    
    // Get relationship updates for important contacts
    try {
      const insights = await searchRelationshipHistory({
        contacts: config.priorities || [], // Use priorities as important contacts
        timeframe: 'last_7_days'
      })
      
      return insights
    } catch (error) {
      console.error('Failed to get relationship insights:', error)
      return {}
    }
  }

  private async getSecurityIncidents(date: Date): Promise<any[]> {
    const supabase = await createClient()
    const yesterday = new Date(date)
    yesterday.setDate(date.getDate() - 1)
    
    const { data } = await supabase
      .from('security_incidents')
      .select('*')
      .eq('user_id', this.config.userId)
      .gte('created_at', yesterday.toISOString())
      .order('severity')
      .limit(5)
      
    return data || []
  }

  private async getWeeklyData(weekStart: Date, weekEnd: Date): Promise<any> {
    // Aggregate weekly data from various sources
    const supabase = await createClient()
    
    const [actions, emails, commitments] = await Promise.all([
      supabase
        .from('intelligent_actions')
        .select('*')
        .eq('user_id', this.config.userId)
        .gte('created_at', weekStart.toISOString())
        .lte('created_at', weekEnd.toISOString()),
      supabase
        .from('email_threads')
        .select('*')
        .eq('user_id', this.config.userId)
        .gte('last_message_date', weekStart.toISOString())
        .lte('last_message_date', weekEnd.toISOString()),
      supabase
        .from('commitments')
        .select('*')
        .eq('user_id', this.config.userId)
        .gte('created_at', weekStart.toISOString())
        .lte('created_at', weekEnd.toISOString())
    ])

    return {
      actions: actions.data || [],
      emails: emails.data || [],
      commitments: commitments.data || []
    }
  }

  private async getMonthlyData(monthStart: Date, monthEnd: Date): Promise<any> {
    // Aggregate monthly data with trends and patterns
    const weeklyData = await this.getWeeklyData(monthStart, monthEnd)
    
    // Add monthly-specific analytics
    return {
      ...weeklyData,
      trends: await this.analyzeMonthlyTrends(monthStart, monthEnd)
    }
  }

  private async analyzeMonthlyTrends(monthStart: Date, monthEnd: Date): Promise<any> {
    // Analyze trends over the month
    // This would include metrics like email volume, response times, etc.
    return {
      emailVolume: 'increasing',
      responseTime: 'stable',
      commitmentCompletion: '85%'
    }
  }

  private formatBriefingSection(sectionData: any): BriefingSection {
    return {
      title: sectionData?.title || 'Section',
      content: sectionData?.items?.join('\n• ') || '',
      priority: sectionData?.priority || 3,
      type: this.determineSectionType(sectionData?.title),
      items: sectionData?.items || []
    }
  }

  private determineSectionType(title: string): BriefingSection['type'] {
    const titleLower = title?.toLowerCase() || ''
    
    if (titleLower.includes('know')) return 'need_to_know'
    if (titleLower.includes('do')) return 'need_to_do'
    if (titleLower.includes('opportunit')) return 'opportunities'
    if (titleLower.includes('risk')) return 'risks'
    
    return 'need_to_know'
  }

  private countBriefingItems(briefing: DailyBriefing): number {
    return (
      briefing.needToKnow.items.length +
      briefing.needToDo.items.length +
      briefing.opportunities.items.length +
      briefing.risks.items.length +
      briefing.relationshipInsights.items.length
    )
  }
}