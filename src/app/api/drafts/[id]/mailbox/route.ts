import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createMailboxManager } from '@/lib/email/mailbox-manager'
import { refreshUserToken, getAppOnlyToken } from '@/lib/microsoft-graph/client'
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

    // Get stored access token from email_accounts
    const { data: emailAccount, error: accountError } = await supabase
      .from('email_accounts')
      .select('encrypted_access_token, access_token_expires_at')
      .eq('user_id', user.id)
      .eq('email_address', userData.email)
      .single()

    console.log('Email account fetch result:', { 
      hasAccount: !!emailAccount, 
      hasToken: !!emailAccount?.encrypted_access_token,
      expires: emailAccount?.access_token_expires_at,
      accountError 
    })

    if (accountError || !emailAccount?.encrypted_access_token || !emailAccount?.access_token_expires_at) {
      console.log('Missing token details:', {
        hasAccount: !!emailAccount,
        hasToken: !!emailAccount?.encrypted_access_token,
        hasExpiry: !!emailAccount?.access_token_expires_at,
        accountError: accountError?.message
      })
      
      return NextResponse.json({ 
        error: 'Authentication required for mailbox operations. Please click "Sync Emails" on the dashboard first to refresh your Microsoft authentication, then try again.',
        requiresSync: true 
      }, { status: 400 })
    }

    // Check if token is expired
    const tokenExpiry = new Date(emailAccount.access_token_expires_at)
    if (tokenExpiry < new Date()) {
      return NextResponse.json({ 
        error: 'Access token has expired. Please sync your emails again to refresh authentication.',
        requiresSync: true 
      }, { status: 400 })
    }

    // Decrypt the access token
    let accessToken: string
    try {
      const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
      const [ivHex, authTagHex, encrypted] = emailAccount.encrypted_access_token.split(':')
      
      const iv = Buffer.from(ivHex, 'hex')
      const authTag = Buffer.from(authTagHex, 'hex')
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(authTag)
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      
      accessToken = decrypted
      console.log('Successfully decrypted access token')
    } catch (error) {
      console.error('Failed to decrypt access token:', error)
      return NextResponse.json({ 
        error: 'Failed to decrypt access token. Please sync your emails again.' 
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