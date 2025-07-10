import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DailyBriefingGenerator } from '@/lib/ai/daily-briefing-generator'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { briefingType = 'morning' } = await request.json()
    
    if (!['morning', 'evening'].includes(briefingType)) {
      return NextResponse.json({ error: 'Invalid briefing type' }, { status: 400 })
    }

    const generator = new DailyBriefingGenerator(user.id)
    
    let briefing
    if (briefingType === 'morning') {
      briefing = await generator.generateMorningBriefing()
    } else {
      // TODO: Implement evening briefing
      return NextResponse.json({ error: 'Evening briefings not yet implemented' }, { status: 501 })
    }

    // Mark as delivered
    await supabase
      .from('daily_briefings')
      .update({ delivered_at: new Date() })
      .eq('id', briefing.id)

    return NextResponse.json({ briefing })
  } catch (error) {
    console.error('Error generating briefing:', error)
    return NextResponse.json(
      { error: 'Failed to generate briefing' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const type = searchParams.get('type') || 'morning'

    // Get existing briefing
    const { data: briefing, error } = await supabase
      .from('daily_briefings')
      .select('*')
      .eq('user_id', user.id)
      .eq('briefing_date', date)
      .eq('briefing_type', type)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error
    }

    if (!briefing) {
      return NextResponse.json({ briefing: null })
    }

    return NextResponse.json({ briefing })
  } catch (error) {
    console.error('Error fetching briefing:', error)
    return NextResponse.json(
      { error: 'Failed to fetch briefing' },
      { status: 500 }
    )
  }
}