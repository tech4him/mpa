import { Agent, run, tool } from '@openai/agents'
import { createServiceClient } from '@/lib/supabase/service'
import { 
  DailyBriefing, 
  IntelligenceSummary, 
  IntelligentAction,
  AutomatedAction,
  EmailThread,
  ExtractedTask,
  EmailMessage
} from '@/types'
import { EnhancedBriefingSummary } from '@/types/briefing'
import { categorizeEmailsByTopic } from './topic-categorizer'
import { analyzeRelationshipPatterns } from './relationship-analyzer'
import { detectAnomalies } from './anomaly-detector'
import { generateIntelligentActions } from './intelligent-action-generator'

// Tool to search for email content by keywords
const searchEmailContent = tool({
  name: 'searchEmailContent',
  description: 'Search email messages for specific keywords or topics',
  parameters: {
    type: 'object',
    properties: {
      keywords: { type: 'string', description: 'Keywords to search for' },
      userId: { type: 'string', description: 'User ID to search for' },
      limit: { type: 'number', description: 'Max results to return (optional, defaults to 10)' }
    },
    required: ['keywords', 'userId', 'limit'],
    additionalProperties: false
  },
  execute: async ({ keywords, userId, limit = 10 }) => {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('email_messages')
      .select('id, thread_id, subject, body, from_email, received_at')
      .eq('user_id', userId)
      .or(`subject.ilike.%${keywords}%,body.ilike.%${keywords}%`)
      .order('received_at', { ascending: false })
      .limit(limit)
    
    return data || []
  }
})

// Tool to get calendar/meeting context
const getUpcomingDeadlines = tool({
  name: 'getUpcomingDeadlines',
  description: 'Get tasks and deadlines coming up in the next few days',
  parameters: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'User ID' },
      days: { type: 'number', description: 'Number of days to look ahead (optional, defaults to 7)' }
    },
    required: ['userId', 'days'],
    additionalProperties: false
  },
  execute: async ({ userId, days = 7 }) => {
    const supabase = createServiceClient()
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + days)
    
    const { data } = await supabase
      .from('extracted_tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lte('due_date', futureDate.toISOString())
      .order('due_date', { ascending: true })
    
    return data || []
  }
})

// Tool to analyze thread importance
const analyzeThreadImportance = tool({
  name: 'analyzeThreadImportance',
  description: 'Analyze why a thread might be important based on participants and content',
  parameters: {
    type: 'object',
    properties: {
      threadId: { type: 'string', description: 'Thread database ID' },
      userId: { type: 'string', description: 'User ID' }
    },
    required: ['threadId', 'userId'],
    additionalProperties: false
  },
  execute: async ({ threadId, userId }) => {
    const supabase = createServiceClient()
    
    // Get thread details
    const { data: thread } = await supabase
      .from('email_threads')
      .select('*')
      .eq('id', threadId)
      .eq('user_id', userId)
      .single()
    
    // Get recent messages
    const { data: messages } = await supabase
      .from('email_messages')
      .select('body, from_email, received_at')
      .eq('thread_id', threadId)
      .order('received_at', { ascending: false })
      .limit(3)
    
    // Check if any participants are VIPs
    const { data: vipContacts } = await supabase
      .from('contacts')
      .select('email, name, is_vip')
      .eq('user_id', userId)
      .in('email', thread?.participants || [])
      .eq('is_vip', true)
    
    return {
      thread,
      recentMessages: messages,
      vipParticipants: vipContacts,
      hasVIPs: (vipContacts?.length || 0) > 0,
      messageCount: thread?.message_count || 0,
      daysSinceLastMessage: thread?.last_message_date 
        ? Math.floor((new Date().getTime() - new Date(thread.last_message_date).getTime()) / (1000 * 60 * 60 * 24))
        : null
    }
  }
})

// Daily Briefing Agent
const briefingAgent = new Agent({
  name: 'Daily Briefing Agent',
  model: 'gpt-4o',
  tools: [searchEmailContent, getUpcomingDeadlines, analyzeThreadImportance],
  instructions: `You are an intelligent assistant generating daily briefings for Mission Mutual staff.
    
    You MUST return a JSON object with this exact structure:
    {
      "need_to_know": [
        {
          "title": "string - brief title",
          "description": "string - detailed description",
          "urgency": "high" | "medium" | "low",
          "related_threads": ["optional array of thread database IDs (UUIDs), NOT Microsoft thread_ids"]
        }
      ],
      "need_to_do": [
        {
          "task": "string - clear action item",
          "due": "ISO date string or null",
          "priority": number (1-5),
          "source": "string - where this came from",
          "thread_id": "optional thread ID"
        }
      ],
      "anomalies": [
        {
          "type": "string - anomaly type",
          "description": "string - what's unusual",
          "severity": "critical" | "warning" | "info",
          "recommendation": "string - what to do about it",
          "related_entity": "optional string"
        }
      ],
      "key_metrics": {
        "unread_important": number,
        "pending_responses": number,
        "overdue_tasks": number,
        "vip_threads": number
      },
      "topic_summaries": [
        {
          "topic": "string - topic name like 'Financial Operations'",
          "summary": "string - 1-2 sentence summary of emails in this topic",
          "action_needed": "boolean - whether immediate action is required"
        }
      ]
    }
    
    Focus on:
    1. NEED TO KNOW: Deadlines, critical decisions, VIP messages, important updates
    2. NEED TO DO: Specific actions with clear next steps
    3. ANOMALIES: Unusual patterns, risks, opportunities
    4. TOPIC SUMMARIES: Brief overview of emails grouped by topic
    
    IMPORTANT: When referencing threads, use the 'id' field (UUID format like "64bbe07a-6cbd-42a3-a010-f47a8282b190"), 
    NOT the 'thread_id' field (Microsoft format like "AAQkAGY3NDU2MTk5...").
    
    TOOLS AVAILABLE:
    1. searchEmailContent - Search for emails about specific topics or keywords
    2. getUpcomingDeadlines - Get tasks and deadlines coming up 
    3. analyzeThreadImportance - Deep dive into why a thread matters
    
    USE THESE TOOLS to gather additional context beyond the basic data provided. For example:
    - If you see a Meraki license renewal, use searchEmailContent to find related emails
    - Use getUpcomingDeadlines to check for approaching deadlines
    - Use analyzeThreadImportance for high-priority threads to understand their significance
    
    Be concise and actionable. Extract key information from email content and tool results.`,
})

export class DailyBriefingGenerator {
  private userId: string

  constructor(userId: string) {
    this.userId = userId
  }

  private async getSupabase() {
    return createServiceClient()
  }

  async generateMorningBriefing(dateString?: string): Promise<DailyBriefing> {
    // Use provided date or current date
    const briefingDateStr = dateString || new Date().toISOString().split('T')[0]
    console.log('Generating briefing for date:', briefingDateStr)

    // Check if briefing already exists
    const supabase = await this.getSupabase()
    const { data: existing } = await supabase
      .from('daily_briefings')
      .select('*')
      .eq('user_id', this.userId)
      .eq('briefing_date', briefingDateStr)
      .eq('briefing_type', 'morning')
      .single()

    if (existing) {
      console.log('Briefing already exists for date:', briefingDateStr, 'ID:', existing.id)
      return existing as DailyBriefing
    }

    // Gather intelligence data
    console.log('Gathering intelligence data for user:', this.userId)
    const [
      unreadThreads,
      pendingTasks,
      vipThreads,
      recentActivity,
      relationshipPatterns,
      anomalies,
      allRecentThreads,
      recentMessages
    ] = await Promise.allSettled([
      this.getUnreadImportantThreads(),
      this.getPendingTasks(),
      this.getVIPThreads(),
      this.getRecentActivity(),
      analyzeRelationshipPatterns(this.userId),
      detectAnomalies(this.userId),
      this.getRecentThreads(),
      this.getRecentMessages()
    ]).then(results => {
      const resolved = results.map((result, index) => {
        const labels = ['unreadThreads', 'pendingTasks', 'vipThreads', 'recentActivity', 'relationshipPatterns', 'anomalies', 'allRecentThreads', 'recentMessages']
        if (result.status === 'rejected') {
          console.error(`Failed to get ${labels[index]}:`, result.reason)
          return index === 3 ? { emails_processed: 0, drafts_generated: 0, tasks_extracted: 0 } : []
        }
        return result.value
      })
      return resolved
    })

    console.log('Intelligence data gathered:', {
      unreadThreads: unreadThreads.length,
      pendingTasks: pendingTasks.length,
      vipThreads: vipThreads.length,
      recentActivity,
      relationshipPatterns: relationshipPatterns.length,
      anomalies: anomalies.length,
      allRecentThreads: allRecentThreads.length,
      recentMessages: recentMessages.length
    })

    // Categorize emails by topic using all available threads
    const allThreadsForCategorization = [...unreadThreads, ...vipThreads, ...allRecentThreads]
    const allMessagesForCategorization = [...recentMessages]
    
    // If we don't have recent messages, get messages for the important threads
    if (allMessagesForCategorization.length === 0 && allThreadsForCategorization.length > 0) {
      const threadIds = allThreadsForCategorization.map(t => t.id).slice(0, 20) // Limit to avoid too many queries
      const emailContent = await this.getEmailContent(threadIds)
      // Transform email content to message format for categorization
      allMessagesForCategorization.push(...emailContent.map(msg => ({
        id: msg.id,
        thread_id: msg.thread_id,
        subject: msg.subject,
        body: msg.body,
        from_email: msg.from_email,
        from_name: null, // Not available in email content
        to_emails: [],
        received_at: msg.received_at,
        user_id: this.userId,
        is_read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })))
    }
    
    const topicGroups = categorizeEmailsByTopic(allThreadsForCategorization, allMessagesForCategorization)
    console.log('Categorized emails into topics:', topicGroups.map(g => `${g.title} (${g.count})`))

    // Generate intelligence summary
    console.log('Generating intelligence summary...')
    const intelligenceSummary = await this.generateIntelligenceSummary({
      unreadThreads,
      pendingTasks,
      vipThreads,
      recentActivity,
      relationshipPatterns,
      anomalies,
      topicGroups
    })

    // Generate intelligent action recommendations
    console.log('Generating intelligent actions...')
    let actionsRecommended = []
    try {
      actionsRecommended = await generateIntelligentActions({
        userId: this.userId,
        threads: [...unreadThreads, ...vipThreads],
        tasks: pendingTasks,
        anomalies
      })
      console.log('Generated actions:', actionsRecommended.length)
    } catch (error) {
      console.error('Failed to generate intelligent actions:', error)
    }

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
        briefing_date: briefingDateStr, // Use date string format
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

  private async getRecentThreads(): Promise<EmailThread[]> {
    const supabase = await this.getSupabase()
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const { data } = await supabase
      .from('email_threads')
      .select('*')
      .eq('user_id', this.userId)
      .gte('last_message_date', yesterday.toISOString())
      .order('last_message_date', { ascending: false })
      .limit(50)

    return data || []
  }

  private async getRecentMessages(): Promise<EmailMessage[]> {
    const supabase = await this.getSupabase()
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const { data } = await supabase
      .from('email_messages')
      .select('*')
      .eq('user_id', this.userId)
      .gte('received_at', yesterday.toISOString())
      .order('received_at', { ascending: false })
      .limit(100)

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

  private async getEmailContent(threadIds: string[]): Promise<any[]> {
    if (threadIds.length === 0) return []
    
    const supabase = await this.getSupabase()
    const { data: messages } = await supabase
      .from('email_messages')
      .select('thread_id, subject, body, from_email, to_emails, received_at')
      .in('thread_id', threadIds)
      .order('received_at', { ascending: false })
      .limit(50)
    
    return messages || []
  }

  private async generateIntelligenceSummary(data: any): Promise<IntelligenceSummary & { topics?: any[] }> {
    // Get actual email content for context
    const threadIds = [
      ...data.unreadThreads.map((t: any) => t.id),
      ...data.vipThreads.map((t: any) => t.id)
    ].slice(0, 10) // Limit to 10 most important threads
    
    const emailContent = await this.getEmailContent(threadIds)
    
    // Store topic groups in the intelligence summary
    const topicSummaries = data.topicGroups?.map((group: any) => ({
      topic: group.title,
      count: group.count,
      priority: group.priority,
      emails: group.emails.slice(0, 5) // Include top 5 emails per topic
    }))
    
    const prompt = `
      Generate a morning intelligence briefing based on the following data:
      
      Unread Important Threads: ${JSON.stringify(data.unreadThreads)}
      Email Content Samples: ${JSON.stringify(emailContent)}
      Pending Tasks: ${JSON.stringify(data.pendingTasks)}
      VIP Communications: ${JSON.stringify(data.vipThreads)}
      Relationship Patterns: ${JSON.stringify(data.relationshipPatterns)}
      Anomalies: ${JSON.stringify(data.anomalies)}
      Topic Groups: ${JSON.stringify(topicSummaries)}
      
      Focus on:
      1. What the user NEEDS TO KNOW (critical information, deadlines, VIP messages)
      2. What the user NEEDS TO DO (urgent tasks, required responses, follow-ups)
      3. ANOMALIES (unusual patterns, delayed responses, potential issues)
      4. TOPIC SUMMARIES (brief overview of emails in each topic group)
      
      Be concise and actionable. Prioritize by urgency and importance.
    `

    try {
      console.log('Calling OpenAI agent for intelligence summary...')
      const response = await run(briefingAgent, prompt)
      console.log('OpenAI agent response received:', !!response.finalOutput)
      console.log('Agent response type:', typeof response.finalOutput)
      console.log('Agent response content:', JSON.stringify(response.finalOutput).substring(0, 500))

      // Parse the response into IntelligenceSummary format
      const content = response.finalOutput || ''
      const parsed = this.parseIntelligenceSummary(content)
      
      // Add the topic groups to the parsed summary
      return {
        ...parsed,
        topics: data.topicGroups || []
      }
    } catch (error) {
      console.error('OpenAI agent failed:', error)
      // Return a fallback summary
      return {
        need_to_know: [],
        need_to_do: [],
        anomalies: [],
        key_metrics: {
          unread_important: 0,
          pending_responses: 0,
          overdue_tasks: 0,
          vip_threads: 0
        },
        topics: data.topicGroups || []
      }
    }
  }

  private parseIntelligenceSummary(content: any): IntelligenceSummary {
    // Parse AI response into structured format
    try {
      let parsed = content
      
      if (typeof content === 'string') {
        // Remove markdown code blocks if present
        const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        
        // Try to extract JSON from the string
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        } else {
          parsed = JSON.parse(cleanContent)
        }
      }
      
      // If the response has an IntelligenceSummary property, use that
      if (parsed?.IntelligenceSummary) {
        parsed = parsed.IntelligenceSummary
      }
      
      // Ensure all required fields exist
      return {
        need_to_know: parsed.need_to_know || [],
        need_to_do: parsed.need_to_do || [],
        anomalies: parsed.anomalies || [],
        key_metrics: parsed.key_metrics || {
          unread_important: 0,
          pending_responses: 0,
          overdue_tasks: 0,
          vip_threads: 0
        }
      }
    } catch (error) {
      console.error('Failed to parse intelligence summary:', error)
      console.error('Content was:', content)
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