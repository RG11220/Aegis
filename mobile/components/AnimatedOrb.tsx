import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type AnimatedOrbProps = {
  colors: [string, string, ...string[]];
  size: number;
  initialX: number;
  initialY: number;
  duration: number;
};

export function AnimatedOrb({ colors, size, initialX, initialY, duration }: AnimatedOrbProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const easing = Easing.inOut(Easing.ease);

    const animX = Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, { toValue: 30, duration, easing, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: -30, duration, easing, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 0, duration, easing, useNativeDriver: true }),
      ])
    );

    const animY = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, { toValue: -20, duration: duration * 0.8, easing, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: duration * 0.8, easing, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: duration * 0.8, easing, useNativeDriver: true }),
      ])
    );

    const animScale = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.1, duration: duration * 1.2, easing, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.9, duration: duration * 1.2, easing, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: duration * 1.2, easing, useNativeDriver: true }),
      ])
    );

    animX.start();
    animY.start();
    animScale.start();

    return () => {
      animX.stop();
      animY.stop();
      animScale.stop();
    };
  }, [duration, translateX, translateY, scale]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: initialX,
        top: initialY,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    >
      <LinearGradient
        colors={colors}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: 0.6,
        }}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
    </Animated.View>
  );
}
