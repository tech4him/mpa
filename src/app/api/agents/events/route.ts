import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('[Agent Events] Received event:', body)

    // Store the event in the database
    const supabase = await createClient()
    await supabase.from('agent_events').insert({
      agent_id: body.agentId,
      user_id: body.userId,
      event_type: body.type,
      payload: body.payload,
      created_at: body.timestamp
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Agent Events] Error processing event:', error)
    return NextResponse.json(
      { error: 'Failed to process event' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const eventType = url.searchParams.get('type')

    let query = supabase
      .from('agent_events')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (eventType) {
      query = query.eq('event_type', eventType)
    }

    const { data: events } = await query

    return NextResponse.json({ events: events || [] })
  } catch (error) {
    console.error('[Agent Events] Error fetching events:', error)
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    )
  }
}