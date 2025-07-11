#!/usr/bin/env tsx

import OpenAI from 'openai'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  organization: process.env.OPENAI_ORG_ID,
})

const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID!

async function checkVectorStore() {
  console.log('🔍 Checking OpenAI Vector Store status...')
  
  try {
    const vectorStore = await openai.vectorStores.retrieve(vectorStoreId)
    console.log(`📊 Vector Store Status: ${vectorStore.status}`)
    console.log(`📁 File Count: ${vectorStore.file_counts.total}`)
    console.log(`🕐 Last Activity: ${vectorStore.last_active_at}`)
    
    if (vectorStore.file_counts.total > 0) {
      console.log('✅ Vector store contains files!')
    } else {
      console.log('❌ Vector store is empty')
    }
  } catch (error) {
    console.error('❌ Error checking vector store:', error)
  }
}

if (require.main === module) {
  checkVectorStore().catch(console.error)
}