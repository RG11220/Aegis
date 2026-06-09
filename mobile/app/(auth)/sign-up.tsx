import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native'
import React, { useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSignUp } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useApi } from '@/lib/axios'
import { useCryptoSession } from '@/lib/cryptoSession'
import { persistKeys } from '@/lib/cryptoSessionStorage'

const SignUpScreen = () => {
  const { signUp, setActive, isLoaded } = useSignUp()
  const router = useRouter()
  const { apiWithAuth } = useApi()
  const setKeys = useCryptoSession((s) => s.setKeys)

  // uses server-side key provisioning (on-device RSA too slow)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [code, setCode] = useState('')
  const [pendingVerification, setPendingVerification] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const passwordsMatch = password === confirmPassword
  const canSubmit = username.trim() && email && password && confirmPassword && passwordsMatch

  const handleSignUp = async () => {
    if (!isLoaded) return
    if (!passwordsMatch) {
      setError('Passwords do not match.')
      return
    }
    try {
      setLoading(true)
      setError('')
      await signUp.create({ username, emailAddress: email, password })
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setPendingVerification(true)
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (!isLoaded) return
    try {
      setLoading(true)
      setError('')
      const result = await signUp.attemptEmailAddressVerification({ code })
      if (result.status === 'complete' && setActive) {
        await setActive({ session: result.createdSessionId })

        try {
          // ensure user row exists before provisioning
          await apiWithAuth({ method: 'POST', url: '/auth/callback' })

          const { data } = await apiWithAuth<{ publicKey: string; privateKey: string }>({
            method: 'POST',
            url: '/auth/provision-keys',
            data: { password },
          })

          setKeys(data.privateKey, data.publicKey)
          // persist to the device keychain so keys survive app restarts
          await persistKeys(email, data.privateKey, data.publicKey)
        } catch (cryptoErr: any) {
          const msg =
            cryptoErr?.response?.data?.message ?? cryptoErr?.message ?? String(cryptoErr)
          console.error('[Crypto] Key provisioning failed:', cryptoErr)
          Alert.alert('Encryption setup failed', msg)
          setError(`Encryption setup failed: ${msg}`)
        }
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage ?? 'Invalid code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (pendingVerification) {
    return (
      <SafeAreaView className='flex-1 bg-surface-dark'>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className='flex-1'
        >
          <View className='px-6 pt-4'>
            <TouchableOpacity
              onPress={() => setPendingVerification(false)}
              className='w-10 h-10 rounded-full bg-surface-card items-center justify-center'
            >
              <Feather name='arrow-left' size={20} color='#ffffff' />
            </TouchableOpacity>
          </View>

          <View className='flex-1 justify-center px-6'>
            <View className='mb-8'>
              <View className='w-10 h-1 bg-primary-light rounded-full mb-4' />
              <Text className='text-white text-3xl font-bold'>Check your{'\n'}email</Text>
              <Text className='text-gray-500 mt-2 text-sm'>
                We sent a 6-digit code to{' '}
                <Text className='text-gray-300'>{email}</Text>
              </Text>
            </View>

            <View className='gap-4'>
              <View>
                <Text className='text-gray-400 text-xs font-medium mb-2 uppercase tracking-widest'>Verification Code</Text>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder='000000'
                  placeholderTextColor='#444'
                  keyboardType='number-pad'
                  maxLength={6}
                  className='bg-surface-card text-white rounded-2xl px-4 py-4 text-base border border-surface-light text-center tracking-widest'
                />
              </View>

              {error ? (
                <View className='flex-row items-center gap-2'>
                  <Feather name='alert-circle' size={14} color='#f87171' />
                  <Text className='text-red-400 text-sm'>{error}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View className='px-6 pb-10 gap-4'>
            <TouchableOpacity
              onPress={handleVerify}
              disabled={loading || code.length < 6}
              activeOpacity={0.85}
              className='rounded-2xl py-4 items-center'
              style={{ backgroundColor: '#00876F', opacity: code.length < 6 ? 0.45 : 1 }}
            >
              {loading ? (
                <ActivityIndicator color='#fff' />
              ) : (
                <Text className='text-white font-bold text-base tracking-wide'>Verify Email</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSignUp} disabled={loading} className='items-center py-1'>
              <Text className='text-gray-500 text-sm'>
                Didn't get it?{' '}
                <Text style={{ color: '#00876F' }} className='font-semibold'>Resend code</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className='flex-1 bg-surface-dark'>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className='flex-1'
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
        >
          <View className='px-6 pt-4'>
            <TouchableOpacity
              onPress={() => router.back()}
              className='w-10 h-10 rounded-full bg-surface-card items-center justify-center'
            >
              <Feather name='arrow-left' size={20} color='#ffffff' />
            </TouchableOpacity>
          </View>

          <View className='px-6 pt-6 pb-10'>
            <View className='mb-8'>
              <View className='w-10 h-1 bg-primary-light rounded-full mb-4' />
              <Text className='text-white text-3xl font-bold'>Create your{'\n'}account</Text>
              <Text className='text-gray-500 mt-2 text-sm'>Join Aegis to get started.</Text>
            </View>

            <View className='gap-4'>
              {/* username */}
              <View>
                <Text className='text-gray-400 text-xs font-medium mb-2 uppercase tracking-widest'>Username</Text>
                <View className='bg-surface-card rounded-2xl flex-row items-center px-4 border border-surface-light'>
                  <Feather name='at-sign' size={16} color='#666' />
                  <TextInput
                    value={username}
                    onChangeText={setUsername}
                    placeholder='your_username'
                    placeholderTextColor='#444'
                    autoCapitalize='none'
                    autoCorrect={false}
                    className='flex-1 text-white py-4 text-base ml-3'
                  />
                </View>
              </View>

              {/* email */}
              <View>
                <Text className='text-gray-400 text-xs font-medium mb-2 uppercase tracking-widest'>Email</Text>
                <View className='bg-surface-card rounded-2xl flex-row items-center px-4 border border-surface-light'>
                  <Feather name='mail' size={16} color='#666' />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder='you@example.com'
                    placeholderTextColor='#444'
                    keyboardType='email-address'
                    autoCapitalize='none'
                    className='flex-1 text-white py-4 text-base ml-3'
                  />
                </View>
              </View>

              {/* password */}
              <View>
                <Text className='text-gray-400 text-xs font-medium mb-2 uppercase tracking-widest'>Password</Text>
                <View className='bg-surface-card rounded-2xl flex-row items-center px-4 border border-surface-light'>
                  <Feather name='lock' size={16} color='#666' />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder='••••••••'
                    placeholderTextColor='#444'
                    secureTextEntry={!showPassword}
                    className='flex-1 text-white py-4 text-base ml-3'
                  />
                  <TouchableOpacity onPress={() => setShowPassword(p => !p)}>
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color='#666' />
                  </TouchableOpacity>
                </View>
              </View>

              {/* confirm password */}
              <View>
                <Text className='text-gray-400 text-xs font-medium mb-2 uppercase tracking-widest'>Confirm Password</Text>
                <View
                  className='bg-surface-card rounded-2xl flex-row items-center px-4 border'
                  style={{
                    borderColor: confirmPassword && !passwordsMatch ? '#f87171' : '#2a2a2a',
                  }}
                >
                  <Feather name='lock' size={16} color='#666' />
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder='••••••••'
                    placeholderTextColor='#444'
                    secureTextEntry={!showConfirmPassword}
                    className='flex-1 text-white py-4 text-base ml-3'
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPassword(p => !p)}>
                    <Feather name={showConfirmPassword ? 'eye-off' : 'eye'} size={18} color='#666' />
                  </TouchableOpacity>
                </View>
                {confirmPassword && !passwordsMatch ? (
                  <Text className='text-red-400 text-xs mt-1 ml-1'>Passwords do not match</Text>
                ) : null}
              </View>

              {error ? (
                <View className='flex-row items-center gap-2'>
                  <Feather name='alert-circle' size={14} color='#f87171' />
                  <Text className='text-red-400 text-sm'>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                onPress={handleSignUp}
                disabled={loading || !canSubmit}
                activeOpacity={0.85}
                className='rounded-2xl py-4 items-center mt-2'
                style={{ backgroundColor: '#00876F', opacity: !canSubmit ? 0.45 : 1 }}
              >
                {loading ? (
                  <ActivityIndicator color='#fff' />
                ) : (
                  <Text className='text-white font-bold text-base tracking-wide'>Create Account</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.push('/(auth)/sign-in')} className='items-center py-1'>
                <Text className='text-gray-500 text-sm'>
                  Already have an account?{' '}
                  <Text style={{ color: '#00876F' }} className='font-semibold'>Sign in</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default SignUpScreen
