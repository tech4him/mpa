import { Client } from '@microsoft/microsoft-graph-client'
import { ConfidentialClientApplication } from '@azure/msal-node'
import fs from 'fs'
import path from 'path'

// Simple file-based token cache implementation
class SimpleTokenCache {
  private cachePath: string
  private cache: string = ''

  constructor() {
    this.cachePath = path.join(process.cwd(), '.msal-cache.json')
    this.loadCache()
  }

  private loadCache() {
    try {
      if (fs.existsSync(this.cachePath)) {
        this.cache = fs.readFileSync(this.cachePath, 'utf8')
      }
    } catch (error) {
      console.warn('Failed to load token cache:', error)
      this.cache = ''
    }
  }

  private saveCache() {
    try {
      fs.writeFileSync(this.cachePath, this.cache)
    } catch (error) {
      console.warn('Failed to save token cache:', error)
    }
  }

  public getCache(): string {
    return this.cache
  }

  public setCache(cache: string) {
    this.cache = cache
    this.saveCache()
  }
}

const tokenCache = new SimpleTokenCache()

const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID || 'dummy-client-id',
    authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}`,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || 'dummy-secret',
  },
  cache: {
    cachePlugin: {
      beforeCacheAccess: async (cacheContext: any) => {
        const cache = tokenCache.getCache()
        if (cache && cache.length > 0) {
          cacheContext.tokenCache.deserialize(cache)
        }
      },
      afterCacheAccess: async (cacheContext: any) => {
        if (cacheContext.cacheHasChanged) {
          const serializedCache = cacheContext.tokenCache.serialize()
          tokenCache.setCache(serializedCache)
        }
      }
    }
  }
}

export const msalClient = new ConfidentialClientApplication(msalConfig)

export async function getGraphClient(accessToken: string) {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken)
    },
  })
}

export async function getAppOnlyToken() {
  const result = await msalClient.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  })
  
  if (!result?.accessToken) {
    throw new Error('Failed to acquire app-only token')
  }
  
  return result.accessToken
}

export async function getValidTokenForUser(userId: string, scopes: string[] = ['User.Read', 'Mail.ReadWrite']): Promise<string> {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  
  // Get user's Azure AD ID
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('azure_ad_id')
    .eq('id', userId)
    .single()
    
  if (userError || !user?.azure_ad_id) {
    throw new Error('User not found or missing Azure AD ID')
  }
  
  try {
    // Get account from cache
    const accounts = await msalClient.getTokenCache().getAllAccounts()
    const account = accounts.find(acc => acc.homeAccountId === user.azure_ad_id)
    
    if (!account) {
      throw new Error('Account not found in token cache')
    }
    
    // Try to get token silently (will auto-refresh if needed)
    const tokenResponse = await msalClient.acquireTokenSilent({
      account: account,
      scopes: scopes,
      forceRefresh: false // Let MSAL decide when to refresh
    })
    
    return tokenResponse.accessToken
  } catch (error: any) {
    // Check if this is an interaction required error
    if (error.errorCode === 'interaction_required' || 
        error.errorCode === 'invalid_grant' ||
        error.errorCode === 'token_renewal_error') {
      // Token refresh failed, user needs to re-authenticate
      throw new Error('User needs to re-authenticate')
    }
    
    // For other errors, log and re-throw
    console.error('Token acquisition error:', error)
    throw error
  }
}

export async function refreshUserToken(storedToken: string) {
  // Legacy function - use getValidTokenForUser instead
  throw new Error('Legacy function. Use getValidTokenForUser instead.')
}

export async function getTokenCacheStatus(userId: string) {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('azure_ad_id')
    .eq('id', userId)
    .single()
    
  if (userError || !user?.azure_ad_id) {
    return { status: 'no_user' }
  }
  
  const accounts = await msalClient.getTokenCache().getAllAccounts()
  const account = accounts.find(acc => acc.homeAccountId === user.azure_ad_id)
  
  if (!account) {
    return { status: 'no_account' }
  }
  
  try {
    await msalClient.acquireTokenSilent({
      account: account,
      scopes: ['User.Read']
    })
    return { status: 'valid' }
  } catch (error: any) {
    if (error.errorCode === 'interaction_required' || 
        error.errorCode === 'invalid_grant' ||
        error.errorCode === 'token_renewal_error') {
      return { status: 'needs_refresh' }
    }
    return { status: 'error', error: error.message }
  }
}