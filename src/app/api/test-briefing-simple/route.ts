import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Test the exact same query that the dashboard uses
    const today = new Date().toISOString().split('T')[0]
    console.log('Testing briefing query for date:', today)
    
    const { data: briefing, error } = await supabase
      .from('daily_briefings')
      .select('*')
      .eq('user_id', user.id)
      .eq('briefing_date', today)
      .eq('briefing_type', 'morning')
      .single()

    console.log('Query result:', { briefing: !!briefing, error })

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      briefing: briefing,
      hasExistingBriefing: !!briefing,
      queryDate: today,
      userId: user.id
    })
    
  } catch (error) {
    console.error('Test briefing error:', error)
    return NextResponse.json(
      { 
        error: 'Test failed', 
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create a minimal test briefing
    const today = new Date().toISOString().split('T')[0]
    
    const { data: briefing, error } = await supabase
      .from('daily_briefings')
      .insert({
        user_id: user.id,
        briefing_date: today,
        briefing_type: 'morning',
        intelligence_summary: {
          need_to_know: [
            {
              title: 'Test Briefing',
              description: 'This is a test briefing to verify the system is working',
              urgency: 'low'
            }
          ],
          need_to_do: [],
          anomalies: [],
          key_metrics: {
            unread_important: 0,
            pending_responses: 0,
            overdue_tasks: 0,
            vip_threads: 0
          }
        },
        actions_recommended: [],
        actions_taken_automatically: [],
        priority_score: 5,
        generated_at: new Date()
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      briefing: briefing
    })
    
  } catch (error) {
    console.error('Create test briefing error:', error)
    return NextResponse.json(
      { 
        error: 'Create test briefing failed', 
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}