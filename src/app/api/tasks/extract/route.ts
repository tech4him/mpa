import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractTasksFromThread } from '@/lib/ai/task-extractor'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { threadId } = body

    if (!threadId) {
      return NextResponse.json(
        { error: 'Missing required field: threadId' }, 
        { status: 400 }
      )
    }

    // Verify user owns the thread
    const { data: thread } = await supabase
      .from('email_threads')
      .select('id')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Extract tasks from the thread
    const extraction = await extractTasksFromThread(user.id, threadId)

    return NextResponse.json({
      success: true,
      extraction
    })

  } catch (error) {
    console.error('Task extraction API error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to extract tasks', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}