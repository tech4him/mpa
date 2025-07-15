import { getGraphClient } from '@/lib/microsoft-graph/client'
import { createClient } from '@/lib/supabase/server'

interface MailboxOperationResult {
  success: boolean
  draftId?: string
  folderId?: string
  error?: string
  message?: string
  requiresSync?: boolean
}

interface DraftToMailboxOptions {
  draftId: string
  userId: string
  accessToken: string
  organizeFolders?: boolean
}

interface FolderCacheEntry {
  id: string
  displayName: string
  messageCount: number
  lastModified: Date
  themes: string[]
}

interface FolderCache {
  folders: FolderCacheEntry[]
  lastUpdated: Date
  cacheExpiryMs: number
}

export class MailboxManager {
  private graphClient: any
  private supabase: any
  private folderCache: FolderCache | null = null
  private readonly CACHE_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes

  constructor(accessToken: string) {
    this.graphClient = null
    this.supabase = null
    this.accessToken = accessToken
  }

  async initialize() {
    this.graphClient = await getGraphClient(this.accessToken)
    this.supabase = await createClient()
  }

  /**
   * Get folders from cache or fetch if cache is expired
   */
  private async getCachedFolders(): Promise<FolderCacheEntry[]> {
    const now = new Date()
    
    // Check if cache is valid
    if (this.folderCache && 
        (now.getTime() - this.folderCache.lastUpdated.getTime()) < this.CACHE_EXPIRY_MS) {
      console.log(`Using cached folders (${this.folderCache.folders.length} folders)`)
      return this.folderCache.folders
    }
    
    console.log('Folder cache expired or missing, fetching fresh data...')
    await this.refreshFolderCache()
    return this.folderCache?.folders || []
  }

  /**
   * Refresh the folder cache with latest data from Microsoft Graph
   */
  private async refreshFolderCache(): Promise<void> {
    try {
      const folders: FolderCacheEntry[] = []
      let nextLink = '/me/mailFolders?$top=100'
      
      while (nextLink) {
        const response = await this.graphClient
          .api(nextLink)
          .get()
        
        for (const folder of response.value) {
          // Skip system folders
          if (['Inbox', 'Sent Items', 'Drafts', 'Deleted Items', 'Junk Email', 'Outbox', 'AI Assistant Drafts'].includes(folder.displayName)) {
            continue
          }
          
          folders.push({
            id: folder.id,
            displayName: folder.displayName,
            messageCount: folder.totalItemCount || 0,
            lastModified: new Date(folder.lastModifiedDateTime || Date.now()),
            themes: [] // Will be populated on demand
          })
        }
        
        nextLink = response['@odata.nextLink'] ? response['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null
      }
      
      this.folderCache = {
        folders,
        lastUpdated: new Date(),
        cacheExpiryMs: this.CACHE_EXPIRY_MS
      }
      
      console.log(`Cached ${folders.length} folders`)
    } catch (error) {
      console.error('Error refreshing folder cache:', error)
      throw error
    }
  }

  /**
   * Invalidate the folder cache (call after creating new folders)
   */
  private invalidateFolderCache(): void {
    this.folderCache = null
  }

  /**
   * Get or analyze themes for a specific folder
   */
  private async getFolderThemes(folderId: string, folderName: string): Promise<string[]> {
    try {
      // Sample messages from the folder to understand themes
      const messages = await this.graphClient
        .api(`/me/mailFolders/${folderId}/messages`)
        .select('subject,body')
        .top(10)  // Reduced from 20 for caching efficiency
        .orderby('receivedDateTime desc')
        .get()

      if (!messages.value || messages.value.length === 0) {
        return []
      }

      const folderContent = messages.value.map((msg: any) => ({
        subject: (msg.subject || '').toLowerCase(),
        body: (msg.body?.content || '').toLowerCase().substring(0, 500)
      }))

      // Extract themes using the existing theme analysis
      const themes = this.extractThemesFromContent(folderContent, folderName)
      
      // Cache the themes in the folder cache
      if (this.folderCache) {
        const cachedFolder = this.folderCache.folders.find(f => f.id === folderId)
        if (cachedFolder) {
          cachedFolder.themes = themes
        }
      }
      
      return themes
    } catch (error) {
      console.warn(`Could not analyze themes for folder ${folderName}:`, error)
      return []
    }
  }

  /**
   * Extract themes from folder content
   */
  private extractThemesFromContent(folderContent: Array<{subject: string, body: string}>, folderName: string): string[] {
    const topicThemes = {
      onboarding: ['laptop', 'macbook', 'computer', 'setup', 'new employee', 'onboard', 'equipment', 'workstation'],
      hr: ['employee', 'staff', 'hire', 'hiring', 'benefits', 'vacation', 'leave', 'performance', 'review', 'payroll'],
      it: ['computer', 'laptop', 'software', 'password', 'access', 'system', 'server', 'network', 'email', 'tech'],
      finance: ['budget', 'expense', 'invoice', 'payment', 'financial', 'accounting', 'cost', 'revenue'],
      security: ['security', 'safety', 'incident', 'breach', 'vulnerability', 'audit', 'advisor'],
      technology: ['software', 'system', 'application', 'platform', 'technology', 'digital', 'supabase', 'database'],
      meetings: ['meeting', 'conference', 'call', 'agenda', 'minutes', 'schedule']
    }

    const folderText = folderContent.map(item => item.subject + ' ' + item.body).join(' ')
    const themes: string[] = []

    for (const [theme, keywords] of Object.entries(topicThemes)) {
      const matchCount = keywords.filter(keyword => folderText.includes(keyword)).length
      if (matchCount >= 2) { // Need at least 2 keyword matches
        themes.push(theme)
      }
    }

    return themes
  }

  /**
   * Calculate match score between thread content and folder themes
   */
  private calculateThemeMatchScore(thread: any, folderThemes: string[], folderName: string): number {
    const threadSubject = (thread.subject || '').toLowerCase()
    const threadBody = (thread.email_messages?.[0]?.body || '').toLowerCase()
    const threadContent = `${threadSubject} ${threadBody}`
    
    const topicThemes = {
      onboarding: ['laptop', 'macbook', 'computer', 'setup', 'new employee', 'onboard', 'equipment', 'workstation'],
      hr: ['employee', 'staff', 'hire', 'hiring', 'benefits', 'vacation', 'leave', 'performance', 'review', 'payroll'],
      it: ['computer', 'laptop', 'software', 'password', 'access', 'system', 'server', 'network', 'email', 'tech'],
      finance: ['budget', 'expense', 'invoice', 'payment', 'financial', 'accounting', 'cost', 'revenue'],
      security: ['security', 'safety', 'incident', 'breach', 'vulnerability', 'audit', 'advisor'],
      technology: ['software', 'system', 'application', 'platform', 'technology', 'digital', 'supabase', 'database'],
      meetings: ['meeting', 'conference', 'call', 'agenda', 'minutes', 'schedule']
    }
    
    let maxScore = 0
    
    for (const theme of folderThemes) {
      const keywords = topicThemes[theme as keyof typeof topicThemes]
      if (keywords) {
        const matchCount = keywords.filter(keyword => threadContent.includes(keyword)).length
        const themeScore = matchCount / keywords.length
        maxScore = Math.max(maxScore, themeScore)
      }
    }
    
    return maxScore
  }

  private accessToken: string

  /**
   * Main workflow: Process approved draft into user's mailbox
   */
  async processApprovedDraft(options: DraftToMailboxOptions): Promise<MailboxOperationResult> {
    try {
      console.log('Initializing mailbox manager...')
      await this.initialize()

      // Get draft details
      console.log('Fetching draft details for:', options.draftId)
      const { data: draft, error: draftError } = await this.supabase
        .from('email_drafts')
        .select(`
          *,
          email_threads!inner(
            id,
            subject,
            category,
            participants,
            email_messages(
              id,
              subject,
              body,
              from_email,
              from_name,
              to_recipients,
              message_id,
              received_at,
              created_at
            )
          )
        `)
        .eq('id', options.draftId)
        .eq('user_id', options.userId)
        .single()

      console.log('Draft query result:', { draft: !!draft, error: draftError })

      if (draftError || !draft) {
        console.error('Draft fetch error:', draftError)
        return { success: false, error: 'Draft not found: ' + (draftError?.message || 'Unknown error') }
      }

      // Create AI Assistant Drafts folder if it doesn't exist
      console.log('Ensuring AI Drafts folder exists...')
      const draftsFolderId = await this.ensureAIDraftsFolder()
      console.log('AI Drafts folder ID:', draftsFolderId)

      // Create the draft email in the folder
      console.log('Creating draft in mailbox...')
      const mailDraftResult = await this.createDraftInMailbox(draft, draftsFolderId)
      console.log('Mailbox draft result:', mailDraftResult)
      
      if (!mailDraftResult.success) {
        return mailDraftResult
      }

      // Organize original emails if requested
      if (options.organizeFolders) {
        await this.organizeOriginalEmails(draft.email_threads, draft.user_id)
      }

      // Update draft status with mailbox reference
      await this.supabase
        .from('email_drafts')
        .update({
          status: 'in_mailbox',
          mailbox_draft_id: mailDraftResult.draftId,
          mailbox_folder_id: draftsFolderId
        })
        .eq('id', options.draftId)

      // Auto-mark thread as processed since draft was created in mailbox
      const { data: draftData } = await this.supabase
        .from('email_drafts')
        .select('thread_id')
        .eq('id', options.draftId)
        .single()

      if (draftData?.thread_id) {
        await this.supabase
          .from('email_threads')
          .update({
            is_processed: true,
            is_hidden: true,
            processed_at: new Date().toISOString(),
            processing_reason: 'draft_created_in_mailbox',
            updated_at: new Date().toISOString()
          })
          .eq('id', draftData.thread_id)
          .eq('user_id', options.userId)
      }

      return {
        success: true,
        draftId: mailDraftResult.draftId,
        folderId: draftsFolderId
      }

    } catch (error) {
      console.error('Error processing approved draft:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  /**
   * Ensure AI Assistant Drafts folder exists
   */
  private async ensureAIDraftsFolder(): Promise<string> {
    try {
      // First check if folder already exists
      const folders = await this.graphClient
        .api('/me/mailFolders')
        .get()

      const existingFolder = folders.value.find((folder: any) => 
        folder.displayName === 'AI Assistant Drafts'
      )

      if (existingFolder) {
        return existingFolder.id
      }

      // Create the folder
      const newFolder = await this.graphClient
        .api('/me/mailFolders')
        .post({
          displayName: 'AI Assistant Drafts',
          isHidden: false
        })

      return newFolder.id

    } catch (error) {
      console.error('Error managing AI drafts folder:', error)
      // Fallback to Drafts folder
      const draftsFolder = await this.graphClient
        .api('/me/mailFolders/drafts')
        .get()
      
      return draftsFolder.id
    }
  }

  /**
   * Create actual draft email in mailbox
   */
  private async createDraftInMailbox(draft: any, folderId: string): Promise<MailboxOperationResult> {
    try {
      const thread = draft.email_threads
      // Get the most recent message in the thread (sort by received_at descending)
      const originalMessage = thread.email_messages?.sort((a: any, b: any) => 
        new Date(b.received_at || b.created_at).getTime() - new Date(a.received_at || a.created_at).getTime()
      )?.[0]
      
      console.log('Original message details:', {
        id: originalMessage?.id,
        subject: originalMessage?.subject,
        hasBody: !!originalMessage?.body,
        bodyLength: originalMessage?.body?.length || 0,
        from: originalMessage?.from_email,
        received: originalMessage?.received_at
      })

      // Determine recipients based on thread context
      const recipients = await this.determineRecipients(thread, originalMessage)

      // For replies, we need to use the reply endpoint instead of creating a new message
      if (originalMessage?.message_id) {
        console.log('Creating reply draft for message ID:', originalMessage.message_id)
        
        // Create reply draft using the Graph API reply endpoint
        console.log('Creating reply draft...')
        const createdDraft = await this.graphClient
          .api(`/me/messages/${originalMessage.message_id}/createReply`)
          .post()

        console.log('Reply draft created, now updating content...')
        
        // Update the draft with our AI-generated content (including original message thread)
        const updateData = {
          body: {
            contentType: 'html',
            content: this.formatDraftContent(draft.content, true, originalMessage)
          },
          toRecipients: recipients.to,
          ccRecipients: recipients.cc || []
        }

        console.log('Update data structure:', JSON.stringify(updateData, null, 2))

        // Update the draft with our content
        await this.graphClient
          .api(`/me/messages/${createdDraft.id}`)
          .patch(updateData)

        // Move the draft to AI Assistant folder if it's not already there
        if (createdDraft.parentFolderId !== folderId) {
          await this.graphClient
            .api(`/me/messages/${createdDraft.id}/move`)
            .post({ destinationId: folderId })
        }

        return {
          success: true,
          draftId: createdDraft.id,
          folderId: folderId
        }
      } else {
        // Create new standalone message if no original message to reply to
        console.log('Creating new standalone draft (no original message to reply to)')
        
        const draftMessage = {
          subject: draft.subject,
          body: {
            contentType: 'html',
            content: this.formatDraftContent(draft.content)
          },
          toRecipients: recipients.to,
          ccRecipients: recipients.cc || [],
          bccRecipients: recipients.bcc || [],
          importance: this.determinePriority(thread.category)
        }

        console.log('New message structure:', JSON.stringify(draftMessage, null, 2))

        const createdDraft = await this.graphClient
          .api(`/me/mailFolders/${folderId}/messages`)
          .post(draftMessage)

        return {
          success: true,
          draftId: createdDraft.id,
          folderId: folderId
        }
      }

    } catch (error) {
      console.error('Error creating draft in mailbox:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create draft' 
      }
    }
  }

  /**
   * Organize original emails into topic-appropriate folders
   */
  private async organizeOriginalEmails(thread: any, userId: string): Promise<void> {
    try {
      // Determine the best folder name based on thread subject and content
      const topicName = await this.determineTopicName(thread)
      const topicFolderId = await this.ensureTopicFolder(topicName)

      // Move/copy original emails to topic folder
      for (const message of thread.email_messages || []) {
        if (message.message_id) {
          try {
            // Copy the message to topic folder (don't move, keep in original location too)
            await this.graphClient
              .api(`/me/messages/${message.message_id}/copy`)
              .post({
                destinationId: topicFolderId
              })
          } catch (msgError) {
            console.warn(`Could not organize message ${message.id}:`, msgError)
          }
        }
      }

    } catch (error) {
      console.error('Error organizing original emails:', error)
      // Non-critical error, don't fail the main operation
    }
  }

  /**
   * Analyze existing folders and determine the best folder for a thread
   */
  private async determineTopicName(thread: any): Promise<string> {
    const subject = (thread.subject || '').toLowerCase()
    const participants = thread.participants || []
    
    try {
      // Get cached folders for analysis
      const cachedFolders = await this.getCachedFolders()
      console.log(`Analyzing ${cachedFolders.length} cached folders for thread subject:`, thread.subject)
      
      // First, extract business entities from the thread
      const entities = this.extractBusinessEntities(thread)
      console.log('Extracted entities:', entities)
      
      // Look for exact matches with extracted entities
      for (const folder of cachedFolders) {
        const folderName = folder.displayName.toLowerCase()
        
        // Check if any extracted entity matches the folder name
        for (const entity of [...entities.projects, ...entities.clients, ...entities.vendors, ...entities.products]) {
          if (entity && (folderName.includes(entity.toLowerCase()) || entity.toLowerCase().includes(folderName))) {
            console.log(`Found entity-based folder match: ${folder.displayName} (entity: ${entity})`)
            return folder.displayName
          }
        }
        
        // Check if subject contains folder name or vice versa
        if (subject.includes(folderName) || folderName.includes(subject.split(' ')[0])) {
          console.log(`Found name-based folder match: ${folder.displayName}`)
          return folder.displayName
        }
      }
      
      // Enhanced content analysis using cached folders and themes
      const folderScores: Array<{folder: FolderCacheEntry, score: number}> = []
      
      for (const folder of cachedFolders) {
        try {
          // Get or analyze themes for this folder
          let themes = folder.themes
          if (themes.length === 0) {
            themes = await this.getFolderThemes(folder.id, folder.displayName)
          }
          
          if (themes.length > 0) {
            console.log(`Analyzing folder "${folder.displayName}" with themes: ${themes.join(', ')}`)
            
            // Calculate match score based on themes
            const matchScore = this.calculateThemeMatchScore(thread, themes, folder.displayName)
            
            if (matchScore > 0.3) {
              folderScores.push({ folder, score: matchScore })
            }
          }
        } catch (folderError) {
          console.warn(`Could not analyze folder ${folder.displayName}:`, folderError)
          continue
        }
      }
      
      // If we found any matches, use the best one
      if (folderScores.length > 0) {
        folderScores.sort((a, b) => b.score - a.score)
        const bestMatch = folderScores[0]
        console.log(`Found content-based folder match: ${bestMatch.folder.displayName} (score: ${bestMatch.score.toFixed(2)})`)
        return bestMatch.folder.displayName
      }
      
    } catch (error) {
      console.warn('Error analyzing existing folders:', error)
    }
    
    // Fall back to intelligent naming based on thread content
    console.log('No existing folder match found, using enhanced content-based naming')
    return this.generateTopicNameFromContent(thread)
  }

  /**
   * Extract business entities from thread content
   */
  private extractBusinessEntities(thread: any): {
    projects: string[]
    clients: string[]
    vendors: string[]
    products: string[]
    departments: string[]
  } {
    const subject = (thread.subject || '').toLowerCase()
    const body = (thread.email_messages?.[0]?.body || '').toLowerCase()
    const fullText = `${subject} ${body}`.substring(0, 2000) // Limit for performance
    
    const entities = {
      projects: [],
      clients: [],
      vendors: [],
      products: [],
      departments: []
    }
    
    // Extract project patterns
    const projectPatterns = [
      /project\s+([a-zA-Z][a-zA-Z0-9\s]{2,20})/gi,
      /initiative\s+([a-zA-Z][a-zA-Z0-9\s]{2,20})/gi,
      /campaign\s+([a-zA-Z][a-zA-Z0-9\s]{2,20})/gi,
      /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+project\b/gi,
      /\b([A-Z]{2,10})\b/g // Project codes like "ABC123", "QTR1"
    ]
    
    projectPatterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(fullText)) !== null) {
        const project = match[1]?.trim()
        if (project && project.length > 2 && project.length < 30) {
          entities.projects.push(this.titleCase(project))
        }
      }
    })
    
    // Extract client patterns
    const clientPatterns = [
      /client\s+([a-zA-Z][a-zA-Z0-9\s]{2,25})/gi,
      /customer\s+([a-zA-Z][a-zA-Z0-9\s]{2,25})/gi,
      /account\s+([a-zA-Z][a-zA-Z0-9\s]{2,25})/gi,
      /for\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:team|group|department)/gi
    ]
    
    clientPatterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(fullText)) !== null) {
        const client = match[1]?.trim()
        if (client && client.length > 2 && client.length < 30) {
          entities.clients.push(this.titleCase(client))
        }
      }
    })
    
    // Extract vendor/partner patterns
    const vendorPatterns = [
      /vendor\s+([a-zA-Z][a-zA-Z0-9\s]{2,25})/gi,
      /supplier\s+([a-zA-Z][a-zA-Z0-9\s]{2,25})/gi,
      /partner\s+([a-zA-Z][a-zA-Z0-9\s]{2,25})/gi,
      /contractor\s+([a-zA-Z][a-zA-Z0-9\s]{2,25})/gi
    ]
    
    vendorPatterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(fullText)) !== null) {
        const vendor = match[1]?.trim()
        if (vendor && vendor.length > 2 && vendor.length < 30) {
          entities.vendors.push(this.titleCase(vendor))
        }
      }
    })
    
    // Extract department patterns
    const deptPatterns = [
      /\b([a-zA-Z]+)\s+(?:team|department|dept|division|group)\b/gi,
      /\b(?:team|department|dept|division|group)\s+([a-zA-Z]+)\b/gi
    ]
    
    deptPatterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(fullText)) !== null) {
        const dept = match[1]?.trim()
        if (dept && dept.length > 2 && dept.length < 20) {
          entities.departments.push(this.titleCase(dept))
        }
      }
    })
    
    // Extract product patterns (look for capitalized words that might be products)
    const productPattern = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\s+(?:software|platform|system|tool|application|app|service)\b/gi
    let match
    while ((match = productPattern.exec(fullText)) !== null) {
      const product = match[1]?.trim()
      if (product && product.length > 2 && product.length < 25) {
        entities.products.push(product)
      }
    }
    
    // Remove duplicates and common false positives
    const commonWords = new Set(['new', 'old', 'big', 'small', 'good', 'bad', 'main', 'first', 'last', 'next', 'best', 'current', 'final'])
    
    Object.keys(entities).forEach(key => {
      entities[key] = [...new Set(entities[key])]
        .filter(item => !commonWords.has(item.toLowerCase()))
        .slice(0, 5) // Limit to top 5 per category
    })
    
    return entities
  }
  
  /**
   * Convert string to title case
   */
  private titleCase(str: string): string {
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    )
  }

  /**
   * Calculate how well a thread's content matches the content themes in a folder
   */
  private calculateContentMatchScore(thread: any, folderContent: Array<{subject: string, body: string}>, folderName: string): number {
    const threadSubject = (thread.subject || '').toLowerCase()
    const threadBody = (thread.email_messages?.[0]?.body || '').toLowerCase()
    
    // Define topic themes and their keywords
    const topicThemes = {
      onboarding: ['laptop', 'macbook', 'computer', 'setup', 'new employee', 'onboard', 'equipment', 'workstation', 'account setup', 'orientation'],
      hr: ['employee', 'staff', 'hire', 'hiring', 'benefits', 'vacation', 'leave', 'performance', 'review', 'payroll'],
      it: ['computer', 'laptop', 'software', 'password', 'access', 'system', 'server', 'network', 'email', 'tech'],
      finance: ['budget', 'expense', 'invoice', 'payment', 'financial', 'accounting', 'cost', 'revenue'],
      biblionexus: ['biblionexus', 'nexus', 'transition', 'platform', 'migration'],
      board: ['board', 'governance', 'executive', 'strategic', 'leadership'],
      development: ['donor', 'fundraising', 'grant', 'development', 'partnership'],
      meetings: ['meeting', 'conference', 'call', 'agenda', 'minutes', 'schedule']
    }
    
    // Extract keywords from current thread
    const threadKeywords = this.extractKeywords(threadSubject + ' ' + threadBody)
    
    // Extract keywords from folder content
    const folderText = folderContent.map(item => item.subject + ' ' + item.body).join(' ')
    const folderKeywords = this.extractKeywords(folderText)
    
    // Calculate content similarity score
    let maxThemeScore = 0
    let bestTheme = ''
    
    for (const [theme, keywords] of Object.entries(topicThemes)) {
      const threadThemeScore = keywords.filter(keyword => 
        threadKeywords.some(tk => tk.includes(keyword) || keyword.includes(tk))
      ).length / keywords.length
      
      const folderThemeScore = keywords.filter(keyword => 
        folderKeywords.some(fk => fk.includes(keyword) || keyword.includes(fk))
      ).length / keywords.length
      
      // If both thread and folder have similar theme scores, it's a good match
      const themeMatch = Math.min(threadThemeScore, folderThemeScore)
      
      if (themeMatch > maxThemeScore) {
        maxThemeScore = themeMatch
        bestTheme = theme
      }
    }
    
    // Boost score if folder name suggests the theme
    const folderNameLower = folderName.toLowerCase()
    if (bestTheme === 'onboarding' && (folderNameLower.includes('onboard') || folderNameLower.includes('new') || folderNameLower.includes('employee'))) {
      maxThemeScore += 0.3
    }
    if (bestTheme === 'hr' && (folderNameLower.includes('hr') || folderNameLower.includes('human') || folderNameLower.includes('staff'))) {
      maxThemeScore += 0.3
    }
    if (bestTheme === 'it' && (folderNameLower.includes('it') || folderNameLower.includes('tech') || folderNameLower.includes('computer'))) {
      maxThemeScore += 0.3
    }
    
    console.log(`Theme analysis for "${folderName}": ${bestTheme} (${maxThemeScore.toFixed(2)})`)
    return Math.min(maxThemeScore, 1.0) // Cap at 1.0
  }

  /**
   * Extract meaningful keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Remove HTML tags and normalize
    const cleanText = text.replace(/<[^>]*>/g, ' ').toLowerCase()
    
    // Split into words and filter out common stop words
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'])
    
    return cleanText
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 50) // Limit to first 50 meaningful words
  }

  /**
   * Generate a topic name based on thread content when no existing folder matches
   */
  private generateTopicNameFromContent(thread: any): string {
    const subject = (thread.subject || '').toLowerCase()
    const body = (thread.email_messages?.[0]?.body || '').toLowerCase()
    const fullText = `${subject} ${body}`.substring(0, 1000)
    
    // Check for common business contexts FIRST with better pattern matching
    const businessPatterns = [
      { pattern: /\b(?:laptop|macbook|computer|equipment|setup|onboard|new\s+employee)\b/i, folder: 'IT & Onboarding' },
      { pattern: /\b(?:biblionexus|nexus|platform|migration|transition)\b/i, folder: 'Platform Migration' },
      { pattern: /\b(?:board|governance|executive|strategic|leadership)\b/i, folder: 'Leadership' },
      { pattern: /\b(?:budget|financial|expense|invoice|payment|accounting|revenue|cost)\b/i, folder: 'Finance' },
      { pattern: /\b(?:donor|fundraising|grant|development|partnership|sponsor)\b/i, folder: 'Development' },
      { pattern: /\b(?:meeting|conference|call|agenda|minutes|schedule|appointment)\b/i, folder: 'Meetings' },
      { pattern: /\b(?:contract|agreement|legal|compliance|policy|terms)\b/i, folder: 'Legal & Compliance' },
      { pattern: /\b(?:marketing|campaign|promotion|advertisement|brand|social)\b/i, folder: 'Marketing' },
      { pattern: /\b(?:hr|human\s+resources|benefits|vacation|leave|payroll|staff)\b/i, folder: 'Human Resources' },
      { pattern: /\b(?:training|education|learning|workshop|course|certification)\b/i, folder: 'Training & Education' },
      { pattern: /\b(?:security|safety|incident|breach|vulnerability|audit|advisor)\b/i, folder: 'Security' },
      { pattern: /\b(?:operations|workflow|process|procedure|efficiency|optimization)\b/i, folder: 'Operations' },
      { pattern: /\b(?:software|system|application|platform|technology|digital|supabase|database)\b/i, folder: 'Technology' },
      { pattern: /\b(?:customer|support|help|assistance|service|ticket)\b/i, folder: 'Customer Support' },
      { pattern: /\b(?:report|summary|analytics|metrics|data|dashboard)\b/i, folder: 'Reports & Analytics' },
      { pattern: /\b(?:proposal|pitch|presentation|deck|rfp)\b/i, folder: 'Proposals' },
      { pattern: /\b(?:event|conference|webinar|workshop|seminar)\b/i, folder: 'Events' }
    ]
    
    for (const { pattern, folder } of businessPatterns) {
      if (pattern.test(fullText)) {
        return folder
      }
    }
    
    // Then try to use extracted business entities
    const entities = this.extractBusinessEntities(thread)
    
    if (entities.projects.length > 0) {
      return `Project: ${entities.projects[0]}`
    }
    
    if (entities.clients.length > 0) {
      return `Client: ${entities.clients[0]}`
    }
    
    if (entities.products.length > 0) {
      return `${entities.products[0]}`
    }
    
    if (entities.departments.length > 0) {
      return `${entities.departments[0]} Team`
    }
    
    if (entities.vendors.length > 0) {
      return `Vendor: ${entities.vendors[0]}`
    }
    
    // Try to extract organization/company names from participants
    const organizationName = this.extractOrganizationFromParticipants(thread.participants)
    if (organizationName) {
      return `${organizationName} Communications`
    }
    
    // Skip extractMeaningfulTopic to avoid creating subject-based folders
    // const meaningfulTopic = this.extractMeaningfulTopic(thread.subject)
    // if (meaningfulTopic) {
    //   return meaningfulTopic
    // }
    
    // Use sender domain as last meaningful resort
    const senderDomain = this.extractSenderDomain(thread)
    if (senderDomain) {
      return `${senderDomain} Communications`
    }
    
    // Very last resort - time-based or category-based
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().toLocaleString('default', { month: 'long' })
    
    switch (thread.category) {
      case 'VIP_CRITICAL':
        return `${currentMonth} ${currentYear} - VIP`
      case 'FINANCIAL':
        return `${currentMonth} ${currentYear} - Finance`
      case 'MEETING_REQUEST':
        return `${currentMonth} ${currentYear} - Meetings`
      case 'ACTION_REQUIRED':
        return `${currentMonth} ${currentYear} - Action Items`
      default:
        return `${currentMonth} ${currentYear} - General`
    }
  }
  
  /**
   * Extract topic from subject line using various patterns
   */
  private extractTopicFromSubject(subject: string): string | null {
    if (!subject) return null
    
    // Remove common prefixes
    const cleanSubject = subject.replace(/^(re:|fwd?:|fw:)\s*/i, '').trim()
    
    // Look for patterns like "Project X - ..." or "Client Y: ..."
    const colonPattern = /^([^:]+):/
    const dashPattern = /^([^-]+)\s*-\s*/
    const bracketPattern = /^\[([^\]]+)\]/
    
    let match = colonPattern.exec(cleanSubject) || dashPattern.exec(cleanSubject) || bracketPattern.exec(cleanSubject)
    
    if (match && match[1]) {
      const topic = match[1].trim()
      if (topic.length > 3 && topic.length < 40 && !/\b(the|and|or|of|in|on|at|to|for|with|by)\b/i.test(topic)) {
        return this.titleCase(topic)
      }
    }
    
    // Look for project codes or IDs
    const codePattern = /\b([A-Z]{2,10}-?\d{2,10}|\d{4}-[A-Z]{2,10})\b/
    match = codePattern.exec(cleanSubject)
    if (match) {
      return `Project: ${match[1]}`
    }
    
    // Extract first meaningful phrase (before first comma, period, or after 40 chars)
    const firstPhrase = cleanSubject.split(/[,.]/)[0].substring(0, 40).trim()
    if (firstPhrase.length > 8 && firstPhrase.split(' ').length > 1) {
      return this.titleCase(firstPhrase)
    }
    
    return null
  }
  
  /**
   * Extract organization name from participant email domains
   */
  private extractOrganizationFromParticipants(participants: string[]): string | null {
    if (!participants || participants.length === 0) return null
    
    const domains = participants
      .map(email => {
        const match = /@([^.]+)\./.exec(email)
        return match ? match[1] : null
      })
      .filter(domain => domain && !['gmail', 'yahoo', 'hotmail', 'outlook', 'icloud'].includes(domain))
    
    if (domains.length > 0) {
      return this.titleCase(domains[0])
    }
    
    return null
  }
  
  /**
   * Extract sender domain for folder naming
   */
  private extractSenderDomain(thread: any): string | null {
    const firstMessage = thread.email_messages?.[0]
    if (!firstMessage?.from_email) return null
    
    const match = /@([^.]+)\./.exec(firstMessage.from_email)
    if (match && !['gmail', 'yahoo', 'hotmail', 'outlook', 'icloud'].includes(match[1])) {
      return this.titleCase(match[1])
    }
    
    return null
  }
  
  /**
   * Extract meaningful topic from subject by removing noise words
   */
  private extractMeaningfulTopic(subject: string): string | null {
    if (!subject) return null
    
    const cleanSubject = subject.replace(/^(re:|fwd?:|fw:)\s*/i, '').trim()
    const words = cleanSubject.split(/\s+/)
    
    // Remove noise words
    const noiseWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must'])
    
    const meaningfulWords = words.filter(word => 
      word.length > 2 && 
      !noiseWords.has(word.toLowerCase()) &&
      !/^\d+$/.test(word)
    ).slice(0, 4) // Take first 4 meaningful words
    
    if (meaningfulWords.length >= 2) {
      return meaningfulWords.join(' ')
    }
    
    return null
  }

  /**
   * Ensure topic folder exists, checking for existing folders first
   */
  private async ensureTopicFolder(topicName: string): Promise<string> {
    try {
      // Get cached folders
      const cachedFolders = await this.getCachedFolders()

      // First, check for exact topic name match
      let existingFolder = cachedFolders.find((folder) => 
        folder.displayName.toLowerCase() === topicName.toLowerCase()
      )

      if (existingFolder) {
        console.log(`Found existing folder: ${existingFolder.displayName}`)
        return existingFolder.id
      }

      // Check for folders containing the topic name
      existingFolder = cachedFolders.find((folder) => 
        folder.displayName.toLowerCase().includes(topicName.toLowerCase()) ||
        topicName.toLowerCase().includes(folder.displayName.toLowerCase())
      )

      if (existingFolder) {
        console.log(`Found similar folder: ${existingFolder.displayName}`)
        return existingFolder.id
      }

      // Create new folder with just the topic name (not "Topic: prefix")
      console.log(`Creating new folder: ${topicName}`)
      const newFolder = await this.graphClient
        .api('/me/mailFolders')
        .post({
          displayName: topicName,
          isHidden: false
        })

      console.log(`Successfully created folder: ${newFolder.displayName}`)
      
      // Invalidate cache after creating new folder
      this.invalidateFolderCache()
      
      return newFolder.id

    } catch (error) {
      console.error('Error managing topic folder:', error)
      
      // If folder already exists (409 error), try to find it
      if (error.statusCode === 409) {
        try {
          // Invalidate cache and refresh to get the latest folder list
          this.invalidateFolderCache()
          const freshFolders = await this.getCachedFolders()
          
          const existingFolder = freshFolders.find((folder) => 
            folder.displayName.toLowerCase() === topicName.toLowerCase()
          )
          
          if (existingFolder) {
            console.log(`Found existing folder after 409 error: ${existingFolder.displayName}`)
            return existingFolder.id
          }
        } catch (retryError) {
          console.error('Error retrying folder lookup:', retryError)
        }
      }
      
      // Fallback to inbox
      const inbox = await this.graphClient
        .api('/me/mailFolders/inbox')
        .get()
      
      return inbox.id
    }
  }

  /**
   * Determine email recipients based on thread context
   */
  private async determineRecipients(thread: any, originalMessage: any): Promise<{
    to: any[]
    cc?: any[]
    bcc?: any[]
  }> {
    console.log('Determining recipients for thread:', {
      threadId: thread?.id,
      originalMessageFromEmail: originalMessage?.from_email,
      participantsCount: thread?.participants?.length
    })

    const recipients = { to: [], cc: [], bcc: [] }

    if (originalMessage && originalMessage.from_email) {
      // For replies, send to original sender
      recipients.to.push({
        emailAddress: {
          address: originalMessage.from_email,
          name: originalMessage.from_email
        }
      })
    } else {
      // If no original message, use a placeholder or prompt user
      console.log('No original message found, using placeholder recipient')
      recipients.to.push({
        emailAddress: {
          address: 'recipient@example.com',
          name: 'Recipient'
        }
      })
    }

    // Add other participants as CC if it's a group conversation
    if (thread.participants && thread.participants.length > 2) {
      try {
        const currentUserEmail = await this.getCurrentUserEmail()
        
        thread.participants.forEach((email: string) => {
          if (email && email !== originalMessage?.from_email && email !== currentUserEmail) {
            recipients.cc.push({
              emailAddress: {
                address: email,
                name: email
              }
            })
          }
        })
      } catch (error) {
        console.warn('Error getting current user email for CC recipients:', error)
      }
    }

    console.log('Final recipients:', recipients)
    return recipients
  }

  /**
   * Get current user's email address
   */
  private async getCurrentUserEmail(): Promise<string> {
    try {
      const user = await this.graphClient
        .api('/me')
        .select('mail,userPrincipalName')
        .get()
      
      return user.mail || user.userPrincipalName || ''
    } catch (error) {
      console.error('Error getting current user email:', error)
      return ''
    }
  }

  /**
   * Format draft content for email body, optionally including original message thread
   */
  private formatDraftContent(content: string, includeOriginal: boolean = false, originalMessage?: any): string {
    // Ensure content is properly formatted as HTML
    let htmlContent = content
    if (!content.includes('<html>') && !content.includes('<body>')) {
      // Convert plain text to HTML if needed
      htmlContent = content
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
      
      htmlContent = `<p>${htmlContent}</p>`
    }
    
    let fullContent = htmlContent
    
    // Add original message thread if this is a reply
    if (includeOriginal && originalMessage) {
      const originalDate = originalMessage.received_at ? new Date(originalMessage.received_at).toLocaleString() : 'Unknown date'
      const originalFrom = originalMessage.from_name || originalMessage.from_email || 'Unknown sender'
      const originalSubject = originalMessage.subject || 'No subject'
      
      // Clean and format the original body content
      let originalBody = originalMessage.body || 'No content available'
      
      // If body is HTML, strip tags for cleaner display but preserve some formatting
      if (originalBody.includes('<') && originalBody.includes('>')) {
        originalBody = originalBody
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim()
      }
      
      // Limit length and clean up whitespace
      if (originalBody.length > 1000) {
        originalBody = originalBody.substring(0, 1000) + '...'
      }
      
      originalBody = originalBody.replace(/\n\n+/g, '\n\n').trim()
      
      if (!originalBody || originalBody === 'No content available') {
        originalBody = '[Email content not available]'
      }
      
      fullContent += `
        <br>
        <hr style="border: none; border-top: 1px solid #ccc; margin: 10px 0;">
        <div style="margin-top: 10px;">
          <details>
            <summary style="color: #666; font-size: 12px; cursor: pointer;">
              ••• Show original message
            </summary>
            <div style="border-left: 3px solid #ccc; padding-left: 10px; margin-top: 10px; color: #666; font-size: 12px;">
              <p><strong>From:</strong> ${originalFrom}</p>
              <p><strong>Date:</strong> ${originalDate}</p>
              <p><strong>Subject:</strong> ${originalSubject}</p>
              <div style="margin-top: 10px; color: #333; white-space: pre-wrap;">
                ${originalBody.replace(/\n/g, '<br>')}
              </div>
            </div>
          </details>
        </div>
      `
    }
    
    return `
      <html>
        <body>
          ${fullContent}
          <br>
          <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">
          <p style="color: #666; font-size: 12px; font-style: italic;">
            This draft was generated by AI Assistant and is ready for your review and sending.
          </p>
        </body>
      </html>
    `
  }

  /**
   * Determine email priority based on category
   */
  private determinePriority(category?: string): 'low' | 'normal' | 'high' {
    const urgentCategories = ['urgent', 'board', 'executive', 'crisis']
    const highCategories = ['donor', 'partner', 'vendor']
    
    if (!category) return 'normal'
    
    const lowerCategory = category.toLowerCase()
    
    if (urgentCategories.some(cat => lowerCategory.includes(cat))) {
      return 'high'
    } else if (highCategories.some(cat => lowerCategory.includes(cat))) {
      return 'high'
    }
    
    return 'normal'
  }

  /**
   * List drafts in AI Assistant folder
   */
  async listAIDrafts(): Promise<any[]> {
    try {
      const folderId = await this.ensureAIDraftsFolder()
      
      const messages = await this.graphClient
        .api(`/me/mailFolders/${folderId}/messages`)
        .select('id,subject,createdDateTime,isDraft,body')
        .filter('isDraft eq true')
        .orderby('createdDateTime desc')
        .get()

      return messages.value || []

    } catch (error) {
      console.error('Error listing AI drafts:', error)
      return []
    }
  }

  /**
   * Send a draft from the AI Assistant folder
   */
  async sendDraft(draftId: string): Promise<MailboxOperationResult> {
    try {
      await this.graphClient
        .api(`/me/messages/${draftId}/send`)
        .post({})

      return { success: true, draftId }

    } catch (error) {
      console.error('Error sending draft:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to send draft' 
      }
    }
  }

  /**
   * File emails from a thread into appropriate folder without creating drafts
   */
  async fileThreadEmails(threadId: string, userId: string): Promise<MailboxOperationResult> {
    try {
      console.log('Filing thread emails for:', threadId)
      
      // Get thread details  
      const { data: thread, error: threadError } = await this.supabase
        .from('email_threads')
        .select(`
          *,
          email_messages(
            id,
            subject,
            body,
            from_email,
            from_name,
            to_recipients,
            message_id,
            received_at,
            created_at
          )
        `)
        .eq('id', threadId)
        .eq('user_id', userId)
        .single()

      if (threadError || !thread) {
        console.error('Thread fetch error:', threadError)
        return { success: false, error: 'Thread not found: ' + (threadError?.message || 'Unknown error') }
      }

      // Determine the best folder name for this thread
      const topicName = await this.determineTopicName(thread)
      console.log('Determined topic name:', topicName)
      
      // Ensure the folder exists
      const topicFolderId = await this.ensureTopicFolder(topicName)
      console.log('Topic folder ID:', topicFolderId)

      // Move/copy all emails in the thread to the topic folder
      let movedCount = 0
      const failedMessages: string[] = []
      
      for (const message of thread.email_messages || []) {
        if (message.message_id) {
          try {
            console.log('Moving message to folder:', message.message_id)
            // Copy the message to topic folder (don't move, keep in original location too)
            await this.graphClient
              .api(`/me/messages/${message.message_id}/copy`)
              .post({
                destinationId: topicFolderId
              })
            movedCount++
          } catch (msgError: any) {
            console.warn(`Could not move message ${message.message_id}:`, msgError)
            failedMessages.push(message.message_id)
            
            // If the message wasn't found (404), it might have been deleted or moved
            // This is normal and shouldn't prevent other operations
            if (msgError.statusCode === 404) {
              console.log(`Message ${message.message_id} not found - may have been deleted or moved`)
            }
          }
        }
      }
      
      // Log summary of filing operation
      if (failedMessages.length > 0) {
        console.log(`Filed ${movedCount} messages successfully, ${failedMessages.length} failed (likely deleted/moved already)`)
      }

      const totalMessages = thread.email_messages?.length || 0
      const successMessage = movedCount === totalMessages 
        ? `Successfully filed ${movedCount} emails to "${topicName}" folder`
        : `Filed ${movedCount} of ${totalMessages} emails to "${topicName}" folder (some messages may have been already moved or deleted)`

      return {
        success: movedCount > 0, // Consider it successful if at least one message was moved
        folderId: topicFolderId,
        message: successMessage
      }

    } catch (error: any) {
      console.error('Error filing thread emails:', error)
      
      // Check if it's a token expiration error
      if (error?.statusCode === 401 || error?.code === 'InvalidAuthenticationToken') {
        return { 
          success: false, 
          error: 'Authentication token expired. Please sync your emails again to refresh authentication.',
          requiresSync: true
        }
      }
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to file emails' 
      }
    }
  }
}

/**
 * Utility function to create mailbox manager instance
 */
export async function createMailboxManager(accessToken: string): Promise<MailboxManager> {
  const manager = new MailboxManager(accessToken)
  await manager.initialize()
  return manager
}