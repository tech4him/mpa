#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testInboxZeroSetup() {
  console.log('🧪 Testing Inbox Zero System Setup...\n')

  try {
    // Test 1: Check if inbox zero tables exist
    console.log('1. Checking if inbox zero tables exist...')
    
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['inbox_zero_processing_log', 'inbox_zero_settings', 'email_triage_results'])

    if (tablesError) {
      console.log('❌ Error checking tables:', tablesError.message)
    } else {
      const tableNames = tables.map(t => t.table_name)
      console.log('✅ Found tables:', tableNames)
      
      if (tableNames.length < 3) {
        console.log('⚠️  Some inbox zero tables are missing. Run the migration script.')
      }
    }

    // Test 2: Check email_messages table for new columns
    console.log('\n2. Checking email_messages table columns...')
    
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'email_messages')
      .in('column_name', ['is_archived', 'is_snoozed', 'ai_category', 'processed_at'])

    if (columnsError) {
      console.log('❌ Error checking columns:', columnsError.message)
    } else {
      const columnNames = columns.map(c => c.column_name)
      console.log('✅ Found inbox zero columns:', columnNames)
    }

    // Test 3: Get current email stats
    console.log('\n3. Current email statistics...')
    
    const { count: totalEmails } = await supabase
      .from('email_messages')
      .select('*', { count: 'exact', head: true })

    const { count: unreadEmails } = await supabase
      .from('email_messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)

    const { count: archivedEmails } = await supabase
      .from('email_messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_archived', true)

    console.log(`📧 Total emails: ${totalEmails || 0}`)
    console.log(`📬 Unread emails: ${unreadEmails || 0}`)
    console.log(`📁 Archived emails: ${archivedEmails || 0}`)

    // Test 4: Check inbox zero function
    console.log('\n4. Testing inbox zero stats function...')
    
    // Get a user to test with
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .limit(1)

    if (users && users.length > 0) {
      const userId = users[0].id
      
      const { data: stats, error: statsError } = await supabase
        .rpc('get_inbox_zero_stats', { user_uuid: userId })

      if (statsError) {
        console.log('❌ Error getting stats:', statsError.message)
      } else {
        console.log('✅ Inbox zero stats function working:', stats)
      }
    } else {
      console.log('⚠️  No users found to test stats function')
    }

    console.log('\n🎉 Inbox Zero System Test Complete!')
    console.log('\nNext steps:')
    console.log('1. Run the inbox-zero-migration.sql if tables are missing')
    console.log('2. Test the /api/inbox-zero/process endpoint')
    console.log('3. Access the Inbox Zero dashboard at /dashboard')

  } catch (error) {
    console.error('❌ Test failed:', error.message)
  }
}

testInboxZeroSetup()