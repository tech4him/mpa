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

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'pending'
    const urgency = searchParams.get('urgency')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('intelligent_actions')
      .select(`
        *,
        email_threads(subject, participants),
        contacts(name, email)
      `)
      .eq('user_id', user.id)
      .eq('status', status)
      .order('urgency_level', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (urgency) {
      query = query.gte('urgency_level', parseInt(urgency))
    }

    const { data: actions, error } = await query

    if (error) throw error

    return NextResponse.json({ actions })
  } catch (error) {
    console.error('Error fetching actions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch actions' },
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

    const actionData = await request.json()
    
    // Validate required fields
    if (!actionData.action_type || !actionData.trigger_context || !actionData.recommended_action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: action, error } = await supabase
      .from('intelligent_actions')
      .insert({
        user_id: user.id,
        action_type: actionData.action_type,
        trigger_context: actionData.trigger_context,
        recommended_action: actionData.recommended_action,
        confidence_score: actionData.confidence_score || 0.5,
        urgency_level: actionData.urgency_level || 5,
        auto_execute: actionData.auto_execute || false,
        thread_id: actionData.thread_id,
        contact_id: actionData.contact_id,
        project_name: actionData.project_name,
        metadata: actionData.metadata || {}
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ action })
  } catch (error) {
    console.error('Error creating action:', error)
    return NextResponse.json(
      { error: 'Failed to create action' },
      { status: 500 }
    )
  }
}