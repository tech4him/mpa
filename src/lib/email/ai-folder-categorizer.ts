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
    const prompt = this.buildCategorizationPrompt(emailContext)
    
    try {
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
              content: 'You are an expert email categorization system for executive email management. Return only valid JSON.'
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

  private buildCategorizationPrompt(emailContext: EmailContext): string {
    const { subject, from, body, date } = emailContext
    
    return `
You are an expert email categorization system for an executive's inbox management. Your goal is to create an intelligent, workable folder structure that helps the executive quickly find and organize emails by business purpose and context.

EMAIL TO ANALYZE:
SUBJECT: ${subject}
FROM: ${from}
DATE: ${date.toISOString()}
BODY: ${body.substring(0, 1000)}

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
- Create person-specific subfolders for ongoing relationships and activities

AVAILABLE CATEGORIES: ${this.parameters.allowed_categories.join(', ')}
MAXIMUM FOLDER DEPTH: ${this.parameters.max_depth} levels
KNOWN ENTITIES:
- Clients: ${this.parameters.client_patterns.join(', ')}
- Projects: ${this.parameters.project_patterns.join(', ')}
- Vendors: ${this.parameters.vendor_patterns.join(', ')}

DECISION FRAMEWORK:
1. What is the PRIMARY business purpose of this email?
2. Is this about a specific person, project, or client relationship?
3. Does this need to be easily findable within a functional area?
4. How would an executive naturally look for this email later?

EXAMPLES OF GOOD CATEGORIZATION:
- Performance review meeting notes → HR/Personnel/[EmployeeName] (business purpose: HR, context: specific person)
- Budget planning email → Finance/Budget/[FiscalYear] (business purpose: Finance, context: planning cycle)
- Project status update → Projects/[ProjectName] (business purpose: project management)
- Vendor alert from tool → Technology/[VendorName] (business purpose: technology, context: vendor)

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

Think about the executive's needs and business context, then respond with JSON only:
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
}