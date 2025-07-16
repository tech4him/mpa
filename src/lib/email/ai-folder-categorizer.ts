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
Analyze this email and categorize it for intelligent folder organization:

SUBJECT: ${subject}
FROM: ${from}
DATE: ${date.toISOString()}
BODY: ${body.substring(0, 1000)}

CATEGORIZATION RULES:
1. Choose ONE primary category from: ${this.parameters.allowed_categories.join(', ')}
2. Identify specific client/project/vendor if applicable
3. Maximum folder depth: ${this.parameters.max_depth} levels
4. Known clients: ${this.parameters.client_patterns.join(', ')}
5. Known projects: ${this.parameters.project_patterns.join(', ')}
6. Known vendors: ${this.parameters.vendor_patterns.join(', ')}

SPECIAL HANDLING:
- Finance emails: Extract fiscal year if mentioned (FY24, FY25, etc.)
- Technology emails: Identify if from known vendor or general tech
- Project emails: Match to known projects or create "Projects/[ProjectName]"
- Vendor emails: Match to known vendors or create "Vendors/[VendorName]"
- HR emails: Extract employee/person names for Personnel subfolders
- Legal emails: Extract case/contract names for specific subfolders

RESPONSE FORMAT (JSON only):
{
  "category": "primary category",
  "subcategory": "Personnel for HR, Budget for Finance, etc.",
  "client": "client name if identified",
  "project": "project name if identified", 
  "vendor": "vendor name if identified",
  "person": "employee/person name for HR emails",
  "confidence": 0.95,
  "reasoning": "brief explanation of categorization",
  "fiscal_year": "FY25 if applicable"
}

FOLDER PATH EXAMPLES:
- Budget email about FY25 → Finance/Budget/FY25
- Zoom network alert → Technology/Zoom
- BiblioNexus project email → Projects/BiblioNexus
- CorpTek support → Vendors/CorpTek
- Julie Riggs performance review → HR/Personnel/JulieRiggs
- General HR email → HR/General
- Legal contract review → Legal/Contracts
- Board meeting notes → Governance/Board

Analyze and respond with JSON only:
`
  }

  private buildFolderPath(result: any): string {
    const { category, subcategory, client, project, vendor, person, fiscal_year } = result
    
    let path = category
    
    // Content-focused categories should prioritize the category over vendor/client
    const contentFocusedCategories = ['HR', 'Legal', 'Finance', 'Governance', 'Operations']
    
    if (contentFocusedCategories.includes(category)) {
      // For content-focused categories, use category as primary structure
      if (subcategory) {
        path = `${category}/${subcategory}`
      } else {
        path = `${category}/General`
      }
      
      // Add person-specific subfolder for HR (Personnel/JohnDoe)
      if (person && category === 'HR' && this.parameters.special_rules.client_specific_folders) {
        path = `${path}/${this.normalizeEntityName(person)}`
      }
      // Add entity-specific subfolder for other content categories
      else if (client && this.parameters.special_rules.client_specific_folders) {
        path = `${path}/${this.normalizeEntityName(client)}`
      }
    } else {
      // For other categories, prioritize specific entity types
      if (vendor && this.parameters.special_rules.client_specific_folders) {
        path = `Vendors/${this.normalizeEntityName(vendor)}`
      } else if (project && this.parameters.special_rules.project_specific_folders) {
        path = `Projects/${this.normalizeEntityName(project)}`
      } else if (client && this.parameters.special_rules.client_specific_folders) {
        path = `Clients/${this.normalizeEntityName(client)}`
      } else if (subcategory) {
        path = `${category}/${subcategory}`
      } else {
        path = `${category}/General`
      }
    }
    
    // Add fiscal year handling
    if (fiscal_year && this.parameters.special_rules.fiscal_year_handling) {
      if (category === 'Finance') {
        path = `${path}/${fiscal_year}`
      }
    }
    
    // Ensure max depth
    const pathParts = path.split('/')
    if (pathParts.length > this.parameters.max_depth) {
      path = pathParts.slice(0, this.parameters.max_depth).join('/')
    }
    
    return path
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
    const { subject, from } = emailContext
    
    // Simple fallback logic
    let category = 'General'
    let folder_path = 'Archive/General'
    
    if (from.includes('corptek')) {
      category = 'Technology'
      folder_path = 'Vendors/CorpTek'
    } else if (subject.toLowerCase().includes('budget') || subject.toLowerCase().includes('fiscal')) {
      category = 'Finance'
      folder_path = 'Finance/Budget'
    } else if (subject.toLowerCase().includes('review') || subject.toLowerCase().includes('performance') || 
               subject.toLowerCase().includes('hr') || subject.toLowerCase().includes('personnel')) {
      category = 'HR'
      folder_path = 'HR/Personnel'
    }
    
    return {
      category,
      confidence: 0.3,
      reasoning: 'Fallback categorization due to AI failure',
      folder_path
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