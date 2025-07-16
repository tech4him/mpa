import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntelligentFolderManager } from '@/lib/email/intelligent-folder-manager'
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
    const { correct_folder, reason } = await request.json()
    
    if (!correct_folder) {
      return NextResponse.json(
        { error: 'Missing correct_folder' },
        { status: 400 }
      )
    }

    // Get the email thread and message details
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

    if (!thread || !thread.email_messages[0]) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    const latestMessage = thread.email_messages[0]

    // Get the AI's original categorization for learning purposes
    const folderManager = new IntelligentFolderManager()
    await folderManager.initialize(user.id)

    const emailContext = {
      subject: latestMessage.subject || '',
      from: latestMessage.from_email || '',
      to: [], // Could be populated from thread data
      body: latestMessage.body || '',
      date: new Date(latestMessage.received_at)
    }

    // Get AI's original decision
    const aiCategorization = await folderManager.testCategorization(emailContext)

    // Learn from the correction
    await folderManager.learnFromCorrection(
      emailContext,
      aiCategorization.folder_path,
      correct_folder,
      reason
    )

    // Store the correction for learning
    const { error: insertError } = await supabase
      .from('folder_corrections')
      .insert({
        user_id: user.id,
        email_thread_id: emailId,
        email_subject: latestMessage.subject,
        email_from: latestMessage.from_email,
        email_body: latestMessage.body,
        ai_suggested_folder: aiCategorization.folder_path,
        ai_reasoning: aiCategorization.reasoning,
        ai_confidence: aiCategorization.confidence,
        correct_folder: correct_folder,
        user_reason: reason,
        correction_timestamp: new Date().toISOString()
      })

    if (insertError) {
      console.error('Failed to store correction:', insertError)
      // Continue with folder move even if correction storage fails
    }

    // Move the email to the correct folder
    const mailboxActions = await MailboxActions.forUser(user.id)
    if (mailboxActions) {
      // Ensure the correct folder exists
      const folderResult = await mailboxActions.ensureFolder(correct_folder)
      if (!folderResult.success) {
        return NextResponse.json({
          error: `Failed to ensure folder: ${folderResult.error}`
        }, { status: 500 })
      }

      // Move email to the correct folder
      const moveResult = await mailboxActions.moveToFolder(
        latestMessage.message_id,
        folderResult.folderId!
      )

      if (!moveResult.success) {
        return NextResponse.json({
          error: `Failed to move email: ${moveResult.error}`
        }, { status: 500 })
      }
    }

    console.log(`📝 User corrected folder for "${latestMessage.subject}"`)
    console.log(`   AI suggested: ${aiCategorization.folder_path}`)
    console.log(`   User corrected to: ${correct_folder}`)
    console.log(`   Reason: ${reason || 'No reason provided'}`)

    return NextResponse.json({ 
      success: true, 
      moved_to: correct_folder 
    })
  } catch (error) {
    console.error('Error correcting folder:', error)
    return NextResponse.json(
      { error: 'Failed to correct folder' },
      { status: 500 }
    )
  }
}