import { View, Text } from 'react-native'
import { Redirect, Stack } from 'expo-router'
import { useAuth } from "@clerk/clerk-expo";
import { HeaderShownContext } from '@react-navigation/elements';


const AuthLayout = () => {
    const { isSignedIn, isLoaded } = useAuth();

    if (!isLoaded) {
    return null; // or a loading spinner
  }

    if (isSignedIn) {
        return <Redirect href="/(tabs)" />
    }
  return (
    <Stack screenOptions={{ headerShown: false }}> </Stack>
  )
}

export default AuthLayout