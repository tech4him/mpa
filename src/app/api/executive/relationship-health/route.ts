import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Analyze relationship health based on email patterns
    const healthResults = await analyzeRelationshipHealth(supabase, user.id)

    return NextResponse.json({
      success: true,
      relationships_analyzed: healthResults.analyzed,
      relationships_updated: healthResults.updated,
      health_summary: healthResults.summary
    })

  } catch (error) {
    console.error('Relationship health analysis error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze relationship health' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get relationship health data
    const { data: relationships } = await supabase
      .from('relationship_health')
      .select('*')
      .eq('user_id', user.id)
      .order('importance_score', { ascending: false })

    return NextResponse.json({
      relationships: relationships || [],
      summary: {
        total: relationships?.length || 0,
        healthy: relationships?.filter(r => r.health_status === 'healthy').length || 0,
        at_risk: relationships?.filter(r => r.health_status === 'at_risk').length || 0,
        cold: relationships?.filter(r => r.health_status === 'cold').length || 0
      }
    })

  } catch (error) {
    console.error('Get relationship health error:', error)
    return NextResponse.json(
      { error: 'Failed to get relationship health' },
      { status: 500 }
    )
  }
}

async function analyzeRelationshipHealth(supabase: any, userId: string) {
  // Get all contacts from email communications
  const { data: emailContacts } = await supabase
    .from('email_messages')
    .select('from_email, from_name, to_recipients, sent_date')
    .eq('user_id', userId)
    .order('sent_date', { ascending: false })

  if (!emailContacts || emailContacts.length === 0) {
    return { analyzed: 0, updated: 0, summary: { healthy: 0, at_risk: 0, cold: 0 } }
  }

  // Analyze communication patterns
  const contactPatterns = analyzeContactPatterns(emailContacts, userId)

  let updated = 0
  const summary = { healthy: 0, at_risk: 0, cold: 0 }

  // Update relationship health for each contact
  for (const [contactEmail, pattern] of Object.entries(contactPatterns)) {
    const healthData = calculateHealthScore(pattern as any)
    
    // Upsert relationship health record
    const { data: upserted } = await supabase
      .from('relationship_health')
      .upsert({
        user_id: userId,
        contact_email: contactEmail,
        contact_name: (pattern as any).name,
        last_interaction_date: (pattern as any).lastInteraction,
        interaction_frequency: (pattern as any).frequency,
        health_score: healthData.score,
        health_status: healthData.status,
        importance_score: (pattern as any).importance,
        communication_pattern: {
          total_interactions: (pattern as any).totalInteractions,
          avg_response_time: (pattern as any).avgResponseTime,
          interaction_trend: (pattern as any).trend
        }
      }, {
        onConflict: 'user_id,contact_email'
      })
      .select()

    if (upserted && upserted.length > 0) {
      updated++
      summary[healthData.status as keyof typeof summary]++
    }
  }

  return {
    analyzed: Object.keys(contactPatterns).length,
    updated,
    summary
  }
}

function analyzeContactPatterns(emails: any[], userEmail: string) {
  const patterns: Record<string, any> = {}

  emails.forEach(email => {
    const contacts = []
    
    // Add sender if not the user
    if (email.from_email !== userEmail) {
      contacts.push({
        email: email.from_email,
        name: email.from_name,
        date: email.sent_date,
        type: 'received'
      })
    }
    
    // Add recipients if user is sender
    if (email.from_email === userEmail && email.to_recipients) {
      email.to_recipients.forEach((recipient: string) => {
        if (recipient !== userEmail) {
          contacts.push({
            email: recipient,
            name: recipient.split('@')[0], // Basic name extraction
            date: email.sent_date,
            type: 'sent'
          })
        }
      })
    }

    // Process each contact
    contacts.forEach(contact => {
      if (!patterns[contact.email]) {
        patterns[contact.email] = {
          name: contact.name,
          interactions: [],
          totalInteractions: 0,
          lastInteraction: null,
          firstInteraction: null
        }
      }

      patterns[contact.email].interactions.push({
        date: contact.date,
        type: contact.type
      })
      patterns[contact.email].totalInteractions++
      
      const interactionDate = new Date(contact.date)
      if (!patterns[contact.email].lastInteraction || interactionDate > new Date(patterns[contact.email].lastInteraction)) {
        patterns[contact.email].lastInteraction = contact.date
      }
      if (!patterns[contact.email].firstInteraction || interactionDate < new Date(patterns[contact.email].firstInteraction)) {
        patterns[contact.email].firstInteraction = contact.date
      }
    })
  })

  // Calculate additional metrics for each contact
  Object.keys(patterns).forEach(email => {
    const pattern = patterns[email]
    
    // Calculate interaction frequency
    const daysSinceFirst = Math.max(1, Math.ceil((new Date().getTime() - new Date(pattern.firstInteraction).getTime()) / (1000 * 60 * 60 * 24)))
    pattern.frequency = pattern.totalInteractions / daysSinceFirst
    
    // Calculate days since last interaction
    pattern.daysSinceLastInteraction = Math.ceil((new Date().getTime() - new Date(pattern.lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
    
    // Calculate importance score based on interaction frequency and recency
    pattern.importance = Math.min(10, Math.max(1, 
      (pattern.totalInteractions * 0.3) + 
      (pattern.frequency * 100) + 
      (pattern.daysSinceLastInteraction > 30 ? -2 : 0)
    ))
    
    // Calculate trend (increasing/decreasing interactions)
    const recentInteractions = pattern.interactions
      .filter((i: any) => new Date(i.date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .length
    const olderInteractions = pattern.interactions
      .filter((i: any) => {
        const date = new Date(i.date)
        return date <= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) && 
               date > new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      })
      .length
    
    pattern.trend = recentInteractions > olderInteractions ? 'increasing' : 
                   recentInteractions < olderInteractions ? 'decreasing' : 'stable'
  })

  return patterns
}

function calculateHealthScore(pattern: any) {
  let score = 0.5 // Base score
  
  // Frequency factor (more frequent = healthier)
  if (pattern.frequency > 0.1) score += 0.3 // Daily interactions
  else if (pattern.frequency > 0.03) score += 0.2 // Weekly interactions
  else if (pattern.frequency > 0.01) score += 0.1 // Monthly interactions
  
  // Recency factor (more recent = healthier)
  if (pattern.daysSinceLastInteraction <= 7) score += 0.2
  else if (pattern.daysSinceLastInteraction <= 30) score += 0.1
  else if (pattern.daysSinceLastInteraction <= 90) score -= 0.1
  else score -= 0.3
  
  // Trend factor
  if (pattern.trend === 'increasing') score += 0.1
  else if (pattern.trend === 'decreasing') score -= 0.1
  
  // Importance factor
  if (pattern.importance >= 8) score += 0.1
  else if (pattern.importance >= 6) score += 0.05
  
  // Normalize score
  score = Math.max(0, Math.min(1, score))
  
  // Determine status
  let status = 'healthy'
  if (score < 0.3) status = 'cold'
  else if (score < 0.6) status = 'at_risk'
  
  return { score, status }
}