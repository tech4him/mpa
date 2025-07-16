import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Marking all unprocessed threads as processed for user:', user.id)

    // Mark all unprocessed threads as processed
    const { data: updatedThreads, error: updateError } = await supabase
      .from('email_threads')
      .update({ 
        is_processed: true,
        processed_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .eq('is_processed', false)
      .select('id')

    if (updateError) {
      console.error('Error updating threads:', updateError)
      throw updateError
    }

    const processedCount = updatedThreads?.length || 0
    console.log(`Marked ${processedCount} threads as processed`)

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
      message: `Marked ${processedCount} threads as processed (inbox clean)`,
      processed_count: processedCount
    })

  } catch (error) {
    console.error('Error marking threads as processed:', error)
    return NextResponse.json(
      { error: 'Failed to mark threads as processed' },
      { status: 500 }
    )
  }
}