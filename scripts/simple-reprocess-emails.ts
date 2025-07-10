import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

// Load environment variables FIRST
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiApiKey = process.env.OPENAI_API_KEY

console.log('Environment check:')
console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗')
console.log('OPENAI_API_KEY:', openaiApiKey ? '✓' : '✗')

if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
  console.error('\n❌ Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const openai = new OpenAI({ apiKey: openaiApiKey })

async function classifyEmail(emailBody: string, metadata: any): Promise<{ shouldIndex: boolean; category: string }> {
  try {
    const prompt = `Classify this email as either BUSINESS_RELEVANT or OTHER based on whether it contains business information, project updates, decisions, or work-related content.

Email Content: ${emailBody.substring(0, 1500)}
From: ${metadata.sender || 'Unknown'}
Subject: ${metadata.subject || 'No Subject'}

Return only: BUSINESS_RELEVANT or OTHER`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      temperature: 0.1,
    })

    const classification = response.choices[0]?.message?.content?.trim() || 'OTHER'
    const shouldIndex = classification === 'BUSINESS_RELEVANT'
    
    return { shouldIndex, category: classification }
  } catch (error) {
    console.error('Classification error:', error)
    return { shouldIndex: false, category: 'ERROR' }
  }
}

async function simpleReprocessEmails() {
  console.log('\nStarting simple email reprocessing...')
  
  try {
    // Get total count of emails with content
    const { count: totalEmails } = await supabase
      .from('email_messages')
      .select('*', { count: 'exact', head: true })
      .not('body', 'is', null)
      .neq('body', '')

    console.log(`Total emails with content: ${totalEmails}`)

    // Get already processed email IDs
    const { data: processedEmails } = await supabase
      .from('organizational_knowledge')
      .select('metadata')
      .eq('document_type', 'email')

    const processedEmailIds = new Set(
      processedEmails?.map(item => item.metadata?.email_id).filter(Boolean) || []
    )

    console.log(`Already processed: ${processedEmailIds.size} emails`)

    // Get emails that haven't been processed yet
    const { data: emails, error } = await supabase
      .from('email_messages')
      .select('*')
      .not('body', 'is', null)
      .neq('body', '')
      .order('received_at', { ascending: false })

    if (error) {
      console.error('Error fetching emails:', error)
      return
    }

    if (!emails || emails.length === 0) {
      console.log('No emails found to process')
      return
    }

    // Filter out already processed emails
    const unprocessedEmails = emails.filter(email => !processedEmailIds.has(email.id))

    console.log(`Total emails found: ${emails.length}`)
    console.log(`Unprocessed emails: ${unprocessedEmails.length}`)

    if (unprocessedEmails.length === 0) {
      console.log('All emails have already been processed!')
      return
    }

    let processed = 0
    let addedToVectorStore = 0
    let skippedNotRelevant = 0
    let errors = 0

    for (const email of unprocessedEmails) {
      try {
        console.log(`[${processed + 1}/${unprocessedEmails.length}] ${email.subject?.substring(0, 50) || 'No Subject'}`)

        // Classify email
        const classification = await classifyEmail(email.body, {
          sender: email.from_email || email.sender,
          subject: email.subject || ''
        })

        if (classification.shouldIndex) {
          // Format content for storage
          const content = `Subject: ${email.subject || 'No Subject'}
From: ${email.from_email || email.sender}
Date: ${email.received_at || email.sent_date}
Recipients: ${email.recipients?.join(', ') || 'None'}

${email.body}`

          // Store in organizational knowledge
          const { error: insertError } = await supabase
            .from('organizational_knowledge')
            .insert({
              document_type: 'email',
              content: content,
              metadata: {
                email_id: email.id,
                sender: email.from_email || email.sender,
                subject: email.subject,
                sent_date: email.sent_date || email.received_at,
                recipients: email.recipients,
                thread_id: email.thread_id,
                classification: classification.category
              }
            })

          if (insertError) {
            console.log('  ✗ Error storing:', insertError)
            errors++
          } else {
            console.log('  ✓ Added to knowledge store')
            addedToVectorStore++
          }
        } else {
          console.log(`  ✗ Skipped - ${classification.category}`)
          skippedNotRelevant++
        }

        processed++
        
        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 200))

      } catch (error) {
        console.error(`Error processing email ${email.id}:`, error)
        errors++
        processed++
      }
    }

    console.log('\n=== RESULTS ===')
    console.log(`Total emails in database: ${totalEmails}`)
    console.log(`Previously processed: ${processedEmailIds.size}`)
    console.log(`Newly processed: ${processed}`)
    console.log(`Added to vector store: ${addedToVectorStore}`)
    console.log(`Skipped (not relevant): ${skippedNotRelevant}`)
    console.log(`Errors: ${errors}`)
    console.log(`Total now in vector store: ${processedEmailIds.size + addedToVectorStore}`)
    console.log(`Overall coverage: ${(((processedEmailIds.size + addedToVectorStore) / (totalEmails || 1)) * 100).toFixed(1)}%`)

  } catch (error) {
    console.error('Error in reprocessing:', error)
  }
}

simpleReprocessEmails().catch(console.error)