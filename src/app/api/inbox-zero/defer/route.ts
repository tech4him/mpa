import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MailboxActions } from '@/lib/microsoft-graph/mailbox-actions'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { email_id, defer_until } = await request.json()
    
    if (!email_id || !defer_until) {
      return NextResponse.json(
        { error: 'Missing email_id or defer_until' },
        { status: 400 }
      )
    }

    // Get the thread and its messages to find the Microsoft message ID
    const { data: thread } = await supabase
      .from('email_threads')
      .select(`
        *,
        email_messages!inner (
          message_id
        )
      `)
      .eq('id', email_id)
      .eq('user_id', user.id)
      .single()

    if (!thread || !thread.email_messages[0]?.message_id) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    // Perform actual mailbox snooze
    const mailboxActions = await MailboxActions.forUser(user.id)
    if (mailboxActions) {
      const snoozeDate = new Date(defer_until)
      const result = await mailboxActions.snoozeEmail(thread.email_messages[0].message_id, snoozeDate)
      if (!result.success) {
        console.error('Failed to snooze in mailbox:', result.error)
        // Continue with DB update even if mailbox action fails
      }
    }

    // Create a deferred email record
    const { error: insertError } = await supabase
      .from('deferred_emails')
      .insert({
        user_id: user.id,
        email_thread_id: email_id,
        defer_until: defer_until,
        created_at: new Date().toISOString()
      })

    if (insertError) {
      throw insertError
    }

    // Mark the email thread as processed (snoozed)
    const { error: updateError } = await supabase
      .from('email_threads')
      .update({ 
        is_processed: true,
        is_hidden: true,
        processed_at: new Date().toISOString()
      })
      .eq('id', email_id)
      .eq('user_id', user.id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deferring email:', error)
    return NextResponse.json(
      { error: 'Failed to defer email' },
      { status: 500 }
    )
  }
}

// GET endpoint to retrieve deferred emails that are due
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date().toISOString()
    
    // Get deferred emails that are due
    const { data: deferredEmails, error } = await supabase
      .from('deferred_emails')
      .select(`
        *,
        email_threads!inner (
          id,
          subject,
          last_message_at,
          participants
        )
      `)
      .eq('user_id', user.id)
      .eq('processed', false)
      .lte('defer_until', now)
      .order('defer_until', { ascending: true })

    if (error) {
      throw error
    }

    // Mark as processed and move back to inbox
    if (deferredEmails.length > 0) {
      const threadIds = deferredEmails.map(d => d.email_thread_id)
      
      // Update threads back to inbox
      await supabase
        .from('email_threads')
        .update({ 
          is_processed: false,
          is_hidden: false
        })
        .in('id', threadIds)
        .eq('user_id', user.id)

      // Mark deferred records as processed
      await supabase
        .from('deferred_emails')
        .update({ processed: true })
        .in('email_thread_id', threadIds)
        .eq('user_id', user.id)
    }

    return NextResponse.json(deferredEmails)
  } catch (error) {
    console.error('Error retrieving deferred emails:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve deferred emails' },
      { status: 500 }
    )
  }
}