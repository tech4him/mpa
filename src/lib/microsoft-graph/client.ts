import { Client } from '@microsoft/microsoft-graph-client'
import { ConfidentialClientApplication } from '@azure/msal-node'

const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID || 'dummy-client-id',
    authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}`,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || 'dummy-secret',
  },
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

export async function refreshUserToken(storedToken: string) {
  // In server-side flow, we don't get refresh tokens
  // The stored token is actually the access token from the initial auth
  // We need to check if it's still valid or prompt for re-authentication
  
  console.log('Note: Server-side flow does not support refresh tokens')
  
  // For now, we'll return an error to prompt re-authentication
  // In a production app, you'd implement a token cache or use a different flow
  throw new Error('Token refresh not supported in server-side flow. Please re-authenticate.')
}