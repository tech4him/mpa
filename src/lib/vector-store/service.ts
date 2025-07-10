import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

interface EmailDocument {
  id: string
  subject: string
  content: string
  sender: string
  recipients: string[]
  date: string
  category: string
  priority: string
  threadId: string
}

interface DocumentMetadata {
  document_type: 'email' | 'document' | 'meeting' | 'project' | 'decision'
  project_id?: string
  sender?: string
  recipients?: string[]
  category?: string
  priority?: string
  thread_id?: string
  date?: string
}

export class VectorStoreService {
  private openai: OpenAI
  private vectorStoreId: string

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      organization: process.env.OPENAI_ORG_ID,
    })
    this.vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID!
  }

  async uploadEmailToVectorStore(
    emailDocument: EmailDocument,
    userId: string
  ): Promise<{ success: boolean; recordId?: string; error?: string }> {
    try {
      // Format email content for vector store
      const documentContent = this.formatEmailForVectorStore(emailDocument)
      
      // Store directly in our database for vector search
      // The OpenAI agents will use the vector store configured in the environment
      await this.storeVectorStoreReference(
        userId,
        emailDocument,
        documentContent
      )

      return { success: true, recordId: emailDocument.id }
    } catch (error) {
      console.error('Error uploading email to vector store:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  private formatEmailForVectorStore(email: EmailDocument): string {
    return `Email Document - ${email.subject}

From: ${email.sender}
To: ${email.recipients.join(', ')}
Date: ${email.date}
Category: ${email.category}
Priority: ${email.priority}
Thread ID: ${email.threadId}

Subject: ${email.subject}

Content:
${email.content}

---
This email is part of Mission Mutual's organizational knowledge base.
Thread: ${email.threadId}
Document Type: email
Category: ${email.category}
`
  }

  private async storeVectorStoreReference(
    userId: string,
    email: EmailDocument,
    documentContent: string
  ): Promise<void> {
    const supabase = await createClient()
    
    const metadata: DocumentMetadata = {
      document_type: 'email',
      sender: email.sender,
      recipients: email.recipients,
      category: email.category,
      priority: email.priority,
      thread_id: email.threadId,
      date: email.date,
    }

    await supabase
      .from('organizational_knowledge')
      .insert({
        document_type: 'email',
        content: documentContent,
        metadata,
        vector_store_id: this.vectorStoreId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
  }

  async searchVectorStore(
    query: string,
    limit: number = 5
  ): Promise<Array<{ content: string; metadata: any }>> {
    try {
      // Note: Direct vector store search via API is not available
      // This would typically be done through the assistant/agent
      // For now, we'll search our database records
      const supabase = await createClient()
      
      const { data: results } = await supabase
        .from('organizational_knowledge')
        .select('content, metadata')
        .textSearch('content', query)
        .limit(limit)

      return results || []
    } catch (error) {
      console.error('Error searching vector store:', error)
      return []
    }
  }

  async shouldUploadEmail(email: EmailDocument, classification?: any): Promise<boolean> {
    // If we have classification data, respect it
    if (classification) {
      return classification.should_index && classification.is_relevant
    }
    
    // Fallback to original criteria for emails without classification
    const significantCategories = ['VIP_CRITICAL', 'ACTION_REQUIRED', 'FINANCIAL', 'MEETING_REQUEST']
    const highPriorityEmails = email.priority === 'high'
    const significantLength = email.content.length > 200
    
    // Upload if it's a significant category, high priority, or substantial content
    return (
      significantCategories.includes(email.category) ||
      highPriorityEmails ||
      significantLength
    )
  }

  async uploadProjectDocument(
    content: string,
    title: string,
    projectId: string,
    documentType: DocumentMetadata['document_type'] = 'document'
  ): Promise<{ success: boolean; recordId?: string; error?: string }> {
    try {
      const documentContent = `${title}

${content}

---
Document Type: ${documentType}
Project ID: ${projectId}
Mission Mutual Organizational Knowledge
`

      // Store in database
      const supabase = await createClient()
      const { data: record } = await supabase
        .from('organizational_knowledge')
        .insert({
          document_type: documentType,
          content: documentContent,
          metadata: {
            document_type: documentType,
            project_id: projectId,
            title,
          },
          vector_store_id: this.vectorStoreId,
          project_id: projectId,
        })
        .select('id')
        .single()

      return { success: true, recordId: record?.id }
    } catch (error) {
      console.error('Error uploading document to vector store:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }
}