import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InboxZeroEngine } from '@/lib/ai/inbox-zero-engine'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { email_ids, focus } = body

    // Initialize inbox zero engine
    const inboxZero = new InboxZeroEngine(user.id)
    
    let results
    if (email_ids && Array.isArray(email_ids)) {
      // Get triage suggestions for specific emails
      results = await inboxZero.getTriageSuggestions(email_ids)
    } else if (focus) {
      // Process emails with specific focus
      results = await inboxZero.processWithFocus(focus)
    } else {
      return NextResponse.json(
        { error: 'Must provide either email_ids array or focus parameter' },
        { status: 400 }
      )
    }
    
    return NextResponse.json({ triage_results: results })
  } catch (error) {
    console.error('Triage processing error:', error)
    return NextResponse.json(
      { error: 'Failed to process triage suggestions' },
      { status: 500 }
    )
  }
}