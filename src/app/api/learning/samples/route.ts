import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
      original_draft, 
      final_sent, 
      feedback_score, 
      edit_type, 
      thread_id,
      feedback_reason
    } = body

    if (!original_draft) {
      return NextResponse.json(
        { error: 'Missing required field: original_draft' }, 
        { status: 400 }
      )
    }

    // Store learning sample
    const { data: sample, error } = await supabase
      .from('learning_samples')
      .insert({
        user_id: user.id,
        thread_id,
        original_draft,
        final_sent: final_sent || '',
        feedback_score: feedback_score || 0,
        edit_type: edit_type || 'manual_edit',
        diff_analysis: { 
          feedback_reason: feedback_reason || null 
        }, // Store feedback reason in diff_analysis
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('Learning sample storage error:', error)
      return NextResponse.json(
        { error: 'Failed to store learning sample' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      sample
    })

  } catch (error) {
    console.error('Learning samples API error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to process learning sample', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}