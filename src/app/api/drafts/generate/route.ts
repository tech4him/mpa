import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateDraft } from '@/lib/ai/draft-generator'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { threadId, draftType, context, urgency, recipientRelationship } = body

    if (!threadId || !draftType) {
      return NextResponse.json(
        { error: 'Missing required fields: threadId, draftType' }, 
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

    // Generate draft
    const draft = await generateDraft({
      threadId,
      userId: user.id,
      draftType,
      context,
      urgency,
      recipientRelationship
    })

    return NextResponse.json({
      success: true,
      draft
    })

  } catch (error) {
    console.error('Draft generation API error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to generate draft', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

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

    if (!threadId) {
      // Get all drafts for user
      const { data: drafts } = await supabase
        .from('email_drafts')
        .select(`
          *,
          email_threads (
            subject,
            category
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      return NextResponse.json({ drafts: drafts || [] })
    } else {
      // Get drafts for specific thread
      const { data: drafts } = await supabase
        .from('email_drafts')
        .select('*')
        .eq('thread_id', threadId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      return NextResponse.json({ drafts: drafts || [] })
    }

  } catch (error) {
    console.error('Draft fetch API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to fetch drafts' },
      { status: 500 }
    )
  }
}