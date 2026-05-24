import { View, Text, ScrollView } from 'react-native'
import React from 'react'

const ChatsTab = () => {
  return (
    <ScrollView className='bg-surface'
      contentInsetAdjustmentBehavior='automatic'>
      <Text className='text-white'>Chats</Text>
    </ScrollView>
  )
}

export default ChatsTab