// recovery screen — re-encrypt key with new password via seed phrase

import React, { useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import useKeyRecovery from '@/hooks/useKeyRecovery'
import { WORD_SET } from '@/lib/crypto/seed/SeedDictionary'

const WORD_COUNT = 24
const COLUMNS = 3
const ROWS = WORD_COUNT / COLUMNS // 8

const RecoverScreen = () => {
  const router = useRouter()
  const { handleRecover, loading } = useKeyRecovery()

  const [words, setWords] = useState<string[]>(Array(WORD_COUNT).fill(''))
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  // focus next input on submit
  const inputRefs = useRef<(TextInput | null)[]>(Array(WORD_COUNT).fill(null))

  const updateWord = (index: number, value: string) => {
    const next = [...words]
    next[index] = value.toLowerCase().trim()
    setWords(next)
  }

  const wordValid = (w: string) => w === '' || WORD_SET.has(w)
  const allFilled = words.every(w => w.length > 0)
  const allValid  = words.every(wordValid)

  const onSubmit = async () => {
    setError('')

    // validate words client-side first
    const invalid = words.filter(w => !WORD_SET.has(w))
    if (invalid.length > 0) {
      setError(`Unknown word(s): ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`)
      return
    }

    const errMsg = await handleRecover(words, password)
    if (errMsg) {
      setError(errMsg)
      return
    }

    // keys restored, go home
    Alert.alert('Account Recovered', 'Your keys have been restored. You can now send and read messages.', [
      { text: 'OK', onPress: () => router.replace('/(tabs)') },
    ])
  }

  return (
    <SafeAreaView className='flex-1 bg-surface-dark'>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className='flex-1'
      >
        <View className='px-6 pt-4'>
          <TouchableOpacity
            onPress={() => router.back()}
            className='w-10 h-10 rounded-full bg-surface-card items-center justify-center'
          >
            <Feather name='arrow-left' size={20} color='#ffffff' />
          </TouchableOpacity>
        </View>

        <ScrollView
          className='flex-1 px-6'
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
        >
          {/* heading */}
          <View className='mt-6 mb-8'>
            <View className='w-10 h-1 bg-primary-light rounded-full mb-4' />
            <Text className='text-white text-3xl font-bold'>Recover{'\n'}Account</Text>
            <Text className='text-gray-500 mt-2 text-sm leading-5'>
              Enter your 24 recovery words in order, then your current password. Your encrypted key will be restored.
            </Text>
          </View>

          {/* word grid */}
          <View className='mb-6'>
            <Text className='text-gray-400 text-xs font-medium mb-3 uppercase tracking-widest'>
              Recovery Words
            </Text>

            {Array.from({ length: ROWS }).map((_, rowIdx) => (
              <View key={rowIdx} className='flex-row gap-2 mb-2'>
                {Array.from({ length: COLUMNS }).map((_, colIdx) => {
                  const idx = rowIdx * COLUMNS + colIdx
                  const w = words[idx] ?? ''
                  const invalid = w.length > 0 && !WORD_SET.has(w)
                  return (
                    <View key={idx} className='flex-1'>
                      <Text className='text-gray-600 text-xs mb-1 text-center'>{idx + 1}</Text>
                      <TextInput
                        ref={el => { inputRefs.current[idx] = el }}
                        value={words[idx]}
                        onChangeText={val => updateWord(idx, val)}
                        placeholder='word'
                        placeholderTextColor='#444'
                        autoCapitalize='none'
                        autoCorrect={false}
                        returnKeyType={idx < WORD_COUNT - 1 ? 'next' : 'done'}
                        onSubmitEditing={() => inputRefs.current[idx + 1]?.focus()}
                        className='rounded-xl px-2 py-2 text-center text-sm'
                        style={{
                          backgroundColor: '#2a2a2e',
                          color: invalid ? '#f87171' : '#ffffff',
                          borderWidth: 1,
                          borderColor: invalid ? '#f87171' : '#333',
                        }}
                      />
                    </View>
                  )
                })}
              </View>
            ))}
          </View>

          {/* password */}
          <View className='mb-8'>
            <Text className='text-gray-400 text-xs font-medium mb-2 uppercase tracking-widest'>
              Current Password
            </Text>
            <View className='bg-surface-card rounded-2xl flex-row items-center px-4 border border-surface-light'>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder='Your current Aegis password'
                placeholderTextColor='#444'
                secureTextEntry={!showPassword}
                className='flex-1 text-white py-4 text-base'
              />
              <TouchableOpacity onPress={() => setShowPassword(p => !p)}>
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color='#666' />
              </TouchableOpacity>
            </View>
          </View>

          {/* error */}
          {error ? (
            <View className='flex-row items-center gap-2 mb-4'>
              <Feather name='alert-circle' size={14} color='#f87171' />
              <Text className='text-red-400 text-sm flex-1'>{error}</Text>
            </View>
          ) : null}

          {/* submit */}
          <TouchableOpacity
            onPress={onSubmit}
            disabled={loading || !allFilled || !allValid || !password}
            activeOpacity={0.85}
            className='rounded-2xl py-4 items-center mb-12'
            style={{
              backgroundColor: '#00876F',
              opacity: !allFilled || !allValid || !password ? 0.45 : 1,
            }}
          >
            {loading ? (
              <ActivityIndicator color='#fff' />
            ) : (
              <Text className='text-white font-bold text-base tracking-wide'>Restore Keys</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default RecoverScreen
