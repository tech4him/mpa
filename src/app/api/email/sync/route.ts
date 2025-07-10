import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EmailSyncService } from '@/lib/email/sync'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has valid email account, create if doesn't exist
    let { data: emailAccount } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!emailAccount) {
      // Create email account record if it doesn't exist
      const webhookSecret = crypto.randomBytes(32).toString('hex')
      const { data: newAccount, error: insertError } = await supabase
        .from('email_accounts')
        .insert({
          user_id: user.id,
          email_address: user.email || '',
          webhook_secret: webhookSecret,
          sync_status: 'pending',
        })
        .select()
        .single()
      
      if (insertError) {
        console.error('Failed to create email account:', insertError)
        return NextResponse.json({ 
          error: 'Failed to create email account', 
          details: insertError.message 
        }, { status: 500 })
      }
      
      emailAccount = newAccount
    }

    if (!emailAccount) {
      return NextResponse.json({ error: 'Failed to create email account - no data returned' }, { status: 500 })
    }

    // Update sync status to in progress
    await supabase
      .from('email_accounts')
      .update({ sync_status: 'in_progress' })
      .eq('user_id', user.id)

    // Initialize and run sync
    const syncService = new EmailSyncService()
    
    try {
      const result = await syncService.syncUserEmails(user.id)
      
      return NextResponse.json({
        success: true,
        message: `Synchronized ${result.messageCount} messages`,
        messageCount: result.messageCount
      })
    } catch (syncError) {
      console.error('Sync service error:', syncError)
      
      // Update sync status to failed
      await supabase
        .from('email_accounts')
        .update({ sync_status: 'failed' })
        .eq('user_id', user.id)
      
      // Return a more specific error message
      const errorMessage = syncError instanceof Error ? syncError.message : 'Unknown sync error'
      
      if (errorMessage.includes('User token not found') || errorMessage.includes('Authentication token expired')) {
        return NextResponse.json({
          error: 'Microsoft authentication required',
          details: 'Please sign out and sign in again to refresh your Microsoft connection',
          code: 'AUTH_REQUIRED'
        }, { status: 401 })
      }
      
      return NextResponse.json({
        error: 'Email sync failed',
        details: errorMessage
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Email sync API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to sync emails', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get sync status
    const { data: emailAccount } = await supabase
      .from('email_accounts')
      .select('sync_status, last_sync')
      .eq('user_id', user.id)
      .single()

    // Get email stats
    const { data: threadStats } = await supabase
      .from('email_threads')
      .select('id, category, has_unread, is_action_required')
      .eq('user_id', user.id)

    const stats = {
      totalThreads: threadStats?.length || 0,
      unreadThreads: threadStats?.filter(t => t.has_unread).length || 0,
      actionRequired: threadStats?.filter(t => t.is_action_required).length || 0,
      categories: {
        VIP_CRITICAL: threadStats?.filter(t => t.category === 'VIP_CRITICAL').length || 0,
        ACTION_REQUIRED: threadStats?.filter(t => t.category === 'ACTION_REQUIRED').length || 0,
        FINANCIAL: threadStats?.filter(t => t.category === 'FINANCIAL').length || 0,
        MEETING_REQUEST: threadStats?.filter(t => t.category === 'MEETING_REQUEST').length || 0,
        FYI_ONLY: threadStats?.filter(t => t.category === 'FYI_ONLY').length || 0,
      }
    }

    return NextResponse.json({
      syncStatus: emailAccount?.sync_status || 'idle',
      lastSyncAt: emailAccount?.last_sync || null,
      stats
    })

  } catch (error) {
    console.error('Email sync status API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    )
  }
}