import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ProjectIntelligenceEngine } from '@/lib/ai/project-intelligence-engine'

/**
 * Auto-detect projects from email patterns and communication threads
 * This helps bootstrap the project intelligence system by analyzing existing emails
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Auto-detecting projects for user:', user.id)

    // Get recent email threads to analyze for project patterns
    const { data: threads } = await supabase
      .from('email_threads')
      .select('*')
      .eq('user_id', user.id)
      .gte('last_message_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()) // Last 90 days
      .order('message_count', { ascending: false })
      .limit(100)

    if (!threads || threads.length === 0) {
      return NextResponse.json({ 
        message: 'No recent email threads found to analyze',
        detected_projects: []
      })
    }

    // Analyze threads for project patterns
    const detectedProjects = await detectProjectsFromThreads(threads, user.id)

    // Store detected projects
    const createdProjects = []
    for (const project of detectedProjects) {
      try {
        const { data: createdProject } = await supabase
          .from('project_intelligence')
          .insert({
            user_id: user.id,
            name: project.name,
            description: project.description,
            category: project.category,
            status: 'active',
            priority: project.priority,
            stakeholders: project.stakeholders,
            expected_timeline: project.expected_timeline,
            communication_cadence: project.communication_cadence,
            health_score: 7, // Default healthy score
            created_by: 'auto_detection'
          })
          .select()
          .single()

        if (createdProject) {
          // Link related threads to this project
          for (const threadId of project.related_threads) {
            await supabase
              .from('project_threads')
              .insert({
                project_id: createdProject.id,
                thread_id: threadId,
                relevance_score: 0.8, // High relevance for auto-detected
                relationship_type: 'primary',
                confidence_score: 0.7
              })
          }
          
          createdProjects.push(createdProject)
        }
      } catch (error) {
        console.error('Error creating project:', error)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Detected and created ${createdProjects.length} projects`,
      detected_projects: createdProjects,
      analyzed_threads: threads.length
    })

  } catch (error) {
    console.error('Auto-detect projects error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to auto-detect projects',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * Analyze email threads to detect project patterns
 */
async function detectProjectsFromThreads(threads: any[], userId: string) {
  const detectedProjects = []
  
  // Group threads by subject patterns and participants
  const subjectGroups = new Map()
  const participantGroups = new Map()
  
  for (const thread of threads) {
    const subject = thread.subject || ''
    const participants = thread.participants || []
    
    // Detect project patterns in subjects
    const projectKeywords = [
      'project', 'initiative', 'campaign', 'audit', 'renewal', 'upgrade',
      'implementation', 'rollout', 'training', 'budget', 'planning',
      'review', 'assessment', 'proposal', 'contract', 'license'
    ]
    
    const subjectLower = subject.toLowerCase()
    const hasProjectKeyword = projectKeywords.some(keyword => subjectLower.includes(keyword))
    
    if (hasProjectKeyword) {
      // Extract potential project name from subject
      const projectName = extractProjectName(subject)
      
      if (!subjectGroups.has(projectName)) {
        subjectGroups.set(projectName, [])
      }
      subjectGroups.get(projectName).push(thread)
    }
    
    // Group by key participants (more than 3 participants suggests project work)
    if (participants.length >= 3) {
      const participantKey = participants.sort().slice(0, 5).join(',') // Limit to top 5 for grouping
      
      if (!participantGroups.has(participantKey)) {
        participantGroups.set(participantKey, [])
      }
      participantGroups.get(participantKey).push(thread)
    }
  }
  
  // Convert groups to project definitions
  for (const [projectName, groupThreads] of subjectGroups) {
    if (groupThreads.length >= 3) { // Minimum 3 threads to constitute a project
      const project = createProjectFromThreads(projectName, groupThreads)
      if (project) {
        detectedProjects.push(project)
      }
    }
  }
  
  // Also check participant groups for projects not caught by subject analysis
  for (const [participantKey, groupThreads] of participantGroups) {
    if (groupThreads.length >= 5) { // Higher threshold for participant-based grouping
      const subjects = groupThreads.map(t => t.subject).join(' ')
      const projectName = extractProjectName(subjects) || `Collaboration with ${participantKey.split(',')[0]}`
      
      // Check if we already have a similar project
      const exists = detectedProjects.some(p => 
        p.name.toLowerCase().includes(projectName.toLowerCase()) ||
        projectName.toLowerCase().includes(p.name.toLowerCase())
      )
      
      if (!exists) {
        const project = createProjectFromThreads(projectName, groupThreads)
        if (project) {
          detectedProjects.push(project)
        }
      }
    }
  }
  
  return detectedProjects.slice(0, 10) // Limit to 10 auto-detected projects
}

/**
 * Extract a project name from email subject lines
 */
function extractProjectName(subject: string): string {
  const cleaned = subject
    .replace(/^(re:|fwd?:|fw:)\s*/i, '') // Remove reply/forward prefixes
    .replace(/\[.*?\]/g, '') // Remove bracketed content
    .trim()
  
  // Common project name patterns
  const patterns = [
    /(\w+\s+(?:project|initiative|campaign|audit|renewal|upgrade|implementation))/i,
    /((?:project|initiative)\s+\w+)/i,
    /([A-Z][a-z]+\s+[A-Z][a-z]+\s+(?:Project|Initiative|Campaign))/,
    // Extract first few meaningful words
    /^([^-:]+)/
  ]
  
  for (const pattern of patterns) {
    const match = cleaned.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }
  
  // Fallback: take first 4 words
  const words = cleaned.split(/\s+/).slice(0, 4)
  return words.join(' ') || 'Untitled Project'
}

/**
 * Create a project definition from a group of related threads
 */
function createProjectFromThreads(projectName: string, threads: any[]) {
  if (threads.length === 0) return null
  
  // Analyze threads to determine project characteristics
  const allParticipants = new Set()
  const categories = new Set()
  let totalMessages = 0
  let latestDate = new Date(0)
  let earliestDate = new Date()
  
  for (const thread of threads) {
    // Collect participants
    if (thread.participants) {
      thread.participants.forEach((p: string) => allParticipants.add(p))
    }
    
    // Collect categories
    if (thread.category) {
      categories.add(thread.category)
    }
    
    totalMessages += thread.message_count || 0
    
    const threadDate = new Date(thread.last_message_date)
    if (threadDate > latestDate) latestDate = threadDate
    if (threadDate < earliestDate) earliestDate = threadDate
  }
  
  // Determine project category based on content analysis
  let projectCategory = 'operational'
  const nameAndSubjects = (projectName + ' ' + threads.map(t => t.subject).join(' ')).toLowerCase()
  
  if (nameAndSubjects.includes('budget') || nameAndSubjects.includes('financial') || nameAndSubjects.includes('audit')) {
    projectCategory = 'financial'
  } else if (nameAndSubjects.includes('hire') || nameAndSubjects.includes('staff') || nameAndSubjects.includes('personnel')) {
    projectCategory = 'personnel'
  } else if (nameAndSubjects.includes('tech') || nameAndSubjects.includes('system') || nameAndSubjects.includes('software')) {
    projectCategory = 'technical'
  } else if (nameAndSubjects.includes('legal') || nameAndSubjects.includes('contract') || nameAndSubjects.includes('compliance')) {
    projectCategory = 'legal'
  } else if (nameAndSubjects.includes('strategy') || nameAndSubjects.includes('planning') || nameAndSubjects.includes('vision')) {
    projectCategory = 'strategic'
  }
  
  // Determine priority based on participants and activity
  let priority = 3 // default medium
  if (allParticipants.size >= 5 || totalMessages >= 20) {
    priority = 4 // high activity suggests higher priority
  }
  if (categories.has('VIP_CRITICAL') || nameAndSubjects.includes('urgent') || nameAndSubjects.includes('critical')) {
    priority = 5
  }
  
  // Determine communication cadence based on activity
  const daysBetween = Math.max(1, (latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24))
  const avgDaysBetweenMessages = daysBetween / threads.length
  let cadence = 'weekly'
  if (avgDaysBetweenMessages <= 2) cadence = 'daily'
  else if (avgDaysBetweenMessages <= 7) cadence = 'weekly'
  else if (avgDaysBetweenMessages <= 14) cadence = 'biweekly'
  else cadence = 'monthly'
  
  return {
    name: projectName,
    description: `Auto-detected project based on ${threads.length} email threads with ${allParticipants.size} participants`,
    category: projectCategory,
    priority,
    stakeholders: Array.from(allParticipants).slice(0, 10).map(email => ({
      name: email.split('@')[0], // Use email prefix as name
      email,
      role: 'contributor',
      importance: 3
    })),
    expected_timeline: {
      milestones: [],
      deadlines: []
    },
    communication_cadence: cadence,
    related_threads: threads.map(t => t.id)
  }
}