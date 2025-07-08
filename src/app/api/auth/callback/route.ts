import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const { accessToken, account } = await req.json()
    
    if (!accessToken || !account) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      )
    }
    
    // Get user info from Microsoft Graph
    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    
    if (!graphResponse.ok) {
      throw new Error('Failed to fetch user info')
    }
    
    const graphUser = await graphResponse.json()
    
    // Create or update user in Supabase
    const supabase = await createClient()
    
    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('azure_ad_id', account.homeAccountId)
      .single()
    
    // Store access token as encrypted refresh token (temporary)
    const encryptedToken = await encryptToken(accessToken)
    
    if (existingUser) {
      // Update existing user
      await supabase
        .from('users')
        .update({
          encrypted_refresh_token: encryptedToken,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUser.id)
      
      // Sign in to Supabase
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: graphUser.mail || graphUser.userPrincipalName,
        password: generateUserPassword(account.homeAccountId),
      })
      
      if (signInError) throw signInError
    } else {
      // Create new user
      const { data: authUser, error: signUpError } = await supabase.auth.signUp({
        email: graphUser.mail || graphUser.userPrincipalName,
        password: generateUserPassword(account.homeAccountId),
        options: {
          data: {
            name: graphUser.displayName,
            azure_ad_id: account.homeAccountId,
          },
        },
      })
      
      if (signUpError) throw signUpError
      
      // Create user record
      await supabase.from('users').insert({
        id: authUser.user!.id,
        email: graphUser.mail || graphUser.userPrincipalName,
        name: graphUser.displayName,
        role: 'user',
        azure_ad_id: account.homeAccountId,
        encrypted_refresh_token: encryptedToken,
      })
      
      // Create email account
      const webhookSecret = crypto.randomBytes(32).toString('hex')
      await supabase.from('email_accounts').insert({
        user_id: authUser.user!.id,
        email_address: graphUser.mail || graphUser.userPrincipalName,
        webhook_secret: webhookSecret,
        sync_status: 'pending',
      })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Auth callback error:', error)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}

async function encryptToken(token: string): Promise<string> {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  
  let encrypted = cipher.update(token, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag()
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
}

function generateUserPassword(azureId: string): string {
  const hash = crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY!)
    .update(azureId)
    .digest('hex')
  
  return hash.substring(0, 32)
}