import { getGraphClient } from './client'
import { createClient } from '@/lib/supabase/server'
import { createMailboxManager } from '@/lib/email/mailbox-manager'
import crypto from 'crypto'

export interface SendEmailOptions {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
  isHtml?: boolean
  inReplyToId?: string
  threadId?: string
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send an email via Microsoft Graph API
 */
export async function sendEmail(
  userId: string, 
  options: SendEmailOptions
): Promise<SendEmailResult> {
  try {
    const supabase = await createClient()

    // Get user's email from users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single()

    if (userError || !userData?.email) {
      return {
        success: false,
        error: 'User email not found'
      }
    }

    // Get stored access token from email_accounts
    const { data: emailAccount, error: accountError } = await supabase
      .from('email_accounts')
      .select('encrypted_access_token, access_token_expires_at')
      .eq('user_id', userId)
      .eq('email_address', userData.email)
      .single()

    if (accountError || !emailAccount?.encrypted_access_token) {
      return {
        success: false,
        error: 'Email account authentication not found'
      }
    }

    // Check if token is expired
    const tokenExpiry = new Date(emailAccount.access_token_expires_at)
    if (tokenExpiry < new Date()) {
      return {
        success: false,
        error: 'Access token has expired'
      }
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
    } catch (error) {
      return {
        success: false,
        error: 'Failed to decrypt access token'
      }
    }

    // Create Graph client
    const graphClient = await getGraphClient(accessToken)

    // Prepare message
    const message: any = {
      subject: options.subject,
      body: {
        contentType: options.isHtml ? 'HTML' : 'Text',
        content: options.body
      },
      toRecipients: options.to.map(email => ({
        emailAddress: { address: email }
      }))
    }

    // Add CC recipients if provided
    if (options.cc && options.cc.length > 0) {
      message.ccRecipients = options.cc.map(email => ({
        emailAddress: { address: email }
      }))
    }

    // Add BCC recipients if provided
    if (options.bcc && options.bcc.length > 0) {
      message.bccRecipients = options.bcc.map(email => ({
        emailAddress: { address: email }
      }))
    }

    // If this is a reply, set the conversation properties
    if (options.inReplyToId) {
      message.replyTo = [{
        emailAddress: { address: userData.email }
      }]
      
      // For replies, we should use the reply API instead
      const replyResult = await graphClient
        .api(`/me/messages/${options.inReplyToId}/reply`)
        .post({
          message: {
            ...message,
            // Remove toRecipients for reply - Graph will handle this
            toRecipients: undefined
          }
        })

      return {
        success: true,
        messageId: replyResult?.id
      }
    }

    // Send the message
    const result = await graphClient
      .api('/me/sendMail')
      .post({
        message,
        saveToSentItems: true
      })

    return {
      success: true,
      messageId: result?.id
    }

  } catch (error) {
    console.error('Error sending email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email'
    }
  }
}

/**
 * Send an email draft that was created in the AI Assistant Drafts folder
 */
export async function sendDraftFromMailbox(
  userId: string,
  draftId: string
): Promise<SendEmailResult> {
  try {
    const supabase = await createClient()

    // Get user's email from users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single()

    if (userError || !userData?.email) {
      return {
        success: false,
        error: 'User email not found'
      }
    }

    // Get stored access token from email_accounts
    const { data: emailAccount, error: accountError } = await supabase
      .from('email_accounts')
      .select('encrypted_access_token, access_token_expires_at')
      .eq('user_id', userId)
      .eq('email_address', userData.email)
      .single()

    if (accountError || !emailAccount?.encrypted_access_token) {
      return {
        success: false,
        error: 'Email account authentication not found'
      }
    }

    // Check if token is expired
    const tokenExpiry = new Date(emailAccount.access_token_expires_at)
    if (tokenExpiry < new Date()) {
      return {
        success: false,
        error: 'Access token has expired'
      }
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
    } catch (error) {
      return {
        success: false,
        error: 'Failed to decrypt access token'
      }
    }

    // Create mailbox manager and send the draft
    const mailboxManager = await createMailboxManager(accessToken)
    const result = await mailboxManager.sendDraft(draftId)

    return {
      success: result.success,
      messageId: result.draftId,
      error: result.error
    }

  } catch (error) {
    console.error('Error sending draft from mailbox:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send draft'
    }
  }
}