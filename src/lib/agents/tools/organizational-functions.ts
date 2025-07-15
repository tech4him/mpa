import { createClient } from '@/lib/supabase/server'
import { VectorStoreService } from '@/lib/vector-store/service'

// Initialize vector store service lazily to avoid environment variable issues
let vectorStoreService: VectorStoreService | null = null
function getVectorStoreService(): VectorStoreService {
  if (!vectorStoreService) {
    vectorStoreService = new VectorStoreService()
  }
  return vectorStoreService
}

// Pure function implementations that can be called directly or wrapped in tools

export async function searchProjectContext({ query }: { query: string }) {
  console.log('searchProjectContext called with query:', query)
  try {
    const supabase = await createClient()
    
    // Parse query for specific project names and email addresses
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
    const participants = query.match(emailRegex) || []
    
    // Try to search vector store for project context, but continue if it fails
    let vectorResults = null
    try {
      vectorResults = await getVectorStoreService().searchDocuments(query, {
        filter: {
          document_type: 'project'
        },
        topK: 5
      })
    } catch (vectorError) {
      console.log('Vector store search failed, continuing with database search:', vectorError.message)
    }
    
    // Search for projects in database that might match the query
    const { data: projectMatches } = await supabase
      .from('project_context')
      .select('*')
      .textSearch('project_name', query.replace(/[^\w\s]/g, ''))
      .limit(3)
    
    // Search for projects involving participants if any email addresses found
    let participantProjects = []
    if (participants.length > 0) {
      const { data } = await supabase
        .from('project_context')
        .select('*')
        .overlaps('team_members', participants)
        .limit(3)
      
      participantProjects = data || []
    }
    
    return {
      vectorResults: vectorResults.documents,
      projectMatches: projectMatches || [],
      participantProjects: participantProjects,
      participantsFound: participants,
      relevanceScore: vectorResults.relevanceScore
    }
  } catch (error) {
    console.error('Error searching project context:', error)
    return {
      error: 'Failed to search project context',
      vectorResults: [],
      projectMatches: [],
      participantProjects: [],
      participantsFound: []
    }
  }
}

export async function searchRelationshipHistory({ 
  contacts, 
  timeframe = 'last_6_months' 
}: { 
  contacts: string[]
  timeframe?: 'last_7_days' | 'last_30_days' | 'last_3_months' | 'last_6_months' | 'last_year'
}) {
  try {
    const supabase = await createClient()
    
    // Calculate date range
    const timeframeMap = {
      'last_7_days': 7,
      'last_30_days': 30,
      'last_3_months': 90,
      'last_6_months': 180,
      'last_year': 365
    }
    
    const daysBack = timeframeMap[timeframe] || 180
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    
    // Get relationship intelligence
    const { data: relationships } = await supabase
      .from('relationship_intelligence')
      .select(`
        *,
        contacts!inner(email, name, organization, is_vip, total_interactions, last_interaction)
      `)
      .in('contacts.email', contacts)
    
    // Get recent thread interactions
    const { data: threads } = await supabase
      .from('email_threads')
      .select('*')
      .contains('participants', contacts)
      .gte('last_message_date', startDate.toISOString())
      .order('last_message_date', { ascending: false })
    
    // Analyze interaction patterns
    const interactionAnalysis = analyzeInteractionPatterns(threads || [])
    
    return {
      relationships: relationships || [],
      recentThreads: threads || [],
      interactionAnalysis,
      communicationPatterns: extractCommunicationPatterns(relationships || []),
      timeframeDays: daysBack
    }
  } catch (error) {
    console.error('Error searching relationship history:', error)
    return {
      error: 'Failed to search relationship history',
      relationships: [],
      recentThreads: [],
      interactionAnalysis: {},
      communicationPatterns: {}
    }
  }
}

export async function verifyOrganizationalFacts({ 
  claims, 
  context = '' 
}: { 
  claims: string[]
  context?: string 
}) {
  try {
    const verifications = await Promise.all(
      claims.map(async (claim) => {
        // Search vector store for supporting evidence
        const evidence = await getVectorStoreService().searchDocuments(claim, {
          topK: 3
        })
        
        // Calculate verification confidence
        const confidence = evidence.relevanceScore || 0
        const verified = confidence > 0.7
        
        return {
          claim,
          verified,
          confidence,
          evidence: evidence.documents,
          supportingContext: evidence.documents.slice(0, 2).map(doc => doc.content)
        }
      })
    )
    
    return {
      verifications,
      overallConfidence: verifications.reduce((acc, v) => acc + v.confidence, 0) / verifications.length,
      contextProvided: context || null
    }
  } catch (error) {
    console.error('Error verifying organizational facts:', error)
    return {
      error: 'Failed to verify organizational facts',
      verifications: [],
      overallConfidence: 0
    }
  }
}

export async function getEmailThreadContext({ 
  threadId, 
  includeHistory = true 
}: { 
  threadId: string
  includeHistory?: boolean 
}) {
  console.log('getEmailThreadContext called with threadId:', threadId)
  try {
    const supabase = await createClient()
    
    // Get thread details
    const { data: thread } = await supabase
      .from('email_threads')
      .select('*')
      .eq('id', threadId)
      .single()
    
    if (!thread) {
      return { error: 'Thread not found' }
    }
    
    // Get messages if requested
    let messages = []
    if (includeHistory) {
      const { data: messagesData } = await supabase
        .from('email_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('sent_date', { ascending: true })
      
      messages = messagesData || []
    }
    
    // Get related tasks
    const { data: tasks } = await supabase
      .from('extracted_tasks')
      .select('*')
      .eq('thread_id', threadId)
    
    // Get drafts
    const { data: drafts } = await supabase
      .from('email_drafts')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
    
    // Get participant intelligence
    const participantIntelligence = await getParticipantIntelligence(thread.participants)
    
    return {
      thread,
      messages,
      tasks: tasks || [],
      drafts: drafts || [],
      participantIntelligence,
      messageCount: messages.length,
      hasOngoingTasks: (tasks || []).some(task => task.status === 'pending'),
      lastActivity: thread.last_message_date
    }
  } catch (error) {
    console.error('Error getting email thread context:', error)
    return {
      error: 'Failed to get email thread context',
      thread: null,
      messages: [],
      tasks: [],
      drafts: []
    }
  }
}

export async function updateOrganizationalMemory({ 
  documentType, 
  content, 
  metadata, 
  significance = 0.5 
}: {
  documentType: 'email' | 'decision' | 'project' | 'meeting' | 'relationship' | 'briefing'
  content: string
  metadata: {
    source?: string
    priority?: number
    tags?: string[]
    project_name?: string
    participants?: string[]
    briefingDate?: string
  }
  significance?: number
}) {
  try {
    const supabase = await createClient()
    
    // Only store significant information
    if (significance < 0.3) {
      return {
        stored: false,
        reason: 'Information below significance threshold'
      }
    }
    
    // Store in organizational knowledge table
    const { data: knowledge, error } = await supabase
      .from('organizational_knowledge')
      .insert({
        document_type: documentType,
        content,
        metadata: {
          source: metadata?.source || 'email_interaction',
          priority: metadata?.priority || 3,
          tags: metadata?.tags || [],
          project_name: metadata?.project_name || '',
          participants: metadata?.participants || [],
          briefingDate: metadata?.briefingDate,
          significance,
          created_by: 'ai_agent'
        }
      })
      .select()
      .single()
    
    if (error) throw error
    
    // Also store in vector store for search
    await getVectorStoreService().storeDocument(content, {
      documentType,
      significance,
      source: metadata?.source || 'email_interaction',
      priority: metadata?.priority || 3,
      tags: metadata?.tags || [],
      project_name: metadata?.project_name || '',
      participants: metadata?.participants || []
    })
    
    return {
      stored: true,
      knowledgeId: knowledge.id,
      significance,
      documentType
    }
  } catch (error) {
    console.error('Error updating organizational memory:', error)
    return {
      error: 'Failed to update organizational memory',
      stored: false
    }
  }
}

// Helper functions
function analyzeInteractionPatterns(threads: any[]) {
  if (threads.length === 0) return {}
  
  const patterns = {
    totalThreads: threads.length,
    averageMessagesPerThread: threads.reduce((acc, t) => acc + t.message_count, 0) / threads.length,
    priorityDistribution: {},
    categoryDistribution: {},
    timePattern: {}
  }
  
  // Analyze priority distribution
  threads.forEach(thread => {
    const priority = thread.priority || 3
    patterns.priorityDistribution[priority] = (patterns.priorityDistribution[priority] || 0) + 1
  })
  
  // Analyze category distribution
  threads.forEach(thread => {
    const category = thread.category || 'UNKNOWN'
    patterns.categoryDistribution[category] = (patterns.categoryDistribution[category] || 0) + 1
  })
  
  return patterns
}

function extractCommunicationPatterns(relationships: any[]) {
  const patterns = {}
  
  relationships.forEach(rel => {
    const contact = rel.contacts
    patterns[contact.email] = {
      name: contact.name,
      organization: contact.organization,
      isVip: contact.is_vip,
      totalInteractions: contact.total_interactions,
      lastInteraction: contact.last_interaction,
      communicationPreferences: rel.communication_preferences || {},
      projectInvolvement: rel.project_involvement || []
    }
  })
  
  return patterns
}

async function getParticipantIntelligence(participants: string[]) {
  const supabase = await createClient()
  
  const { data: contacts } = await supabase
    .from('contacts')
    .select('*')
    .in('email', participants)
  
  const intelligence = {}
  
  for (const contact of contacts || []) {
    intelligence[contact.email] = {
      name: contact.name,
      organization: contact.organization,
      isVip: contact.is_vip,
      vipTier: contact.vip_tier,
      totalInteractions: contact.total_interactions,
      lastInteraction: contact.last_interaction,
      communicationPreferences: contact.communication_preferences
    }
  }
  
  return intelligence
}