import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

interface OutlookWebhookPayload {
  value: Array<{
    subscriptionId: string
    changeType: 'created' | 'updated' | 'deleted'
    resource: string
    resourceData?: {
      '@odata.type': string
      '@odata.id': string
      id: string
    }
  }>
}

// Webhook validation
function validateWebhookToken(req: NextRequest): boolean {
  const validationToken = req.nextUrl.searchParams.get('validationToken')
  return !!validationToken
}

// Verify webhook signature
function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(body)
  const expectedSignature = hmac.digest('base64')
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

export async function POST(req: NextRequest) {
  try {
    // Handle webhook validation
    const validationToken = req.nextUrl.searchParams.get('validationToken')
    if (validationToken) {
      return new NextResponse(validationToken, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    // Parse webhook payload
    const body = await req.text()
    const payload: OutlookWebhookPayload = JSON.parse(body)

    // Get webhook secret from headers
    const subscriptionId = payload.value[0]?.subscriptionId
    if (!subscriptionId) {
      return NextResponse.json({ error: 'Missing subscription ID' }, { status: 400 })
    }

    // Verify the webhook is registered
    const supabase = await createClient()
    const { data: account } = await supabase
      .from('email_accounts')
      .select('webhook_secret, user_id')
      .eq('microsoft_subscription_id', subscriptionId)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Unknown subscription' }, { status: 404 })
    }

    // Verify signature if provided
    const signature = req.headers.get('x-microsoft-signature')
    if (signature && !verifyWebhookSignature(body, signature, account.webhook_secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Process each notification
    for (const notification of payload.value) {
      // Trigger immediate email sync for this user
      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Add authorization header if needed
          },
          body: JSON.stringify({
            userId: account.user_id,
            subscriptionId: notification.subscriptionId,
            changeType: notification.changeType,
            resource: notification.resource
          })
        })
      } catch (error) {
        console.error('Failed to trigger email sync:', error)
        // Continue processing other notifications
      }
    }

    // Acknowledge webhook immediately
    return NextResponse.json({ status: 'accepted' }, { status: 200 })
  } catch (error) {
    console.error('Webhook processing error:', error)
    // Still return 200 to prevent Microsoft from retrying
    return NextResponse.json({ status: 'error' }, { status: 200 })
  }
}

export async function GET(req: NextRequest) {
  // Handle webhook validation for GET requests
  const validationToken = req.nextUrl.searchParams.get('validationToken')
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
  
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}