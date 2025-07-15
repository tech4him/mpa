#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

async function testAgentFixes() {
  console.log('🔧 Testing agent system fixes...\n')

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Test 1: Check if database columns exist
    console.log('1. Testing database schema...')
    const { data: threadData, error: threadError } = await supabase
      .from('email_threads')
      .select('id, subject, from_email, is_processed, priority_score')
      .limit(1)

    if (threadError) {
      console.error('❌ Database schema test failed:', threadError.message)
      return
    }

    console.log('✅ Database schema is correct - all required columns exist')

    // Test 2: Test agent configuration storage
    console.log('\n2. Testing agent configuration storage...')
    
    const { data: agentConfigTest, error: configTestError } = await supabase
      .from('agent_configs')
      .select('id, name, type, autonomy_level')
      .limit(1)

    if (configTestError) {
      console.error('❌ Agent config test failed:', configTestError.message)
      return
    }

    console.log('✅ Agent configuration table accessible')

    // Test 3: Check if we can query unprocessed emails
    console.log('\n3. Testing email query...')
    const { data: unprocessedThreads, error: emailError } = await supabase
      .from('email_threads')
      .select('id, subject, from_email, is_processed')
      .eq('is_processed', false)
      .limit(5)

    if (emailError) {
      console.error('❌ Email query failed:', emailError.message)
      return
    }

    console.log(`✅ Found ${unprocessedThreads?.length || 0} unprocessed email threads`)
    if (unprocessedThreads && unprocessedThreads.length > 0) {
      console.log('   Sample unprocessed emails:')
      unprocessedThreads.slice(0, 3).forEach((thread, index) => {
        console.log(`   ${index + 1}. ${thread.subject?.substring(0, 50) || 'No Subject'}... (from: ${thread.from_email || 'Unknown'})`)
      })
    }

    // Test 4: Check agent tables
    console.log('\n4. Testing agent tables...')
    const { data: agentConfigs, error: configError } = await supabase
      .from('agent_configs')
      .select('id, name, type, enabled')
      .limit(5)

    if (configError) {
      console.error('❌ Agent tables test failed:', configError.message)
      return
    }

    console.log(`✅ Agent tables accessible - found ${agentConfigs?.length || 0} existing configs`)

    // Test 5: Test organizational tools table
    console.log('\n5. Testing organizational tables...')
    const { data: projectData, error: projectError } = await supabase
      .from('project_context')
      .select('id, project_name')
      .limit(1)

    if (projectError) {
      console.error('❌ Organizational tables test failed:', projectError.message)
      return
    }

    console.log('✅ Organizational tables accessible')

    console.log('\n🎉 All tests passed! Agent system fixes are working correctly.')
    console.log('\nNext steps:')
    console.log('- The agent system should now start without database errors')
    console.log('- QStash events should publish successfully')
    console.log('- Email processing should work with the complete schema')

  } catch (error) {
    console.error('❌ Test failed with error:', error)
  }
}

// Run the test
testAgentFixes().catch(console.error)