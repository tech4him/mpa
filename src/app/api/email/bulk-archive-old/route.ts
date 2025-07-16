import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MailboxActions } from '@/lib/microsoft-graph/mailbox-actions'
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

    // Date cutoff: 6/29/2025 (emails received before this date will be archived)
    const cutoffDate = new Date('2025-06-29T00:00:00Z')
    console.log(`Archiving emails received before: ${cutoffDate.toISOString()}`)

    // Get emails from inbox that are older than cutoff date
    const oldEmails = await fetchOldEmailsFromInbox(graphClient, cutoffDate)
    console.log(`Found ${oldEmails.length} emails to archive`)

    if (oldEmails.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No old emails found to archive',
        archived_count: 0
      })
    }

    // Initialize mailbox actions
    const mailboxActions = await MailboxActions.forUser(user.id)
    if (!mailboxActions) {
      return NextResponse.json({ error: 'Failed to access mailbox' }, { status: 500 })
    }

    let archivedCount = 0
    let errorCount = 0

    // Archive emails in batches
    const batchSize = 10
    for (let i = 0; i < oldEmails.length; i += batchSize) {
      const batch = oldEmails.slice(i, i + batchSize)
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(oldEmails.length / batchSize)}`)

      for (const email of batch) {
        try {
          console.log(`Archiving email: ${email.id} (${email.receivedDateTime})`)
          const result = await mailboxActions.archiveEmail(email.id)
          
          if (result.success) {
            archivedCount++
            console.log(`✅ Archived: ${email.subject?.substring(0, 50)}...`)
          } else {
            errorCount++
            console.error(`❌ Failed to archive ${email.id}: ${result.error}`)
          }
        } catch (error) {
          errorCount++
          console.error(`❌ Error archiving ${email.id}:`, error)
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < oldEmails.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // Also mark corresponding threads as processed in database
    console.log('Marking corresponding database threads as processed...')
    const emailIds = oldEmails.map(e => e.id)
    
    const { data: threadsToProcess } = await supabase
      .from('email_threads')
      .select(`
        id,
        email_messages!inner (
          message_id
        )
      `)
      .eq('user_id', user.id)
      .eq('is_processed', false)

    let dbProcessedCount = 0
    for (const thread of threadsToProcess || []) {
      const threadMessageIds = thread.email_messages.map((msg: any) => msg.message_id)
      const hasArchivedMessage = threadMessageIds.some(msgId => emailIds.includes(msgId))
      
      if (hasArchivedMessage) {
        await supabase
          .from('email_threads')
          .update({ 
            is_processed: true,
            processed_at: new Date().toISOString()
          })
          .eq('id', thread.id)
        
        dbProcessedCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Bulk archive complete: ${archivedCount} emails archived, ${errorCount} errors`,
      archived_count: archivedCount,
      error_count: errorCount,
      db_processed_count: dbProcessedCount,
      cutoff_date: cutoffDate.toISOString()
    })

  } catch (error) {
    console.error('Error during bulk archive:', error)
    return NextResponse.json(
      { error: 'Failed to perform bulk archive' },
      { status: 500 }
    )
  }
}

async function fetchOldEmailsFromInbox(graphClient: any, cutoffDate: Date) {
  const emails: any[] = []
  let pageCount = 0
  const maxPages = 50
  
  try {
    console.log('Fetching old emails from inbox...')
    
    // Build filter for emails received before cutoff date
    const filterQuery = `receivedDateTime lt ${cutoffDate.toISOString()}`
    
    let query = graphClient.api('/me/mailFolders/inbox/messages')
      .select('id,subject,receivedDateTime')
      .filter(filterQuery)
      .top(1000)
      .orderby('receivedDateTime desc')

    console.log('Filter query:', filterQuery)
    let response = await query.get()
    
    while (response.value && response.value.length > 0 && pageCount < maxPages) {
      pageCount++
      console.log(`Processing page ${pageCount}, old emails found:`, response.value.length)
      emails.push(...response.value)
      
      // Check for next page
      if (response['@odata.nextLink']) {
        response = await graphClient.api(response['@odata.nextLink']).get()
      } else {
        console.log('No more pages - finished fetching old emails')
        break
      }
    }

    console.log(`Total old emails found: ${emails.length}`)
    return emails
  } catch (error: any) {
    console.error('Error fetching old emails:', error)
    throw error
  }
}