import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Agent, tool } from '@openai/agents'

// Initialize the Executive Intelligence Agent
const executiveAgent = new Agent({
  name: 'Executive Intelligence Agent',
  model: 'gpt-4o',
  instructions: `You are an executive intelligence agent that analyzes work patterns and provides actionable insights.
  
  Your role is to:
  1. Extract commitments and promises from communications
  2. Identify relationships that need attention
  3. Detect patterns and anomalies in work flow
  4. Provide proactive recommendations
  5. Summarize what matters most for executive decision-making
  
  Focus on strategic value and relationship quality. Be concise but insightful.`
})

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get recent email threads for analysis
    const { data: threads } = await supabase
      .from('email_threads')
      .select(`
        *,
        email_messages (
          id,
          subject,
          body,
          from_email,
          from_name,
          to_recipients,
          sent_date,
          processed
        )
      `)
      .eq('user_id', user.id)
      .order('last_message_date', { ascending: false })
      .limit(50)

    // Get existing commitments
    const { data: existingCommitments } = await supabase
      .from('commitments')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'in_progress'])

    // Get relationship health data
    const { data: relationshipHealth } = await supabase
      .from('relationship_health')
      .select('*')
      .eq('user_id', user.id)
      .in('health_status', ['at_risk', 'cold'])

    // Get recent intelligent actions
    const { data: recentActions } = await supabase
      .from('intelligent_actions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'executed')
      .gte('executed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours

    // Analyze communications for new commitments and patterns
    const analysisResults = await analyzeExecutiveIntelligence(threads || [], user.id)

    // Build priority actions based on real data
    const priorityActions = await buildPriorityActions(
      threads || [],
      existingCommitments || [],
      relationshipHealth || [],
      user.id,
      supabase
    )

    // Build intelligence summary
    const intelligenceSummary = {
      total_communications: threads?.length || 0,
      decisions_needed: priorityActions.filter(a => a.urgency === 'high').length,
      commitments_tracked: existingCommitments?.length || 0,
      relationships_healthy: await getHealthyRelationshipsCount(supabase, user.id)
    }

    // Format response
    const intelligence = {
      priority_actions: priorityActions,
      commitments: formatCommitments(existingCommitments || []),
      relationship_alerts: formatRelationshipAlerts(relationshipHealth || []),
      automated_actions: formatAutomatedActions(recentActions || []),
      intelligence_summary: intelligenceSummary,
      analysis_metadata: {
        analyzed_at: new Date().toISOString(),
        threads_analyzed: threads?.length || 0,
        new_commitments_found: analysisResults.newCommitments.length
      }
    }

    return NextResponse.json(intelligence)

  } catch (error) {
    console.error('Executive intelligence error:', error)
    return NextResponse.json(
      { error: 'Failed to generate executive intelligence' },
      { status: 500 }
    )
  }
}

async function analyzeExecutiveIntelligence(threads: any[], userId: string) {
  // This would use the OpenAI Agent to analyze emails and extract intelligence
  // For now, we'll return mock data structure
  return {
    newCommitments: [],
    relationshipInsights: [],
    patterns: [],
    anomalies: []
  }
}

async function buildPriorityActions(threads: any[], commitments: any[], relationshipAlerts: any[], userId: string, supabase: any) {
  const actions = []

  // Check for overdue commitments
  const overdueCommitments = commitments.filter(c => 
    c.status === 'pending' && new Date(c.due_date) < new Date()
  )

  if (overdueCommitments.length > 0) {
    actions.push({
      id: 'overdue-commitments',
      title: `${overdueCommitments.length} Overdue Commitments`,
      description: `You have ${overdueCommitments.length} commitments that are past due and need attention.`,
      urgency: 'high' as const,
      suggested_actions: ['Review All', 'Send Updates', 'Reschedule']
    })
  }

  // Check for urgent emails based on real data
  const { data: urgentThreads } = await supabase
    .from('email_threads')
    .select('id, subject, category, last_message_date')
    .eq('user_id', userId)
    .eq('category', 'ACTION_REQUIRED')
    .gte('last_message_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days

  if (urgentThreads && urgentThreads.length > 0) {
    actions.push({
      id: 'urgent-emails',
      title: `${urgentThreads.length} Urgent Messages`,
      description: `You have ${urgentThreads.length} messages marked as action required from the last week.`,
      urgency: 'high' as const,
      suggested_actions: ['Review All', 'Generate Drafts', 'Delegate']
    })
  }

  // Check for drafts that need attention
  const { data: pendingDrafts } = await supabase
    .from('email_drafts')
    .select('id, thread_id')
    .eq('user_id', userId)
    .eq('status', 'pending')

  if (pendingDrafts && pendingDrafts.length > 0) {
    actions.push({
      id: 'pending-drafts',
      title: `${pendingDrafts.length} Drafts Waiting for Review`,
      description: `You have ${pendingDrafts.length} AI-generated drafts waiting for your review and approval.`,
      urgency: 'medium' as const,
      suggested_actions: ['Review Drafts', 'Approve All', 'Edit & Send']
    })
  }

  // Check for relationship issues
  if (relationshipAlerts.length > 0) {
    actions.push({
      id: 'relationship-health',
      title: `${relationshipAlerts.length} Relationships Need Attention`,
      description: `Professional relationships that haven't been contacted recently or are showing concerning patterns.`,
      urgency: 'medium' as const,
      suggested_actions: ['Send Check-in', 'Schedule Call', 'Review History']
    })
  }

  return actions
}

function formatCommitments(commitments: any[]) {
  return commitments.map(c => ({
    id: c.id,
    description: c.description,
    due_date: c.due_date,
    status: c.status,
    committed_to: c.committed_to || 'Unknown',
    days_until_due: Math.ceil((new Date(c.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
  }))
}

function formatRelationshipAlerts(alerts: any[]) {
  return alerts.map(alert => ({
    contact_email: alert.contact_email,
    contact_name: alert.contact_name,
    days_since_contact: Math.ceil((new Date().getTime() - new Date(alert.last_interaction_date).getTime()) / (1000 * 60 * 60 * 24)),
    relationship_type: alert.relationship_type || 'Professional',
    importance_score: alert.importance_score
  }))
}

function formatAutomatedActions(actions: any[]) {
  return actions.map(action => {
    const actionData = action.recommended_action
    return `${actionData.type || 'Action'}: ${actionData.description || 'Completed automatically'}`
  })
}

async function getHealthyRelationshipsCount(supabase: any, userId: string) {
  const { count } = await supabase
    .from('relationship_health')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('health_status', 'healthy')

  return count || 0
}