import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const threadId = searchParams.get('threadId')

  if (!threadId) {
    return NextResponse.json({ error: 'Thread ID is required' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get thread details
    const { data: thread } = await supabase
      .from('email_threads')
      .select('*')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Generate AI recommendations based on thread analysis
    const recommendations = await generateRecommendations(thread)

    return NextResponse.json(recommendations)
  } catch (error) {
    console.error('AI recommendations error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function generateRecommendations(thread: any) {
  const recommendations = []

  // Recommendation 1: Auto-reply for common scenarios
  if (thread.category === 'ACTION_REQUIRED' && thread.priority <= 2) {
    recommendations.push({
      type: 'draft_reply',
      title: 'Draft urgent reply',
      description: 'This high-priority action item needs a quick response. Generate an AI draft to save time.',
      confidence: 0.85,
      action_data: { urgency: 'high', draft_type: 'reply' }
    })
  }

  // Recommendation 2: Meeting scheduling
  if (thread.category === 'MEETING_REQUEST') {
    recommendations.push({
      type: 'schedule_meeting',
      title: 'Schedule meeting',
      description: 'This appears to be a meeting request. Create a calendar invite or suggest times.',
      confidence: 0.9,
      action_data: { meeting_type: 'scheduled', participants: thread.participants }
    })
  }

  // Recommendation 3: Task extraction
  if (thread.category === 'ACTION_REQUIRED' && thread.message_count > 2) {
    recommendations.push({
      type: 'create_task',
      title: 'Extract action items',
      description: 'This multi-message thread likely contains tasks. Extract them automatically.',
      confidence: 0.8,
      action_data: { extract_type: 'comprehensive' }
    })
  }

  // Recommendation 4: Delegation
  if (thread.category === 'FINANCIAL' && thread.priority >= 3) {
    recommendations.push({
      type: 'delegate',
      title: 'Delegate to finance team',
      description: 'This financial matter might be better handled by your finance team.',
      confidence: 0.7,
      action_data: { suggested_team: 'finance', delegation_type: 'forward' }
    })
  }

  // Recommendation 5: Archive old FYI threads
  if (thread.category === 'FYI_ONLY' && thread.priority >= 4) {
    const daysSinceLastMessage = Math.floor(
      (Date.now() - new Date(thread.last_message_date).getTime()) / (1000 * 60 * 60 * 24)
    )
    
    if (daysSinceLastMessage > 7) {
      recommendations.push({
        type: 'archive',
        title: 'Archive old FYI thread',
        description: 'This FYI thread is over a week old and can likely be archived.',
        confidence: 0.75,
        action_data: { archive_reason: 'outdated_fyi' }
      })
    }
  }

  return recommendations
}