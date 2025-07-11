#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import * as dotenv from 'dotenv'
import { Readable } from 'stream'

// Set up File global for OpenAI
import { File } from 'node:buffer'
globalThis.File = File

dotenv.config({ path: '.env.local' })

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  organization: process.env.OPENAI_ORG_ID,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID!

async function populateVectorStore() {
  console.log('🔍 Fetching existing emails from Supabase...')
  
  const { data: emails, error } = await supabase
    .from('organizational_knowledge')
    .select('*')
    .eq('document_type', 'email')
    .is('openai_file_id', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Error fetching emails:', error)
    return
  }

  console.log(`📧 Found ${emails.length} emails to upload to OpenAI Vector Store`)

  if (emails.length === 0) {
    console.log('✅ No emails need to be uploaded - vector store is already populated')
    return
  }

  let uploaded = 0
  let failed = 0

  for (const email of emails) {
    try {
      console.log(`📤 Uploading email ${uploaded + 1}/${emails.length}...`)
      
      // Upload to OpenAI Vector Store
      const file = await openai.files.create({
        file: new File([email.content], `email-${email.id}.txt`, { type: 'text/plain' }),
        purpose: 'assistants',
      })

      await openai.vectorStores.files.create(vectorStoreId, {
        file_id: file.id,
      })

      // Update the record with the OpenAI file ID
      await supabase
        .from('organizational_knowledge')
        .update({ openai_file_id: file.id })
        .eq('id', email.id)

      uploaded++
      console.log(`✅ Uploaded email ${uploaded}/${emails.length}`)
      
      // Rate limiting - wait 100ms between uploads
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (error) {
      console.error(`❌ Failed to upload email ${email.id}:`, error)
      failed++
    }
  }

  console.log(`\n📊 Upload Summary:`)
  console.log(`✅ Successfully uploaded: ${uploaded}`)
  console.log(`❌ Failed uploads: ${failed}`)
  console.log(`📁 Total emails in vector store: ${uploaded}`)

  // Verify vector store status
  console.log('\n🔍 Checking OpenAI Vector Store status...')
  const vectorStore = await openai.vectorStores.retrieve(vectorStoreId)
  console.log(`📊 Vector Store Status: ${vectorStore.status}`)
  console.log(`📁 File Count: ${vectorStore.file_counts.total}`)
  console.log('✅ Vector store population complete!')
}

if (require.main === module) {
  populateVectorStore().catch(console.error)
}