import { createClient } from '@/lib/supabase/server'

interface EmailContext {
  subject: string
  from: string
  to: string[]
  body: string
  date: Date
}

interface FolderParameters {
  max_depth: number
  allowed_categories: string[]
  client_patterns: string[]
  project_patterns: string[]
  vendor_patterns: string[]
  special_rules: {
    fiscal_year_handling: boolean
    client_specific_folders: boolean
    project_specific_folders: boolean
  }
}

interface CategoryResult {
  category: string
  subcategory?: string
  client?: string
  project?: string
  vendor?: string
  confidence: number
  reasoning: string
  folder_path: string
}

export class AIFolderCategorizer {
  private userId: string = ''
  private parameters: FolderParameters = {
    max_depth: 3,
    allowed_categories: [
      'Finance',
      'Technology', 
      'Legal',
      'HR',
      'Marketing',
      'Operations',
      'Partnerships',
      'Projects',
      'Vendors',
      'Governance'
    ],
    client_patterns: [
      'biblionexus',
      'mission mutual',
      'faith comes by hearing'
    ],
    project_patterns: [
      'biblionexus',
      'digital bible platform',
      'scripture access'
    ],
    vendor_patterns: [
      'corptek',
      'microsoft',
      'zoom',
      'salesforce',
      'adobe'
    ],
    special_rules: {
      fiscal_year_handling: true,
      client_specific_folders: true,
      project_specific_folders: true
    }
  }

  async initialize(userId: string): Promise<void> {
    this.userId = userId
    await this.loadUserParameters()
  }

  private async loadUserParameters(): Promise<void> {
    try {
      const supabase = await createClient()
      
      const { data: userParams } = await supabase
        .from('folder_parameters')
        .select('*')
        .eq('user_id', this.userId)
        .single()

      if (userParams) {
        this.parameters = { ...this.parameters, ...userParams.parameters }
      }
    } catch (error) {
      console.log('Using default folder parameters')
    }
  }

  /**
   * Use AI to categorize email and determine folder structure
   */
  async categorizeEmail(emailContext: EmailContext): Promise<CategoryResult> {
    try {
      // Get learning context from user corrections and vector store
      const learningContext = await this.getLearningContext(emailContext)
      
      const prompt = this.buildCategorizationPrompt(emailContext, learningContext)
      
      // Call OpenAI API for categorization
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert email categorization system for executive email management. Learn from user corrections and organizational context. Return only valid JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
          max_tokens: 500
        })
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`)
      }

      const data = await response.json()
      const result = JSON.parse(data.choices[0].message.content)
      
      // Validate and build folder path
      const folderPath = this.buildFolderPath(result)
      
      return {
        ...result,
        folder_path: folderPath
      }
    } catch (error) {
      console.error('AI categorization failed:', error)
      return this.getFallbackCategory(emailContext)
    }
  }

  /**
   * Get learning context from user corrections and vector store
   */
  private async getLearningContext(emailContext: EmailContext): Promise<string> {
    try {
      const supabase = await import('@/lib/supabase/server').then(m => m.createClient())
      
      // Get user correction patterns
      const { data: corrections } = await supabase
        .rpc('get_folder_learning_context', { p_user_id: this.userId })
      
      // Get relevant organizational context from vector store
      let vectorContext = ''
      try {
        const { VectorStoreService } = await import('../vector-store/service')
        const vectorStore = new VectorStoreService()
        
        // Search for relevant organizational knowledge
        const searchQuery = `${emailContext.subject} ${emailContext.from} ${emailContext.body.substring(0, 500)}`
        const searchResults = await vectorStore.searchVectorStore(searchQuery, 3)
        
        if (searchResults.length > 0) {
          vectorContext = `
ORGANIZATIONAL CONTEXT (from previous emails and documents):
${searchResults.map(result => `- ${result.content}`).join('\n')}
`
        }
      } catch (error) {
        console.log('Vector store context unavailable:', error)
      }
      
      // Build learning context
      let learningContext = ''
      
      if (corrections && corrections.length > 0) {
        learningContext += `
USER CORRECTION PATTERNS (learn from these):
${corrections.map(c => `- When AI suggests "${c.suggested_folder}", user often corrects to "${c.pattern_value}"`).join('\n')}
`
      }
      
      return learningContext + vectorContext
    } catch (error) {
      console.error('Failed to get learning context:', error)
      return ''
    }
  }

  private buildCategorizationPrompt(emailContext: EmailContext, learningContext: string = ''): string {
    const { subject, from, body, date } = emailContext
    
    return `
You are an expert email categorization system for an executive's inbox management. Your goal is to create an intelligent, workable folder structure that helps the executive quickly find and organize emails by business purpose and context.

EMAIL TO ANALYZE:
SUBJECT: ${subject}
FROM: ${from}
DATE: ${date.toISOString()}
BODY: ${body.substring(0, 2500)}

EXECUTIVE CONTEXT:
You are organizing emails for a senior executive who needs to:
- Quickly locate emails by business function and context
- Track activities across different areas of responsibility
- Maintain organized records for follow-up and reference
- Balance detailed organization with practical usability

ORGANIZATIONAL PHILOSOPHY:
- Content and business purpose should drive folder structure
- Group related activities together regardless of communication tool
- Personnel matters belong in HR, financial matters in Finance, etc.
- Vendors and tools are secondary to the business purpose
- Create person-specific subfolders ONLY for activities directly about that individual
- General processes (onboarding, policies, training) should use functional subfolders
- Only create person folders for direct personnel actions: reviews, disciplinary, individual development

AVAILABLE CATEGORIES: ${this.parameters.allowed_categories.join(', ')}
MAXIMUM FOLDER DEPTH: ${this.parameters.max_depth} levels

COMMON FUNCTIONAL SUBCATEGORIES:
- HR: Personnel (individual actions), Onboarding, Policies, Training, Benefits, Recruiting
- Finance: Budget, Expenses, Revenue, Payroll, Audit, Planning
- Legal: Contracts, Compliance, Litigation, Policies, Intellectual Property
- Operations: General, Planning, Facilities, Vendors, Procedures

KNOWN ENTITIES:
- Clients: ${this.parameters.client_patterns.join(', ')}
- Projects: ${this.parameters.project_patterns.join(', ')}
- Vendors: ${this.parameters.vendor_patterns.join(', ')}

DECISION FRAMEWORK:
1. What is the PRIMARY business purpose of this email?
2. Is this about a specific individual's direct personnel action OR a general business process?
3. Does this need to be easily findable within a functional area?
4. How would an executive naturally look for this email later?

ENTITY EXTRACTION GUIDELINES:
- Only extract person names for direct individual actions (performance reviews, disciplinary actions, individual development)
- Do NOT extract person names for general processes (onboarding, policy updates, team communications)
- Project names should be extracted for project-specific communications
- Client names for client-specific work or relationships

EXAMPLES OF GOOD CATEGORIZATION:
- Performance review meeting notes → HR/Personnel/[EmployeeName] (direct individual action)
- New staff onboarding from BiblioNexus → HR/Onboarding (staff transition process)
- Staff names/email setup for new hires → HR/Onboarding (onboarding logistics)
- Budget planning email → Finance/Budget/[FiscalYear] (business purpose: Finance, context: planning cycle)
- Project status update → Projects/[ProjectName] (business purpose: project management)
- Vendor alert from tool → Technology/[VendorName] (business purpose: technology, context: vendor)
- Employee handbook update → HR/Policies (policy changes)
- John's disciplinary action → HR/Personnel/John (direct individual action)

RESPONSE FORMAT (JSON only):
{
  "category": "primary business category",
  "subcategory": "functional area like Personnel, Budget, Contracts",
  "entity": "specific person, project, client, or vendor name",
  "entity_type": "person|project|client|vendor",
  "confidence": 0.95,
  "reasoning": "explain why this categorization serves the executive's needs",
  "fiscal_year": "FY25 if applicable to financial matters"
}

${learningContext}

Think about the executive's needs, business context, and any correction patterns, then respond with JSON only:
`
  }

  private buildFolderPath(result: any): string {
    const { category, subcategory, entity, entity_type, fiscal_year } = result
    
    // Start with the primary business category
    let path = category
    
    // Add subcategory if provided (functional area)
    if (subcategory) {
      path = `${category}/${subcategory}`
    }
    
    // Add entity-specific folder if provided and rules allow
    if (entity && this.shouldCreateEntityFolder(entity_type)) {
      path = `${path}/${this.normalizeEntityName(entity)}`
    }
    
    // Add fiscal year for financial matters
    if (fiscal_year && this.parameters.special_rules.fiscal_year_handling) {
      path = `${path}/${fiscal_year}`
    }
    
    // Ensure we don't exceed max depth
    const pathParts = path.split('/')
    if (pathParts.length > this.parameters.max_depth) {
      path = pathParts.slice(0, this.parameters.max_depth).join('/')
    }
    
    return path
  }

  private shouldCreateEntityFolder(entityType: string): boolean {
    switch (entityType) {
      case 'person':
      case 'client':
        return this.parameters.special_rules.client_specific_folders
      case 'project':
        return this.parameters.special_rules.project_specific_folders
      case 'vendor':
        return this.parameters.special_rules.client_specific_folders
      default:
        return false
    }
  }

  private normalizeEntityName(name: string): string {
    // Convert to proper case and remove special characters
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
      .replace(/[^a-zA-Z0-9]/g, '')
  }

  private getFallbackCategory(emailContext: EmailContext): CategoryResult {
    // Simple fallback when AI fails - default to general archive
    return {
      category: 'Operations',
      subcategory: 'General',
      confidence: 0.1,
      reasoning: 'AI categorization failed - defaulting to Operations/General for manual review',
      folder_path: 'Operations/General'
    }
  }

  /**
   * Update folder parameters for user
   */
  async updateParameters(newParameters: Partial<FolderParameters>): Promise<boolean> {
    try {
      const supabase = await createClient()
      
      const updatedParams = { ...this.parameters, ...newParameters }
      
      await supabase
        .from('folder_parameters')
        .upsert({
          user_id: this.userId,
          parameters: updatedParams
        })
      
      this.parameters = updatedParams
      return true
    } catch (error) {
      console.error('Failed to update folder parameters:', error)
      return false
    }
  }

  /**
   * Get current folder parameters
   */
  getFolderParameters(): FolderParameters {
    return this.parameters
  }

  /**
   * Add new entity pattern (client, project, vendor)
   */
  async addEntityPattern(type: 'client' | 'project' | 'vendor', pattern: string): Promise<boolean> {
    const key = `${type}_patterns` as keyof FolderParameters
    const patterns = this.parameters[key] as string[]
    
    if (!patterns.includes(pattern.toLowerCase())) {
      patterns.push(pattern.toLowerCase())
      return await this.updateParameters({ [key]: patterns })
    }
    
    return true
  }

  /**
   * Test categorization without actually using it
   */
  async testCategorization(emailContext: EmailContext): Promise<CategoryResult> {
    return await this.categorizeEmail(emailContext)
  }

  /**
   * Learn from user corrections to improve future categorization
   */
  async learnFromCorrection(
    emailContext: EmailContext,
    aiSuggestion: string,
    userCorrection: string,
    reason?: string
  ): Promise<void> {
    try {
      // Extract patterns from the correction
      const patterns = this.extractPatternsFromCorrection(
        emailContext,
        aiSuggestion,
        userCorrection,
        reason
      )

      // Update entity patterns if new entities are discovered
      for (const pattern of patterns) {
        if (pattern.type === 'project' && pattern.entity) {
          await this.addEntityPattern('project', pattern.entity)
        } else if (pattern.type === 'client' && pattern.entity) {
          await this.addEntityPattern('client', pattern.entity)
        } else if (pattern.type === 'vendor' && pattern.entity) {
          await this.addEntityPattern('vendor', pattern.entity)
        }
      }

      console.log(`📚 Learned from correction: ${aiSuggestion} → ${userCorrection}`)
    } catch (error) {
      console.error('Failed to learn from correction:', error)
    }
  }

  private extractPatternsFromCorrection(
    emailContext: EmailContext,
    aiSuggestion: string,
    userCorrection: string,
    reason?: string
  ): Array<{ type: string; entity?: string; pattern: string }> {
    const patterns: Array<{ type: string; entity?: string; pattern: string }> = []
    
    // Extract project patterns
    if (userCorrection.includes('Projects/')) {
      const projectMatch = userCorrection.match(/Projects\/([^\/]+)/)
      if (projectMatch) {
        const projectName = projectMatch[1].toLowerCase()
        patterns.push({
          type: 'project',
          entity: projectName,
          pattern: projectName
        })
      }
    }

    // Extract client patterns
    if (userCorrection.includes('Clients/')) {
      const clientMatch = userCorrection.match(/Clients\/([^\/]+)/)
      if (clientMatch) {
        const clientName = clientMatch[1].toLowerCase()
        patterns.push({
          type: 'client',
          entity: clientName,
          pattern: clientName
        })
      }
    }

    // Extract vendor patterns
    if (userCorrection.includes('Vendors/')) {
      const vendorMatch = userCorrection.match(/Vendors\/([^\/]+)/)
      if (vendorMatch) {
        const vendorName = vendorMatch[1].toLowerCase()
        patterns.push({
          type: 'vendor',
          entity: vendorName,
          pattern: vendorName
        })
      }
    }

    return patterns
  }
}