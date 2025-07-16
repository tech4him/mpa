import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InboxZeroLearningEngine } from '@/lib/ai/inbox-zero-learning'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { email_id, action, email_data } = await request.json()
    
    if (!email_id || !action || !email_data) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Record the action using the learning engine
    const learningEngine = new InboxZeroLearningEngine(supabase, user.id)
    await learningEngine.recordAction(email_id, action, email_data)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error recording action:', error)
    return NextResponse.json(
      { error: 'Failed to record action' },
      { status: 500 }
    )
  }
}