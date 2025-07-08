import { PublicClientApplication, Configuration } from '@azure/msal-browser'

export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_MICROSOFT_TENANT_ID || 'common'}`,
    redirectUri: typeof window !== 'undefined' 
      ? `${window.location.origin}/auth/callback`
      : `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback`,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: true,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return
        }
        switch (level) {
          case 0: // Error
            console.error(message)
            return
          case 1: // Warning
            console.warn(message)
            return
          case 2: // Info
            console.info(message)
            return
          case 3: // Verbose
            console.debug(message)
            return
        }
      },
    },
  },
}

let msalInstance: PublicClientApplication | null = null

export function getMsalInstance(): PublicClientApplication {
  if (!msalInstance && typeof window !== 'undefined') {
    msalInstance = new PublicClientApplication(msalConfig)
  }
  return msalInstance!
}