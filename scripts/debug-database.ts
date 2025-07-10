import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugDatabase() {
  console.log('Checking database schema...')
  
  // Check if organizational_knowledge table exists
  const { data: tables, error: tableError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .like('table_name', '%knowledge%')

  console.log('Tables with "knowledge":', tables)
  console.log('Table error:', tableError)

  // Try to query organizational_knowledge
  const { data, error } = await supabase
    .from('organizational_knowledge')
    .select('*')
    .limit(1)

  console.log('Organizational knowledge query result:', { data, error })

  // Check email_messages table
  const { data: emailData, error: emailError } = await supabase
    .from('email_messages')
    .select('id, subject, from_email')
    .limit(1)

  console.log('Email messages query result:', { emailData, emailError })
}

debugDatabase().catch(console.error)