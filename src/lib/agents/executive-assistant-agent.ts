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

export interface ExecutiveAssistantConfig extends AgentConfig {
  briefingSchedule: string; // CRON schedule for daily briefings
  priorities: string[]; // Priority keywords to watch for
  vipContacts: string[]; // VIP email addresses
  delegationRules: any[]; // Rules for delegation and escalation
}

export interface ExecutiveTask {
  id: string
  type: 'commitment' | 'follow_up' | 'decision' | 'review'
  title: string
  description: string
  priority: number
  dueDate?: Date
  relatedEmails: string[]
  context: any
}

/**
 * Executive Assistant Agent - Main orchestration agent for executive work
 * Handles high-level decision making, priority management, and work coordination
 */
export class ExecutiveAssistantAgent extends BaseAgent<any, AgentDecision> {
  private openaiAgent: Agent
  
  constructor(config: ExecutiveAssistantConfig) {
    super(config)
    
    // Initialize OpenAI agent with executive capabilities
    this.openaiAgent = new Agent({
      name: 'Executive Assistant AI',
      model: 'gpt-4o',
      instructions: `You are an AI Executive Assistant responsible for managing executive-level tasks, priorities, and decision-making.

Your primary responsibilities:
1. Analyze and prioritize incoming work across all channels
2. Identify commitments, follow-ups, and decisions needed
3. Coordinate with other specialized agents
4. Generate executive briefings and priority summaries
5. Monitor project progress and relationship health
6. Escalate issues requiring executive attention

Key principles:
- Focus on high-impact, strategic work
- Maintain context across all projects and relationships  
- Proactively identify risks and opportunities
- Ensure nothing important falls through the cracks
- Adapt to executive work patterns and preferences

Available tools:
- searchProjectContext: Find project-related information and context
- searchRelationshipHistory: Analyze contact relationships and communication patterns
- verifyOrganizationalFacts: Verify claims against organizational knowledge
- getEmailThreadContext: Get comprehensive thread history and context
- updateOrganizationalMemory: Store significant insights and decisions

When processing items:
1. Assess strategic importance and executive relevance
2. Identify connections to ongoing projects and relationships
3. Extract commitments, decisions, and follow-up actions
4. Determine appropriate delegation or escalation
5. Update organizational memory with significant insights

Always provide clear reasoning and actionable recommendations.`,
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
    return 'executive_work'
  }

  protected async analyzeItem(item: any): Promise<AgentDecision> {
    try {
      // Use OpenAI agent for sophisticated analysis
      const analysis = await this.openaiAgent.run({
        messages: [{
          role: 'user',
          content: `Analyze this item for executive relevance and required actions:

${JSON.stringify(item, null, 2)}

Provide analysis in this format:
{
  "executiveRelevance": "high|medium|low",
  "priority": 1-5,
  "actionType": "delegate|execute|escalate|monitor",
  "reasoning": "explanation",
  "commitments": ["list of commitments identified"],
  "followUps": ["list of follow-ups needed"],
  "relationships": ["affected relationships"],
  "projects": ["related projects"],
  "recommendations": ["actionable recommendations"]
}`
        }]
      })

      const analysisResult = JSON.parse(analysis.messages[analysis.messages.length - 1]?.content || '{}')
      
      return {
        action: this.determineAction(analysisResult),
        confidence: this.calculateConfidence(analysisResult),
        reasoning: analysisResult.reasoning || 'Executive analysis completed',
        metadata: {
          executiveRelevance: analysisResult.executiveRelevance,
          priority: analysisResult.priority,
          commitments: analysisResult.commitments || [],
          followUps: analysisResult.followUps || [],
          relationships: analysisResult.relationships || [],
          projects: analysisResult.projects || [],
          recommendations: analysisResult.recommendations || []
        }
      }
    } catch (error) {
      console.error('Executive analysis error:', error)
      return {
        action: 'flag_for_review',
        confidence: 0.3,
        reasoning: 'Failed to analyze item - requires manual review',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  }

  private determineAction(analysis: any): string {
    const relevance = analysis.executiveRelevance
    const priority = analysis.priority
    
    if (relevance === 'high' || priority <= 2) {
      return 'escalate_to_executive'
    } else if (relevance === 'medium' || priority === 3) {
      return 'delegate_with_monitoring'
    } else if (analysis.commitments?.length > 0 || analysis.followUps?.length > 0) {
      return 'track_commitments'
    } else {
      return 'file_for_reference'
    }
  }

  private calculateConfidence(analysis: any): number {
    let confidence = 0.7 // Base confidence
    
    // Increase confidence based on completeness of analysis
    if (analysis.reasoning) confidence += 0.1
    if (analysis.commitments?.length > 0) confidence += 0.1
    if (analysis.relationships?.length > 0) confidence += 0.05
    if (analysis.projects?.length > 0) confidence += 0.05
    
    return Math.min(confidence, 1.0)
  }

  protected async processItem(item: any, decision: AgentDecision): Promise<void> {
    const supabase = await createClient()

    try {
      switch (decision.action) {
        case 'escalate_to_executive':
          await this.escalateToExecutive(item, decision)
          break
          
        case 'delegate_with_monitoring':
          await this.delegateWithMonitoring(item, decision)
          break
          
        case 'track_commitments':
          await this.trackCommitments(item, decision)
          break
          
        case 'file_for_reference':
          await this.fileForReference(item, decision)
          break
          
        default:
          await this.flagForReview(item, 3)
      }

      // Update organizational memory with significant insights
      if (decision.confidence > 0.8 && decision.metadata?.executiveRelevance === 'high') {
        try {
          await updateOrganizationalMemory({
            documentType: 'executive_decision',
            content: `Executive item processed: ${item.subject || item.title}\n\nDecision: ${decision.action}\nReasoning: ${decision.reasoning}\nRecommendations: ${decision.metadata?.recommendations?.join(', ')}`,
            metadata: {
              itemId: item.id,
              action: decision.action,
              priority: decision.metadata?.priority,
              commitments: decision.metadata?.commitments,
              projects: decision.metadata?.projects
            },
            significance: 0.9
          })
        } catch (error) {
          console.error('Failed to update organizational memory:', error)
        }
      }

      await this.logAction({
        action_type: decision.action,
        email_id: item.id,
        description: `Executive assistant processed: ${decision.action}`,
        metadata: decision.metadata
      })

    } catch (error) {
      console.error('Executive processing error:', error)
      await this.flagForReview(item, 1) // High priority for executive items
    }
  }

  private async escalateToExecutive(item: any, decision: AgentDecision): Promise<void> {
    const supabase = await createClient()
    
    // Create high-priority alert for executive attention
    await supabase.from('intelligent_actions').insert({
      user_id: this.config.userId,
      action_type: 'executive_attention_required',
      title: `High Priority: ${item.subject || item.title}`,
      description: decision.reasoning,
      priority: 1,
      status: 'pending',
      metadata: {
        itemId: item.id,
        recommendations: decision.metadata?.recommendations,
        commitments: decision.metadata?.commitments,
        relatedProjects: decision.metadata?.projects
      }
    })
  }

  private async delegateWithMonitoring(item: any, decision: AgentDecision): Promise<void> {
    const supabase = await createClient()
    
    // Create monitored task
    await supabase.from('intelligent_actions').insert({
      user_id: this.config.userId,
      action_type: 'delegated_task',
      title: `Monitor: ${item.subject || item.title}`,
      description: `Delegated item requiring monitoring: ${decision.reasoning}`,
      priority: 3,
      status: 'in_progress',
      metadata: {
        itemId: item.id,
        delegationType: 'with_monitoring',
        followUps: decision.metadata?.followUps,
        checkInDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 week
      }
    })
  }

  private async trackCommitments(item: any, decision: AgentDecision): Promise<void> {
    const supabase = await createClient()
    
    // Create commitment tracking entries
    for (const commitment of decision.metadata?.commitments || []) {
      await supabase.from('commitments').insert({
        user_id: this.config.userId,
        title: commitment,
        source_email_id: item.id,
        status: 'pending',
        priority: decision.metadata?.priority || 3,
        metadata: {
          extractedBy: 'executive_assistant_agent',
          originalItem: item.subject || item.title,
          context: decision.reasoning
        }
      })
    }
  }

  private async fileForReference(item: any, decision: AgentDecision): Promise<void> {
    // Update organizational memory for future reference
    try {
      await updateOrganizationalMemory({
        documentType: 'reference',
        content: `Reference item: ${item.subject || item.title}\n\nContext: ${decision.reasoning}`,
        metadata: {
          itemId: item.id,
          significance: 0.3,
          filedBy: 'executive_assistant_agent'
        },
        significance: 0.3
      })
    } catch (error) {
      console.error('Failed to file item for reference:', error)
    }
  }

  /**
   * Generate executive briefing
   */
  async generateBriefing(date: Date = new Date()): Promise<any> {
    const supabase = await createClient()
    
    try {
      // Get high-priority items
      const { data: highPriorityItems } = await supabase
        .from('intelligent_actions')
        .select('*')
        .eq('user_id', this.config.userId)
        .lte('priority', 2)
        .eq('status', 'pending')
        .order('priority')
        .limit(10)

      // Get pending commitments
      const { data: pendingCommitments } = await supabase
        .from('commitments')
        .select('*')
        .eq('user_id', this.config.userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10)

      // Get relationship intelligence updates
      const relationships = await searchRelationshipHistory({
        contacts: (this.config as ExecutiveAssistantConfig).vipContacts || [],
        timeframe: 'last_7_days'
      })

      // Generate briefing using OpenAI agent
      const briefing = await this.openaiAgent.run({
        messages: [{
          role: 'user',
          content: `Generate an executive briefing for ${date.toDateString()} based on this data:

High Priority Items: ${JSON.stringify(highPriorityItems, null, 2)}
Pending Commitments: ${JSON.stringify(pendingCommitments, null, 2)}
VIP Relationship Updates: ${JSON.stringify(relationships, null, 2)}

Format as:
{
  "needToKnow": ["critical updates"],
  "needToDo": ["urgent actions"],
  "opportunities": ["potential opportunities"],
  "risks": ["risks to monitor"],
  "relationshipInsights": ["relationship updates"],
  "summary": "executive summary"
}`
        }]
      })

      const briefingData = JSON.parse(briefing.messages[briefing.messages.length - 1]?.content || '{}')
      
      // Store briefing
      await supabase.from('daily_briefings').insert({
        user_id: this.config.userId,
        briefing_date: date.toISOString().split('T')[0],
        content: briefingData,
        generated_by: 'executive_assistant_agent',
        status: 'ready'
      })

      return briefingData
    } catch (error) {
      console.error('Briefing generation error:', error)
      throw error
    }
  }

  /**
   * Monitor and update project health
   */
  async monitorProjectHealth(): Promise<void> {
    try {
      // Get all active projects
      const projects = await searchProjectContext({
        query: 'status:active'
      })

      for (const project of projects.participantProjects || []) {
        // Analyze project health using OpenAI agent
        const healthAnalysis = await this.openaiAgent.run({
          messages: [{
            role: 'user',
            content: `Analyze project health for: ${JSON.stringify(project, null, 2)}

Provide health assessment including risks, progress, and recommendations.`
          }]
        })

        // Store project health update
        await updateOrganizationalMemory({
          documentType: 'project',
          content: `Project Health Update: ${project.project_name}\n\n${healthAnalysis.messages[healthAnalysis.messages.length - 1]?.content}`,
          metadata: {
            projectId: project.id,
            healthCheck: true,
            analysisDate: new Date().toISOString()
          },
          significance: 0.7
        })
      }
    } catch (error) {
      console.error('Project health monitoring error:', error)
    }
  }
}