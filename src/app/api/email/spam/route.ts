import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGraphClient, getValidTokenForUser } from '@/lib/microsoft-graph/client'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { threadId, messageId, emailId } = body

    if (!threadId && !messageId && !emailId) {
      return NextResponse.json({ 
        error: 'Thread ID, Message ID, or Email ID required' 
      }, { status: 400 })
    }

    // Check if we have a valid access token
    let canUseGraphAPI = false
    let graphClient = null

    try {
      // Get valid access token (auto-refreshes if needed)
      const accessToken = await getValidTokenForUser(user.id, ['User.Read', 'Mail.ReadWrite'])
      graphClient = await getGraphClient(accessToken)
      canUseGraphAPI = true
    } catch (error: any) {
      console.error('Failed to get valid token:', error)
      // Continue without Graph API - we can still mark as spam in our database
    }

    // Process based on what was provided
    if (threadId) {
      // Mark entire thread as spam
      const { data: thread } = await supabase
        .from('email_threads')
        .select('*')
        .eq('id', threadId)
        .eq('user_id', user.id)
        .single()

      if (!thread) {
        return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
      }

      // Get all messages in thread
      const { data: messages } = await supabase
        .from('email_messages')
        .select('*')
        .eq('thread_id', threadId)
        .eq('user_id', user.id)

      // Mark each message as spam in Microsoft Graph if possible
      if (canUseGraphAPI && messages) {
        for (const message of messages) {
          if (message.message_id) {
            try {
              // Move to Junk Email folder
              await graphClient!
                .api(`/me/messages/${message.message_id}/move`)
                .post({
                  destinationId: 'junkemail'
                })
              
              console.log(`Moved message ${message.message_id} to junk folder`)
            } catch (error) {
              console.error(`Failed to move message ${message.message_id} to junk:`, error)
            }
          }
        }
      }

      // Update thread and messages in database
      await supabase
        .from('email_threads')
        .update({ 
          category: 'SPAM',
          is_action_required: false,
          priority: 5 // Lowest priority
        })
        .eq('id', threadId)
        .eq('user_id', user.id)

      // Update or create classifications for all messages
      if (messages) {
        for (const message of messages) {
          await supabase
            .from('email_classifications')
            .upsert({
              email_id: message.id,
              user_id: user.id,
              category: 'SPAM',
              is_relevant: false,
              business_context: 'SPAM',
              should_index: false,
              should_archive: true,
              confidence: 1.0,
              reasoning: 'Manually marked as spam by user',
              created_at: new Date().toISOString()
            }, {
              onConflict: 'email_id'
            })
        }
      }

      // Delete messages from database (soft delete by marking as spam)
      await supabase
        .from('email_messages')
        .update({ 
          is_deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq('thread_id', threadId)
        .eq('user_id', user.id)

      return NextResponse.json({ 
        success: true, 
        message: 'Thread marked as spam and deleted',
        messagesProcessed: messages?.length || 0
      })

    } else if (messageId || emailId) {
      // Mark individual message as spam
      const { data: message } = await supabase
        .from('email_messages')
        .select('*')
        .eq(emailId ? 'id' : 'message_id', emailId || messageId)
        .eq('user_id', user.id)
        .single()

      if (!message) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 })
      }

      // Move to junk in Microsoft Graph if possible
      if (canUseGraphAPI && message.message_id) {
        try {
          await graphClient!
            .api(`/me/messages/${message.message_id}/move`)
            .post({
              destinationId: 'junkemail'
            })
          
          console.log(`Moved message ${message.message_id} to junk folder`)
        } catch (error) {
          console.error(`Failed to move message to junk:`, error)
        }
      }

      // Update classification
      await supabase
        .from('email_classifications')
        .upsert({
          email_id: message.id,
          user_id: user.id,
          category: 'SPAM',
          is_relevant: false,
          business_context: 'SPAM',
          should_index: false,
          should_archive: true,
          confidence: 1.0,
          reasoning: 'Manually marked as spam by user',
          created_at: new Date().toISOString()
        }, {
          onConflict: 'email_id'
        })

      // Mark message as deleted
      await supabase
        .from('email_messages')
        .update({ 
          is_deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq('id', message.id)
        .eq('user_id', user.id)

      // Check if thread should be updated
      const { data: remainingMessages } = await supabase
        .from('email_messages')
        .select('id')
        .eq('thread_id', message.thread_id)
        .eq('user_id', user.id)
        .is('is_deleted', false)

      // If no remaining messages, mark thread as spam
      if (!remainingMessages || remainingMessages.length === 0) {
        await supabase
          .from('email_threads')
          .update({ 
            category: 'SPAM',
            is_action_required: false,
            priority: 5
          })
          .eq('id', message.thread_id)
          .eq('user_id', user.id)
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Message marked as spam and deleted'
      })
    }

  } catch (error) {
    console.error('Spam marking error:', error)
    
    return NextResponse.json({
      error: 'Failed to mark as spam',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET endpoint to retrieve spam statistics
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get spam statistics
    const { data: spamCount } = await supabase
      .from('email_classifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('category', 'SPAM')

    const { data: recentSpam } = await supabase
      .from('email_messages')
      .select(`
        id,
        subject,
        from_email,
        received_at,
        email_classifications!inner(category)
      `)
      .eq('user_id', user.id)
      .eq('email_classifications.category', 'SPAM')
      .order('received_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      totalSpam: spamCount || 0,
      recentSpam: recentSpam || []
    })

  } catch (error) {
    console.error('Spam stats error:', error)
    
    return NextResponse.json({
      error: 'Failed to fetch spam statistics'
    }, { status: 500 })
  }
}