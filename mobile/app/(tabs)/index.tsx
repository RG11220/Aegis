import { View, Text, ScrollView, Button } from 'react-native'
import React from 'react'
import * as Sentry from "@sentry/react-native";


const ChatsTab = () => {
  return (
    <ScrollView className='bg-surface'
      contentInsetAdjustmentBehavior='automatic'>
      <Text className='text-white'>Chats</Text>

    </ScrollView>
  )
}

export default ChatsTab