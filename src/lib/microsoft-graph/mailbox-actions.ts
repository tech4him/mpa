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
  private folderCache: Map<string, string> = new Map() // path -> id

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
      console.log(`🕐 Snoozing email ${messageId} until ${snoozeUntil.toISOString()}`)
      
      // Move to a custom "Snoozed" folder and set flag
      // First, try to create/get the Snoozed folder
      const folderId = await this.getOrCreateSnoozedFolder()
      
      if (!folderId) {
        console.error('Failed to get or create Snoozed folder')
        return { success: false, error: 'Failed to create snoozed folder' }
      }

      console.log(`📁 Moving email to Snoozed folder (ID: ${folderId})`)

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
        console.log(`✅ Email ${messageId} successfully snoozed`)
        return { success: true }
      } else {
        const error = await moveResponse.text()
        console.error(`❌ Failed to move email to Snoozed folder:`, error)
        return { success: false, error: `Failed to snooze email: ${error}` }
      }
    } catch (error) {
      console.error(`❌ Snooze failed for email ${messageId}:`, error)
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
      // Use the existing ensureFolder method which handles caching and hierarchical creation
      const result = await this.ensureFolder('Snoozed')
      
      if (result.success && result.folderId) {
        return result.folderId
      }

      console.error('Failed to ensure Snoozed folder:', result.error)
      return null
    } catch (error) {
      console.error('Failed to get/create snoozed folder:', error)
      return null
    }
  }

  /**
   * Ensure a folder exists, creating it if necessary
   */
  async ensureFolder(folderPath: string): Promise<{ success: boolean; folderId?: string; error?: string }> {
    try {
      // Check cache first
      if (this.folderCache.has(folderPath)) {
        return { 
          success: true, 
          folderId: this.folderCache.get(folderPath) 
        }
      }

      // Split path into parts
      const parts = folderPath.split('/')
      let currentPath = ''
      let parentId = null

      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part
        
        // Check if this level exists in cache
        if (this.folderCache.has(currentPath)) {
          parentId = this.folderCache.get(currentPath)
          continue
        }

        // Search for existing folder
        const searchQuery = parentId 
          ? `/me/mailFolders/${parentId}/childFolders?$filter=displayName eq '${part}'`
          : `/me/mailFolders?$filter=displayName eq '${part}'`

        const searchResponse = await fetch(`https://graph.microsoft.com/v1.0${searchQuery}`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        })

        if (!searchResponse.ok) {
          throw new Error(`Search failed: ${searchResponse.statusText}`)
        }

        const searchData = await searchResponse.json()
        
        if (searchData.value && searchData.value.length > 0) {
          // Folder exists
          parentId = searchData.value[0].id
          this.folderCache.set(currentPath, parentId)
        } else {
          // Create folder
          const createUrl = parentId 
            ? `https://graph.microsoft.com/v1.0/me/mailFolders/${parentId}/childFolders`
            : `https://graph.microsoft.com/v1.0/me/mailFolders`

          const createResponse = await fetch(createUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              displayName: part
            })
          })

          if (!createResponse.ok) {
            throw new Error(`Create folder failed: ${createResponse.statusText}`)
          }

          const createData = await createResponse.json()
          parentId = createData.id
          this.folderCache.set(currentPath, parentId)
        }
      }

      return { success: true, folderId: parentId }
    } catch (error) {
      console.error('Failed to ensure folder:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  /**
   * Move a message to a specific folder
   */
  async moveToFolder(messageId: string, folderId: string): Promise<MailboxActionResult> {
    try {
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/move`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          destinationId: folderId
        })
      })

      if (response.ok) {
        return { success: true }
      } else {
        const error = await response.text()
        return { success: false, error }
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  /**
   * Get folder hierarchy for debugging
   */
  async getFolderHierarchy(): Promise<any[]> {
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        return data.value || []
      } else {
        console.error('Failed to get folder hierarchy:', response.statusText)
        return []
      }
    } catch (error) {
      console.error('Error getting folder hierarchy:', error)
      return []
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