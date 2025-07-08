import { NextRequest, NextResponse } from 'next/server'
import { EmailSyncService } from '@/lib/email/sync'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, subscriptionId, changeType, resource } = body

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Trigger email sync for this user
    const syncService = new EmailSyncService()
    const result = await syncService.syncUserEmails(userId)

    return NextResponse.json({ 
      status: 'processed', 
      messageCount: result.messageCount,
      changeType,
      resource
    })
    
  } catch (error) {
    console.error('Email processing error:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

