
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Switch } from 'react-native';
import { BlurView } from 'expo-blur';
import { TelemetrySource, TelemetryService } from '../services/TelemetryService';
import { MockNMEAStreamer } from '../services/MockNMEAStreamer';

interface DevMenuProps {
  visible: boolean;
  onClose: () => void;
  telemetrySource: TelemetrySource;
  onSourceChange: (source: TelemetrySource) => void;
  vesselLocation: { lat: number; lng: number };
  isStressTestActive: boolean;
  onToggleStressTest: (active: boolean) => void;
}

export const DevMenu: React.FC<DevMenuProps> = ({
  visible,
  onClose,
  telemetrySource,
  onSourceChange,
  vesselLocation,
  isStressTestActive,
  onToggleStressTest,
}) => {
  const [autoFallback, setAutoFallback] = useState(true);

  const startWinterStorm = () => {
    const service = TelemetryService.getInstance();
    service.startMock(MockNMEAStreamer.WINTER_STORM_SCENARIO(vesselLocation.lat, vesselLocation.lng));
    onClose();
  };

  const startDivergence = () => {
    const service = TelemetryService.getInstance();
    service.startMock(MockNMEAStreamer.DIVERGENCE_SCENARIO(vesselLocation.lat, vesselLocation.lng, 15));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>COMMAND BRIDGE (DEV)</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>CLOSE</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.sectionTitle}>TELEMETRY SOURCE</Text>
            <View style={styles.sourceGrid}>
              {(['device', 'signalk', 'mock'] as TelemetrySource[]).map((src) => (
                <TouchableOpacity
                  key={src}
                  style={[styles.sourceButton, telemetrySource === src && styles.sourceButtonActive]}
                  onPress={() => onSourceChange(src)}
                >
                  <Text style={[styles.sourceButtonText, telemetrySource === src && styles.sourceButtonTextActive]}>
                    {src.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Auto-Fallback to Device GPS</Text>
              <Switch 
                value={autoFallback} 
                onValueChange={setAutoFallback}
                trackColor={{ false: '#333', true: '#00BFFF' }}
              />
            </View>

            <Text style={styles.sectionTitle}>SIMULATION PRESETS</Text>
            <TouchableOpacity style={styles.presetButton} onPress={startWinterStorm}>
              <Text style={styles.presetButtonText}>❄️ Winter Storm (Illinois Scenario)</Text>
              <Text style={styles.presetSubtext}>Simulates 28hPa drop + 50kt wind</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.presetButton} onPress={startDivergence}>
              <Text style={styles.presetButtonText}>📐 AI Divergence (Circular Truth)</Text>
              <Text style={styles.presetSubtext}>Simulates sensor vs AI mismatch</Text>
            </TouchableOpacity>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>ProMotion 120Hz Stress Test</Text>
              <Switch 
                value={isStressTestActive} 
                onValueChange={onToggleStressTest}
                trackColor={{ false: '#333', true: '#FFD700' }}
              />
            </View>
            <Text style={styles.inputHint}>Renders 100+ "Fluttering Arrows" to verify tactical fluidity.</Text>

            <Text style={styles.sectionTitle}>DIAGNOSTICS</Text>
            <View style={styles.diagBox}>
              <Text style={styles.diagText}>Lat: {vesselLocation.lat.toFixed(4)}</Text>
              <Text style={styles.diagText}>Lng: {vesselLocation.lng.toFixed(4)}</Text>
              <Text style={styles.diagText}>Engine: op-sqlite (Zero Latency)</Text>
              <Text style={styles.diagText}>Vector Extension: sqlite-vec v0.2.4</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  container: { height: '80%', backgroundColor: 'rgba(0, 20, 40, 0.9)', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  title: { color: '#00BFFF', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  closeText: { color: '#FFF', fontWeight: 'bold' },
  scroll: { paddingBottom: 40 },
  sectionTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 15, marginTop: 20 },
  sourceGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  sourceButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sourceButtonActive: { backgroundColor: 'rgba(0, 191, 255, 0.2)', borderColor: '#00BFFF' },
  sourceButtonText: { color: 'rgba(255,255,255,0.6)', fontWeight: 'bold', fontSize: 12 },
  sourceButtonTextActive: { color: '#00BFFF' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  rowLabel: { color: '#FFF', fontSize: 14 },
  presetButton: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  presetButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  presetSubtext: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 },
  diagBox: { backgroundColor: '#000', borderRadius: 12, padding: 15 },
  diagText: { color: '#00FF00', fontFamily: 'monospace', fontSize: 12, marginBottom: 5 },
  inputHint: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: -10, marginBottom: 15 }
});
