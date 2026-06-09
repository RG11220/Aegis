import { useSSO } from '@clerk/clerk-expo'
import { useEffect, useState } from 'react'
import { Alert, Platform } from 'react-native'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'

// needed so OAuth redirect can complete back into the app
WebBrowser.maybeCompleteAuthSession()

function useSocialAuth() {
  const [loadingStrategy, setLoadingStrategy] = useState<string | null>(null)
  const { startSSOFlow } = useSSO()

  // warm up browser on android for faster OAuth
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
      // clerk redirect back after OAuth
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
        // auth layout redirects to tabs
      } else {
        // browser closed without completing — likely Expo Go or needs MFA
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
      // surface real clerk error message
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
