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

    const { threadId, folderId } = await request.json()
    
    if (!threadId) {
      return NextResponse.json({ error: 'Thread ID required' }, { status: 400 })
    }

    // Get the thread to find the Microsoft thread ID
    const { data: thread, error: threadError } = await supabase
      .from('email_threads')
      .select('thread_id, user_id, category')
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

    // Determine target folder based on category if not specified
    let targetFolderId = folderId
    if (!targetFolderId) {
      // Map categories to folder names
      const folderMap: Record<string, string> = {
        'FINANCIAL': 'Finance',
        'PROJECT': 'Projects', 
        'LEGAL': 'Legal',
        'VENDOR': 'Vendors',
        'HR': 'Personnel',
        'ADMIN': 'Admin',
        'ARCHIVED': 'Archive'
      }
      
      const folderName = folderMap[thread.category] || 'Archive'
      
      try {
        const graphClient = await getGraphClient(userData.microsoft_refresh_token)
        
        // Try to find the folder
        const folders = await graphClient
          .api('/me/mailFolders')
          .filter(`displayName eq '${folderName}'`)
          .get()
        
        if (folders.value.length > 0) {
          targetFolderId = folders.value[0].id
        } else {
          // Create the folder if it doesn't exist
          const newFolder = await graphClient
            .api('/me/mailFolders')
            .post({ displayName: folderName })
          
          targetFolderId = newFolder.id
        }
      } catch (graphError) {
        console.error('Error getting/creating folder:', graphError)
        // Continue without moving in Outlook
      }
    }

    // Move messages in Microsoft Graph if we have a folder
    if (targetFolderId) {
      try {
        const graphClient = await getGraphClient(userData.microsoft_refresh_token)
        
        // Get all messages in the thread
        const messages = await graphClient
          .api(`/me/messages`)
          .filter(`conversationId eq '${thread.thread_id}'`)
          .select('id')
          .get()

        // Move each message to the target folder
        for (const message of messages.value) {
          await graphClient
            .api(`/me/messages/${message.id}/move`)
            .post({ destinationId: targetFolderId })
        }
      } catch (graphError) {
        console.error('Microsoft Graph error:', graphError)
        // Continue even if Graph update fails
      }
    }

    // Update thread status in database
    const { error: updateError } = await supabase
      .from('email_threads')
      .update({ 
        status: 'archived',
        folder_id: targetFolderId,
        updated_at: new Date().toISOString()
      })
      .eq('id', threadId)
      .eq('user_id', user.id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ 
      success: true,
      folderId: targetFolderId 
    })
  } catch (error) {
    console.error('Error filing thread:', error)
    return NextResponse.json(
      { error: 'Failed to file thread' },
      { status: 500 }
    )
  }
}