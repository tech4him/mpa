import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if there's an active sync operation
    const { data: account } = await supabase
      .from('email_accounts')
      .select('last_sync, sync_status')
      .eq('user_id', user.id)
      .single()

    // Get unread email count
    const { data: threads, error: threadsError } = await supabase
      .from('email_threads')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_processed', false)
      .eq('is_hidden', false)

    if (threadsError) {
      throw threadsError
    }

    return NextResponse.json({
      is_syncing: account?.sync_status === 'in_progress',
      last_sync_at: account?.last_sync,
      unread_count: threads?.length || 0
    })
  } catch (error) {
    console.error('Error checking sync status:', error)
    return NextResponse.json(
      { error: 'Failed to check sync status' },
      { status: 500 }
    )
  }
}