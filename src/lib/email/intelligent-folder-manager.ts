import { MailboxActions } from '../microsoft-graph/mailbox-actions'
import { createClient } from '@/lib/supabase/server'
import { AIFolderCategorizer } from './ai-folder-categorizer'

interface FolderMapping {
  id: string
  name: string
  patterns: string[]
  folder_path: string
  priority: number
  is_active: boolean
  subfolder_rules?: {
    pattern: string
    subfolder: string
  }[]
}

interface EmailContext {
  subject: string
  from: string
  to: string[]
  body: string
  date: Date
}

export class IntelligentFolderManager {
  private mailboxActions: MailboxActions | null = null
  private userId: string = ''
  private folderMappings: FolderMapping[] = []
  private aiCategorizer: AIFolderCategorizer = new AIFolderCategorizer()

  async initialize(userId: string): Promise<void> {
    this.userId = userId
    this.mailboxActions = await MailboxActions.forUser(userId)
    await this.aiCategorizer.initialize(userId)
    await this.loadFolderMappings()
  }

  /**
   * Load folder mappings from database
   */
  private async loadFolderMappings(): Promise<void> {
    try {
      const supabase = await createClient()
      
      const { data: mappings, error } = await supabase
        .from('folder_mappings')
        .select('*')
        .eq('user_id', this.userId)
        .eq('is_active', true)
        .order('priority', { ascending: true })

      if (error) {
        console.error('Failed to load folder mappings:', error)
        // Fall back to default mappings
        await this.createDefaultMappings()
        return
      }

      this.folderMappings = mappings || []
      
      // If no mappings exist, create defaults
      if (this.folderMappings.length === 0) {
        await this.createDefaultMappings()
      }
    } catch (error) {
      console.error('Error loading folder mappings:', error)
      // Continue with empty mappings - will use AI fallback
      this.folderMappings = []
    }
  }

  /**
   * Create default folder mappings for new users
   */
  private async createDefaultMappings(): Promise<void> {
    const defaultMappings = [
      {
        name: 'IT Support',
        patterns: ['corptek', 'corp tek', 'helpdesk', 'it support', 'technical support'],
        folder_path: 'Vendors/CorpTek',
        priority: 10
      },
      {
        name: 'Budget & Fiscal',
        patterns: ['budget', 'fiscal', 'fy 24', 'fy 25', 'fy 26', 'fiscal year'],
        folder_path: 'Finance/Budget',
        priority: 20
      },
      {
        name: 'General Finance',
        patterns: ['financial', 'finance', 'accounting', 'expense', 'revenue', 'invoice', 'payment'],
        folder_path: 'Finance/General',
        priority: 30
      },
      {
        name: 'Board & Governance',
        patterns: ['board meeting', 'board member', 'governance', 'board of directors'],
        folder_path: 'Governance/Board',
        priority: 40
      },
      {
        name: 'Human Resources',
        patterns: ['hr', 'human resources', 'employee', 'personnel', 'hiring', 'recruitment'],
        folder_path: 'HR',
        priority: 50
      },
      {
        name: 'Legal & Compliance',
        patterns: ['legal', 'compliance', 'contract', 'agreement', 'policy'],
        folder_path: 'Legal',
        priority: 60
      },
      {
        name: 'Partnerships',
        patterns: ['partnership', 'partner', 'collaboration', 'mou', 'memorandum'],
        folder_path: 'Partnerships',
        priority: 70
      }
    ]

    const supabase = await createClient()
    
    for (const mapping of defaultMappings) {
      const { error } = await supabase
        .from('folder_mappings')
        .insert({
          user_id: this.userId,
          name: mapping.name,
          patterns: mapping.patterns,
          folder_path: mapping.folder_path,
          priority: mapping.priority,
          is_active: true
        })

      if (error) {
        console.error('Failed to create default mapping:', error)
      }
    }

    // Reload mappings after creation
    await this.loadFolderMappings()
  }

  /**
   * Determine the best folder for an email based on its content
   */
  async determineFolder(emailContext: EmailContext): Promise<string> {
    const { subject, from, body } = emailContext

    console.log(`🔍 Determining folder for email: "${subject}" from ${from}`)
    
    // Use AI-powered categorization as primary method
    try {
      console.log(`🤖 Using AI categorization for intelligent folder detection`)
      
      const result = await this.aiCategorizer.categorizeEmail(emailContext)
      
      console.log(`✅ AI Analysis Complete:`)
      console.log(`   Category: ${result.category}`)
      console.log(`   Client: ${result.client || 'None'}`)
      console.log(`   Project: ${result.project || 'None'}`)
      console.log(`   Vendor: ${result.vendor || 'None'}`)
      console.log(`   Confidence: ${result.confidence}`)
      console.log(`   Reasoning: ${result.reasoning}`)
      console.log(`📁 Final folder determined: ${result.folder_path}`)
      
      return result.folder_path
    } catch (error) {
      console.error('AI categorization failed:', error)
      console.log(`⚠️ Falling back to pattern matching`)
      
      // Fallback to pattern matching for critical emails
      return await this.fallbackPatternMatching(emailContext)
    }
  }

  /**
   * Fallback pattern matching for when AI fails
   */
  private async fallbackPatternMatching(emailContext: EmailContext): Promise<string> {
    const { subject, from, body } = emailContext
    const fullContent = `${subject} ${from} ${body}`.toLowerCase()

    console.log(`📋 Checking ${this.folderMappings.length} pattern mappings`)

    // Check each mapping in priority order
    for (const mapping of this.folderMappings) {
      for (const pattern of mapping.patterns) {
        if (fullContent.includes(pattern.toLowerCase())) {
          let folder = mapping.folder_path
          
          console.log(`✅ Pattern "${pattern}" matched! Base folder: ${folder}`)
          
          // Handle special cases like fiscal year subfolders
          if (mapping.name === 'Budget & Fiscal') {
            const fyMatch = fullContent.match(/fy\s*(\d{2,4})/i)
            if (fyMatch) {
              const year = fyMatch[1]
              const fullYear = year.length === 2 ? `20${year}` : year
              folder = `${folder}/FY${fullYear}`
              console.log(`📅 Added fiscal year subfolder: ${folder}`)
            }
          }
          
          console.log(`📁 Pattern-based folder determined: ${folder}`)
          return folder
        }
      }
    }

    console.log(`❌ No patterns matched, using generic archive`)
    return 'Archive/General'
  }

  /**
   * Use AI to categorize emails that don't match predefined patterns
   */
  private async categorizeWithAI(emailContext: EmailContext): Promise<string> {
    const { subject, from, body } = emailContext
    const fullContent = `${subject} ${body}`.toLowerCase()
    
    // Technology/IT keywords
    const techKeywords = [
      'server', 'network', 'firewall', 'database', 'software', 'hardware',
      'system', 'technical', 'technology', 'it', 'computer', 'security',
      'backup', 'maintenance', 'upgrade', 'patch', 'bug', 'error',
      'troubleshoot', 'support ticket', 'password', 'login', 'access',
      'vpn', 'wifi', 'email server', 'domain', 'hosting', 'cloud'
    ]
    
    // Finance keywords
    const financeKeywords = [
      'invoice', 'payment', 'billing', 'cost', 'budget', 'expense',
      'revenue', 'financial', 'accounting', 'receipt', 'transaction',
      'purchase', 'order', 'quote', 'estimate', 'contract'
    ]
    
    // Legal keywords
    const legalKeywords = [
      'legal', 'contract', 'agreement', 'terms', 'policy', 'compliance',
      'regulation', 'law', 'attorney', 'lawyer', 'litigation', 'patent',
      'trademark', 'copyright', 'intellectual property'
    ]
    
    // HR keywords
    const hrKeywords = [
      'employee', 'hiring', 'recruitment', 'interview', 'resume',
      'benefits', 'payroll', 'performance', 'training', 'onboarding',
      'termination', 'policy', 'handbook', 'vacation', 'pto'
    ]
    
    // Marketing keywords
    const marketingKeywords = [
      'marketing', 'campaign', 'social media', 'website', 'seo',
      'advertising', 'promotion', 'brand', 'content', 'analytics',
      'metrics', 'engagement', 'conversion', 'lead', 'prospect'
    ]
    
    // Check content against keyword categories
    if (techKeywords.some(keyword => fullContent.includes(keyword))) {
      return 'Technology'
    }
    
    if (financeKeywords.some(keyword => fullContent.includes(keyword))) {
      return 'Finance'
    }
    
    if (legalKeywords.some(keyword => fullContent.includes(keyword))) {
      return 'Legal'
    }
    
    if (hrKeywords.some(keyword => fullContent.includes(keyword))) {
      return 'HR'
    }
    
    if (marketingKeywords.some(keyword => fullContent.includes(keyword))) {
      return 'Marketing'
    }
    
    // Check sender domain for organizational context
    const domain = from.split('@')[1]?.toLowerCase() || ''
    
    if (domain.includes('gov')) return 'Government'
    if (domain.includes('edu')) return 'Education'
    if (domain.includes('.org') && !domain.includes('missionmutual')) return 'NonProfit'
    
    // Check for vendor patterns
    if (domain.includes('microsoft') || domain.includes('google') || 
        domain.includes('adobe') || domain.includes('salesforce')) {
      return 'Technology'
    }
    
    // Default to General
    return 'General'
  }

  /**
   * Map AI categories to folder paths
   */
  private mapCategoryToFolder(category: string): string {
    const categoryMap: Record<string, string> = {
      'Technology': 'Technology/General',
      'Finance': 'Finance/General',
      'Legal': 'Legal/General',
      'HR': 'HR/General',
      'Marketing': 'Marketing/General',
      'Government': 'External/Government',
      'Education': 'External/Education',
      'NonProfit': 'External/NonProfits',
      'General': 'Archive/General'
    }
    
    return categoryMap[category] || 'Archive/Uncategorized'
  }

  /**
   * Archive an email to the appropriate folder
   */
  async archiveToSmartFolder(
    messageId: string, 
    emailContext: EmailContext
  ): Promise<{ success: boolean; folder: string; error?: string }> {
    if (!this.mailboxActions) {
      return { 
        success: false, 
        folder: '', 
        error: 'Mailbox actions not initialized' 
      }
    }

    try {
      // Determine the best folder
      const folderPath = await this.determineFolder(emailContext)
      
      // Ensure folder exists (create if needed)
      const folderResult = await this.mailboxActions.ensureFolder(folderPath)
      if (!folderResult.success) {
        return {
          success: false,
          folder: folderPath,
          error: `Failed to ensure folder: ${folderResult.error}`
        }
      }

      // Move email to the folder
      const moveResult = await this.mailboxActions.moveToFolder(
        messageId,
        folderResult.folderId!
      )

      return {
        success: moveResult.success,
        folder: folderPath,
        error: moveResult.error
      }
    } catch (error) {
      console.error('Error in smart archive:', error)
      return {
        success: false,
        folder: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get suggested folders based on email content
   */
  async suggestFolders(emailContext: EmailContext): Promise<string[]> {
    const suggestions: string[] = []
    const { subject, from, body } = emailContext
    const fullContent = `${subject} ${from} ${body}`.toLowerCase()

    // Check all patterns and collect matches
    for (const mapping of IntelligentFolderManager.FOLDER_MAPPINGS) {
      const pattern = mapping.pattern
      const matches = typeof pattern === 'string' 
        ? fullContent.includes(pattern.toLowerCase())
        : pattern.test(fullContent)
      
      if (matches) {
        suggestions.push(mapping.folder)
      }
    }

    // Add AI suggestion if no matches
    if (suggestions.length === 0) {
      const aiCategory = await this.categorizeWithAI(emailContext)
      suggestions.push(this.mapCategoryToFolder(aiCategory))
    }

    return suggestions
  }

  /**
   * Add custom folder mapping
   */
  async addCustomMapping(name: string, patterns: string[], folderPath: string, priority: number = 100): Promise<boolean> {
    try {
      const supabase = await createClient()
      
      const { error } = await supabase
        .from('folder_mappings')
        .insert({
          user_id: this.userId,
          name,
          patterns,
          folder_path: folderPath,
          priority,
          is_active: true
        })

      if (error) {
        console.error('Failed to add custom mapping:', error)
        return false
      }

      // Reload mappings
      await this.loadFolderMappings()
      return true
    } catch (error) {
      console.error('Error adding custom mapping:', error)
      return false
    }
  }

  /**
   * Update existing folder mapping
   */
  async updateMapping(id: string, updates: Partial<FolderMapping>): Promise<boolean> {
    try {
      const supabase = await createClient()
      
      const { error } = await supabase
        .from('folder_mappings')
        .update(updates)
        .eq('id', id)
        .eq('user_id', this.userId)

      if (error) {
        console.error('Failed to update mapping:', error)
        return false
      }

      // Reload mappings
      await this.loadFolderMappings()
      return true
    } catch (error) {
      console.error('Error updating mapping:', error)
      return false
    }
  }

  /**
   * Delete folder mapping
   */
  async deleteMapping(id: string): Promise<boolean> {
    try {
      const supabase = await createClient()
      
      const { error } = await supabase
        .from('folder_mappings')
        .update({ is_active: false })
        .eq('id', id)
        .eq('user_id', this.userId)

      if (error) {
        console.error('Failed to delete mapping:', error)
        return false
      }

      // Reload mappings
      await this.loadFolderMappings()
      return true
    } catch (error) {
      console.error('Error deleting mapping:', error)
      return false
    }
  }

  /**
   * Get all folder mappings for user
   */
  async getFolderMappings(): Promise<FolderMapping[]> {
    return this.folderMappings
  }

  /**
   * Reload folder mappings from database
   */
  async reloadMappings(): Promise<void> {
    await this.loadFolderMappings()
  }

  /**
   * Get AI folder parameters
   */
  getFolderParameters() {
    return this.aiCategorizer.getFolderParameters()
  }

  /**
   * Update AI folder parameters
   */
  async updateFolderParameters(params: any): Promise<boolean> {
    return await this.aiCategorizer.updateParameters(params)
  }

  /**
   * Add new entity pattern (client, project, vendor)
   */
  async addEntityPattern(type: 'client' | 'project' | 'vendor', pattern: string): Promise<boolean> {
    return await this.aiCategorizer.addEntityPattern(type, pattern)
  }

  /**
   * Test AI categorization without applying it
   */
  async testCategorization(emailContext: EmailContext) {
    return await this.aiCategorizer.testCategorization(emailContext)
  }
}