import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const threadId = searchParams.get('threadId')
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const taskType = searchParams.get('taskType')

    let query = supabase
      .from('tasks')
      .select(`
        *,
        email_threads (
          id,
          subject,
          category
        )
      `)
      .eq('user_id', user.id)

    if (threadId) {
      query = query.eq('thread_id', threadId)
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (priority) {
      query = query.eq('priority', priority)
    }

    if (taskType) {
      query = query.eq('task_type', taskType)
    }

    const { data: tasks, error } = await query
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      throw new Error('Failed to fetch tasks')
    }

    return NextResponse.json({ tasks: tasks || [] })

  } catch (error) {
    console.error('Tasks fetch API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { 
      title, 
      description, 
      due_date, 
      priority, 
      task_type, 
      thread_id,
      assigned_to 
    } = body

    if (!title || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: title, description' }, 
        { status: 400 }
      )
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        thread_id: thread_id || null,
        title,
        description,
        due_date: due_date || null,
        assigned_to: assigned_to || null,
        priority: priority || 'medium',
        task_type: task_type || 'task',
        status: 'pending',
        source: 'manual'
      })
      .select()
      .single()

    if (error) {
      throw new Error('Failed to create task')
    }

    return NextResponse.json({
      success: true,
      task
    })

  } catch (error) {
    console.error('Task creation API error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to create task',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}