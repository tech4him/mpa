import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGraphClient, getValidTokenForUser } from '@/lib/microsoft-graph/client'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get valid access token
    let accessToken: string
    try {
      accessToken = await getValidTokenForUser(user.id, ['User.Read', 'Mail.ReadWrite'])
    } catch (error: any) {
      console.error('Failed to get valid token:', error)
      return NextResponse.json({ 
        error: 'Authentication required', 
        details: 'Please sign out and sign in again to refresh your Microsoft connection'
      }, { status: 401 })
    }

    // Initialize Graph client
    const graphClient = await getGraphClient(accessToken)

    // Get all message IDs currently in the inbox
    console.log('Fetching current inbox messages from Microsoft Graph...')
    const inboxMessages = await fetchCurrentInboxMessages(graphClient)
    const inboxMessageIds = new Set(inboxMessages.map(m => m.id))
    
    console.log(`Found ${inboxMessageIds.size} messages currently in inbox`)
    console.log('First 5 inbox message IDs:', Array.from(inboxMessageIds).slice(0, 5))

    // Get all unprocessed threads from our database
    const { data: unprocessedThreads } = await supabase
      .from('email_threads')
      .select(`
        id, 
        thread_id,
        email_messages!inner (
          message_id
        )
      `)
      .eq('user_id', user.id)
      .eq('is_processed', false)
      .eq('is_hidden', false)

    if (!unprocessedThreads || unprocessedThreads.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unprocessed threads found',
        cleaned_count: 0
      })
    }

    console.log(`Found ${unprocessedThreads.length} unprocessed threads in database`)

    let cleanedCount = 0
    let checkedCount = 0

    // Check each thread to see if any of its messages still exist in the inbox
    for (const thread of unprocessedThreads) {
      checkedCount++
      const threadMessageIds = thread.email_messages.map((msg: any) => msg.message_id)
      
      console.log(`Checking thread ${checkedCount}/${unprocessedThreads.length}: ${thread.id} with ${threadMessageIds.length} messages`)
      
      // If none of the thread's messages are in the current inbox, mark thread as processed
      const hasMessagesInInbox = threadMessageIds.some(msgId => {
        const hasMessage = inboxMessageIds.has(msgId)
        if (hasMessage) {
          console.log(`  Found message ${msgId} still in inbox`)
        }
        return hasMessage
      })
      
      if (!hasMessagesInInbox) {
        console.log(`  ✅ Thread ${thread.id} no longer has messages in inbox - marking as processed`)
        
        const { error: updateError } = await supabase
          .from('email_threads')
          .update({ 
            is_processed: true,
            processed_at: new Date().toISOString()
          })
          .eq('id', thread.id)
        
        if (updateError) {
          console.error(`  ❌ Failed to update thread ${thread.id}:`, updateError)
        } else {
          cleanedCount++
        }
      } else {
        console.log(`  ⏩ Thread ${thread.id} still has messages in inbox - keeping unprocessed`)
      }
      
      // Add small delay to prevent overwhelming the system
      if (checkedCount % 50 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    // Update sync timestamp
    await supabase
      .from('email_accounts')
      .update({ 
        last_sync: new Date().toISOString(),
        sync_status: 'completed'
      })
      .eq('user_id', user.id)

    return NextResponse.json({
      success: true,
      message: `Cleanup complete - processed ${cleanedCount} threads that were no longer in inbox`,
      cleaned_count: cleanedCount,
      remaining_count: unprocessedThreads.length - cleanedCount
    })

  } catch (error) {
    console.error('Error during cleanup sync:', error)
    return NextResponse.json(
      { error: 'Failed to perform cleanup sync' },
      { status: 500 }
    )
  }
}

async function fetchCurrentInboxMessages(graphClient: any) {
  const messages: any[] = []
  let pageCount = 0
  const maxPages = 50 // Get more pages to ensure we have all messages
  
  try {
    console.log('Building Microsoft Graph query for current inbox...')
    let query = graphClient.api('/me/mailFolders/inbox/messages')
      .select('id')
      .top(1000) // Maximum allowed per page
      .orderby('receivedDateTime desc')

    console.log('Executing Graph API call...')
    let response = await query.get()
    
    while (response.value && response.value.length > 0 && pageCount < maxPages) {
      pageCount++
      console.log(`Processing inbox page ${pageCount}, messages:`, response.value.length)
      messages.push(...response.value)
      
      // Check for next page
      if (response['@odata.nextLink']) {
        response = await graphClient.api(response['@odata.nextLink']).get()
      } else {
        console.log('No more pages - finished fetching inbox messages')
        break
      }
    }

    console.log(`Total messages fetched from inbox: ${messages.length}`)
    return messages
  } catch (error: any) {
    console.error('Error fetching current inbox messages:', error)
    throw error
  }
}