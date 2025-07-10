import { Agent, run } from '@openai/agents'
import { createClient } from '@/lib/supabase/server'
import { 
  DailyBriefing, 
  IntelligenceSummary, 
  IntelligentAction,
  AutomatedAction,
  EmailThread,
  ExtractedTask
} from '@/types'
import { analyzeRelationshipPatterns } from './relationship-analyzer'
import { detectAnomalies } from './anomaly-detector'
import { generateIntelligentActions } from './intelligent-action-generator'

// Daily Briefing Agent
const briefingAgent = new Agent({
  name: 'Daily Briefing Agent',
  model: 'gpt-4o',
  instructions: `You are an intelligent assistant generating daily briefings for Mission Mutual staff.
    Your briefings should be:
    - Concise and actionable
    - Focused on what truly matters
    - Proactive in identifying potential issues
    - Context-aware about ongoing projects and relationships
    
    Prioritize information based on:
    1. Urgency and time sensitivity
    2. VIP communications
    3. Project deadlines
    4. Unusual patterns or anomalies
    5. Follow-up commitments
    
    Format responses as structured JSON matching the IntelligenceSummary type.`,
})

export class DailyBriefingGenerator {
  private userId: string

  constructor(userId: string) {
    this.userId = userId
  }

  private async getSupabase() {
    return await createClient()
  }

  async generateMorningBriefing(): Promise<DailyBriefing> {
    const briefingDate = new Date()
    briefingDate.setHours(0, 0, 0, 0)

    // Check if briefing already exists
    const supabase = await this.getSupabase()
    const { data: existing } = await supabase
      .from('daily_briefings')
      .select('*')
      .eq('user_id', this.userId)
      .eq('briefing_date', briefingDate.toISOString())
      .eq('briefing_type', 'morning')
      .single()

    if (existing) {
      return existing as DailyBriefing
    }

    // Gather intelligence data
    const [
      unreadThreads,
      pendingTasks,
      vipThreads,
      recentActivity,
      relationshipPatterns,
      anomalies
    ] = await Promise.all([
      this.getUnreadImportantThreads(),
      this.getPendingTasks(),
      this.getVIPThreads(),
      this.getRecentActivity(),
      analyzeRelationshipPatterns(this.userId),
      detectAnomalies(this.userId)
    ])

    // Generate intelligence summary
    const intelligenceSummary = await this.generateIntelligenceSummary({
      unreadThreads,
      pendingTasks,
      vipThreads,
      recentActivity,
      relationshipPatterns,
      anomalies
    })

    // Generate intelligent action recommendations
    const actionsRecommended = await generateIntelligentActions({
      userId: this.userId,
      threads: [...unreadThreads, ...vipThreads],
      tasks: pendingTasks,
      anomalies
    })

    // Get automated actions taken overnight
    const actionsTakenAutomatically = await this.getAutomatedActions()

    // Calculate priority score
    const priorityScore = this.calculatePriorityScore({
      intelligenceSummary,
      actionsRecommended,
      actionsTakenAutomatically
    })

    // Create briefing
    const { data: briefing, error } = await supabase
      .from('daily_briefings')
      .insert({
        user_id: this.userId,
        briefing_date: briefingDate.toISOString().split('T')[0], // Use date string format
        briefing_type: 'morning',
        intelligence_summary: intelligenceSummary,
        actions_recommended: actionsRecommended,
        actions_taken_automatically: actionsTakenAutomatically,
        priority_score: priorityScore,
        generated_at: new Date(),
        included_action_ids: actionsRecommended.map(a => a.id).filter(id => id) // Filter out empty IDs
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating briefing:', error)
      throw error
    }

    return briefing as DailyBriefing
  }

  private async getUnreadImportantThreads(): Promise<EmailThread[]> {
    const supabase = await this.getSupabase()
    const { data } = await supabase
      .from('email_threads')
      .select('*')
      .eq('user_id', this.userId)
      .eq('status', 'active')
      .in('category', ['ACTION_REQUIRED', 'FINANCIAL', 'LEGAL'])
      .gte('priority', 3)
      .order('priority', { ascending: false })
      .order('last_message_date', { ascending: false })
      .limit(10)

    return data || []
  }

  private async getPendingTasks(): Promise<ExtractedTask[]> {
    const supabase = await this.getSupabase()
    const { data } = await supabase
      .from('extracted_tasks')
      .select('*')
      .eq('user_id', this.userId)
      .eq('status', 'pending')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20)

    return data || []
  }

  private async getVIPThreads(): Promise<EmailThread[]> {
    const supabase = await this.getSupabase()
    const { data } = await supabase
      .from('email_threads')
      .select('*')
      .eq('user_id', this.userId)
      .eq('is_vip', true)
      .gte('last_message_date', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('last_message_date', { ascending: false })

    return data || []
  }

  private async getRecentActivity() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const supabase = await this.getSupabase()
    
    const [emails, drafts, tasks] = await Promise.all([
      supabase
        .from('email_messages')
        .select('count')
        .eq('user_id', this.userId)
        .gte('created_at', yesterday.toISOString()),
      supabase
        .from('email_drafts')
        .select('count')
        .eq('user_id', this.userId)
        .gte('created_at', yesterday.toISOString()),
      supabase
        .from('extracted_tasks')
        .select('count')
        .eq('user_id', this.userId)
        .gte('created_at', yesterday.toISOString())
    ])

    return {
      emails_processed: emails.count || 0,
      drafts_generated: drafts.count || 0,
      tasks_extracted: tasks.count || 0
    }
  }

  private async generateIntelligenceSummary(data: any): Promise<IntelligenceSummary> {
    const prompt = `
      Generate a morning intelligence briefing based on the following data:
      
      Unread Important Threads: ${JSON.stringify(data.unreadThreads)}
      Pending Tasks: ${JSON.stringify(data.pendingTasks)}
      VIP Communications: ${JSON.stringify(data.vipThreads)}
      Relationship Patterns: ${JSON.stringify(data.relationshipPatterns)}
      Anomalies: ${JSON.stringify(data.anomalies)}
      
      Focus on:
      1. What the user NEEDS TO KNOW (critical information, deadlines, VIP messages)
      2. What the user NEEDS TO DO (urgent tasks, required responses, follow-ups)
      3. ANOMALIES (unusual patterns, delayed responses, potential issues)
      
      Be concise and actionable. Prioritize by urgency and importance.
    `

    const response = await run(briefingAgent, prompt)

    // Parse the response into IntelligenceSummary format
    const content = response.finalOutput || ''
    return this.parseIntelligenceSummary(content)
  }

  private parseIntelligenceSummary(content: any): IntelligenceSummary {
    // Parse AI response into structured format
    try {
      if (typeof content === 'string') {
        return JSON.parse(content)
      }
      return content
    } catch (error) {
      // Fallback structure
      return {
        need_to_know: [],
        need_to_do: [],
        anomalies: [],
        key_metrics: {
          unread_important: 0,
          pending_responses: 0,
          overdue_tasks: 0,
          vip_threads: 0
        }
      }
    }
  }

  private async getAutomatedActions(): Promise<AutomatedAction[]> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const supabase = await this.getSupabase()
    
    // Get processing rules that were applied
    const { data: rules } = await supabase
      .from('email_processing_rules')
      .select('*')
      .eq('user_id', this.userId)
      .eq('enabled', true)
      .gte('last_applied', yesterday.toISOString())

    const actions: AutomatedAction[] = []

    for (const rule of rules || []) {
      if (rule.times_applied > 0) {
        actions.push({
          action_type: 'email_processing_rule',
          description: `Applied rule: ${rule.name || 'Unnamed rule'}`,
          executed_at: new Date(rule.last_applied),
          result: 'success',
          details: {
            times_applied: rule.times_applied,
            actions: rule.actions
          }
        })
      }
    }

    return actions
  }

  private calculatePriorityScore(data: {
    intelligenceSummary: IntelligenceSummary
    actionsRecommended: IntelligentAction[]
    actionsTakenAutomatically: AutomatedAction[]
  }): number {
    let score = 5 // Base score

    // Increase for urgent items
    const urgentItems = data.intelligenceSummary.need_to_know.filter(
      item => item.urgency === 'high'
    ).length
    score += Math.min(urgentItems * 2, 4)

    // Increase for critical anomalies
    const criticalAnomalies = data.intelligenceSummary.anomalies.filter(
      a => a.severity === 'critical'
    ).length
    score += criticalAnomalies * 2

    // Increase for high-urgency actions
    const urgentActions = data.actionsRecommended.filter(
      a => a.urgency_level >= 8
    ).length
    score += Math.min(urgentActions, 3)

    // Cap at 10
    return Math.min(score, 10)
  }
}