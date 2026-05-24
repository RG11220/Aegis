import { useSignIn } from '@clerk/clerk-expo'
import { useState } from 'react'

function useEmailSignIn() {
  const { signIn, setActive, isLoaded } = useSignIn()
  const [loading, setLoading] = useState(false)

  const handleEmailSignIn = async (
    email: string,
    password: string
  ): Promise<string | undefined> => {
    if (!isLoaded) return

    setLoading(true)
    try {
      const result = await signIn.create({
        identifier: email,
        password,
      })

      if (result.status === 'complete' && setActive) {
        await setActive({ session: result.createdSessionId })
        // auth gate in your layout will redirect automatically
      }
    } catch (error: any) {
      const message = error.errors?.[0]?.longMessage ?? 'Sign in failed'
      console.error(message)
      return message
    } finally {
      setLoading(false)
    }
  }

  return { handleEmailSignIn, loading }
}

export default useEmailSignIn
