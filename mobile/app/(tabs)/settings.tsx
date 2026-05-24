import { View, Text, ScrollView, Pressable } from 'react-native'
import React from 'react'
import { useAuth } from '@clerk/clerk-expo';

const settings = () => {
 const { signOut } = useAuth();
  return (
    <ScrollView className='bg-surface'
          contentInsetAdjustmentBehavior='automatic'>
          <Text className='text-white'>Profile</Text>
          <Pressable onPress={() => signOut()} className='bg-primary p-3 rounded-lg mt-5'>
            <Text className='text-white'>Sign Out</Text>
          </Pressable>
        </ScrollView>
  )
}

export default settings