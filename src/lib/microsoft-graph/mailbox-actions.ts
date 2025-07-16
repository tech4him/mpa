import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

interface MailboxActionResult {
  success: boolean
  error?: string
  draftId?: string
}

export class MailboxActions {
  private accessToken: string
  private userId: string

  constructor(accessToken: string, userId: string) {
    this.accessToken = accessToken
    this.userId = userId
  }

  static async forUser(userId: string): Promise<MailboxActions | null> {
    try {
      const supabase = await createClient(true) // Service role
      
      // Get user's encrypted access token
      const { data: account } = await supabase
        .from('email_accounts')
        .select('encrypted_access_token')
        .eq('user_id', userId)
        .single()

      if (!account?.encrypted_access_token) {
        return null
      }

      const accessToken = await decryptAccessToken(account.encrypted_access_token)
      return new MailboxActions(accessToken, userId)
    } catch (error) {
      console.error('Failed to create MailboxActions:', error)
      return null
    }
  }

  async deleteEmail(messageId: string): Promise<MailboxActionResult> {
    try {
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        return { success: true }
      } else {
        const error = await response.text()
        return { success: false, error: `Failed to delete email: ${error}` }
      }
    } catch (error) {
      return { success: false, error: `Delete failed: ${error}` }
    }
  }

  async archiveEmail(messageId: string): Promise<MailboxActionResult> {
    try {
      // Move to Archive folder
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/move`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          destinationId: 'archive'
        })
      })

      if (response.ok) {
        return { success: true }
      } else {
        const error = await response.text()
        return { success: false, error: `Failed to archive email: ${error}` }
      }
    } catch (error) {
      return { success: false, error: `Archive failed: ${error}` }
    }
  }

  async snoozeEmail(messageId: string, snoozeUntil: Date): Promise<MailboxActionResult> {
    try {
      // Move to a custom "Snoozed" folder and set flag
      // First, try to create/get the Snoozed folder
      const folderId = await this.getOrCreateSnoozedFolder()
      
      if (!folderId) {
        return { success: false, error: 'Failed to create snoozed folder' }
      }

      // Move email to snoozed folder
      const moveResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/move`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          destinationId: folderId
        })
      })

      if (moveResponse.ok) {
        return { success: true }
      } else {
        const error = await moveResponse.text()
        return { success: false, error: `Failed to snooze email: ${error}` }
      }
    } catch (error) {
      return { success: false, error: `Snooze failed: ${error}` }
    }
  }

  async createDraft(subject: string, body: string, recipientEmail?: string, originalMessageId?: string): Promise<MailboxActionResult> {
    try {
      let draftData: any = {
        subject: subject,
        body: {
          contentType: 'text',
          content: body
        }
      }

      // If replying to a message
      if (originalMessageId) {
        // Get original message to set up reply
        const originalResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${originalMessageId}`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        })

        if (originalResponse.ok) {
          const originalMessage = await originalResponse.json()
          draftData = {
            subject: subject.startsWith('Re:') ? subject : `Re: ${originalMessage.subject}`,
            body: {
              contentType: 'text',
              content: body
            },
            toRecipients: [{
              emailAddress: {
                address: originalMessage.from.emailAddress.address,
                name: originalMessage.from.emailAddress.name
              }
            }],
            replyTo: [{
              emailAddress: {
                address: originalMessage.from.emailAddress.address,
                name: originalMessage.from.emailAddress.name
              }
            }]
          }
        }
      } else if (recipientEmail) {
        // New email or delegation
        draftData.toRecipients = [{
          emailAddress: {
            address: recipientEmail
          }
        }]
      }

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(draftData)
      })

      if (response.ok) {
        const draft = await response.json()
        return { success: true, draftId: draft.id }
      } else {
        const error = await response.text()
        return { success: false, error: `Failed to create draft: ${error}` }
      }
    } catch (error) {
      return { success: false, error: `Draft creation failed: ${error}` }
    }
  }

  private async getOrCreateSnoozedFolder(): Promise<string | null> {
    try {
      // First, check if Snoozed folder exists
      const foldersResponse = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      })

      if (foldersResponse.ok) {
        const folders = await foldersResponse.json()
        const snoozedFolder = folders.value.find((f: any) => f.displayName === 'Snoozed')
        
        if (snoozedFolder) {
          return snoozedFolder.id
        }
      }

      // Create Snoozed folder if it doesn't exist
      const createResponse = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          displayName: 'Snoozed'
        })
      })

      if (createResponse.ok) {
        const newFolder = await createResponse.json()
        return newFolder.id
      }

      return null
    } catch (error) {
      console.error('Failed to get/create snoozed folder:', error)
      return null
    }
  }
}

async function decryptAccessToken(encryptedToken: string): Promise<string> {
  const [ivHex, authTagHex, encryptedHex] = encryptedToken.split(':')
  
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encrypted, undefined, 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}