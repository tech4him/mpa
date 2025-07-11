import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { actionId, action } = await request.json()

    // Route to appropriate action handler
    let result
    switch (actionId) {
      case 'overdue-commitments':
        result = await handleOverdueCommitments(action, user.id, supabase)
        break
      case 'urgent-emails':
        result = await handleUrgentEmails(action, user.id, supabase)
        break
      case 'relationship-health':
        result = await handleRelationshipHealth(action, user.id, supabase)
        break
      default:
        result = { success: false, message: 'Unknown action' }
    }

    // Log the action
    await supabase.from('intelligent_actions').insert({
      user_id: user.id,
      action_type: actionId,
      trigger_context: `User clicked: ${action}`,
      recommended_action: { type: action, actionId },
      confidence_score: 1.0,
      urgency_level: 5,
      status: 'executed',
      executed_at: new Date().toISOString()
    })

    return NextResponse.json(result)

  } catch (error) {
    console.error('Executive action error:', error)
    return NextResponse.json(
      { error: 'Failed to execute action' },
      { status: 500 }
    )
  }
}

async function handleOverdueCommitments(action: string, userId: string, supabase: any) {
  switch (action) {
    case 'Review All':
      // Get all overdue commitments
      const { data: overdue } = await supabase
        .from('commitments')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .lt('due_date', new Date().toISOString())
      
      return {
        success: true,
        message: `Found ${overdue?.length || 0} overdue commitments`,
        data: overdue
      }

    case 'Send Updates':
      // This would generate status update emails
      return {
        success: true,
        message: 'Status update drafts will be generated',
        action: 'generate_status_updates'
      }

    case 'Reschedule':
      // This would help reschedule overdue items
      return {
        success: true,
        message: 'Rescheduling assistance will be provided',
        action: 'reschedule_commitments'
      }

    default:
      return { success: false, message: 'Unknown action for overdue commitments' }
  }
}

async function handleUrgentEmails(action: string, userId: string, supabase: any) {
  switch (action) {
    case 'Review All':
      // Get urgent email threads
      const { data: urgent } = await supabase
        .from('email_threads')
        .select('*')
        .eq('user_id', userId)
        .eq('category', 'ACTION_REQUIRED')
        .eq('processed', false)
        .order('last_message_date', { ascending: false })
      
      return {
        success: true,
        message: `Found ${urgent?.length || 0} urgent emails`,
        data: urgent
      }

    case 'Generate Drafts':
      // Get urgent emails and generate drafts
      const { data: urgentForDrafts } = await supabase
        .from('email_threads')
        .select(`
          id,
          subject,
          participants,
          email_messages (
            id,
            subject,
            from_email,
            sent_date
          )
        `)
        .eq('user_id', userId)
        .eq('category', 'ACTION_REQUIRED')
        .eq('processed', false)
        .limit(5) // Limit to prevent overwhelming

      // For now, just return the threads that would get drafts
      return {
        success: true,
        message: `AI drafts will be generated for ${urgentForDrafts?.length || 0} urgent emails`,
        action: 'generate_drafts',
        data: urgentForDrafts,
        next_step: 'Draft generation will be implemented in the AI agents'
      }

    case 'Delegate':
      // Get team members and delegation options
      const { data: recentContacts } = await supabase
        .from('contacts')
        .select('email, name, organization')
        .eq('user_id', userId)
        .order('last_interaction', { ascending: false })
        .limit(10)

      return {
        success: true,
        message: 'Delegation options ready - showing your frequent contacts',
        action: 'show_delegation_options',
        data: recentContacts,
        next_step: 'Choose a contact to delegate urgent emails to'
      }

    default:
      return { success: false, message: 'Unknown action for urgent emails' }
  }
}

async function handleRelationshipHealth(action: string, userId: string, supabase: any) {
  switch (action) {
    case 'Send Check-in':
      // This would generate check-in messages
      return {
        success: true,
        message: 'Check-in messages will be drafted',
        action: 'draft_checkins'
      }

    case 'Schedule Call':
      // This would help schedule calls
      return {
        success: true,
        message: 'Call scheduling assistant will be opened',
        action: 'schedule_calls'
      }

    case 'Review History':
      // Get relationship history
      const { data: relationships } = await supabase
        .from('relationship_health')
        .select('*')
        .eq('user_id', userId)
        .in('health_status', ['at_risk', 'cold'])
      
      return {
        success: true,
        message: `Found ${relationships?.length || 0} relationships needing attention`,
        data: relationships
      }

    default:
      return { success: false, message: 'Unknown action for relationship health' }
  }
}