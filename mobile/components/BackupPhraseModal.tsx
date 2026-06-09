// Shown once, right after new encryption keys are provisioned. Displays the 24-word
// recovery phrase so the user can back it up. This is the ONLY way to recover messages
// after a forgotten password or on a new device — the phrase is also emailed, but this
// in-app backup means a lost email isn't total data loss.

import { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCryptoSession } from "@/lib/cryptoSession";

const BackupPhraseModal = () => {
  const words = useCryptoSession((s) => s.pendingSeedPhrase);
  const setPendingSeedPhrase = useCryptoSession((s) => s.setPendingSeedPhrase);
  const [confirmed, setConfirmed] = useState(false);

  if (!words || words.length === 0) return null;

  const done = () => {
    setConfirmed(false);
    setPendingSeedPhrase(null);
  };

  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "#0D0D0F" }}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 40 }}>
          <View style={{ alignItems: "center", marginBottom: 16 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#1a1a1e", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2e2e32" }}>
              <Ionicons name="key" size={26} color="#F4A261" />
            </View>
          </View>

          <Text style={{ color: "#F4F4F5", fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 8 }}>
            Save your recovery phrase
          </Text>
          <Text style={{ color: "#9a9aa0", fontSize: 14, textAlign: "center", marginBottom: 20, lineHeight: 20 }}>
            These 24 words are the only way to recover your messages if you forget your password or use a new device. Write them down in order and keep them somewhere safe. We can't show them again or reset them for you.
          </Text>

          {/* word grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", backgroundColor: "#1a1a1e", borderRadius: 16, borderWidth: 1, borderColor: "#2e2e32", paddingVertical: 8, paddingHorizontal: 8, marginBottom: 20 }}>
            {words.map((w, i) => (
              <View key={i} style={{ width: "50%", flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingHorizontal: 8 }}>
                <Text style={{ color: "#6B6B70", fontSize: 12, width: 26 }}>{i + 1}.</Text>
                <Text style={{ color: "#F4F4F5", fontSize: 15, fontWeight: "600" }}>{w}</Text>
              </View>
            ))}
          </View>

          {/* warning */}
          <View style={{ flexDirection: "row", gap: 8, backgroundColor: "#3a2000", borderRadius: 12, borderWidth: 1, borderColor: "#f4a26155", padding: 12, marginBottom: 20 }}>
            <Ionicons name="warning-outline" size={18} color="#F4A261" />
            <Text style={{ color: "#e7c9a3", fontSize: 12, flex: 1, lineHeight: 18 }}>
              Never share these words. Anyone who has them can read your messages. Aegis will never ask you for them.
            </Text>
          </View>

          {/* confirm */}
          <Pressable onPress={() => setConfirmed((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: confirmed ? "#00876F" : "#3a3a3e", backgroundColor: confirmed ? "#00876F" : "transparent", alignItems: "center", justifyContent: "center" }}>
              {confirmed && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <Text style={{ color: "#cfcfd4", fontSize: 14, flex: 1 }}>
              I've written down my recovery phrase and stored it safely.
            </Text>
          </Pressable>

          {/* continue */}
          <Pressable
            onPress={done}
            disabled={!confirmed}
            style={{ backgroundColor: "#F4A261", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: confirmed ? 1 : 0.45 }}
          >
            <Text style={{ color: "#0D0D0F", fontWeight: "700", fontSize: 16 }}>Continue</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
};

export default BackupPhraseModal;
