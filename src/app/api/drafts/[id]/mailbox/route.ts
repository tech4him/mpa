import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createMailboxManager } from '@/lib/email/mailbox-manager'
import { getValidTokenForUser, getAppOnlyToken } from '@/lib/microsoft-graph/client'
import crypto from 'crypto'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: draftId } = await params
    const body = await request.json()
    const { action = 'create_draft', organizeFolders = true } = body

    // Get user's email from users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', user.id)
      .single()

    if (userError || !userData?.email) {
      console.error('User data issue:', { userError, hasUserData: !!userData })
      return NextResponse.json({ 
        error: 'User email not found.',
        details: userError?.message 
      }, { status: 400 })
    }

    // Get valid access token (auto-refreshes if needed)
    let accessToken: string
    try {
      accessToken = await getValidTokenForUser(user.id, ['User.Read', 'Mail.ReadWrite', 'Mail.Send'])
      console.log('Successfully obtained valid access token')
    } catch (error: any) {
      console.error('Failed to get valid token:', error)
      if (error.message === 'User needs to re-authenticate') {
        return NextResponse.json({ 
          error: 'Authentication expired. Please sign in again to refresh your access.',
          requiresSync: true 
        }, { status: 401 })
      }
      return NextResponse.json({ 
        error: 'Failed to obtain access token. Please try again.',
        requiresSync: true 
      }, { status: 500 })
    }

    // Verify draft exists and belongs to user
    const { data: draft, error: draftError } = await supabase
      .from('email_drafts')
      .select('id, status')
      .eq('id', draftId)
      .eq('user_id', user.id)
      .single()

    if (draftError || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    // Create mailbox manager and process the request
    console.log('Creating mailbox manager...')
    const mailboxManager = await createMailboxManager(accessToken)

    let result
    switch (action) {
      case 'create_draft':
        console.log('Processing approved draft:', { draftId, userId: user.id, organizeFolders })
        try {
          result = await mailboxManager.processApprovedDraft({
            draftId,
            userId: user.id,
            accessToken,
            organizeFolders
          })
          console.log('Draft processing result:', result)
        } catch (error) {
          console.error('Error in processApprovedDraft:', error)
          throw error
        }
        break

      case 'list_drafts':
        const drafts = await mailboxManager.listAIDrafts()
        return NextResponse.json({ success: true, drafts })

      case 'send_draft':
        const { mailboxDraftId } = body
        if (!mailboxDraftId) {
          return NextResponse.json({ 
            error: 'Mailbox draft ID required for sending' 
          }, { status: 400 })
        }
        result = await mailboxManager.sendDraft(mailboxDraftId)
        break

      default:
        return NextResponse.json({ 
          error: 'Invalid action. Use: create_draft, list_drafts, or send_draft' 
        }, { status: 400 })
    }

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Operation failed' 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: getSuccessMessage(action)
    })

  } catch (error) {
    console.error('Mailbox operation error:', error)
    
    return NextResponse.json({
      error: 'Failed to process mailbox operation',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

function getSuccessMessage(action: string): string {
  switch (action) {
    case 'create_draft':
      return 'Draft created in your AI Assistant Drafts folder'
    case 'send_draft':
      return 'Draft sent successfully'
    case 'list_drafts':
      return 'AI drafts retrieved'
    default:
      return 'Operation completed'
  }
}