import { createClient } from '@/lib/supabase/server'
import { config } from 'dotenv'

// Load environment variables
config({ path: '.env.local' })

async function checkEmails() {
  console.log('Checking emails using server client...\n')
  
  try {
    const supabase = await createClient()
    
    // Check if we have any emails at all
    const { count: totalEmails, error: emailError } = await supabase
      .from('email_messages')
      .select('*', { count: 'exact', head: true })

    console.log('Total emails query result:', { totalEmails, emailError })

    if (emailError) {
      console.error('Error querying emails:', emailError)
      return
    }

    console.log(`📧 Total emails in database: ${totalEmails}`)

    // Check organizational knowledge
    const { count: vectorStoreEntries, error: vectorError } = await supabase
      .from('organizational_knowledge')
      .select('*', { count: 'exact', head: true })
      .eq('document_type', 'email')

    console.log('Vector store query result:', { vectorStoreEntries, vectorError })

    if (vectorError) {
      console.error('Error querying vector store:', vectorError)
      return
    }

    console.log(`🔍 Emails in vector store: ${vectorStoreEntries || 0}`)

    // Get a sample of emails if any exist
    if (totalEmails && totalEmails > 0) {
      const { data: sampleEmails, error: sampleError } = await supabase
        .from('email_messages')
        .select('id, subject, from_email, user_id, created_at')
        .limit(3)

      if (sampleError) {
        console.error('Error getting sample emails:', sampleError)
      } else {
        console.log('\n📬 Sample emails:')
        sampleEmails?.forEach(email => {
          console.log(`  • ${email.subject?.substring(0, 50) || 'No Subject'} - ${email.from_email} (User: ${email.user_id})`)
        })
      }
    }

  } catch (error) {
    console.error('Error in email check:', error)
  }
}

checkEmails().catch(console.error)