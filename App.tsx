import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { IdentityService, MarinerIdentity } from './src/services/IdentityService';

export default function App() {
  const [identity, setIdentity] = useState<MarinerIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const idService = IdentityService.getInstance();
      const user = await idService.getOrInitializeIdentity();
      setIdentity(user);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#006064" />
        <Text style={styles.loadingText}>Initializing Mariner's Grid...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mariner's AI Grid</Text>
      
      <View style={styles.card}>
        <Text style={styles.label}>Shadow Identity (Device ID)</Text>
        <Text style={styles.value}>{identity?.deviceId}</Text>
        
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Trust Score</Text>
            <Text style={styles.value}>{identity?.trustScore}</Text>
          </View>
          <View>
            <Text style={styles.label}>Status</Text>
            <Text style={styles.value}>{identity?.isNewUser ? 'New Recruit' : 'Veteran'}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.status}>Local-First • Cloud-Optional</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#001B3A', // Deep Ocean
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#E0F7FA',
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#E0F7FA',
    marginBottom: 40,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Glass morphism
    borderRadius: 16,
    padding: 24,
    width: '100%',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
  },
  label: {
    fontSize: 12,
    color: '#81D4FA',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 20,
    fontFamily: 'Courier', // Monospace for IDs
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  status: {
    position: 'absolute',
    bottom: 40,
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
  }
});