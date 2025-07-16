import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MailboxActions } from '@/lib/microsoft-graph/mailbox-actions'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: emailId } = await params
    
    // Get the thread and its messages to find the Microsoft message ID
    const { data: thread } = await supabase
      .from('email_threads')
      .select(`
        *,
        email_messages!inner (
          message_id
        )
      `)
      .eq('id', emailId)
      .eq('user_id', user.id)
      .single()

    if (!thread || !thread.email_messages[0]?.message_id) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    // Perform actual mailbox archive
    const mailboxActions = await MailboxActions.forUser(user.id)
    if (mailboxActions) {
      const result = await mailboxActions.archiveEmail(thread.email_messages[0].message_id)
      if (!result.success) {
        console.error('Failed to archive in mailbox:', result.error)
        // Continue with DB update even if mailbox action fails
      }
    }
    
    // Update the email thread in database
    const { error: updateError } = await supabase
      .from('email_threads')
      .update({ 
        is_processed: true,
        is_hidden: true,
        processed_at: new Date().toISOString()
      })
      .eq('id', emailId)
      .eq('user_id', user.id)

    if (updateError) {
      throw updateError
    }

    // Log the action for learning
    await supabase
      .from('learning_samples')
      .insert({
        user_id: user.id,
        email_thread_id: emailId,
        action_taken: 'archived',
        action_timestamp: new Date().toISOString(),
        source: 'inbox_zero'
      })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error archiving email:', error)
    return NextResponse.json(
      { error: 'Failed to archive email' },
      { status: 500 }
    )
  }
}