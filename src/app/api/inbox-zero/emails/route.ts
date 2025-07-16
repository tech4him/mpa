import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get unprocessed emails from the inbox
    const { data: threads, error } = await supabase
      .from('email_threads')
      .select(`
        *,
        email_messages!inner (
          id,
          subject,
          from_email,
          to_recipients,
          received_at,
          body,
          is_archived,
          is_deleted
        )
      `)
      .eq('user_id', user.id)
      .eq('is_processed', false)
      .eq('is_hidden', false)
      .order('last_message_date', { ascending: true })
      .limit(50)

    if (error) {
      throw error
    }

    // Add AI analysis for each email
    const emailsWithAnalysis = await Promise.all(
      threads.map(async (thread) => {
        const latestMessage = thread.email_messages[0]
        
        // Estimate time to process (simple heuristic)
        const wordCount = latestMessage.body?.split(' ').length || 0
        const estimated_time_seconds = Math.min(Math.max(wordCount * 2, 30), 600) // 30s to 10min
        
        // AI-powered action suggestion
        const suggested_action = await suggestAction(latestMessage.body || '', estimated_time_seconds)
        
        return {
          ...thread,
          estimated_time_seconds,
          suggested_action: suggested_action.action,
          action_confidence: suggested_action.confidence,
          action_reason: suggested_action.reason,
          participants: [{
            email: latestMessage.from_email,
            name: latestMessage.from_email
          }]
        }
      })
    )

    return NextResponse.json(emailsWithAnalysis)
  } catch (error) {
    console.error('Error loading inbox zero emails:', error)
    return NextResponse.json(
      { error: 'Failed to load emails' },
      { status: 500 }
    )
  }
}

async function suggestAction(content: string, estimatedTime: number): Promise<{
  action: 'do' | 'delegate' | 'defer' | 'delete'
  confidence: number
  reason: string
}> {
  // Simple rule-based suggestions (can be enhanced with AI)
  const contentLower = content.toLowerCase()
  
  // DELETE patterns
  if (contentLower.includes('unsubscribe') || 
      contentLower.includes('newsletter') ||
      contentLower.includes('promotional') ||
      contentLower.includes('marketing')) {
    return {
      action: 'delete',
      confidence: 85,
      reason: 'Appears to be promotional/marketing content'
    }
  }
  
  // DO patterns (quick actions)
  if (estimatedTime < 120) { // 2 minutes
    if (contentLower.includes('quick question') ||
        contentLower.includes('yes/no') ||
        contentLower.includes('confirm') ||
        contentLower.includes('approve')) {
      return {
        action: 'do',
        confidence: 90,
        reason: 'Quick response required (< 2 minutes)'
      }
    }
  }
  
  // DELEGATE patterns
  if (contentLower.includes('can you ask') ||
      contentLower.includes('please have someone') ||
      contentLower.includes('need help with') ||
      contentLower.includes('assign to')) {
    return {
      action: 'delegate',
      confidence: 75,
      reason: 'Request can be handled by someone else'
    }
  }
  
  // DEFER patterns
  if (contentLower.includes('when you have time') ||
      contentLower.includes('next week') ||
      contentLower.includes('later') ||
      contentLower.includes('meeting request') ||
      estimatedTime > 300) { // 5 minutes
    return {
      action: 'defer',
      confidence: 70,
      reason: 'Requires dedicated time or future action'
    }
  }
  
  // Default to DO for actionable items
  if (contentLower.includes('?') || 
      contentLower.includes('please') ||
      contentLower.includes('need') ||
      contentLower.includes('request')) {
    return {
      action: 'do',
      confidence: 60,
      reason: 'Contains actionable request'
    }
  }
  
  // Default to defer if unsure
  return {
    action: 'defer',
    confidence: 50,
    reason: 'Requires review to determine action'
  }
}