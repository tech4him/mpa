import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MailboxActions } from '@/lib/microsoft-graph/mailbox-actions'
import { IntelligentFolderManager } from '@/lib/email/intelligent-folder-manager'

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
    
    // Get the thread and its messages with full context for intelligent foldering
    const { data: thread } = await supabase
      .from('email_threads')
      .select(`
        *,
        email_messages!inner (
          message_id,
          subject,
          from_email,
          body,
          received_at
        )
      `)
      .eq('id', emailId)
      .eq('user_id', user.id)
      .single()

    if (!thread || !thread.email_messages[0]?.message_id) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    const latestMessage = thread.email_messages[0]
    let archivedFolder = 'Archive'

    // Try intelligent folder archiving first
    try {
      const folderManager = new IntelligentFolderManager()
      await folderManager.initialize(user.id)

      const emailContext = {
        subject: latestMessage.subject || '',
        from: latestMessage.from_email || '',
        to: [], // Could be populated from thread data
        body: latestMessage.body || '',
        date: new Date(latestMessage.received_at)
      }

      console.log(`📁 Archiving email "${latestMessage.subject}" using intelligent folder system`)
      
      const result = await folderManager.archiveToSmartFolder(
        latestMessage.message_id,
        emailContext
      )

      if (result.success) {
        archivedFolder = result.folder
        console.log(`✅ Email archived to intelligent folder: ${result.folder}`)
      } else {
        console.error('Smart archive failed, falling back to regular archive:', result.error)
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Intelligent folder archiving failed:', error)
      
      // Fallback to regular archive
      const mailboxActions = await MailboxActions.forUser(user.id)
      if (mailboxActions) {
        const result = await mailboxActions.archiveEmail(latestMessage.message_id)
        if (!result.success) {
          console.error('Failed to archive in mailbox:', result.error)
          // Continue with DB update even if mailbox action fails
        }
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

    return NextResponse.json({ 
      success: true,
      folder: archivedFolder 
    })
  } catch (error) {
    console.error('Error archiving email:', error)
    return NextResponse.json(
      { error: 'Failed to archive email' },
      { status: 500 }
    )
  }
}