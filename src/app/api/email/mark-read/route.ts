import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGraphClient } from '@/lib/microsoft-graph/client'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { threadId } = await request.json()
    
    if (!threadId) {
      return NextResponse.json({ error: 'Thread ID required' }, { status: 400 })
    }

    // Get the thread to find the Microsoft thread ID
    const { data: thread, error: threadError } = await supabase
      .from('email_threads')
      .select('thread_id, user_id')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single()

    if (threadError || !thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Get user's Microsoft token
    const { data: userData } = await supabase
      .from('users')
      .select('microsoft_refresh_token')
      .eq('id', user.id)
      .single()

    if (!userData?.microsoft_refresh_token) {
      return NextResponse.json({ error: 'Microsoft account not connected' }, { status: 400 })
    }

    // Mark messages as read in Microsoft Graph
    try {
      const graphClient = await getGraphClient(userData.microsoft_refresh_token)
      
      // Get all messages in the thread
      const messages = await graphClient
        .api(`/me/messages`)
        .filter(`conversationId eq '${thread.thread_id}'`)
        .select('id')
        .get()

      // Mark each message as read
      for (const message of messages.value) {
        await graphClient
          .api(`/me/messages/${message.id}`)
          .patch({ isRead: true })
      }
    } catch (graphError) {
      console.error('Microsoft Graph error:', graphError)
      // Continue even if Graph update fails
    }

    // Update thread status in database
    const { error: updateError } = await supabase
      .from('email_threads')
      .update({ 
        status: 'read',
        updated_at: new Date().toISOString()
      })
      .eq('id', threadId)
      .eq('user_id', user.id)

    if (updateError) {
      throw updateError
    }

    // Update all messages in the thread
    await supabase
      .from('email_messages')
      .update({ is_read: true })
      .eq('thread_id', threadId)
      .eq('user_id', user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking thread as read:', error)
    return NextResponse.json(
      { error: 'Failed to mark thread as read' },
      { status: 500 }
    )
  }
}