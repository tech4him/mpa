import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InboxZeroEngine } from '@/lib/ai/inbox-zero-engine'

export async function POST() {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize inbox zero engine
    const inboxZero = new InboxZeroEngine(user.id)
    
    // Process inbox for zero state
    const result = await inboxZero.processInboxForZero()
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('Inbox zero processing error:', error)
    return NextResponse.json(
      { error: 'Failed to process inbox for zero state' },
      { status: 500 }
    )
  }
}

// GET endpoint for processing status
export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get recent processing history
    const { data: processingLogs, error } = await supabase
      .from('inbox_zero_processing_log')
      .select('*')
      .eq('user_id', user.id)
      .order('processed_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Failed to get processing logs:', error)
      return NextResponse.json({ processingLogs: [] })
    }

    // Get current unread count
    const { count: unreadCount } = await supabase
      .from('email_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .eq('is_deleted', false)

    return NextResponse.json({
      unread_count: unreadCount || 0,
      processing_history: processingLogs || []
    })

  } catch (error) {
    console.error('Failed to get inbox zero status:', error)
    return NextResponse.json(
      { error: 'Failed to get status' },
      { status: 500 }
    )
  }
}