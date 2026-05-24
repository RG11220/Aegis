import { useSignUp } from '@clerk/clerk-expo'
import { useState } from 'react'

function useEmailSignUp() {
  const { signUp, setActive, isLoaded } = useSignUp()
  const [pendingVerification, setPendingVerification] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSignUp = async (
    email: string,
    password: string
  ): Promise<string | undefined> => {
    if (!isLoaded) return

    setLoading(true)
    try {
      await signUp.create({ emailAddress: email, password })
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setPendingVerification(true)
    } catch (error: any) {
      const message = error.errors?.[0]?.longMessage ?? 'Sign up failed'
      console.error(message)
      return message
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (code: string): Promise<string | undefined> => {
    if (!isLoaded) return

    setLoading(true)
    try {
      const result = await signUp.attemptEmailAddressVerification({ code })

      if (result.status === 'complete' && setActive) {
        await setActive({ session: result.createdSessionId })
        // auth gate in your layout will redirect automatically
      }
    } catch (error: any) {
      const message = error.errors?.[0]?.longMessage ?? 'Verification failed'
      console.error(message)
      return message
    } finally {
      setLoading(false)
    }
  }

  return { handleSignUp, handleVerify, pendingVerification, loading }
}

export default useEmailSignUp
