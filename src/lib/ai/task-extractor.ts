import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

// Check if OpenAI API key is configured
const hasOpenAIKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'dummy-key'

const openai = hasOpenAIKey ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID,
}) : null

interface ExtractedTask {
  title: string
  description: string
  due_date?: string
  assigned_to?: string
  priority: 'low' | 'medium' | 'high'
  confidence: number
  context: string
  task_type?: 'task' | 'commitment' | 'follow_up'
}

interface TaskExtractionResult {
  tasks: ExtractedTask[]
  commitments: ExtractedTask[]
  followUps: ExtractedTask[]
}

export async function extractTasksFromThread(
  userId: string, 
  threadId: string
): Promise<TaskExtractionResult> {
  try {
    const supabase = await createClient()

    // Get thread and all messages
    const { data: thread } = await supabase
      .from('email_threads')
      .select('*')
      .eq('id', threadId)
      .eq('user_id', userId)
      .single()

    if (!thread) {
      throw new Error('Thread not found')
    }

    const { data: messages } = await supabase
      .from('email_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('received_at', { ascending: true })

    if (!messages || messages.length === 0) {
      return { tasks: [], commitments: [], followUps: [] }
    }

    // Combine all message content for analysis
    const threadContent = messages.map(msg => `
From: ${msg.from_name} <${msg.from_email}>
Date: ${new Date(msg.received_at).toLocaleString()}
Subject: ${msg.subject}

${msg.body}
`).join('\n\n---\n\n')

    // Extract tasks using AI
    const extraction = await extractTasksWithAI(threadContent, thread.category)

    // Store extracted tasks in database
    const storedTasks = await storeTasks(supabase, userId, threadId, extraction)

    return {
      tasks: storedTasks.filter(t => t.task_type === 'task'),
      commitments: storedTasks.filter(t => t.task_type === 'commitment'),
      followUps: storedTasks.filter(t => t.task_type === 'follow_up')
    }

  } catch (error) {
    console.error('Task extraction error:', error)
    return { tasks: [], commitments: [], followUps: [] }
  }
}

async function extractTasksWithAI(
  threadContent: string, 
  category: string
): Promise<ExtractedTask[]> {
  // Return empty array if no OpenAI key is configured
  if (!hasOpenAIKey || !openai) {
    console.log('OpenAI API key not configured, skipping task extraction')
    return []
  }
  const systemPrompt = `You are an expert at extracting actionable tasks, commitments, and follow-ups from email threads.

Extract three types of items:
1. TASKS: Explicit action items mentioned in the emails
2. COMMITMENTS: Things someone has committed to do
3. FOLLOW_UPS: Items that need follow-up or checking back on

For each item, provide:
- title: Brief, actionable title (2-8 words)
- description: More detailed description
- due_date: If a specific date/time is mentioned (ISO format, or null)
- assigned_to: Email address of person responsible (or null if unclear)
- priority: low, medium, or high based on urgency/importance
- confidence: 0.0-1.0 how confident you are this is actually a task
- context: Brief context about where this came from in the email
- task_type: "task", "commitment", or "follow_up"

Return JSON with an array of extracted items. Only include items with confidence > 0.6.

Email Category: ${category}
Focus on extracting items relevant to business operations, financial matters, and organizational commitments.`

  const userPrompt = `Extract tasks, commitments, and follow-ups from this email thread:

${threadContent}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    })

    const result = completion.choices[0]?.message?.content
    if (!result) {
      return []
    }

    const parsed = JSON.parse(result)
    return parsed.items || parsed.tasks || []

  } catch (error) {
    console.error('AI task extraction error:', error)
    return []
  }
}

async function storeTasks(
  supabase: any,
  userId: string,
  threadId: string,
  tasks: ExtractedTask[]
): Promise<any[]> {
  const tasksToInsert = tasks
    .filter(task => task.confidence > 0.6)
    .map(task => ({
      user_id: userId,
      thread_id: threadId,
      task_description: `${task.title}: ${task.description}`,
      due_date: task.due_date || null,
      assigned_to: task.assigned_to || null,
      status: 'pending',
      confidence: task.confidence
    }))

  if (tasksToInsert.length === 0) {
    return []
  }

  const { data: insertedTasks, error } = await supabase
    .from('extracted_tasks')
    .insert(tasksToInsert)
    .select()

  if (error) {
    console.error('Error storing tasks:', error)
    return []
  }

  return insertedTasks || []
}

export async function getThreadTasks(userId: string, threadId: string) {
  const supabase = await createClient()
  
  const { data: tasks, error } = await supabase
    .from('extracted_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error('Failed to fetch tasks')
  }

  return tasks || []
}

export async function updateTask(
  userId: string, 
  taskId: string, 
  updates: Partial<{
    title: string
    description: string
    due_date: string
    status: string
    priority: string
  }>
) {
  const supabase = await createClient()
  
  const { data: task, error } = await supabase
    .from('extracted_tasks')
    .update(updates)
    .eq('id', taskId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    throw new Error('Failed to update task')
  }

  return task
}