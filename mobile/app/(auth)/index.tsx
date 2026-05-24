import { View, Text, Dimensions, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { Feather } from '@expo/vector-icons'
import useAuthSocial from '@/hooks/useSocialAuth'
import { useRouter } from 'expo-router'

const { width, height } = Dimensions.get('window')

const AuthScreen = () => {
  const { handleSocialAuth, loadingStrategy } = useAuthSocial()
  const router = useRouter()
  const isLoading = loadingStrategy !== null

  return (
    <SafeAreaView className='flex-1 bg-surface-dark'>
      {/* Branding */}
      <View className='items-center pt-10'>
        <Image
          source={require('../../assets/images/logo.png')}
          style={{ width: 100, height: 100, marginVertical: -20 }}
          contentFit='contain'
        />
        <Text className='text-4xl font-bold text-white tracking-wider uppercase'>
          Aegis
        </Text>
      </View>

      {/* Hero + buttons */}
      <View className='flex-1 justify-center items-center px-6'>
        <Image
          source={require('../../assets/images/auth.png')}
          style={{ width: width - 48, height: height * 0.3 }}
          contentFit='contain'
        />

        <View className='mt-6 items-center'>
          <Text className='text-4xl font-bold text-white text-center'>
            Connect & Chat
          </Text>
          <Text className='text-gray-400 text-base mt-2 text-center'>
            Secure, end-to-end encrypted messaging.
          </Text>
        </View>

        <View className='w-full gap-3 mt-10'>
          {/* Google */}
          <Pressable
            className='flex-row items-center justify-center gap-3 bg-white py-4 rounded-2xl active:opacity-80'
            disabled={isLoading}
            accessibilityRole='button'
            accessibilityLabel='Continue with Google'
            onPress={() => !isLoading && handleSocialAuth('oauth_google')}
          >
            {loadingStrategy === 'oauth_google' ? (
              <ActivityIndicator size='small' color='#1a1a1a' />
            ) : (
              <>
                <Image
                  source={require('../../assets/images/google.png')}
                  style={{ width: 20, height: 20 }}
                  contentFit='contain'
                />
                <Text className='text-gray-900 font-semibold text-base'>Continue with Google</Text>
              </>
            )}
          </Pressable>

          {/* Email */}
          <Pressable
            className='flex-row items-center justify-center gap-3 border border-surface-light py-4 rounded-2xl active:opacity-80'
            onPress={() => router.push('/(auth)/sign-in')}
            accessibilityRole='button'
            accessibilityLabel='Continue with Email'
          >
            <Feather name='mail' size={20} color='#ffffff' />
            <Text className='text-white font-semibold text-base'>Continue with Email</Text>
          </Pressable>
        </View>

        <Text className='text-gray-600 text-xs text-center mt-6'>
          By continuing, you agree to our Terms of Service{'\n'}and Privacy Policy.
        </Text>
      </View>
    </SafeAreaView>
  )
}

export default AuthScreen
