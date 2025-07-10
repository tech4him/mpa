import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EmailProcessingService } from '@/lib/email/processing-status'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, threadId, reason } = body

    const processingService = new EmailProcessingService()

    switch (action) {
      case 'mark_processed':
        if (!threadId || !reason) {
          return NextResponse.json({ 
            error: 'threadId and reason required' 
          }, { status: 400 })
        }
        
        const success = await processingService.markThreadAsProcessed(
          threadId, 
          user.id, 
          reason
        )
        
        return NextResponse.json({ 
          success, 
          message: success ? 'Thread marked as processed' : 'Failed to mark thread' 
        })

      case 'unmark_processed':
        if (!threadId) {
          return NextResponse.json({ 
            error: 'threadId required' 
          }, { status: 400 })
        }
        
        const unmarkSuccess = await processingService.unmarkThreadAsProcessed(
          threadId, 
          user.id
        )
        
        return NextResponse.json({ 
          success: unmarkSuccess, 
          message: unmarkSuccess ? 'Thread unmarked as processed' : 'Failed to unmark thread' 
        })

      case 'auto_process':
        const processedCount = await processingService.autoProcessThreads(user.id)
        
        return NextResponse.json({ 
          success: true, 
          processedCount,
          message: `Auto-processed ${processedCount} threads` 
        })

      case 'check_status':
        if (!threadId) {
          return NextResponse.json({ 
            error: 'threadId required' 
          }, { status: 400 })
        }
        
        const status = await processingService.checkThreadProcessingStatus(
          threadId, 
          user.id
        )
        
        return NextResponse.json({ success: true, status })

      case 'file_and_done':
        if (!threadId) {
          return NextResponse.json({ 
            error: 'threadId required' 
          }, { status: 400 })
        }

        try {
          // First, get the user's access token for mailbox operations
          const { data: userData } = await supabase
            .from('users')
            .select('email')
            .eq('id', user.id)
            .single()

          if (!userData?.email) {
            return NextResponse.json({ 
              error: 'User email not found.' 
            }, { status: 400 })
          }

          // Get stored access token from email_accounts
          const { data: emailAccount } = await supabase
            .from('email_accounts')
            .select('encrypted_access_token, access_token_expires_at')
            .eq('user_id', user.id)
            .eq('email_address', userData.email)
            .single()

          if (!emailAccount?.encrypted_access_token) {
            return NextResponse.json({ 
              error: 'Authentication required for filing. Please sync your emails first.',
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
          const { createMailboxManager } = await import('@/lib/email/mailbox-manager')
          const crypto = await import('crypto')
          
          const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
          const [ivHex, authTagHex, encrypted] = emailAccount.encrypted_access_token.split(':')
          
          const iv = Buffer.from(ivHex, 'hex')
          const authTag = Buffer.from(authTagHex, 'hex')
          
          const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
          decipher.setAuthTag(authTag)
          
          let decrypted = decipher.update(encrypted, 'hex', 'utf8')
          decrypted += decipher.final('utf8')
          
          const accessToken = decrypted

          // File the emails first
          const mailboxManager = await createMailboxManager(accessToken)
          const filingResult = await mailboxManager.fileThreadEmails(threadId, user.id)
          
          if (!filingResult.success) {
            return NextResponse.json({ 
              error: 'Failed to file emails: ' + filingResult.error,
              requiresSync: filingResult.requiresSync || false
            }, { status: filingResult.requiresSync ? 400 : 500 })
          }

          // Then mark as processed
          const processSuccess = await processingService.markThreadAsProcessed(
            threadId, 
            user.id, 
            'filed_and_done'
          )
          
          if (!processSuccess) {
            return NextResponse.json({ 
              error: 'Filed emails but failed to mark as processed' 
            }, { status: 500 })
          }

          return NextResponse.json({ 
            success: true, 
            message: filingResult.message + ' and marked as done',
            folderId: filingResult.folderId
          })

        } catch (error) {
          console.error('File and done error:', error)
          return NextResponse.json({ 
            error: 'Failed to file and process thread' 
          }, { status: 500 })
        }

      default:
        return NextResponse.json({ 
          error: 'Invalid action. Use: mark_processed, unmark_processed, auto_process, check_status, or file_and_done' 
        }, { status: 400 })
    }

  } catch (error) {
    console.error('Email processing API error:', error)
    
    return NextResponse.json({
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const processingService = new EmailProcessingService()
    const stats = await processingService.getProcessingStats(user.id)
    
    return NextResponse.json({ success: true, stats })

  } catch (error) {
    console.error('Email processing stats error:', error)
    
    return NextResponse.json({
      error: 'Failed to get processing stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}