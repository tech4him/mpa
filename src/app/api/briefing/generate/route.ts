import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DailyBriefingGenerator } from '@/lib/ai/daily-briefing-generator'

export async function POST(request: NextRequest) {
  console.log('POST /api/briefing/generate - Starting')
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error('Unauthorized - no user found:', userError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.log('User authenticated:', user.id, user.email)

    const { briefingType = 'morning', date, forceRegenerate = false } = await request.json()
    console.log('Briefing type requested:', briefingType, 'Date:', date, 'Force regenerate:', forceRegenerate)
    
    if (!['morning', 'evening'].includes(briefingType)) {
      return NextResponse.json({ error: 'Invalid briefing type' }, { status: 400 })
    }

    // Delete existing briefing if force regenerate is requested
    if (forceRegenerate) {
      console.log('Force regenerate requested - deleting existing briefing')
      const briefingDateStr = date || new Date().toISOString().split('T')[0]
      await supabase
        .from('daily_briefings')
        .delete()
        .eq('user_id', user.id)
        .eq('briefing_date', briefingDateStr)
        .eq('briefing_type', briefingType)
      console.log('Existing briefing deleted for force regeneration')
    }

    console.log('Creating DailyBriefingGenerator for user:', user.id)
    const generator = new DailyBriefingGenerator(user.id)
    
    let briefing
    if (briefingType === 'morning') {
      console.log('Generating morning briefing for date:', date || 'auto')
      briefing = await generator.generateMorningBriefing(date)
      console.log('Briefing generated:', briefing?.id)
    } else {
      // TODO: Implement evening briefing
      return NextResponse.json({ error: 'Evening briefings not yet implemented' }, { status: 501 })
    }

    // Mark as delivered
    console.log('Marking briefing as delivered...')
    await supabase
      .from('daily_briefings')
      .update({ delivered_at: new Date() })
      .eq('id', briefing.id)

    console.log('Briefing generation complete')
    return NextResponse.json({ briefing })
  } catch (error) {
    console.error('Error generating briefing - Full error:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json(
      { error: 'Failed to generate briefing', details: error instanceof Error ? error.message : 'Unknown error' },
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