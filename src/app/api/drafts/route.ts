import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const threadId = searchParams.get('threadId')

  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let query = supabase
      .from('email_drafts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (threadId) {
      query = query.eq('thread_id', threadId)
    }

    const { data: drafts, error } = await query

    if (error) {
      console.error('Drafts fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch drafts' }, { status: 500 })
    }

    return NextResponse.json(drafts || [])
  } catch (error) {
    console.error('Drafts API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      thread_id, 
      subject, 
      content, 
      draft_type = 'reply',
      confidence_score = 0.8,
      ai_reasoning = 'User-created draft'
    } = body

    if (!thread_id || !content) {
      return NextResponse.json({ 
        error: 'Thread ID and content are required' 
      }, { status: 400 })
    }

    const { data: draft, error } = await supabase
      .from('email_drafts')
      .insert({
        user_id: user.id,
        thread_id,
        subject: subject || 'Re: Draft',
        content,
        draft_type,
        confidence_score,
        ai_reasoning,
        status: 'pending_review'
      })
      .select()
      .single()

    if (error) {
      console.error('Draft creation error:', error)
      return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 })
    }

    return NextResponse.json(draft)
  } catch (error) {
    console.error('Draft creation API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}