import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InboxZeroLearningEngine } from '@/lib/ai/inbox-zero-learning'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the next unprocessed email
    const { data: threads, error } = await supabase
      .from('email_threads')
      .select(`
        *,
        email_messages (
          id,
          subject,
          from_email,
          from_name,
          to_recipients,
          cc_recipients,
          bcc_recipients,
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
      .limit(1)

    if (error) {
      throw error
    }

    if (threads.length === 0) {
      return NextResponse.json({ email: null })
    }

    const email = threads[0]
    
    // Handle threads without messages
    if (!email.email_messages || email.email_messages.length === 0) {
      // Create a placeholder message structure for threads without messages
      email.email_messages = [{
        id: email.id,
        subject: email.subject || 'No Subject',
        from_email: email.from_email || 'unknown@email.com',
        from_name: null,
        to_recipients: [],
        cc_recipients: [],
        bcc_recipients: [],
        received_at: email.last_message_date || new Date().toISOString(),
        body: '',
        is_archived: false,
        is_deleted: false
      }]
    }
    
    const latestMessage = email.email_messages[0]
    
    // Get AI suggestion using learning engine
    const learningEngine = new InboxZeroLearningEngine(supabase, user.id)
    const suggestion = await learningEngine.suggestAction({
      from_email: latestMessage.from_email || email.from_email || 'unknown@email.com',
      subject: email.subject || latestMessage.subject || 'No Subject',
      body: latestMessage.body || '',
      estimated_time_seconds: estimateProcessingTime(latestMessage.body || '')
    })

    return NextResponse.json({
      email: {
        ...email,
        suggestion
      }
    })
  } catch (error) {
    console.error('Error loading next email:', error)
    return NextResponse.json(
      { error: 'Failed to load next email' },
      { status: 500 }
    )
  }
}

function estimateProcessingTime(body: string): number {
  const wordCount = body.split(' ').length
  return Math.min(Math.max(wordCount * 2, 30), 600) // 30s to 10min
}