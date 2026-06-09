import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import React, { useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import useEmailSignIn from '@/hooks/useEmailSignIn'

const SignInScreen = () => {
  const router = useRouter()
  const { handleEmailSignIn, loading } = useEmailSignIn()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const handleSignIn = async () => {
    setError('')
    const err = await handleEmailSignIn(email, password)
    if (err) setError(err)
  }

  return (
    <SafeAreaView className='flex-1 bg-surface-dark'>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className='flex-1'
      >
        {/* back */}
        <View className='px-6 pt-4'>
          <TouchableOpacity
            onPress={() => router.back()}
            className='w-10 h-10 rounded-full bg-surface-card items-center justify-center'
          >
            <Feather name='arrow-left' size={20} color='#ffffff' />
          </TouchableOpacity>
        </View>

        <View className='flex-1 justify-center px-6'>
          {/* heading */}
          <View className='mb-8'>
            <View className='w-10 h-1 bg-primary-light rounded-full mb-4' />
            <Text className='text-white text-3xl font-bold'>Welcome{'\n'}back</Text>
            <Text className='text-gray-500 mt-2 text-sm'>Sign in to continue to Aegis.</Text>
          </View>

          {/* fields */}
          <View className='gap-4'>
            <View>
              <Text className='text-gray-400 text-xs font-medium mb-2 uppercase tracking-widest'>Email or Username</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder='you@example.com or your_username'
                placeholderTextColor='#444'
                autoCapitalize='none'
                autoCorrect={false}
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

        {/* cta */}
        <View className='px-6 pb-10 gap-4'>
          <TouchableOpacity
            onPress={handleSignIn}
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
              <Text className='text-white font-bold text-base tracking-wide'>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/recover-account')} className='items-center py-1'>
            <Text className='text-gray-500 text-sm'>
              Forgot password?{' '}
              <Text style={{ color: '#00876F' }} className='font-semibold'>Recover account</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/sign-up')} className='items-center py-1'>
            <Text className='text-gray-500 text-sm'>
              No account?{' '}
              <Text style={{ color: '#00876F' }} className='font-semibold'>Create one</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default SignInScreen
