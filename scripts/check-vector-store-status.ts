import { config } from 'dotenv'

// Load environment variables FIRST before any other imports
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log('Environment check:')
console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗')
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓' : '✗')

if (!supabaseUrl) {
  console.error('\n❌ Missing required environment variables:')
  console.error('  • NEXT_PUBLIC_SUPABASE_URL')
  console.error('\nPlease check your .env.local file')
  process.exit(1)
}

// Use service key if available, otherwise fall back to anon key
const key = supabaseServiceKey || supabaseAnonKey
if (!key) {
  console.error('\n❌ Missing Supabase authentication key')
  console.error('Need either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

console.log('Using key type:', supabaseServiceKey ? 'Service Role' : 'Anonymous')
const supabase = createClient(supabaseUrl, key)

async function checkVectorStoreStatus() {
  console.log('Checking vector store status...\n')
  
  try {
    // Get total email count
    const { count: totalEmails } = await supabase
      .from('email_messages')
      .select('*', { count: 'exact', head: true })

    console.log(`📧 Total emails in database: ${totalEmails}`)

    // Get emails with content
    const { count: emailsWithContent } = await supabase
      .from('email_messages')
      .select('*', { count: 'exact', head: true })
      .not('body', 'is', null)
      .neq('body', '')

    console.log(`📝 Emails with content: ${emailsWithContent}`)

    // Check organizational knowledge entries
    const { count: vectorStoreEntries } = await supabase
      .from('organizational_knowledge')
      .select('*', { count: 'exact', head: true })
      .eq('document_type', 'email')

    console.log(`🔍 Emails in vector store: ${vectorStoreEntries || 0}`)

    // Get recent emails
    const { data: recentEmails } = await supabase
      .from('email_messages')
      .select('subject, from_email, received_at')
      .order('received_at', { ascending: false })
      .limit(5)

    console.log('\n📬 Recent emails:')
    recentEmails?.forEach(email => {
      const date = new Date(email.received_at).toLocaleDateString()
      console.log(`  • ${email.subject?.substring(0, 50) || 'No Subject'} - ${email.from_email} (${date})`)
    })

    // Calculate percentages
    const contentPercentage = emailsWithContent && totalEmails ? ((emailsWithContent / totalEmails) * 100).toFixed(1) : 0
    const vectorStorePercentage = vectorStoreEntries && totalEmails ? ((vectorStoreEntries / totalEmails) * 100).toFixed(1) : 0

    console.log('\n📊 Statistics:')
    console.log(`  • Emails with content: ${contentPercentage}%`)
    console.log(`  • Vector store coverage: ${vectorStorePercentage}%`)

    if ((vectorStoreEntries || 0) === 0) {
      console.log('\n⚠️  No emails found in vector store!')
      console.log('   Run: npm run reprocess-emails')
    } else if ((vectorStoreEntries || 0) < (emailsWithContent || 0) * 0.2) {
      console.log('\n⚠️  Vector store coverage is low')
      console.log('   Consider running: npm run reprocess-emails')
    } else {
      console.log('\n✅ Vector store seems to be populated')
    }

  } catch (error) {
    console.error('Error checking vector store status:', error)
  }
}

// Run the status check
checkVectorStoreStatus().catch(console.error)