import { createClient } from '@/lib/supabase/server'
import { getGraphClient, getValidTokenForUser } from '@/lib/microsoft-graph/client'
import crypto from 'crypto'

interface EmailMessage {
  id: string
  subject: string
  body: {
    contentType: string
    content: string
  }
  from: {
    emailAddress: {
      name: string
      address: string
    }
  }
  toRecipients: Array<{
    emailAddress: {
      name: string
      address: string
    }
  }>
  ccRecipients?: Array<{
    emailAddress: {
      name: string
      address: string
    }
  }>
  bccRecipients?: Array<{
    emailAddress: {
      name: string
      address: string
    }
  }>
  createdDateTime: string
  receivedDateTime: string
  hasAttachments: boolean
  importance: 'low' | 'normal' | 'high'
  isRead: boolean
  conversationId: string
  parentFolderId: string
  replyTo?: Array<{
    emailAddress: {
      name: string
      address: string
    }
  }>
}

interface EmailThread {
  id: string
  subject: string
  participants: string[]
  lastMessageDate: string
  messageCount: number
  hasUnread: boolean
  isActionRequired: boolean
  category: 'ACTION_REQUIRED' | 'FYI_ONLY' | 'FINANCIAL' | 'MEETING_REQUEST' | 'VIP_CRITICAL'
  priority: 'high' | 'medium' | 'low'
}

export class EmailSyncService {
  private vectorStoreService: any
  private classificationProcessor: any

  constructor() {
    // Initialize services for vector store and classification
    // These are important for draft generation and future briefings
    this.initializeServices()
  }

  private async initializeServices() {
    try {
      // Lazy load services to avoid circular dependencies
      const { VectorStoreService } = await import('../vector-store/vector-store-service')
      const { EmailClassificationProcessor } = await import('../ai/email-classification')
      
      this.vectorStoreService = new VectorStoreService()
      this.classificationProcessor = new EmailClassificationProcessor()
    } catch (error) {
      console.error('Failed to initialize AI services:', error)
      // Continue without these services - sync should still work
    }
  }

  private async getSupabase() {
    return await createClient()
  }

  async syncUserEmails(userId: string) {
    try {
      const supabase = await this.getSupabase()
      
      // Ensure services are initialized
      if (!this.vectorStoreService || !this.classificationProcessor) {
        await this.initializeServices()
      }
      
      // Get user info
      const { data: user } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single()

      if (!user) {
        throw new Error('User not found')
      }

      // Get valid access token (auto-refreshes if needed)
      let accessToken: string
      try {
        accessToken = await getValidTokenForUser(userId, ['User.Read', 'Mail.ReadWrite'])
        console.log('Retrieved valid access token for user')
      } catch (error: any) {
        console.error('Failed to get valid token:', error)
        if (error.message === 'User needs to re-authenticate') {
          throw new Error('Authentication expired. Please sign in again to refresh your access.')
        }
        throw error
      }

      // Update email account with fresh token info
      try {
        const encryptedAccessToken = await this.encryptToken(accessToken)
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour expiry
        
        console.log('Updating email account with fresh token:', {
          userId,
          email: user.email,
          expiresAt: expiresAt.toISOString(),
          hasEncryptedToken: !!encryptedAccessToken
        })
        
        // Upsert email account (insert or update if exists)
        const { data: upsertResult, error: upsertError } = await supabase
          .from('email_accounts')
          .upsert({
            user_id: userId,
            email_address: user.email,
            encrypted_access_token: encryptedAccessToken,
            access_token_expires_at: expiresAt.toISOString(),
            webhook_secret: crypto.randomBytes(32).toString('hex'),
            sync_status: 'in_progress'
          }, {
            onConflict: 'user_id,email_address',
            ignoreDuplicates: false
          })
          .select()
        
        if (upsertError) {
          console.error('Upsert error:', upsertError)
          throw upsertError
        }
        
        console.log('Successfully updated email account with fresh token:', upsertResult)
      } catch (error) {
        console.error('Failed to update email account:', error)
        // Continue with sync even if storage fails
      }

      // Initialize Graph client
      const graphClient = await getGraphClient(accessToken)

      console.log('Starting email sync for user:', userId)
      
      // Check if we have threads but no messages (indicating previous sync failed to store messages)
      const { count: threadCount } = await supabase
        .from('email_threads')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

      const { count: messageCount } = await supabase
        .from('email_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

      console.log('Thread count:', threadCount || 0)
      console.log('Message count:', messageCount || 0)

      let deltaQuery: string | undefined
      
      if ((threadCount || 0) > 0 && (messageCount || 0) === 0) {
        console.log('Threads exist but no messages found - doing full sync')
        deltaQuery = undefined // Force full sync
      } else {
        // Get last sync timestamp for delta query
        console.log('Getting last sync timestamp...')
        const { data: lastSync } = await supabase
          .from('email_accounts')
          .select('last_sync')
          .eq('user_id', userId)
          .eq('email_address', user.email)
          .single()
          
        console.log('Last sync timestamp:', lastSync?.last_sync)

        deltaQuery = lastSync?.last_sync
          ? `receivedDateTime ge ${new Date(lastSync.last_sync).toISOString()}`
          : undefined
      }

      console.log('Delta query:', deltaQuery)

      // Fetch messages from Microsoft Graph
      console.log('Fetching messages from Microsoft Graph...')
      const messages = await this.fetchMessages(graphClient, deltaQuery)
      console.log('Fetched messages count:', messages?.length || 0)

      // Process and store messages
      console.log('Processing messages...')
      await this.processMessages(supabase, userId, messages)
      console.log('Finished processing messages')

      // Auto-process threads after sync
      console.log('Running auto-processing for completed threads...')
      const { EmailProcessingService } = await import('./processing-status')
      const processingService = new EmailProcessingService()
      const processedCount = await processingService.autoProcessThreads(userId)
      console.log(`Auto-processed ${processedCount} threads`)

      // Update last sync timestamp
      await supabase
        .from('email_accounts')
        .update({ 
          last_sync: new Date().toISOString(),
          sync_status: 'completed'
        })
        .eq('user_id', userId)
        .eq('email_address', user.email)

      return { success: true, messageCount: messages.length, processedCount }
    } catch (error: any) {
      console.error('Email sync error:', error)
      
      // Update sync status to failed
      const supabase = await this.getSupabase()
      
      // Get user email for the update
      const { data: userData } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single()

      if (userData?.email) {
        await supabase
          .from('email_accounts')
          .update({ sync_status: 'failed' })
          .eq('user_id', userId)
          .eq('email_address', userData.email)
      }

      // Check if it's an authentication error
      if (error?.statusCode === 401 || error?.message?.includes('401') || 
          error?.message?.includes('token') || error?.message?.includes('expired') ||
          error?.message?.includes('Authentication')) {
        throw new Error('Authentication expired. Please sign in again to refresh your access.')
      }

      throw error
    }
  }

  private async fetchMessages(graphClient: any, deltaQuery?: string): Promise<EmailMessage[]> {
    const messages: EmailMessage[] = []
    let pageCount = 0
    const maxPages = 10 // Safety limit to prevent infinite loops
    
    try {
      console.log('Building Microsoft Graph query...')
      let query = graphClient.api('/me/messages')
        .select('id,subject,body,from,toRecipients,ccRecipients,bccRecipients,createdDateTime,receivedDateTime,hasAttachments,importance,isRead,conversationId,parentFolderId,replyTo')
        .top(100)
        .orderby('receivedDateTime desc')

      if (deltaQuery) {
        console.log('Adding delta filter:', deltaQuery)
        query = query.filter(deltaQuery)
      }

      console.log('Executing Graph API call...')
      let response = await query.get()
      console.log('Got response, value length:', response?.value?.length || 0)
      
      while (response.value && response.value.length > 0 && pageCount < maxPages) {
        pageCount++
        console.log(`Processing page ${pageCount}, messages:`, response.value.length)
        messages.push(...response.value)
        
        // Check for next page
        if (response['@odata.nextLink']) {
          response = await graphClient.api(response['@odata.nextLink']).get()
        } else {
          break
        }
      }

      return messages
    } catch (error: any) {
      console.error('Error fetching messages:', error)
      
      // Check if token is expired
      if (error.statusCode === 401 && error.code === 'InvalidAuthenticationToken') {
        throw new Error('Authentication token expired. Please sign in again.')
      }
      
      throw error
    }
  }

  private async processMessages(supabase: any, userId: string, messages: EmailMessage[]) {
    for (const message of messages) {
      try {
        // Check if message already exists
        const { data: existingMessage } = await supabase
          .from('email_messages')
          .select('id')
          .eq('message_id', message.id)
          .single()

        if (existingMessage) {
          continue // Skip if already processed
        }

        // Find or create thread
        try {
          const thread = await this.findOrCreateThread(supabase, userId, message)
          
          if (!thread || !thread.id) {
            console.error('Failed to create thread for message:', message.id)
            continue
          }

          // Store message
          await this.storeMessage(supabase, userId, thread.id, message)

          // Update thread with latest message info
          await this.updateThread(supabase, thread.id, message)

          // Extract and store contacts
          await this.extractAndStoreContacts(supabase, userId, message)

          // Classify email for business relevance
          const classification = await this.classifyEmailForRelevance(message, thread.id, userId)

          // Upload relevant emails to vector store for organizational knowledge
          await this.uploadToVectorStoreIfRelevant(message, thread.id, userId, classification)
        } catch (threadError) {
          console.error(`Error creating/processing thread for message ${message.id}:`, threadError)
          continue
        }

      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error)
        // Continue with next message
      }
    }
  }

  private async findOrCreateThread(supabase: any, userId: string, message: EmailMessage): Promise<{ id: string }> {
    try {
      console.log('Finding/creating thread for message:', message.id, 'conversationId:', message.conversationId)
      
      // Try to find existing thread by conversation ID
      const { data: existingThread } = await supabase
        .from('email_threads')
        .select('id')
        .eq('conversation_id', message.conversationId)
        .eq('user_id', userId)
        .single()

      if (existingThread) {
        console.log('Found existing thread:', existingThread.id)
        return existingThread
      }

      console.log('Creating new thread...')
      // Create new thread
      const participants = this.extractParticipants(message)
      const category = this.categorizeEmail(message)
      const priority = this.determinePriority(message)

      console.log('Thread data:', {
        conversation_id: message.conversationId,
        subject: message.subject,
        participants: participants.length,
        category,
        priority
      })

      const { data: newThread, error } = await supabase
        .from('email_threads')
        .insert({
          user_id: userId,
          thread_id: message.conversationId, // Use conversationId as thread_id
          conversation_id: message.conversationId,
          subject: message.subject || '',
          participants,
          last_message_date: message.receivedDateTime,
          message_count: 1,
          has_unread: !message.isRead,
          is_action_required: category === 'ACTION_REQUIRED',
          category,
          priority,
        })
        .select('id')
        .single()

      if (error) {
        console.error('Error creating thread:', error)
        throw new Error('Failed to create thread')
      }

      console.log('Created new thread:', newThread?.id)
      return newThread!
    } catch (error) {
      console.error('Error in findOrCreateThread:', error)
      throw error
    }
  }

  private async storeMessage(supabase: any, userId: string, threadId: string, message: EmailMessage) {
    try {
      const { error } = await supabase
        .from('email_messages')
        .insert({
          user_id: userId,
          thread_id: threadId,
          message_id: message.id,
          subject: message.subject || '',
          body: message.body?.content || '',
          from_email: message.from?.emailAddress?.address || '',
          from_name: message.from?.emailAddress?.name || '',
          to_recipients: message.toRecipients?.map(r => r?.emailAddress?.address).filter(Boolean) || [],
          cc_recipients: message.ccRecipients?.map(r => r?.emailAddress?.address).filter(Boolean) || [],
          bcc_recipients: message.bccRecipients?.map(r => r?.emailAddress?.address).filter(Boolean) || [],
          sender: message.from?.emailAddress?.address || '', // Required field
          recipients: message.toRecipients?.map(r => r?.emailAddress?.address).filter(Boolean) || [], // Required field
          sent_date: message.createdDateTime,
          received_at: message.receivedDateTime,
          has_draft: false,
          processed: false,
          created_at: message.createdDateTime,
        })
      
      if (error) {
        console.error('Error storing message:', error)
        throw error
      }
    } catch (error) {
      console.error(`Failed to store message ${message.id}:`, error)
      throw error
    }
  }

  private async updateThread(supabase: any, threadId: string, message: EmailMessage) {
    // Get current message count
    const { data: thread } = await supabase
      .from('email_threads')
      .select('message_count')
      .eq('id', threadId)
      .single()

    await supabase
      .from('email_threads')
      .update({
        last_message_date: message.receivedDateTime,
        message_count: (thread?.message_count || 0) + 1,
        has_unread: !message.isRead,
      })
      .eq('id', threadId)
  }

  private async extractAndStoreContacts(supabase: any, userId: string, message: EmailMessage) {
    const contacts = new Set<string>()
    
    // Add sender
    if (message.from?.emailAddress?.address) {
      contacts.add(message.from.emailAddress.address)
    }
    
    // Add recipients
    message.toRecipients?.forEach(r => {
      if (r?.emailAddress?.address) {
        contacts.add(r.emailAddress.address)
      }
    })
    message.ccRecipients?.forEach(r => {
      if (r?.emailAddress?.address) {
        contacts.add(r.emailAddress.address)
      }
    })
    message.bccRecipients?.forEach(r => {
      if (r?.emailAddress?.address) {
        contacts.add(r.emailAddress.address)
      }
    })

    for (const email of contacts) {
      try {
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', email)
          .eq('user_id', userId)
          .single()

        if (!existingContact) {
          const name = this.findContactName(email, message)
          await supabase
            .from('contacts')
            .insert({
              user_id: userId,
              email,
              name,
              total_interactions: 1,
              last_interaction: message.receivedDateTime,
            })
        } else {
          // Update interaction count and last interaction
          const { data: contact } = await supabase
            .from('contacts')
            .select('total_interactions')
            .eq('id', existingContact.id)
            .single()

          await supabase
            .from('contacts')
            .update({
              total_interactions: (contact?.total_interactions || 0) + 1,
              last_interaction: message.receivedDateTime,
            })
            .eq('id', existingContact.id)
        }
      } catch (error) {
        console.error(`Error storing contact ${email}:`, error)
      }
    }
  }

  private extractParticipants(message: EmailMessage): string[] {
    const participants = new Set<string>()
    
    // Add sender if available
    if (message.from?.emailAddress?.address) {
      participants.add(message.from.emailAddress.address)
    }
    
    // Add recipients
    message.toRecipients?.forEach(r => {
      if (r?.emailAddress?.address) {
        participants.add(r.emailAddress.address)
      }
    })
    
    // Add CC recipients
    message.ccRecipients?.forEach(r => {
      if (r?.emailAddress?.address) {
        participants.add(r.emailAddress.address)
      }
    })
    
    // Add BCC recipients
    message.bccRecipients?.forEach(r => {
      if (r?.emailAddress?.address) {
        participants.add(r.emailAddress.address)
      }
    })

    return Array.from(participants)
  }

  private categorizeEmail(message: EmailMessage): EmailThread['category'] {
    const subject = (message.subject || '').toLowerCase()
    const body = (message.body?.content || '').toLowerCase()
    
    // VIP detection (board members, donors, etc.)
    const vipDomains = ['missionmutual.org', 'board.'] // Add actual VIP domains
    const fromEmail = message.from?.emailAddress?.address || ''
    const isVip = vipDomains.some(domain => fromEmail.includes(domain))
    
    if (isVip) {
      return 'VIP_CRITICAL'
    }

    // Financial keywords
    const financialKeywords = ['invoice', 'payment', 'budget', 'financial', 'expense', 'revenue']
    if (financialKeywords.some(keyword => subject.includes(keyword) || body.includes(keyword))) {
      return 'FINANCIAL'
    }

    // Meeting request
    if (subject.includes('meeting') || body.includes('calendar') || body.includes('schedule')) {
      return 'MEETING_REQUEST'
    }

    // Action required detection
    const actionKeywords = ['please', 'can you', 'need', 'required', 'urgent', 'asap', 'deadline']
    if (actionKeywords.some(keyword => subject.includes(keyword) || body.includes(keyword))) {
      return 'ACTION_REQUIRED'
    }

    return 'FYI_ONLY'
  }

  private determinePriority(message: EmailMessage): number {
    if (message.importance === 'high') {
      return 1 // high priority
    }

    const urgentKeywords = ['urgent', 'asap', 'immediate', 'critical']
    const subject = (message.subject || '').toLowerCase()
    const body = (message.body?.content || '').toLowerCase()
    
    if (urgentKeywords.some(keyword => subject.includes(keyword) || body.includes(keyword))) {
      return 1 // high priority
    }

    return 3 // medium priority (default)
  }

  private findContactName(email: string, message: EmailMessage): string {
    // Try to find name from message participants
    const allParticipants = [
      message.from,
      ...(message.toRecipients || []),
      ...(message.ccRecipients || []),
      ...(message.bccRecipients || [])
    ].filter(Boolean)

    for (const participant of allParticipants) {
      if (participant?.emailAddress?.address === email) {
        return participant.emailAddress.name || email
      }
    }

    return email
  }

  private async uploadToVectorStoreIfRelevant(
    message: EmailMessage, 
    threadId: string, 
    userId: string,
    classification: any
  ) {
    try {
      // If vector store service not available, skip upload
      if (!this.vectorStoreService) {
        console.log(`⏩ Skipping vector store upload for ${message.id} - service not available`)
        return
      }

      const category = this.categorizeEmail(message)
      const priority = this.determinePriority(message) === 1 ? 'high' : 'medium'
      
      const emailDocument = {
        id: message.id,
        subject: message.subject || '',
        content: message.body?.content || '',
        sender: message.from?.emailAddress?.address || '',
        recipients: message.toRecipients?.map(r => r?.emailAddress?.address).filter(Boolean) || [],
        date: message.receivedDateTime,
        category,
        priority,
        threadId,
      }

      // Check if this email should be uploaded to vector store based on classification
      const shouldUpload = await this.vectorStoreService.shouldUploadEmail(emailDocument, classification)
      
      if (shouldUpload) {
        console.log(`📚 Uploading business-relevant email ${message.id} to vector store (category: ${classification.category}, context: ${classification.business_context})`)
        const result = await this.vectorStoreService.uploadEmailToVectorStore(emailDocument, userId)
        
        if (result.success) {
          console.log(`✅ Successfully uploaded email ${message.id} to vector store with record ID: ${result.recordId}`)
        } else {
          console.error(`❌ Failed to upload email ${message.id} to vector store:`, result.error)
        }
      } else {
        console.log(`⏩ Skipping email ${message.id} - classified as ${classification.category} (not relevant for vector store)`)
      }
    } catch (error) {
      console.error(`Error uploading email ${message.id} to vector store:`, error)
    }
  }

  private async classifyEmailForRelevance(
    message: EmailMessage,
    threadId: string,
    userId: string
  ): Promise<any> {
    try {
      // If classification processor not available, return default
      if (!this.classificationProcessor) {
        return {
          isRelevant: true,
          category: 'BUSINESS_RELEVANT',
          businessContext: 'EXTERNAL',
          shouldIndex: true,
          shouldArchive: false,
          reasoning: 'Classification service not available',
          confidence: 0.5,
        };
      }

      const emailContext = {
        id: message.id,
        subject: message.subject || '',
        sender: message.from?.emailAddress?.address || '',
        recipients: message.toRecipients?.map(r => r?.emailAddress?.address).filter(Boolean) || [],
        body: message.body?.content || '',
        threadId,
      };

      console.log(`🔍 Classifying email ${message.id} for business relevance`);
      
      const classification = await this.classificationProcessor.classifyEmail(emailContext, userId);
      
      console.log(`🔍 Classification complete: ${classification.category} (${classification.businessContext}) - Relevant: ${classification.isRelevant}, Index: ${classification.shouldIndex}`);
      
      // Update email with classification information
      const supabase = await this.getSupabase();
      // Note: We'll link classification via email_id, not store classification_id
      // This avoids the type error and maintains proper referential integrity

      // Handle automatic actions based on classification
      if (classification.shouldArchive) {
        await this.classificationProcessor.handleEmailAction(message.id, 'archive', userId);
        console.log(`📁 Auto-archived email ${message.id} (${classification.category})`);
      }
      
      return classification;
    } catch (error) {
      console.error(`Email classification failed for email ${message.id}:`, error);
      // Return default classification that allows processing
      return {
        isRelevant: true,
        category: 'BUSINESS_RELEVANT',
        businessContext: 'EXTERNAL',
        shouldIndex: false,
        shouldArchive: false,
        reasoning: 'Error in classification - defaulting to manual review',
        confidence: 0.1,
      };
    }
  }

  private async decryptRefreshToken(encryptedToken: string): Promise<string> {
    const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
    const [ivHex, authTagHex, encrypted] = encryptedToken.split(':')
    
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }

  private async encryptToken(token: string): Promise<string> {
    const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
    const iv = crypto.randomBytes(16)
    
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    
    let encrypted = cipher.update(token, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag()
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
  }
}