import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { DailyBriefingGenerator } from '@/lib/ai/daily-briefing-generator'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient()
    
    // Get first user for testing (bypassing auth)
    const { data: users } = await supabase
      .from('users')
      .select('*')
      .limit(1)
    
    if (!users || users.length === 0) {
      return NextResponse.json({ error: 'No users found in database' }, { status: 404 })
    }
    
    const user = users[0]

    const debugInfo: any = {
      userId: user.id,
      userEmail: user.email,
      timestamp: new Date().toISOString(),
      steps: []
    }

    // Step 1: Check database tables
    debugInfo.steps.push('1. Checking database tables...')
    
    const tables = [
      'email_threads',
      'extracted_tasks', 
      'contacts',
      'email_processing_rules',
      'daily_briefings'
    ]
    
    const tableCounts: any = {}
    
    for (const table of tables) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
        
        tableCounts[table] = error ? `Error: ${error.message}` : count || 0
      } catch (err) {
        tableCounts[table] = `Exception: ${err}`
      }
    }
    
    debugInfo.tableCounts = tableCounts
    
    // Step 2: Test specific queries
    debugInfo.steps.push('2. Testing specific data queries...')
    
    // Test unread important threads
    const { data: threads } = await supabase
      .from('email_threads')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('category', ['ACTION_REQUIRED', 'FINANCIAL', 'LEGAL'])
      .gte('priority', 3)
      .order('priority', { ascending: false })
      .limit(10)
    
    debugInfo.unreadThreads = threads?.length || 0
    
    // Test pending tasks
    const { data: tasks } = await supabase
      .from('extracted_tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .limit(20)
    
    debugInfo.pendingTasks = tasks?.length || 0
    
    // Test VIP threads
    const { data: vipThreads } = await supabase
      .from('email_threads')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_vip', true)
      .gte('last_message_date', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    
    debugInfo.vipThreads = vipThreads?.length || 0
    
    // Test contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', user.id)
      .limit(10)
    
    debugInfo.contacts = contacts?.length || 0
    
    // Step 3: Check environment variables
    debugInfo.steps.push('3. Checking environment variables...')
    debugInfo.environment = {
      openaiKey: !!process.env.OPENAI_API_KEY,
      openaiOrg: !!process.env.OPENAI_ORG_ID,
      supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    }
    
    // Step 4: Test briefing generation
    debugInfo.steps.push('4. Testing briefing generation...')
    
    try {
      const generator = new DailyBriefingGenerator(user.id)
      debugInfo.generatorCreated = true
      
      // Check if briefing already exists
      const briefingDate = new Date()
      briefingDate.setHours(0, 0, 0, 0)
      
      const { data: existing } = await supabase
        .from('daily_briefings')
        .select('*')
        .eq('user_id', user.id)
        .eq('briefing_date', briefingDate.toISOString().split('T')[0])
        .single()
      
      debugInfo.existingBriefing = existing ? {
        id: existing.id,
        created_at: existing.created_at,
        content: existing.content
      } : null
      
      if (!existing) {
        debugInfo.steps.push('5. Generating new briefing...')
        const briefing = await generator.generateMorningBriefing()
        debugInfo.newBriefing = {
          id: briefing.id,
          content: briefing.content,
          created_at: briefing.created_at
        }
        debugInfo.generationSuccess = true
      } else {
        debugInfo.steps.push('5. Using existing briefing...')
        debugInfo.generationSuccess = true
      }
      
    } catch (error) {
      console.error('Briefing generation error:', error)
      debugInfo.generationError = error instanceof Error ? error.message : JSON.stringify(error)
      debugInfo.generationSuccess = false
      debugInfo.generationStack = error instanceof Error ? error.stack : 'No stack trace'
      debugInfo.errorDetails = {
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : JSON.stringify(error),
        cause: error instanceof Error ? error.cause : undefined,
        fullError: error
      }
    }
    
    return NextResponse.json(debugInfo)
    
  } catch (error) {
    console.error('Debug briefing error:', error)
    return NextResponse.json(
      { 
        error: 'Debug failed', 
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      },
      { status: 500 }
    )
  }
}