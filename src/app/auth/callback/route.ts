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
    console.log('Has access token:', !!response?.accessToken)
    console.log('Home account ID:', response?.account?.homeAccountId)
    console.log('Account details:', {
      homeAccountId: response?.account?.homeAccountId,
      localAccountId: response?.account?.localAccountId,
      username: response?.account?.username,
      environment: response?.account?.environment
    })
    
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

    // Create or update user in Supabase (use service role to bypass RLS)
    const supabase = await createClient(true)
    
    // Check if user exists (by azure_ad_id or email)
    const email = graphUser.mail || graphUser.userPrincipalName
    console.log('Looking for user with email:', email)
    console.log('Looking for user with homeAccountId:', response.account.homeAccountId)
    
    let { data: existingUser, error: azureIdError } = await supabase
      .from('users')
      .select('id, azure_ad_id')
      .eq('azure_ad_id', response.account.homeAccountId)
      .single()
    
    console.log('User found by azure_ad_id:', existingUser)
    console.log('Azure ID lookup error:', azureIdError)
    
    // If not found by azure_ad_id, try by email
    if (!existingUser) {
      const { data: userByEmail, error: emailError } = await supabase
        .from('users')
        .select('id, azure_ad_id')
        .eq('email', email)
        .single()
      existingUser = userByEmail
      console.log('User found by email:', existingUser)
      console.log('Email lookup error:', emailError)
    }

    // Encrypt refresh token
    // Note: MSAL v3+ doesn't expose refresh tokens directly for security
    // We'll store the access token for now and handle refresh via MSAL
    const refreshTokenToStore = response.accessToken
    const encryptedRefreshToken = await encryptRefreshToken(refreshTokenToStore)

    if (existingUser) {
      console.log('Found existing user, updating user record...')
      // Update existing user
      const { error: updateUserError } = await supabase
        .from('users')
        .update({
          azure_ad_id: response.account.homeAccountId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUser.id)

      if (updateUserError) {
        console.log('User update error:', updateUserError)
        throw updateUserError
      }
      console.log('User record updated successfully')

      // Upsert email account with token (insert or update if exists)
      console.log('Upserting email account...')
      const expiresAt = new Date(Date.now() + 3600 * 1000) // 1 hour from now
      const webhookSecret = crypto.randomBytes(32).toString('hex')
      
      const { error: upsertError } = await supabase
        .from('email_accounts')
        .upsert({
          user_id: existingUser.id,
          email_address: email,
          encrypted_access_token: encryptedRefreshToken,
          access_token_expires_at: expiresAt.toISOString(),
          webhook_secret: webhookSecret,
          sync_status: 'pending'
        }, {
          onConflict: 'user_id,email_address',
          ignoreDuplicates: false
        })
      
      if (upsertError) {
        console.log('Email account upsert error:', upsertError)
        throw upsertError
      }
      console.log('Email account upserted successfully')

      // Sign in to Supabase (use regular client for session cookies)
      console.log('Attempting to sign in user to Supabase...')
      const regularSupabase = await createClient() // Regular client for session
      const { data: signInData, error: signInError } = await regularSupabase.auth.signInWithPassword({
        email: graphUser.mail || graphUser.userPrincipalName,
        password: generateUserPassword(response.account.homeAccountId),
      })

      console.log('Supabase sign in result:', { 
        success: !signInError, 
        error: signInError?.message,
        userId: signInData?.user?.id 
      })

      if (signInError) throw signInError
    } else {
      console.log('User not found in public.users table, checking auth.users...')
      
      // Try to sign in first (in case user exists in auth but not in our table)
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email,
        password: generateUserPassword(response.account.homeAccountId),
      })
      
      console.log('Sign in attempt result:', { 
        success: !signInError, 
        error: signInError?.message,
        userId: signInData?.user?.id 
      })
      
      let userId: string
      
      if (signInError && signInError.message === 'Invalid login credentials') {
        console.log('User not in auth, creating new user...')
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

        console.log('Sign up result:', { success: !signUpError, error: signUpError?.message })
        if (signUpError) throw signUpError
        userId = authUser.user!.id
      } else if (signInError) {
        console.log('Sign in failed with unexpected error:', signInError)
        throw signInError
      } else {
        // User exists in auth
        console.log('User exists in auth, using existing ID:', signInData.user!.id)
        userId = signInData.user!.id
      }

      // Create user record
      console.log('Creating user record for:', userId)
      const { error: userInsertError } = await supabase.from('users').insert({
        id: userId,
        email: email,
        name: graphUser.displayName,
        role: 'user',
        azure_ad_id: response.account.homeAccountId,
      })

      if (userInsertError) {
        console.log('User insert error:', userInsertError)
        throw userInsertError
      }
      console.log('User record created successfully')

      // Upsert email account with token (insert or update if exists)
      console.log('Upserting email account with token...')
      const webhookSecret = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 3600 * 1000) // 1 hour from now
      const { error: emailAccountError } = await supabase
        .from('email_accounts')
        .upsert({
          user_id: userId,
          email_address: email,
          encrypted_access_token: encryptedRefreshToken,
          access_token_expires_at: expiresAt.toISOString(),
          webhook_secret: webhookSecret,
          sync_status: 'pending',
        }, {
          onConflict: 'user_id,email_address',
          ignoreDuplicates: false
        })

      if (emailAccountError) {
        console.log('Email account upsert error:', emailAccountError)
        throw emailAccountError
      }
      console.log('Email account upserted successfully')
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