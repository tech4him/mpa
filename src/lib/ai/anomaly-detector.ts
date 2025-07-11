import { createServiceClient } from '@/lib/supabase/service'

export interface Anomaly {
  type: 'delayed_response' | 'unusual_volume' | 'priority_shift' | 'new_contact' | 'missing_followup' | 'pattern_break'
  description: string
  severity: 'critical' | 'warning' | 'info'
  recommendation: string
  related_entity?: string
  confidence: number
  detected_at: Date
  context: {
    entity_type: 'contact' | 'thread' | 'project' | 'pattern'
    entity_id?: string
    baseline_value?: number
    current_value?: number
    threshold?: number
  }
}

export async function detectAnomalies(userId: string): Promise<Anomaly[]> {
  const supabase = createServiceClient()
  const anomalies: Anomaly[] = []
  
  // Get baseline data for comparison
  const [
    responsePatterns,
    volumePatterns,
    vipCommunications,
    pendingTasks,
    threads
  ] = await Promise.all([
    getResponsePatterns(userId),
    getVolumePatterns(userId),
    getVIPCommunications(userId),
    getPendingTasks(userId),
    getRecentThreads(userId)
  ])

  // 1. Detect delayed responses from VIP contacts
  const delayedResponses = await detectDelayedResponses(userId, responsePatterns)
  anomalies.push(...delayedResponses)

  // 2. Detect unusual email volume
  const volumeAnomalies = await detectVolumeAnomalies(userId, volumePatterns)
  anomalies.push(...volumeAnomalies)

  // 3. Detect priority shifts
  const priorityShifts = await detectPriorityShifts(userId, threads)
  anomalies.push(...priorityShifts)

  // 4. Detect missing follow-ups
  const missingFollowups = await detectMissingFollowups(userId, pendingTasks)
  anomalies.push(...missingFollowups)

  // 5. Detect new high-importance contacts
  const newContacts = await detectNewImportantContacts(userId, threads)
  anomalies.push(...newContacts)

  // 6. Detect broken communication patterns
  const patternBreaks = await detectPatternBreaks(userId, responsePatterns)
  anomalies.push(...patternBreaks)

  // Sort by severity and confidence
  return anomalies.sort((a, b) => {
    const severityOrder = { critical: 3, warning: 2, info: 1 }
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity]
    if (severityDiff !== 0) return severityDiff
    return b.confidence - a.confidence
  })
}

async function getResponsePatterns(userId: string) {
  const supabase = createServiceClient()
  try {
    const { data, error } = await supabase
      .from('relationship_intelligence')
      .select('*')
      .eq('user_id', userId)
      .gte('importance_score', 7) // High importance relationships
    
    if (error) {
      console.error('Error fetching response patterns:', error)
      return []
    }
    
    return data || []
  } catch (err) {
    console.error('Exception in getResponsePatterns:', err)
    return []
  }
}

async function getVolumePatterns(userId: string) {
  const supabase = createServiceClient()
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  
  const { data } = await supabase
    .from('email_threads')
    .select('created_at, category, priority')
    .eq('user_id', userId)
    .gte('created_at', last30Days.toISOString())
    .order('created_at', { ascending: false })
  
  return data || []
}

async function getVIPCommunications(userId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('email_threads')
    .select('*')
    .eq('user_id', userId)
    .eq('is_vip', true)
    .gte('last_message_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('last_message_date', { ascending: false })
  
  return data || []
}

async function getPendingTasks(userId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('extracted_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('due_date', { ascending: true })
  
  return data || []
}

async function getRecentThreads(userId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('email_threads')
    .select('*')
    .eq('user_id', userId)
    .gte('last_message_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('last_message_date', { ascending: false })
  
  return data || []
}

async function detectDelayedResponses(userId: string, patterns: any[]): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = []
  const now = new Date()
  
  for (const pattern of patterns) {
    const contact = pattern.contacts
    const lastInteraction = new Date(contact.last_interaction)
    const hoursSinceLastContact = (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60)
    
    // Get typical response time from pattern
    const typicalResponseTime = pattern.communication_preferences?.average_response_time || 24
    const threshold = typicalResponseTime * 2 // Alert if 2x typical time
    
    if (hoursSinceLastContact > threshold && contact.is_vip) {
      anomalies.push({
        type: 'delayed_response',
        description: `${contact.name || contact.email} usually responds within ${typicalResponseTime} hours, but it's been ${Math.round(hoursSinceLastContact)} hours`,
        severity: hoursSinceLastContact > threshold * 2 ? 'critical' : 'warning',
        recommendation: `Consider following up with ${contact.name || contact.email}`,
        related_entity: contact.email,
        confidence: 0.8,
        detected_at: now,
        context: {
          entity_type: 'contact',
          entity_id: contact.email,
          baseline_value: typicalResponseTime,
          current_value: hoursSinceLastContact,
          threshold: threshold
        }
      })
    }
  }
  
  return anomalies
}

async function detectVolumeAnomalies(userId: string, volumeData: any[]): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = []
  
  // Calculate daily averages for the last 30 days
  const dailyVolumes = new Map<string, number>()
  volumeData.forEach(item => {
    const date = new Date(item.created_at).toDateString()
    dailyVolumes.set(date, (dailyVolumes.get(date) || 0) + 1)
  })
  
  const volumes = Array.from(dailyVolumes.values())
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length
  const stdDev = Math.sqrt(volumes.reduce((acc, val) => acc + Math.pow(val - avgVolume, 2), 0) / volumes.length)
  
  // Check today's volume
  const today = new Date().toDateString()
  const todayVolume = dailyVolumes.get(today) || 0
  
  if (todayVolume > avgVolume + 2 * stdDev) {
    anomalies.push({
      type: 'unusual_volume',
      description: `Today's email volume (${todayVolume}) is significantly higher than average (${Math.round(avgVolume)})`,
      severity: 'warning',
      recommendation: 'Review for urgent items or potential issues',
      confidence: 0.7,
      detected_at: new Date(),
      context: {
        entity_type: 'pattern',
        baseline_value: avgVolume,
        current_value: todayVolume,
        threshold: avgVolume + 2 * stdDev
      }
    })
  }
  
  return anomalies
}

async function detectPriorityShifts(userId: string, threads: any[]): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = []
  
  // Group threads by sender and check for priority changes
  const senderPatterns = new Map<string, { priorities: number[], recent: number[] }>()
  
  threads.forEach(thread => {
    const sender = thread.participants?.[0] || 'unknown'
    if (!senderPatterns.has(sender)) {
      senderPatterns.set(sender, { priorities: [], recent: [] })
    }
    
    const pattern = senderPatterns.get(sender)!
    pattern.priorities.push(thread.priority)
    
    // Consider recent if within last 3 days
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    if (new Date(thread.last_message_date) > threeDaysAgo) {
      pattern.recent.push(thread.priority)
    }
  })
  
  // Check for significant priority increases
  for (const [sender, pattern] of senderPatterns.entries()) {
    if (pattern.recent.length === 0) continue
    
    const avgPriority = pattern.priorities.reduce((a, b) => a + b, 0) / pattern.priorities.length
    const recentAvg = pattern.recent.reduce((a, b) => a + b, 0) / pattern.recent.length
    
    if (recentAvg > avgPriority + 1.5) {
      anomalies.push({
        type: 'priority_shift',
        description: `${sender} recent messages have higher priority (${recentAvg.toFixed(1)}) than usual (${avgPriority.toFixed(1)})`,
        severity: 'warning',
        recommendation: `Review recent communications from ${sender} for urgent matters`,
        related_entity: sender,
        confidence: 0.6,
        detected_at: new Date(),
        context: {
          entity_type: 'contact',
          entity_id: sender,
          baseline_value: avgPriority,
          current_value: recentAvg
        }
      })
    }
  }
  
  return anomalies
}

async function detectMissingFollowups(userId: string, tasks: any[]): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = []
  const now = new Date()
  
  const overdueTasks = tasks.filter(task => {
    if (!task.due_date) return false
    return new Date(task.due_date) < now
  })
  
  if (overdueTasks.length > 0) {
    const criticalOverdue = overdueTasks.filter(task => {
      const daysPast = (now.getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24)
      return daysPast > 7
    })
    
    anomalies.push({
      type: 'missing_followup',
      description: `${overdueTasks.length} tasks are overdue${criticalOverdue.length > 0 ? `, ${criticalOverdue.length} more than a week` : ''}`,
      severity: criticalOverdue.length > 0 ? 'critical' : 'warning',
      recommendation: 'Review and prioritize overdue tasks',
      confidence: 0.9,
      detected_at: now,
      context: {
        entity_type: 'pattern',
        current_value: overdueTasks.length
      }
    })
  }
  
  return anomalies
}

async function detectNewImportantContacts(userId: string, threads: any[]): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = []
  
  // Find threads with high priority from new contacts (first interaction)
  const newHighPriorityContacts = threads.filter(thread => {
    return thread.priority >= 4 && thread.message_count === 1
  })
  
  for (const thread of newHighPriorityContacts) {
    const sender = thread.participants?.[0]
    if (sender) {
      anomalies.push({
        type: 'new_contact',
        description: `New high-priority communication from ${sender}`,
        severity: 'info',
        recommendation: `Review new contact ${sender} and consider adding to VIP list`,
        related_entity: sender,
        confidence: 0.5,
        detected_at: new Date(),
        context: {
          entity_type: 'contact',
          entity_id: sender,
          current_value: thread.priority
        }
      })
    }
  }
  
  return anomalies
}

async function detectPatternBreaks(userId: string, patterns: any[]): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = []
  
  // This is a simplified version - in a real implementation, you'd analyze
  // more sophisticated patterns like communication frequency, response times, etc.
  
  return anomalies
}