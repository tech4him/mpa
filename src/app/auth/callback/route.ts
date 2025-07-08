import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { msalClient } from '@/lib/microsoft-graph/client'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  console.log('Auth callback received:', {
    code: code ? 'present' : 'missing',
    state: state ? 'present' : 'missing',
    error,
    errorDescription,
  })

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/auth/error?message=${error}&description=${encodeURIComponent(errorDescription || '')}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/auth/error?message=Invalid_request&description=${encodeURIComponent('Authorization code not received')}`
    )
  }

  // Verify state for CSRF protection
  const storedState = req.cookies.get('auth_state')?.value
  if (!state || state !== storedState) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/auth/error?message=Invalid_state`
    )
  }

  try {
    // Exchange code for tokens
    const tokenRequest = {
      code,
      scopes: ['User.Read', 'Mail.ReadWrite', 'Calendars.Read', 'offline_access'],
      redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    }

    const response = await msalClient.acquireTokenByCode(tokenRequest)
    
    console.log('MSAL response keys:', Object.keys(response || {}))
    console.log('Has refresh token:', !!response?.refreshToken)
    console.log('Has access token:', !!response?.accessToken)
    
    if (!response?.accessToken || !response?.account) {
      throw new Error('Invalid token response')
    }

    // Get user info from Microsoft Graph
    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${response.accessToken}`,
      },
    })
    
    const graphUser = await graphResponse.json()

    // Create or update user in Supabase
    const supabase = await createClient()
    
    // Check if user exists (by azure_ad_id or email)
    const email = graphUser.mail || graphUser.userPrincipalName
    let { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('azure_ad_id', response.account.homeAccountId)
      .single()
    
    // If not found by azure_ad_id, try by email
    if (!existingUser) {
      const { data: userByEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single()
      existingUser = userByEmail
    }

    // Encrypt refresh token
    const refreshTokenToStore = response.refreshToken || response.accessToken
    const encryptedRefreshToken = await encryptRefreshToken(refreshTokenToStore)

    if (existingUser) {
      // Update existing user
      await supabase
        .from('users')
        .update({
          azure_ad_id: response.account.homeAccountId,
          encrypted_refresh_token: encryptedRefreshToken,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUser.id)

      // Sign in to Supabase
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: graphUser.mail || graphUser.userPrincipalName,
        password: generateUserPassword(response.account.homeAccountId),
      })

      if (signInError) throw signInError
    } else {
      // First check if user exists in Supabase Auth
      
      // Try to sign in first (in case user exists in auth but not in our table)
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email,
        password: generateUserPassword(response.account.homeAccountId),
      })
      
      let userId: string
      
      if (signInError && signInError.message === 'Invalid login credentials') {
        // User doesn't exist, create new user
        const { data: authUser, error: signUpError } = await supabase.auth.signUp({
          email: email,
          password: generateUserPassword(response.account.homeAccountId),
          options: {
            data: {
              name: graphUser.displayName,
              azure_ad_id: response.account.homeAccountId,
            },
            emailRedirectTo: undefined, // Disable confirmation email
          },
        })

        if (signUpError) throw signUpError
        userId = authUser.user!.id
      } else if (signInError) {
        throw signInError
      } else {
        // User exists in auth
        userId = signInData.user!.id
      }

      // Create user record
      await supabase.from('users').insert({
        id: userId,
        email: email,
        name: graphUser.displayName,
        role: 'user',
        azure_ad_id: response.account.homeAccountId,
        encrypted_refresh_token: encryptedRefreshToken,
      })

      // Create email account
      const webhookSecret = crypto.randomBytes(32).toString('hex')
      await supabase.from('email_accounts').insert({
        user_id: userId,
        email_address: email,
        webhook_secret: webhookSecret,
        sync_status: 'pending',
      })
    }

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`)
  } catch (error) {
    console.error('Auth callback error:', error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/auth/error?message=Authentication_failed`
    )
  }
}

async function encryptRefreshToken(token: string): Promise<string> {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  
  let encrypted = cipher.update(token, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag()
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
}

function generateUserPassword(azureId: string): string {
  // Generate a deterministic password from Azure AD ID and a secret
  const hash = crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY!)
    .update(azureId)
    .digest('hex')
  
  return hash.substring(0, 32)
}