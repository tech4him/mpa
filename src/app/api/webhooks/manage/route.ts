import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { WebhookService } from '@/lib/microsoft-graph/webhook'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action } = body

    const webhookService = new WebhookService()

    switch (action) {
      case 'create':
        const subscription = await webhookService.createEmailSubscription(user.id)
        if (!subscription) {
          return NextResponse.json(
            { error: 'Failed to create webhook subscription' },
            { status: 500 }
          )
        }
        return NextResponse.json({
          success: true,
          subscription: {
            id: subscription.id,
            expiresAt: subscription.expirationDateTime
          }
        })

      case 'renew':
        const renewed = await webhookService.renewSubscription(user.id)
        if (!renewed) {
          return NextResponse.json(
            { error: 'Failed to renew webhook subscription' },
            { status: 500 }
          )
        }
        return NextResponse.json({ success: true })

      case 'delete':
        const deleted = await webhookService.deleteSubscription(user.id)
        if (!deleted) {
          return NextResponse.json(
            { error: 'Failed to delete webhook subscription' },
            { status: 500 }
          )
        }
        return NextResponse.json({ success: true })

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: create, renew, or delete' },
          { status: 400 }
        )
    }

  } catch (error) {
    console.error('Webhook management API error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to manage webhook subscription',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
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

    const webhookService = new WebhookService()
    const status = await webhookService.checkSubscriptionStatus(user.id)

    return NextResponse.json({ status })

  } catch (error) {
    console.error('Webhook status API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to check webhook status' },
      { status: 500 }
    )
  }
}