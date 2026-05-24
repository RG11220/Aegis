import { useSSO } from '@clerk/clerk-expo'
import { useEffect, useState } from 'react'
import { Alert, Platform } from 'react-native'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'

// Required for the OAuth redirect to complete: this dismisses the in-app browser
// and lets startSSOFlow resolve with a session. Without it, "Continue with Google"
// opens the browser but never returns a session, so sign-in silently fails.
WebBrowser.maybeCompleteAuthSession()

function useSocialAuth() {
  const [loadingStrategy, setLoadingStrategy] = useState<string | null>(null)
  const { startSSOFlow } = useSSO()

  // Warm up the browser on Android for a faster, more reliable OAuth flow (Clerk-recommended).
  useEffect(() => {
    if (Platform.OS !== 'android') return
    void WebBrowser.warmUpAsync()
    return () => {
      void WebBrowser.coolDownAsync()
    }
  }, [])

  const handleSocialAuth = async (strategy: 'oauth_google' | 'oauth_apple') => {
    const provider =
      strategy === 'oauth_google' ? 'Google'
      : strategy === 'oauth_apple' ? 'Apple'
      : 'the provider'

    setLoadingStrategy(strategy)
    try {
      // redirectUrl tells Clerk where to hand control back after OAuth
      const redirectUrl = Linking.createURL('/')
      console.log('[SSO] starting', strategy, '| redirectUrl:', redirectUrl)

      const result = await startSSOFlow({ strategy, redirectUrl })
      console.log('[SSO] result:', JSON.stringify({
        createdSessionId: result.createdSessionId,
        hasSetActive: !!result.setActive,
        hasSignIn: !!result.signIn,
        hasSignUp: !!result.signUp,
      }))

      const { createdSessionId, setActive } = result
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId })
        // Signed in — the (auth) layout guard will redirect to (tabs).
      } else {
        // No session AND no thrown error means the browser closed without the redirect
        // completing — almost always Expo Go (the custom scheme can't redirect back),
        // a dev build that wasn't rebuilt after setting the scheme, or an extra step (MFA).
        console.warn('[SSO] no session created — redirect did not complete', {
          createdSessionId,
          needsMoreSteps: !!result.signIn || !!result.signUp,
        })
        Alert.alert(
          `${provider} sign-in didn't complete`,
          "The browser closed without returning a session. If you're testing in Expo Go, build a dev client instead — the custom URL scheme can't redirect back into Expo Go."
        )
      }
    } catch (error) {
      // Clerk API errors put the real reason on an `errors` array — surface it instead
      // of a generic message so failures are diagnosable.
      const clerkError = (
        error as { errors?: { message?: string; longMessage?: string; code?: string }[] }
      )?.errors?.[0]
      const detail =
        clerkError?.longMessage ||
        clerkError?.message ||
        (error instanceof Error ? error.message : String(error))

      console.error('Error in social auth:', detail, '| code:', clerkError?.code, '| raw:', error)

      Alert.alert(`${provider} sign-in failed`, detail)
    } finally {
      setLoadingStrategy(null)
    }
  }

  return { handleSocialAuth, loadingStrategy }
}

export default useSocialAuth
