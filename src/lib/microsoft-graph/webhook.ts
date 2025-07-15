import { getGraphClient, getValidTokenForUser } from './client'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

interface SubscriptionRequest {
  changeType: string
  notificationUrl: string
  resource: string
  expirationDateTime: string
  clientState?: string
}

interface Subscription {
  id: string
  resource: string
  changeType: string
  clientState?: string
  notificationUrl: string
  expirationDateTime: string
  applicationId: string
  creatorId: string
}

export class WebhookService {
  private async getSupabase() {
    return await createClient()
  }

  async createEmailSubscription(userId: string): Promise<Subscription | null> {
    try {
      const supabase = await this.getSupabase()

      // Get valid access token (auto-refreshes if needed)
      const accessToken = await getValidTokenForUser(userId, ['User.Read', 'Mail.ReadWrite'])

      // Initialize Graph client
      const graphClient = await getGraphClient(accessToken)

      // Generate client state for security
      const clientState = crypto.randomBytes(16).toString('hex')

      // Create subscription
      const subscriptionRequest: SubscriptionRequest = {
        changeType: 'created,updated',
        notificationUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/outlook`,
        resource: 'me/messages',
        expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
        clientState
      }

      const subscription = await graphClient
        .api('/subscriptions')
        .post(subscriptionRequest)

      // Store subscription details
      await supabase
        .from('email_accounts')
        .update({
          microsoft_subscription_id: subscription.id,
          webhook_secret: clientState,
          subscription_expires_at: subscription.expirationDateTime
        })
        .eq('user_id', userId)

      return subscription

    } catch (error) {
      console.error('Webhook subscription error:', error)
      return null
    }
  }

  async renewSubscription(userId: string): Promise<boolean> {
    try {
      const supabase = await this.getSupabase()

      // Get subscription details
      const { data: account } = await supabase
        .from('email_accounts')
        .select('microsoft_subscription_id')
        .eq('user_id', userId)
        .single()

      if (!account?.microsoft_subscription_id) {
        // Create new subscription
        const subscription = await this.createEmailSubscription(userId)
        return !!subscription
      }

      // Get valid access token (auto-refreshes if needed)
      const accessToken = await getValidTokenForUser(userId, ['User.Read', 'Mail.ReadWrite'])

      // Initialize Graph client
      const graphClient = await getGraphClient(accessToken)

      // Renew subscription
      const updatedSubscription = await graphClient
        .api(`/subscriptions/${account.microsoft_subscription_id}`)
        .patch({
          expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
        })

      // Update expiration in database
      await supabase
        .from('email_accounts')
        .update({
          subscription_expires_at: updatedSubscription.expirationDateTime
        })
        .eq('user_id', userId)

      return true

    } catch (error) {
      console.error('Subscription renewal error:', error)
      
      // If renewal fails, try creating a new subscription
      try {
        const subscription = await this.createEmailSubscription(userId)
        return !!subscription
      } catch (retryError) {
        console.error('Failed to create new subscription:', retryError)
        return false
      }
    }
  }

  async deleteSubscription(userId: string): Promise<boolean> {
    try {
      const supabase = await this.getSupabase()

      // Get subscription details
      const { data: account } = await supabase
        .from('email_accounts')
        .select('microsoft_subscription_id')
        .eq('user_id', userId)
        .single()

      if (!account?.microsoft_subscription_id) {
        return true // Already deleted
      }

      // Get valid access token (auto-refreshes if needed)
      const accessToken = await getValidTokenForUser(userId, ['User.Read', 'Mail.ReadWrite'])

      // Initialize Graph client
      const graphClient = await getGraphClient(accessToken)

      // Delete subscription
      await graphClient
        .api(`/subscriptions/${account.microsoft_subscription_id}`)
        .delete()

      // Clear subscription details from database
      await supabase
        .from('email_accounts')
        .update({
          microsoft_subscription_id: null,
          webhook_secret: null,
          subscription_expires_at: null
        })
        .eq('user_id', userId)

      return true

    } catch (error) {
      console.error('Subscription deletion error:', error)
      return false
    }
  }

  async checkSubscriptionStatus(userId: string): Promise<{
    active: boolean
    expiresAt?: string
    subscriptionId?: string
  }> {
    try {
      const supabase = await this.getSupabase()

      const { data: account } = await supabase
        .from('email_accounts')
        .select('microsoft_subscription_id, subscription_expires_at')
        .eq('user_id', userId)
        .single()

      if (!account?.microsoft_subscription_id) {
        return { active: false }
      }

      const expiresAt = new Date(account.subscription_expires_at)
      const now = new Date()
      const active = expiresAt > now

      return {
        active,
        expiresAt: account.subscription_expires_at,
        subscriptionId: account.microsoft_subscription_id
      }

    } catch (error) {
      console.error('Subscription status check error:', error)
      return { active: false }
    }
  }

  private async decryptRefreshToken(encryptedToken: string): Promise<string> {
    const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
    const [ivHex, authTagHex, encrypted] = encryptedToken.split(':')
    
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }
}