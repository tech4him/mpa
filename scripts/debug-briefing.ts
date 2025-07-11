import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { DailyBriefingGenerator } from '../src/lib/ai/daily-briefing-generator'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugBriefingGeneration() {
  console.log('=== Debugging Morning Briefing Generation ===\n')
  
  // 1. Check database connectivity
  console.log('1. Testing database connection...')
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, email')
    .limit(1)
  
  if (userError) {
    console.error('❌ Database connection failed:', userError)
    return
  }
  
  if (!users || users.length === 0) {
    console.error('❌ No users found in database')
    return
  }
  
  const testUserId = users[0].id
  console.log('✅ Database connected. Test user ID:', testUserId)
  
  // 2. Check required tables and data
  console.log('\n2. Checking required tables...')
  
  const tables = [
    'email_threads',
    'extracted_tasks', 
    'contacts',
    'email_processing_rules',
    'daily_briefings',
    'relationship_intelligence',
    'intelligent_actions'
  ]
  
  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', testUserId)
      
      if (error) {
        console.log(`❌ ${table}: Error - ${error.message}`)
      } else {
        console.log(`✅ ${table}: ${count || 0} records`)
      }
    } catch (err) {
      console.log(`❌ ${table}: Exception - ${err}`)
    }
  }
  
  // 3. Test specific data queries that briefing uses
  console.log('\n3. Testing specific briefing data queries...')
  
  // Test unread important threads
  try {
    const { data: threads } = await supabase
      .from('email_threads')
      .select('*')
      .eq('user_id', testUserId)
      .eq('status', 'active')
      .in('category', ['ACTION_REQUIRED', 'FINANCIAL', 'LEGAL'])
      .gte('priority', 3)
      .order('priority', { ascending: false })
      .limit(10)
    
    console.log(`✅ Unread important threads: ${threads?.length || 0}`)
    if (threads && threads.length > 0) {
      console.log('   Sample thread:', {
        id: threads[0].id,
        subject: threads[0].subject,
        category: threads[0].category,
        priority: threads[0].priority
      })
    }
  } catch (err) {
    console.log('❌ Unread threads query failed:', err)
  }
  
  // Test pending tasks
  try {
    const { data: tasks } = await supabase
      .from('extracted_tasks')
      .select('*')
      .eq('user_id', testUserId)
      .eq('status', 'pending')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20)
    
    console.log(`✅ Pending tasks: ${tasks?.length || 0}`)
  } catch (err) {
    console.log('❌ Pending tasks query failed:', err)
  }
  
  // Test VIP threads
  try {
    const { data: vipThreads } = await supabase
      .from('email_threads')
      .select('*')
      .eq('user_id', testUserId)
      .eq('is_vip', true)
      .gte('last_message_date', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('last_message_date', { ascending: false })
    
    console.log(`✅ VIP threads: ${vipThreads?.length || 0}`)
  } catch (err) {
    console.log('❌ VIP threads query failed:', err)
  }
  
  // Test contacts
  try {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', testUserId)
      .limit(10)
    
    console.log(`✅ Contacts: ${contacts?.length || 0}`)
  } catch (err) {
    console.log('❌ Contacts query failed:', err)
  }
  
  // 4. Test AI dependencies
  console.log('\n4. Testing AI dependencies...')
  
  // Check OpenAI environment variables
  const openaiKey = process.env.OPENAI_API_KEY
  const openaiOrg = process.env.OPENAI_ORG_ID
  
  console.log('✅ OpenAI API Key:', openaiKey ? 'Present' : 'Missing')
  console.log('✅ OpenAI Org ID:', openaiOrg ? 'Present' : 'Missing')
  
  // 5. Test briefing generation
  console.log('\n5. Testing briefing generation...')
  
  try {
    const generator = new DailyBriefingGenerator(testUserId)
    console.log('✅ Briefing generator created')
    
    // Try to generate a briefing
    const briefing = await generator.generateMorningBriefing()
    console.log('✅ Briefing generated successfully!')
    console.log('   Priority score:', briefing.priority_score)
    console.log('   Need to know items:', briefing.intelligence_summary.need_to_know?.length || 0)
    console.log('   Need to do items:', briefing.intelligence_summary.need_to_do?.length || 0)
    console.log('   Anomalies:', briefing.intelligence_summary.anomalies?.length || 0)
    console.log('   Recommended actions:', briefing.actions_recommended?.length || 0)
    
    // Check if it was saved to database
    const { data: savedBriefing, error: fetchError } = await supabase
      .from('daily_briefings')
      .select('*')
      .eq('user_id', testUserId)
      .eq('briefing_type', 'morning')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (fetchError) {
      console.log('❌ Failed to fetch saved briefing:', fetchError)
    } else {
      console.log('✅ Briefing saved to database:', savedBriefing.id)
    }
    
  } catch (err) {
    console.log('❌ Briefing generation failed:', err)
    console.error('Full error:', err)
  }
  
  // 6. Test API endpoint
  console.log('\n6. Testing API endpoint simulation...')
  
  try {
    // Simulate what the API does
    const briefingDate = new Date()
    briefingDate.setHours(0, 0, 0, 0)
    
    const { data: existing } = await supabase
      .from('daily_briefings')
      .select('*')
      .eq('user_id', testUserId)
      .eq('briefing_date', briefingDate.toISOString().split('T')[0])
      .eq('briefing_type', 'morning')
      .single()
    
    console.log('✅ Existing briefing check:', existing ? 'Found existing' : 'No existing briefing')
    
    if (existing) {
      console.log('   Briefing ID:', existing.id)
      console.log('   Generated at:', existing.generated_at)
      console.log('   Priority score:', existing.priority_score)
    }
    
  } catch (err) {
    console.log('❌ API endpoint simulation failed:', err)
  }
  
  console.log('\n=== Debug Complete ===')
}

debugBriefingGeneration().catch(console.error)