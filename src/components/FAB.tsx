
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Platform, ActivityIndicator, View } from 'react-native';
import { BlurView } from 'expo-blur';

interface FABProps {
  onPress: () => void;
  icon: string;
  label?: string;
  loading?: boolean;
}

export const FAB: React.FC<FABProps> = ({ onPress, icon, label, loading }) => {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.8} disabled={loading}>
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color="#FFD700" size="small" />
        ) : (
          <>
            <Text style={styles.icon}>{icon}</Text>
            {label && <Text style={styles.label}>{label}</Text>}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)', // Gold border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 27, 58, 0.6)', // Deep Ocean tint
  },
  icon: {
    fontSize: 24,
    color: '#FFD700', // Gold icon
  },
  label: {
    color: '#E0F7FA',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
    letterSpacing: 0.5,
  },
});
