import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ExecutiveAssistantBriefingGenerator } from '@/lib/ai/executive-assistant-briefing'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { briefingType = 'morning', forceRegenerate = false } = await request.json()

    // Validate briefing type
    if (!['morning', 'weekly', 'monthly'].includes(briefingType)) {
      return NextResponse.json({ error: 'Invalid briefing type' }, { status: 400 })
    }

    console.log(`Generating ${briefingType} executive briefing for user:`, user.id)

    const generator = new ExecutiveAssistantBriefingGenerator(user.id)
    const briefing = await generator.generateExecutiveBriefing(briefingType)

    return NextResponse.json({
      success: true,
      briefing,
      message: 'Executive briefing generated successfully'
    })

  } catch (error) {
    console.error('Executive briefing generation error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to generate executive briefing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
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

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const briefingType = searchParams.get('type') || 'morning'

    // Get existing briefing
    const { data: briefing } = await supabase
      .from('daily_briefings')
      .select('*')
      .eq('user_id', user.id)
      .eq('briefing_date', date)
      .eq('briefing_type', briefingType)
      .single()

    if (!briefing) {
      return NextResponse.json({ briefing: null })
    }

    return NextResponse.json({ briefing })

  } catch (error) {
    console.error('Error fetching executive briefing:', error)
    return NextResponse.json(
      { error: 'Failed to fetch briefing' },
      { status: 500 }
    )
  }
}