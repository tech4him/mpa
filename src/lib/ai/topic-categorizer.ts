import { EmailThread, EmailMessage } from '@/types'
import { TopicGroup, EmailBriefingItem } from '@/types/briefing'

const TOPIC_KEYWORDS = {
  'Financial Operations': [
    'budget', 'financial', 'revenue', 'expense', 'payment', 'invoice', 
    'accounting', 'treasury', 'fund', 'donation', 'banking', 'ach',
    'transfer', 'contribution', 'fiscal', 'audit', 'reconciliation'
  ],
  'Personnel and HR': [
    'employee', 'staff', 'hiring', 'onboarding', 'payroll', 'benefits',
    'vacation', 'time off', 'performance', 'review', 'training',
    'personnel', 'hr', 'human resources', 'recruitment', 'termination'
  ],
  'Project Management': [
    'project', 'milestone', 'deadline', 'deliverable', 'timeline',
    'roadmap', 'implementation', 'launch', 'phase', 'sprint',
    'development', 'progress', 'status update', 'completion'
  ],
  'Technology and IT': [
    'server', 'network', 'software', 'hardware', 'security', 'backup',
    'system', 'upgrade', 'maintenance', 'technical', 'support', 'incident',
    'password', 'access', 'vpn', 'cloud', 'database', 'integration'
  ],
  'Vendor and Partner Relations': [
    'vendor', 'supplier', 'partner', 'contract', 'agreement', 'renewal',
    'negotiation', 'proposal', 'rfp', 'service provider', 'consultant',
    'collaboration', 'partnership', 'licensing'
  ],
  'Legal and Compliance': [
    'legal', 'compliance', 'regulation', 'policy', 'terms', 'contract',
    'agreement', 'liability', 'risk', 'audit', 'governance', 'ethics',
    'confidential', 'nda', 'dispute', 'litigation'
  ],
  'Strategic Planning': [
    'strategy', 'planning', 'vision', 'mission', 'goals', 'objectives',
    'initiative', 'transformation', 'innovation', 'roadmap', 'forecast',
    'analysis', 'market', 'competition', 'growth'
  ],
  'Operations and Facilities': [
    'facility', 'building', 'maintenance', 'operations', 'logistics',
    'inventory', 'supplies', 'equipment', 'safety', 'security',
    'utilities', 'lease', 'property', 'workspace'
  ]
}

export function categorizeEmailsByTopic(
  threads: EmailThread[], 
  messages: EmailMessage[]
): TopicGroup[] {
  const messagesByThread = messages.reduce((acc, msg) => {
    if (!acc[msg.thread_id]) acc[msg.thread_id] = []
    acc[msg.thread_id].push(msg)
    return acc
  }, {} as Record<string, EmailMessage[]>)

  const topicGroups: Record<string, TopicGroup> = {}
  const uncategorized: EmailBriefingItem[] = []

  threads.forEach(thread => {
    const threadMessages = messagesByThread[thread.id] || []
    const latestMessage = threadMessages[0]
    
    const emailItem: EmailBriefingItem = {
      id: thread.id,
      thread_id: thread.thread_id,
      subject: thread.subject,
      from: {
        email: latestMessage?.from_email || extractEmailFromParticipants(thread.participants),
        name: latestMessage?.from_name || undefined
      },
      preview: getPreview(latestMessage?.body || thread.snippet || thread.subject),
      received_at: new Date(thread.last_message_date),
      status: thread.status === 'active' ? 'unread' : 'read',
      priority: thread.priority || 3
    }

    const topic = determineTopicFromContent(thread, threadMessages)
    
    if (topic) {
      if (!topicGroups[topic]) {
        topicGroups[topic] = {
          title: topic,
          priority: 'medium',
          count: 0,
          emails: []
        }
      }
      topicGroups[topic].emails.push(emailItem)
      topicGroups[topic].count++
    } else {
      uncategorized.push(emailItem)
    }
  })

  // Add uncategorized if any
  if (uncategorized.length > 0) {
    topicGroups['Miscellaneous'] = {
      title: 'Miscellaneous',
      priority: 'low',
      count: uncategorized.length,
      emails: uncategorized
    }
  }

  // Convert to array and sort by priority
  return Object.values(topicGroups).map(group => {
    // Determine group priority based on content
    group.priority = determineGroupPriority(group)
    // Add suggested actions based on topic
    group.suggestedActions = getSuggestedActions(group.title)
    return group
  }).sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })
}

function determineTopicFromContent(
  thread: EmailThread, 
  messages: EmailMessage[]
): string | null {
  // Use thread subject, snippet, category, and any available message content
  const messageContent = messages.map(m => m.body).join(' ')
  const searchText = `${thread.subject} ${thread.snippet || ''} ${thread.category || ''} ${messageContent}`.toLowerCase()
  
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const matchCount = keywords.filter(keyword => 
      searchText.includes(keyword.toLowerCase())
    ).length
    
    if (matchCount >= 2 || (matchCount === 1 && keywords.some(k => 
      thread.subject.toLowerCase().includes(k.toLowerCase())
    ))) {
      return topic
    }
  }
  
  return null
}

function getPreview(body: string): string {
  // Remove HTML tags and get first 150 characters
  const text = body.replace(/<[^>]*>/g, '').trim()
  return text.length > 150 ? text.substring(0, 147) + '...' : text
}

function extractEmailFromParticipants(participants: string[]): string {
  // Find the first email that's not the user's own email
  const nonUserEmails = participants.filter(email => 
    !email.includes('@missionmutual.org') && email.includes('@')
  )
  return nonUserEmails[0] || participants[0] || 'unknown'
}

function determineGroupPriority(group: TopicGroup): 'high' | 'medium' | 'low' {
  // High priority for financial and legal topics
  if (['Financial Operations', 'Legal and Compliance'].includes(group.title)) {
    return 'high'
  }
  
  // High priority if any email has high priority
  if (group.emails.some(e => e.priority >= 4)) {
    return 'high'
  }
  
  // Low priority for miscellaneous
  if (group.title === 'Miscellaneous') {
    return 'low'
  }
  
  return 'medium'
}

function getSuggestedActions(topic: string): string[] {
  const actions: Record<string, string[]> = {
    'Financial Operations': [
      'Review and approve pending transactions',
      'Schedule financial review meeting',
      'Update budget projections'
    ],
    'Personnel and HR': [
      'Review employee requests',
      'Schedule one-on-ones',
      'Update HR documentation'
    ],
    'Project Management': [
      'Update project status',
      'Review deliverables',
      'Schedule team sync'
    ],
    'Technology and IT': [
      'Review security alerts',
      'Approve system updates',
      'Schedule maintenance window'
    ],
    'Vendor and Partner Relations': [
      'Review contract terms',
      'Schedule vendor meeting',
      'Update vendor documentation'
    ],
    'Legal and Compliance': [
      'Review compliance requirements',
      'Schedule legal consultation',
      'Update policy documentation'
    ],
    'Strategic Planning': [
      'Review strategic objectives',
      'Schedule planning session',
      'Update roadmap'
    ],
    'Operations and Facilities': [
      'Review maintenance requests',
      'Approve facility updates',
      'Schedule safety inspection'
    ]
  }
  
  return actions[topic] || ['Review and prioritize', 'Take appropriate action']
}