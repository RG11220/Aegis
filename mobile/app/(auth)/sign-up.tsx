import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import React, { useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSignUp } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'

const SignUpScreen = () => {
  const { signUp, setActive, isLoaded } = useSignUp()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [pendingVerification, setPendingVerification] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSignUp = async () => {
    if (!isLoaded) return
    try {
      setLoading(true)
      setError('')
      await signUp.create({ emailAddress: email, password })
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
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
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
          {/* Back button */}
          <View className='px-6 pt-4'>
            <TouchableOpacity
              onPress={() => setPendingVerification(false)}
              className='w-10 h-10 rounded-full bg-surface-card items-center justify-center'
            >
              <Feather name='arrow-left' size={20} color='#ffffff' />
            </TouchableOpacity>
          </View>

          {/* Centered form area */}
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
                  className='bg-surface-card text-white rounded-2xl px-4 py-4 text-base border border-surface-light tracking-widest text-center'
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

          {/* CTA pinned to bottom */}
          <View className='px-6 pb-10 gap-4'>
            <TouchableOpacity
              onPress={handleVerify}
              disabled={loading || code.length < 6}
              activeOpacity={0.85}
              className='rounded-2xl py-4 items-center'
              style={{
                backgroundColor: '#00876F',
                opacity: code.length < 6 ? 0.45 : 1,
              }}
            >
              {loading ? (
                <ActivityIndicator color='#fff' />
              ) : (
                <Text className='text-white font-bold text-base tracking-wide'>Verify Email</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSignUp}
              disabled={loading}
              className='items-center py-1'
            >
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
        {/* Back button */}
        <View className='px-6 pt-4'>
          <TouchableOpacity
            onPress={() => router.back()}
            className='w-10 h-10 rounded-full bg-surface-card items-center justify-center'
          >
            <Feather name='arrow-left' size={20} color='#ffffff' />
          </TouchableOpacity>
        </View>

        {/* Centered form area */}
        <View className='flex-1 justify-center px-6'>
          <View className='mb-8'>
            <View className='w-10 h-1 bg-primary-light rounded-full mb-4' />
            <Text className='text-white text-3xl font-bold'>Create your{'\n'}account</Text>
            <Text className='text-gray-500 mt-2 text-sm'>Join Aegis to get started.</Text>
          </View>

          <View className='gap-4'>
            <View>
              <Text className='text-gray-400 text-xs font-medium mb-2 uppercase tracking-widest'>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder='you@example.com'
                placeholderTextColor='#444'
                keyboardType='email-address'
                autoCapitalize='none'
                className='bg-surface-card text-white rounded-2xl px-4 py-4 text-base border border-surface-light'
              />
            </View>

            <View>
              <Text className='text-gray-400 text-xs font-medium mb-2 uppercase tracking-widest'>Password</Text>
              <View className='bg-surface-card rounded-2xl flex-row items-center px-4 border border-surface-light'>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder='••••••••'
                  placeholderTextColor='#444'
                  secureTextEntry={!showPassword}
                  className='flex-1 text-white py-4 text-base'
                />
                <TouchableOpacity onPress={() => setShowPassword(p => !p)}>
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color='#666' />
                </TouchableOpacity>
              </View>
            </View>

            {error ? (
              <View className='flex-row items-center gap-2'>
                <Feather name='alert-circle' size={14} color='#f87171' />
                <Text className='text-red-400 text-sm'>{error}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* CTA pinned to bottom */}
        <View className='px-6 pb-10 gap-4'>
          <TouchableOpacity
            onPress={handleSignUp}
            disabled={loading || !email || !password}
            activeOpacity={0.85}
            className='rounded-2xl py-4 items-center'
            style={{
              backgroundColor: '#00876F',
              opacity: !email || !password ? 0.45 : 1,
            }}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default SignUpScreen
