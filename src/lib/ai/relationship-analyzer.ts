import { createClient } from '@/lib/supabase/server'

export interface RelationshipPattern {
  contact_email: string
  contact_name?: string
  organization?: string
  interaction_frequency: 'daily' | 'weekly' | 'monthly' | 'occasional'
  average_response_time: number // in hours
  typical_topics: string[]
  communication_style: {
    formality: 'formal' | 'casual' | 'mixed'
    preferred_time: string // e.g., "morning", "afternoon", "evening"
    response_expectation: 'immediate' | 'same_day' | 'next_day' | 'flexible'
  }
  recent_sentiment: 'positive' | 'neutral' | 'negative'
  last_interaction: Date
  total_interactions: number
  is_vip: boolean
  relationship_strength: number // 1-10
}

export async function analyzeRelationshipPatterns(userId: string): Promise<RelationshipPattern[]> {
  const supabase = await createClient()
  
  // Get contacts data directly for now
  const { data: contacts } = await supabase
    .from('contacts')
    .select('*')
    .eq('user_id', userId)
    .order('last_interaction', { ascending: false })
    .limit(50)

  if (!contacts || contacts.length === 0) {
    return []
  }

  // Get recent email threads for pattern analysis
  const contactEmails = contacts.map(c => c.email)
  const { data: threads } = await supabase
    .from('email_threads')
    .select('*')
    .eq('user_id', userId)
    .contains('participants', contactEmails)
    .gte('last_message_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()) // Last 90 days
    .order('last_message_date', { ascending: false })

  const patterns: RelationshipPattern[] = []

  for (const contact of contacts) {
    const contactThreads = threads?.filter(t => 
      t.participants.includes(contact.email)
    ) || []

    // Analyze interaction frequency
    const interactionFrequency = calculateInteractionFrequency(contactThreads)
    
    // Analyze response times (simplified for now)
    const avgResponseTime = 24 // Default to 24 hours
    
    // Extract typical topics
    const typicalTopics = extractTypicalTopics(contactThreads)
    
    // Determine communication style
    const communicationStyle = analyzeCommunicationStyle(contact.communication_preferences)
    
    // Calculate relationship strength
    const relationshipStrength = calculateRelationshipStrength({
      totalInteractions: contact.total_interactions,
      frequency: interactionFrequency,
      isVip: contact.is_vip,
      responseTime: avgResponseTime,
      projectInvolvement: 0 // Will implement later
    })

    patterns.push({
      contact_email: contact.email,
      contact_name: contact.name,
      organization: contact.organization,
      interaction_frequency: interactionFrequency,
      average_response_time: avgResponseTime,
      typical_topics: typicalTopics,
      communication_style: communicationStyle,
      recent_sentiment: 'neutral', // TODO: Implement sentiment analysis
      last_interaction: contact.last_interaction ? new Date(contact.last_interaction) : new Date(),
      total_interactions: contact.total_interactions,
      is_vip: contact.is_vip,
      relationship_strength: relationshipStrength
    })
  }

  return patterns
}

function calculateInteractionFrequency(threads: any[]): 'daily' | 'weekly' | 'monthly' | 'occasional' {
  if (threads.length === 0) return 'occasional'
  
  const dates = threads.map(t => new Date(t.last_message_date))
  const daysBetween = calculateAverageDaysBetween(dates)
  
  if (daysBetween <= 1) return 'daily'
  if (daysBetween <= 7) return 'weekly'
  if (daysBetween <= 30) return 'monthly'
  return 'occasional'
}

function calculateAverageDaysBetween(dates: Date[]): number {
  if (dates.length < 2) return Infinity
  
  dates.sort((a, b) => b.getTime() - a.getTime())
  let totalDays = 0
  
  for (let i = 0; i < dates.length - 1; i++) {
    const daysDiff = (dates[i].getTime() - dates[i + 1].getTime()) / (1000 * 60 * 60 * 24)
    totalDays += daysDiff
  }
  
  return totalDays / (dates.length - 1)
}

function calculateAverageResponseTime(interactionHistory: any): number {
  // TODO: Implement based on actual message timestamps
  // For now, return a default value
  return 24 // 24 hours default
}

function extractTypicalTopics(threads: any[]): string[] {
  const topics = new Set<string>()
  
  threads.forEach(thread => {
    if (thread.category) {
      topics.add(thread.category)
    }
    // Extract topics from metadata if available
    if (thread.metadata?.topics) {
      thread.metadata.topics.forEach((topic: string) => topics.add(topic))
    }
  })
  
  return Array.from(topics).slice(0, 5) // Top 5 topics
}

function analyzeCommunicationStyle(preferences: any): RelationshipPattern['communication_style'] {
  // Default style
  const defaultStyle = {
    formality: 'formal' as const,
    preferred_time: 'business_hours',
    response_expectation: 'same_day' as const
  }
  
  if (!preferences) return defaultStyle
  
  return {
    formality: preferences.formality || defaultStyle.formality,
    preferred_time: preferences.preferred_time || defaultStyle.preferred_time,
    response_expectation: preferences.response_expectation || defaultStyle.response_expectation
  }
}

function calculateRelationshipStrength(factors: {
  totalInteractions: number
  frequency: string
  isVip: boolean
  responseTime: number
  projectInvolvement: number
}): number {
  let score = 5 // Base score
  
  // Interaction volume
  if (factors.totalInteractions > 100) score += 2
  else if (factors.totalInteractions > 50) score += 1
  
  // Frequency
  if (factors.frequency === 'daily') score += 2
  else if (factors.frequency === 'weekly') score += 1
  
  // VIP status
  if (factors.isVip) score += 2
  
  // Quick responses
  if (factors.responseTime < 12) score += 1
  
  // Project involvement
  if (factors.projectInvolvement > 3) score += 1
  
  return Math.min(score, 10)
}