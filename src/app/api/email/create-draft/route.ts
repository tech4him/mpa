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

    const { thread_id, subject, body, recipient_email, type } = await request.json()
    
    if (!thread_id || !subject || !body) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get the original thread and message for reply context
    let originalMessageId = null
    if (type === 'reply') {
      const { data: thread } = await supabase
        .from('email_threads')
        .select(`
          email_messages (
            message_id
          )
        `)
        .eq('id', thread_id)
        .eq('user_id', user.id)
        .single()

      originalMessageId = thread?.email_messages?.[0]?.message_id
    }

    // Create draft in actual mailbox
    const mailboxActions = await MailboxActions.forUser(user.id)
    if (!mailboxActions) {
      return NextResponse.json({ error: 'Failed to access mailbox' }, { status: 500 })
    }

    const result = await mailboxActions.createDraft(
      subject, 
      body, 
      recipient_email, 
      originalMessageId
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // Store draft information in database
    const { error: draftError } = await supabase
      .from('email_drafts')
      .insert({
        user_id: user.id,
        thread_id: thread_id,
        subject: subject,
        content: body,
        recipient_email: recipient_email,
        draft_type: type || 'reply',
        microsoft_draft_id: result.draftId,
        status: 'draft',
        created_at: new Date().toISOString()
      })

    if (draftError) {
      console.error('Failed to store draft in database:', draftError)
      // Continue even if DB storage fails since draft is created in mailbox
    }

    return NextResponse.json({ 
      success: true, 
      draft_id: result.draftId,
      message: 'Draft created in your mailbox drafts folder'
    })
  } catch (error) {
    console.error('Error creating draft:', error)
    return NextResponse.json(
      { error: 'Failed to create draft' },
      { status: 500 }
    )
  }
}